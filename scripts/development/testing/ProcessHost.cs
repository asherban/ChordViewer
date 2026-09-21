using System;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace ChordViewer.Testing
{
    // The guardian joins this job BEFORE launching workloads. Children inherit membership,
    // avoiding the race between starting a process and assigning its already-running children.
    public static class WorkloadJob
    {
        [StructLayout(LayoutKind.Sequential)] private struct BasicLimits
        {
            public long ProcessTime, JobTime;
            public uint Flags;
            public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)] private struct IoCounters
        { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
        [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits
        {
            public BasicLimits Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr security, string name);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits value, uint size);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool QueryInformationJobObject(IntPtr job, int kind, IntPtr value, uint size, IntPtr length);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool inside);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
        private static IntPtr job;
        public static void AttachGuardian()
        {
            if (job != IntPtr.Zero) throw new InvalidOperationException("Workload job is already active.");
            var created = CreateJobObject(IntPtr.Zero, null);
            if (created == IntPtr.Zero) throw new Win32Exception();
            var limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. No breakaway permission.
            if (!SetInformationJobObject(created, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))) ||
                !AssignProcessToJobObject(created, Process.GetCurrentProcess().Handle))
            { int code = Marshal.GetLastWin32Error(); CloseHandle(created); throw new Win32Exception(code); }
            // Intentionally kept until process exit, including if the guardian itself is terminated.
            job = created;
        }
        public static void StopChildren()
        {
            if (job == IntPtr.Zero) return;
            int ownId = Process.GetCurrentProcess().Id;
            const int size = 65536;
            IntPtr buffer = Marshal.AllocHGlobal(size);
            try
            {
                var timer = Stopwatch.StartNew();
                do
                {
                    if (!QueryInformationJobObject(job, 3, buffer, size, IntPtr.Zero)) throw new Win32Exception();
                    int count = Marshal.ReadInt32(buffer, 4);
                    if (count < 0 || count > (size - 8) / IntPtr.Size) throw new InvalidOperationException("Invalid job process list.");
                    bool remaining = false;
                    for (int i = 0; i < count; i++)
                    {
                        uint id = (uint)Marshal.ReadIntPtr(buffer, 8 + i * IntPtr.Size).ToInt64();
                        if (id == ownId) continue;
                        IntPtr handle = OpenProcess(0x1001, false, id); // QUERY_LIMITED_INFORMATION | TERMINATE
                        if (handle == IntPtr.Zero) continue;
                        try
                        {
                            bool inside;
                            // Membership is checked on the opened handle: a recycled PID cannot kill an unrelated process.
                            if (IsProcessInJob(handle, job, out inside) && inside)
                            { remaining = true; TerminateProcess(handle, 1); }
                        }
                        finally { CloseHandle(handle); }
                    }
                    if (!remaining) return;
                    Thread.Sleep(50);
                } while (timer.ElapsedMilliseconds < 5000);
                throw new InvalidOperationException("Owned child processes did not exit within five seconds.");
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
    }

    public sealed class ChildProcess : IDisposable
    {
        private readonly Process process;
        private readonly ConcurrentQueue<string> lines = new ConcurrentQueue<string>();
        private readonly object gate = new object();
        private readonly ManualResetEventSlim outputEnded = new ManualResetEventSlim();
        private readonly ManualResetEventSlim errorEnded = new ManualResetEventSlim();
        private readonly StreamWriter log;
        private long logged;
        private bool disposed;
        public int Id { get { return process.Id; } }
        public bool HasExited { get { return process.HasExited; } }
        public int ExitCode { get { return process.ExitCode; } }
        public ChildProcess(string executable, string[] arguments, string directory, string logPath)
        {
            log = new StreamWriter(logPath, false, new UTF8Encoding(false));
            log.AutoFlush = true;
            process = new Process();
            process.StartInfo.FileName = executable;
            process.StartInfo.Arguments = JoinArguments(arguments);
            process.StartInfo.WorkingDirectory = directory;
            process.StartInfo.UseShellExecute = false;
            process.StartInfo.CreateNoWindow = true;
            process.StartInfo.RedirectStandardInput = true;
            process.StartInfo.RedirectStandardOutput = true;
            process.StartInfo.RedirectStandardError = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { Record(args.Data, true); };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) { Record(args.Data, false); };
            try { process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine(); }
            catch { log.Dispose(); process.Dispose(); throw; }
        }
        private void Record(string line, bool stdout)
        {
            if (line == null) { (stdout ? outputEnded : errorEnded).Set(); return; }
            if (line.Length > 16384) line = line.Substring(0, 16384);
            lock (gate)
            {
                if (disposed) return;
                if (logged < 5 * 1024 * 1024) { log.WriteLine(line); logged += line.Length; }
            }
            if (stdout && lines.Count < 4096) lines.Enqueue(line);
        }
        public string ReadLine() { string line; return lines.TryDequeue(out line) ? line : null; }
        public void WaitForOutput()
        {
            // Exit can precede the final asynchronous callbacks. Bound the wait in case
            // a descendant inherited the pipes and keeps them open after its parent exits.
            outputEnded.Wait(1000); errorEnded.Wait(1000);
        }
        public void SendLine(string line)
        {
            if (line.Length > 16384) throw new ArgumentException("Command exceeds its size limit.");
            process.StandardInput.WriteLine(line); process.StandardInput.Flush();
        }
        public void CloseInput() { process.StandardInput.Close(); }
        public void Dispose()
        {
            lock (gate) { if (disposed) return; disposed = true; }
            if (!process.HasExited) process.Kill();
            process.WaitForExit(3000);
            // Async output callbacks may still be finishing; cancel before closing their log.
            try { process.CancelOutputRead(); process.CancelErrorRead(); } catch (InvalidOperationException) { }
            lock (gate) log.Dispose();
            process.Dispose();
        }
        public static string JoinArguments(string[] arguments)
        {
            var command = new StringBuilder();
            foreach (string argument in arguments)
            {
                if (command.Length > 0) command.Append(' ');
                command.Append('"'); int slashes = 0;
                foreach (char c in argument)
                {
                    if (c == '\\') { slashes++; continue; }
                    if (c == '"') command.Append('\\', slashes * 2 + 1);
                    else command.Append('\\', slashes);
                    slashes = 0; command.Append(c);
                }
                command.Append('\\', slashes * 2); command.Append('"');
            }
            return command.ToString();
        }
    }

    public static class MenuInput
    {
        private static readonly ConcurrentQueue<string> lines = new ConcurrentQueue<string>();
        private static readonly StringBuilder buffer = new StringBuilder();
        public static void Begin()
        {
            if (Console.IsInputRedirected)
            {
                var reader = new Thread(delegate() {
                    while (true) {
                        string line = Console.ReadLine();
                        if (line == null) { lines.Enqueue("q"); break; }
                        if (lines.Count < 16) lines.Enqueue(line.Length <= 40 ? line : "invalid");
                    }
                });
                reader.IsBackground = true; reader.Start();
            }
            else Console.TreatControlCAsInput = true;
        }
        public static string Poll()
        {
            if (Console.IsInputRedirected) { string line; return lines.TryDequeue(out line) ? line : null; }
            while (Console.KeyAvailable)
            {
                var key = Console.ReadKey(true);
                if (key.KeyChar == 3) return "q";
                if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); string line = buffer.ToString(); buffer.Clear(); return line; }
                if (key.Key == ConsoleKey.Backspace && buffer.Length > 0) { buffer.Length--; Console.Write("\b \b"); }
                else if (!Char.IsControl(key.KeyChar) && buffer.Length < 40) { buffer.Append(key.KeyChar); Console.Write(key.KeyChar); }
            }
            return null;
        }
    }
}
