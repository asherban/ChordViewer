using System;
using System.Runtime.InteropServices;

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

    // Shared validation for the USB router and LoopBe fixture sender.
    internal static class ShortMidiMessage
    {
        internal static int MessageLength(uint packed)
        {
            int status = (int)(packed & 255);
            if (status < 128 || status >= 240) return 0;
            int length = ((status & 240) == 192 || (status & 240) == 208) ? 2 : 3;
            if (((packed >> 8) & 255) > 127 || (length == 3 && ((packed >> 16) & 255) > 127)) return 0;
            return length;
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
            if (ShortMidiMessage.MessageLength(packed) != data.Length) throw new ArgumentException("Invalid short MIDI message length/status.");
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
