package com.chordviewer.midi

import android.content.Context
import android.hardware.usb.UsbDevice
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

internal data class NativeMidiSource(val device: MidiDeviceInfo, val port: Int,
    val computer: Boolean, val label: String) {
    val id: String get() = device.id.toString()
}
internal data class NativeMidiUpdate(val sources: List<NativeMidiSource> = emptyList(),
    val status: String = "No MIDI device connected", val connected: Boolean = false,
    val snapshot: MidiSnapshot = MidiSnapshot(), val selectedId: String? = null)

/** Owns one native port. Discovery and lifetime run on main; copied byte delivery is bounded. */
internal class NativeMidiInput(context: Context, private val onInput: (MidiInputEvent) -> Unit,
    private val selection: MidiDeviceSelection = MidiDeviceSelection(),
    private val onUpdate: (NativeMidiUpdate) -> Unit) {
    private val manager = context.getSystemService(MidiManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val gate = Any()
    private val events = OrderedMidiEventBuffer()
    private var generation = 0L
    private var deliveryQueued = false
    private var session: MidiInputSession? = null
    private var device: MidiDevice? = null
    private var port: MidiOutputPort? = null
    private var boundId: String? = null
    private var retryDelay = 1000L
    private val retry = Runnable { discover() }
    private var active = false
    private var closed = false
    private var sources = emptyList<NativeMidiSource>()
    private var status = "No MIDI device connected"

    private val observer = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) { discover() }
        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            if (boundId == info.id.toString()) closePort("MIDI device removed. Entry paused.")
            discover()
        }
    }
    private val watchdog = object : Runnable {
        override fun run() {
            synchronized(gate) {
                session?.expire(SystemClock.elapsedRealtime())?.let { offer(it) }
            }
            if (active && !closed) main.postDelayed(this, 50)
        }
    }

    init { manager?.registerDeviceCallback(observer, main) }

    fun foreground(enabled: Boolean) {
        if (closed || active == enabled) return
        active = enabled
        main.removeCallbacks(watchdog)
        main.removeCallbacks(retry)
        if (enabled) { discover(); main.post(watchdog) }
        else closePort("MIDI suspended. Entry paused.")
    }

    fun select(id: String) {
        if (closed || !selection.select(id) || boundId == id) return
        closePort("MIDI source changed. Entry paused.")
        retryDelay = 1000L
        discover()
    }

    fun clear() = synchronized(gate) { session?.clear()?.let { offer(it) } }

    fun close() {
        foreground(false)
        closed = true
        manager?.unregisterDeviceCallback(observer)
        main.removeCallbacks(watchdog)
        main.removeCallbacks(retry)
    }

    @Suppress("DEPRECATION")
    private fun discover() {
        if (closed) return
        sources = if (manager == null) emptyList() else {
            val devices = if (Build.VERSION.SDK_INT >= 33)
                manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM) else manager.devices.toList()
            // One input per physical device. Multi-port keyboards must not inflate the device count.
            devices.filter { it.type == MidiDeviceInfo.TYPE_USB }.sortedBy { it.id }.mapNotNull { info ->
                info.ports.filter { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }.minByOrNull { it.portNumber }?.let { candidate ->
                    val properties = info.properties
                    val usb = properties.getParcelable<UsbDevice>(MidiDeviceInfo.PROPERTY_USB_DEVICE)
                    val computer = usb == null
                    val name = properties.getString(MidiDeviceInfo.PROPERTY_NAME).orEmpty()
                    NativeMidiSource(info, candidate.portNumber, computer,
                        if (computer) "Computer via USB" else name.ifBlank { "USB MIDI device" })
                }
            }
        }
        val selectedId = selection.update(sources.map { it.id })
        val source = sources.firstOrNull { it.id == selectedId }
        if (boundId != null && boundId != selectedId) closePort("MIDI source changed. Entry paused.")
        if (active && boundId == null) {
            main.removeCallbacks(retry)
            when {
                manager == null -> status = "MIDI is unavailable on this device"
                source == null -> status = "No MIDI device connected"
                else -> open(source)
            }
        }
        publish()
    }

    private fun open(source: NativeMidiSource) {
        val current = synchronized(gate) { ++generation }
        boundId = source.id
        status = "Opening ${source.label}…"
        try {
            manager?.openDevice(source.device, { opened ->
                if (!active || closed || current != synchronized(gate) { generation }) {
                    runCatching { opened?.close() }; return@openDevice
                }
                if (opened == null) { retryConnection("Cannot open MIDI input."); return@openDevice }
                try {
                    val output = opened.openOutputPort(source.port) ?: error("Port unavailable")
                    device = opened
                    port = output
                    retryDelay = 1000L
                    synchronized(gate) {
                        session = MidiInputSession(source.computer)
                        status = if (source.computer) "Computer via USB · waiting for router" else "Connected · ${source.label}"
                        offer(session!!.opened())
                    }
                    output.connect(object : MidiReceiver(1024) {
                        override fun onSend(data: ByteArray, offset: Int, count: Int, timestamp: Long) {
                            val arrival = SystemClock.elapsedRealtime()
                            val copy = IntArray(count) { data[offset + it].toInt() and 255 }
                            synchronized(gate) {
                                if (current != generation || session == null) return
                                offer(session!!.accept(copy, arrival))
                            }
                        }
                        override fun onFlush() {
                            synchronized(gate) {
                                if (current == generation) session?.clear()?.let { offer(it) }
                            }
                        }
                    })
                } catch (_: Exception) { runCatching { opened.close() }; retryConnection("MIDI port failed.") }
            }, main)
        } catch (_: Exception) { retryConnection("Cannot open MIDI input.") }
    }

    private fun retryConnection(reason: String) {
        closePort("$reason Retrying automatically.")
        main.removeCallbacks(retry)
        if (active && !closed) {
            main.postDelayed(retry, retryDelay)
            retryDelay = (retryDelay * 2).coerceAtMost(5000L)
        }
    }

    private fun closePort(reason: String) {
        synchronized(gate) {
            generation++
            session = null
            events.clear()
            status = reason
        }
        val previousPort = port; val previousDevice = device
        port = null; device = null; boundId = null
        runCatching { previousPort?.close() }; runCatching { previousDevice?.close() }
        onInput(MidiInputEvent.Reset(false, reason))
        publish()
    }

    private fun offer(input: List<MidiInputEvent>) {
        if (input.isEmpty()) return
        for (event in input) {
            if (event is MidiInputEvent.Reset) {
                events.clear()
                status = event.reason
            }
            if (!events.offer(event)) {
                // Close on main without sending any more old gesture history.
                val expected = generation
                main.post { if (expected == synchronized(gate) { generation }) {
                    retryConnection("MIDI input overflow. Entry paused.")
                } }
                break
            }
        }
        if (deliveryQueued) return
        deliveryQueued = true
        main.post {
            synchronized(gate) {
                deliveryQueued = false
                events.drain().forEach(onInput)
                publish()
            }
        }
    }

    private fun publish() = synchronized(gate) {
        onUpdate(NativeMidiUpdate(sources, status, session?.ready == true,
            session?.snapshot ?: MidiSnapshot(), selection.selectedId))
    }
}
