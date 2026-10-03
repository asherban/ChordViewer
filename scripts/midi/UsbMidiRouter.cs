using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace ChordViewer.LocalMidi
{
    public sealed class MidiDestination
    {
        public uint Id { get; internal set; }
        public string Name { get; internal set; }
        public string DeviceInterface { get; internal set; }
        public bool CanRemember { get { return !String.IsNullOrEmpty(DeviceInterface); } }
    }

    // Unlike Sender, this component never selects or writes to LoopBe as its destination.
    public sealed class UsbMidiRouter : IDisposable
    {
        [DllImport("winmm.dll")]
        private static extern uint midiOutMessage(IntPtr id, uint message, IntPtr first, UIntPtr second);
        private const int Capacity = 1024;
        private readonly object gate = new object();
        private readonly Queue<uint> queue = new Queue<uint>();
        private readonly WinMm.MidiCallback callback;
        private readonly string destinationInterface;
        private readonly string destinationName;
        private readonly uint initialId;
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private IntPtr input, output;
        private Thread worker;
        private FileStream ownership;
        private bool accepting, inputFailed, overflow, openedOnce, outputVerified, explicitSelection;
        private bool ambiguousIdentity;
        private string ambiguousSignature;
        private volatile bool stopping;
        private volatile string status = "Waiting for selected USB MIDI destination";
        private volatile string failure;
        private long forwarded;
        public string Status { get { return status; } }
        public string Failure { get { return failure; } }
        public long ForwardedMessages { get { return Interlocked.Read(ref forwarded); } }

        public static MidiDestination[] Destinations()
        {
            var result = new List<MidiDestination>();
            for (uint id = 0; id < WinMm.midiOutGetNumDevs(); id++)
            {
                WinMm.OutputCaps caps;
                if (WinMm.midiOutGetDevCaps(new UIntPtr(id), out caps, (uint)Marshal.SizeOf(typeof(WinMm.OutputCaps))) != 0) continue;
                if (caps.Name == WinMm.PortName || caps.Technology != 1) continue; // MOD_MIDIPORT only, no synthesizers.
                result.Add(new MidiDestination { Id = id, Name = caps.Name, DeviceInterface = InterfaceName(id) });
            }
            return result.ToArray();
        }

        private static string InterfaceName(uint id)
        {
            IntPtr length = Marshal.AllocHGlobal(4);
            IntPtr buffer = IntPtr.Zero;
            try
            {
                Marshal.WriteInt32(length, 0);
                // Mmddk.h: DRV_RESERVED + 13 obtains bytes; +12 obtains the opaque Unicode interface.
                if (midiOutMessage(new IntPtr(id), 0x80d, length, UIntPtr.Zero) != 0) return null;
                int size = Marshal.ReadInt32(length);
                if (size < 2 || size > 65536 || size % 2 != 0) return null;
                buffer = Marshal.AllocHGlobal(size);
                if (midiOutMessage(new IntPtr(id), 0x80c, buffer, new UIntPtr((uint)size)) != 0) return null;
                return Marshal.PtrToStringUni(buffer, size / 2).TrimEnd('\0');
            }
            finally { if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer); Marshal.FreeHGlobal(length); }
        }

        public UsbMidiRouter(string deviceInterface, string name, uint id, bool explicitlySelected)
        {
            if (String.IsNullOrEmpty(name) || name == WinMm.PortName) throw new ArgumentException("Select a physical MIDI destination, never LoopBe.");
            destinationInterface = deviceInterface;
            destinationName = name;
            initialId = id;
            explicitSelection = explicitlySelected;
            callback = OnMidi;
        }

        public void Start(FileStream sessionLock)
        {
            if (worker != null || stopping) throw new InvalidOperationException("Use a new router for each run.");
            if (sessionLock == null) throw new ArgumentNullException("sessionLock");
            ownership = sessionLock;
            worker = new Thread(Run) { IsBackground = true, Name = "ChordViewer USB MIDI router" };
            try { worker.Start(); } catch { ownership = null; worker = null; throw; }
        }

        private MidiDestination Resolve(bool currentConnection = false)
        {
            var matches = new List<MidiDestination>();
            foreach (var candidate in Destinations())
            {
                bool same = !String.IsNullOrEmpty(destinationInterface)
                    ? String.Equals(candidate.DeviceInterface, destinationInterface, StringComparison.OrdinalIgnoreCase) && candidate.Name == destinationName
                    : (!openedOnce || currentConnection) && candidate.Id == initialId && candidate.Name == destinationName;
                if (!same) continue;
                matches.Add(candidate);
            }
            if (matches.Count > 1)
            {
                ForgetAmbiguousDestination();
                string signature = String.Join(",", matches.ConvertAll(candidate => candidate.Id.ToString()).ToArray());
                if (ambiguousSignature == null) ambiguousSignature = signature;
                else if (ambiguousSignature != signature) throw new InvalidOperationException("Ambiguous MIDI attachments changed. Select the destination again.");
                if (explicitSelection) foreach (var candidate in matches) if (candidate.Id == initialId) return candidate;
                throw new InvalidOperationException("Selected destination is ambiguous. Select it again.");
            }
            if (ambiguousIdentity) throw new InvalidOperationException("Ambiguous MIDI attachment was lost. Select the destination again.");
            return matches.Count == 1 ? matches[0] : null;
        }

        private void ForgetAmbiguousDestination()
        {
            if (ambiguousIdentity) return;
            // Persist before forwarding can continue. All destination writers use this worker-owned lock.
            // Derive the state path from that lock rather than accepting another deletion target.
            string savedChoice = Path.Combine(Path.GetDirectoryName(ownership.Name), "destination.json");
            if (File.Exists(savedChoice))
            {
                if ((File.GetAttributes(savedChoice) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidOperationException("USB MIDI destination state cannot be a link. Select the destination again.");
                File.Delete(savedChoice);
            }
            ambiguousIdentity = true;
        }

        private void OnMidi(IntPtr handle, uint message, UIntPtr instance, UIntPtr data, UIntPtr timestamp)
        {
            lock (gate)
            {
                if (!accepting || stopping || handle != input) return;
                if (message == 0x3c5 || message == 0x3c6 || message == 0x3cc) { inputFailed = true; queue.Clear(); return; }
                if (message != 0x3c3 || ShortMidiMessage.MessageLength(unchecked((uint)data.ToUInt64())) == 0) return;
                if (queue.Count >= Capacity) { overflow = true; queue.Clear(); return; }
                if (!overflow && !inputFailed) queue.Enqueue(unchecked((uint)data.ToUInt64()));
            }
        }

        private void Connect(MidiDestination destination)
        {
            WinMm.Check(WinMm.midiOutOpen(out output, destination.Id, IntPtr.Zero, UIntPtr.Zero, 0), "midiOutOpen");
            var verified = Resolve();
            if (verified == null || verified.Id != destination.Id) throw new InvalidOperationException("Destination changed while opening; no notes sent.");
            outputVerified = true;
            Cleanup(true);
            WinMm.Check(WinMm.midiInOpen(out input, WinMm.FindInput(), callback, UIntPtr.Zero, 0x30000 | 0x20), "midiInOpen");
            lock (gate) { queue.Clear(); overflow = false; inputFailed = false; accepting = true; }
            WinMm.Check(WinMm.midiInStart(input), "midiInStart");
            Send(0xFE);
            openedOnce = true;
            status = "Connected: LoopBe -> " + destination.Name + " (USB MIDI)";
        }

        private void Send(uint message) { WinMm.Check(WinMm.midiOutShortMsg(output, message), "midiOutShortMsg"); }

        private void Cleanup(bool check)
        {
            if (output == IntPtr.Zero || !outputVerified) return;
            for (int channel = 0; channel < 16; channel++)
                foreach (int control in new int[] { 64, 120, 123 })
                {
                    uint result = WinMm.midiOutShortMsg(output, (uint)((0xB0 | channel) | (control << 8)));
                    if (check) WinMm.Check(result, "MIDI cleanup");
                }
        }

        private void CloseConnection()
        {
            lock (gate) { accepting = false; queue.Clear(); }
            // Never hold the callback lock while WinMM waits for callbacks to finish.
            if (input != IntPtr.Zero)
            {
                WinMm.midiInStop(input); WinMm.midiInReset(input); WinMm.midiInClose(input); input = IntPtr.Zero;
            }
            if (output != IntPtr.Zero)
            {
                Cleanup(false);
                if (outputVerified) WinMm.midiOutReset(output);
                WinMm.midiOutClose(output); output = IntPtr.Zero; outputVerified = false;
            }
            explicitSelection = false;
        }

        private void Run()
        {
            try
            {
                while (!stopping)
                {
                    var destination = Resolve();
                    if (destination == null) { status = "Waiting for selected MIDI device; no other output will be substituted"; Thread.Sleep(200); continue; }
                    try
                    {
                        Connect(destination);
                        long heartbeat = clock.ElapsedMilliseconds, discovery = heartbeat;
                        while (!stopping)
                        {
                            uint message = 0; bool available;
                            lock (gate)
                            {
                                if (overflow || inputFailed) throw new InvalidOperationException("MIDI input overflow or failure. Connection reset.");
                                available = queue.Count > 0;
                                if (available) message = queue.Dequeue();
                            }
                            if (clock.ElapsedMilliseconds - discovery >= 500)
                            {
                                var current = Resolve(true);
                                if (current == null || current.Id != destination.Id) break;
                                discovery = clock.ElapsedMilliseconds;
                            }
                            if (available) { Send(message); Interlocked.Increment(ref forwarded); }
                            if (clock.ElapsedMilliseconds - heartbeat >= 100) { Send(0xFE); heartbeat = clock.ElapsedMilliseconds; }
                            if (!available) Thread.Sleep(2);
                        }
                    }
                    catch (Exception error) { status = "USB MIDI connection reset: " + error.Message; }
                    finally { CloseConnection(); }
                    if (String.IsNullOrEmpty(destinationInterface)) throw new InvalidOperationException("Destination has no persistent interface identity. Select it again.");
                    if (!stopping) Thread.Sleep(500);
                }
            }
            catch (Exception error) { if (!stopping) failure = error.Message; }
            finally
            {
                try { CloseConnection(); GC.KeepAlive(callback); }
                finally { ownership.Dispose(); ownership = null; }
            }
        }

        public void Dispose()
        {
            stopping = true;
            if (worker != null && worker != Thread.CurrentThread && !worker.Join(4000))
                throw new InvalidOperationException("USB MIDI worker did not finish cleanup. Close this router process before restarting.");
        }
    }
}
