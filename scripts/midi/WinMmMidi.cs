using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace ChordViewer.LocalMidi
{
    internal static class WinMm
    {
        internal const string PortName = "LoopBe Internal MIDI";
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        internal struct InputCaps
        {
            internal ushort Manufacturer, Product;
            internal uint Version;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] internal string Name;
            internal uint Support;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        internal struct OutputCaps
        {
            internal ushort Manufacturer, Product;
            internal uint Version;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] internal string Name;
            internal ushort Technology, Voices, Notes, ChannelMask;
            internal uint Support;
        }
        internal delegate void MidiCallback(IntPtr device, uint message, UIntPtr instance, UIntPtr data, UIntPtr timestamp);
        [DllImport("winmm.dll")] internal static extern uint midiInGetNumDevs();
        [DllImport("winmm.dll")] internal static extern uint midiOutGetNumDevs();
        [DllImport("winmm.dll", CharSet = CharSet.Unicode)] internal static extern uint midiInGetDevCaps(UIntPtr id, out InputCaps caps, uint size);
        [DllImport("winmm.dll", CharSet = CharSet.Unicode)] internal static extern uint midiOutGetDevCaps(UIntPtr id, out OutputCaps caps, uint size);
        [DllImport("winmm.dll")] internal static extern uint midiInOpen(out IntPtr handle, uint id, MidiCallback callback, UIntPtr instance, uint flags);
        [DllImport("winmm.dll")] internal static extern uint midiInStart(IntPtr handle);
        [DllImport("winmm.dll")] internal static extern uint midiInStop(IntPtr handle);
        [DllImport("winmm.dll")] internal static extern uint midiInReset(IntPtr handle);
        [DllImport("winmm.dll")] internal static extern uint midiInClose(IntPtr handle);
        [DllImport("winmm.dll")] internal static extern uint midiOutOpen(out IntPtr handle, uint id, IntPtr callback, UIntPtr instance, uint flags);
        [DllImport("winmm.dll")] internal static extern uint midiOutShortMsg(IntPtr handle, uint data);
        [DllImport("winmm.dll")] internal static extern uint midiOutReset(IntPtr handle);
        [DllImport("winmm.dll")] internal static extern uint midiOutClose(IntPtr handle);

        internal static void Check(uint result, string operation)
        {
            if (result != 0) throw new InvalidOperationException(operation + " failed (WinMM " + result + ").");
        }
        internal static uint FindInput()
        {
            for (uint i = 0; i < midiInGetNumDevs(); i++)
            {
                InputCaps caps;
                Check(midiInGetDevCaps(new UIntPtr(i), out caps, (uint)Marshal.SizeOf(typeof(InputCaps))), "midiInGetDevCaps");
                if (caps.Name == PortName) return i;
            }
            throw new InvalidOperationException("LoopBe Internal MIDI input was not found. Install or enable LoopBe1.");
        }
        internal static uint FindOutput()
        {
            for (uint i = 0; i < midiOutGetNumDevs(); i++)
            {
                OutputCaps caps;
                Check(midiOutGetDevCaps(new UIntPtr(i), out caps, (uint)Marshal.SizeOf(typeof(OutputCaps))), "midiOutGetDevCaps");
                if (caps.Name == PortName) return i;
            }
            throw new InvalidOperationException("LoopBe Internal MIDI output was not found. Install or enable LoopBe1.");
        }
    }

    // This transport handles short channel messages only. SysEx and clock are deliberately excluded.
    public static class Protocol
    {
        private const string TokenPattern = "\"(?<token>[0-9a-fA-F]{64})\"";
        private static readonly Regex Hello = new Regex(
            "^\\s*\\{\\s*(?:\"type\"\\s*:\\s*\"hello\"\\s*,\\s*\"token\"\\s*:\\s*" + TokenPattern +
            "|\"token\"\\s*:\\s*" + TokenPattern + "\\s*,\\s*\"type\"\\s*:\\s*\"hello\")\\s*\\}\\s*$",
            RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

        public static bool Authenticate(string line, string expected)
        {
            if (line == null || line.Length > 512 || expected == null || expected.Length != 64) return false;
            Match match = Hello.Match(line);
            if (!match.Success) return false;
            string supplied = match.Groups["token"].Value;
            int difference = 0;
            for (int i = 0; i < 64; i++) difference |= supplied[i] ^ expected[i];
            return difference == 0;
        }
        public static int MessageLength(uint packed)
        {
            int status = (int)(packed & 255);
            if (status < 128 || status >= 240) return 0;
            int length = ((status & 240) == 192 || (status & 240) == 208) ? 2 : 3;
            if (((packed >> 8) & 255) > 127 || (length == 3 && ((packed >> 16) & 255) > 127)) return 0;
            return length;
        }
        public static string Frame(uint packed, long sequence, long timestamp)
        {
            int length = MessageLength(packed);
            if (length == 0) throw new ArgumentException("Invalid short MIDI message.");
            return "{\"type\":\"midi\",\"sequence\":" + sequence + ",\"timestampMs\":" + timestamp +
                ",\"data\":[" + (packed & 255) + "," + ((packed >> 8) & 255) +
                (length == 3 ? "," + ((packed >> 16) & 255) : "") + "]}";
        }
    }

    internal struct MidiEvent
    {
        internal uint Packed;
        internal long Timestamp;
    }
    public sealed class Bridge : IDisposable
    {
        public const int Port = 39173;
        private const int Capacity = 1024;
        private readonly object gate = new object();
        private readonly Queue<MidiEvent> queue = new Queue<MidiEvent>(Capacity);
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private readonly string token;
        private readonly WinMm.MidiCallback callback;
        private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
        private volatile bool stopping;
        private bool authenticated, overflow;
        private IntPtr input;
        private TcpClient client;
        private Thread worker;
        public string Failure { get; private set; }

        public Bridge(string token)
        {
            if (!Regex.IsMatch(token ?? "", "\\A[0-9a-f]{64}\\z")) throw new ArgumentException("A random 32-byte lowercase hex token is required.");
            this.token = token;
            callback = OnMidi;
        }
        public void Start()
        {
            if (worker != null || stopping) throw new InvalidOperationException("Start a new bridge instance for each run.");
            try
            {
                listener.Server.ExclusiveAddressUse = true;
                listener.Start(1);
                WinMm.Check(WinMm.midiInOpen(out input, WinMm.FindInput(), callback, UIntPtr.Zero, 0x30000), "midiInOpen");
                WinMm.Check(WinMm.midiInStart(input), "midiInStart");
                worker = new Thread(Serve);
                worker.IsBackground = true;
                worker.Name = "ChordViewer local MIDI bridge";
                worker.Start();
            }
            catch { Dispose(); throw; }
        }
        private void OnMidi(IntPtr device, uint message, UIntPtr instance, UIntPtr data, UIntPtr timestamp)
        {
            if (message != 0x3c3) return; // MIM_DATA; never call WinMM or sockets on its callback thread.
            uint packed = unchecked((uint)data.ToUInt64());
            if (Protocol.MessageLength(packed) == 0) return;
            lock (gate)
            {
                if (!authenticated || stopping || overflow) return;
                if (queue.Count == Capacity) { overflow = true; queue.Clear(); return; }
                queue.Enqueue(new MidiEvent { Packed = packed, Timestamp = clock.ElapsedMilliseconds });
            }
        }
        private static string ReadHello(NetworkStream stream)
        {
            var bytes = new List<byte>(128);
            var deadline = Stopwatch.StartNew();
            while (bytes.Count <= 512)
            {
                int remaining = 3000 - (int)deadline.ElapsedMilliseconds;
                if (remaining <= 0) throw new IOException("Authentication timeout.");
                stream.ReadTimeout = remaining;
                int next = stream.ReadByte();
                if (next == -1) throw new IOException("Disconnected before authentication.");
                if (next == 10) return new UTF8Encoding(false, true).GetString(bytes.ToArray());
                bytes.Add((byte)next);
            }
            throw new IOException("Authentication line is too long.");
        }
        private void Serve()
        {
            try
            {
                while (!stopping)
                {
                    if (!listener.Pending()) { Thread.Sleep(5); continue; }
                    TcpClient accepted = listener.AcceptTcpClient();
                    lock (gate) client = accepted;
                    try { ServeClient(accepted); }
                    catch (IOException) { }
                    catch (SocketException) { }
                    catch (ObjectDisposedException) { }
                    catch (DecoderFallbackException) { }
                    finally
                    {
                        lock (gate) { authenticated = false; overflow = false; queue.Clear(); client = null; }
                        accepted.Close();
                    }
                }
            }
            catch (Exception error) { if (!stopping) Failure = error.GetType().Name + ": " + error.Message; }
        }
        private void ServeClient(TcpClient accepted)
        {
            accepted.NoDelay = true;
            accepted.SendTimeout = 3000;
            using (NetworkStream stream = accepted.GetStream())
            {
                if (!Protocol.Authenticate(ReadHello(stream), token)) return;
                using (var writer = new StreamWriter(stream, new UTF8Encoding(false), 1024, true))
                {
                    writer.NewLine = "\n";
                    writer.AutoFlush = true;
                    lock (gate) { queue.Clear(); overflow = false; authenticated = true; }
                    writer.WriteLine("{\"type\":\"reset\",\"sequence\":0,\"timestampMs\":0}");
                    long sequence = 0;
                    while (!stopping)
                    {
                        // After hello this is a one-way stream. EOF and unexpected input both close it.
                        if (accepted.Client.Poll(0, SelectMode.SelectRead)) return;
                        MidiEvent next = new MidiEvent();
                        bool available;
                        lock (gate)
                        {
                            if (overflow) return; // Never drop a note-off silently: force a client state reset.
                            available = queue.Count > 0;
                            if (available) next = queue.Dequeue();
                        }
                        if (available) writer.WriteLine(Protocol.Frame(next.Packed, ++sequence, next.Timestamp));
                        else Thread.Sleep(2);
                    }
                }
            }
        }
        public void Dispose()
        {
            stopping = true;
            listener.Stop();
            lock (gate) { authenticated = false; queue.Clear(); if (client != null) client.Close(); }
            if (worker != null && worker != Thread.CurrentThread) worker.Join(4000);
            if (input != IntPtr.Zero)
            {
                WinMm.midiInStop(input);
                WinMm.midiInReset(input);
                WinMm.midiInClose(input);
                input = IntPtr.Zero;
            }
            GC.KeepAlive(callback);
        }
    }

    public sealed class Sender : IDisposable
    {
        private IntPtr output;
        public Sender() { WinMm.Check(WinMm.midiOutOpen(out output, WinMm.FindOutput(), IntPtr.Zero, UIntPtr.Zero, 0), "midiOutOpen"); }
        public void Send(int[] data)
        {
            if (output == IntPtr.Zero) throw new ObjectDisposedException("Sender");
            if (data == null || data.Length < 2 || data.Length > 3) throw new ArgumentException("Expected 2 or 3 MIDI bytes.");
            for (int i = 0; i < data.Length; i++)
                if (data[i] < 0 || data[i] > (i == 0 ? 255 : 127)) throw new ArgumentException("Invalid MIDI byte.");
            uint packed = (uint)(data[0] | (data[1] << 8) | (data.Length == 3 ? data[2] << 16 : 0));
            if (Protocol.MessageLength(packed) != data.Length) throw new ArgumentException("Invalid short MIDI message length/status.");
            WinMm.Check(WinMm.midiOutShortMsg(output, packed), "midiOutShortMsg");
        }
        public void Dispose()
        {
            if (output == IntPtr.Zero) return;
            // Cleanup prevents an interrupted fixture from leaving a held note or sustain pedal.
            for (int channel = 0; channel < 16; channel++)
            {
                WinMm.midiOutShortMsg(output, (uint)((0xb0 | channel) | (64 << 8)));
                WinMm.midiOutShortMsg(output, (uint)((0xb0 | channel) | (123 << 8)));
            }
            WinMm.midiOutReset(output);
            WinMm.midiOutClose(output);
            output = IntPtr.Zero;
        }
    }
}
