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
import org.json.JSONObject

internal data class NativeMidiSource(val device: MidiDeviceInfo, val port: Int, val identity: String,
    val computer: Boolean, val strongIdentity: Boolean, val label: String)
internal data class NativeMidiUpdate(val sources: List<NativeMidiSource> = emptyList(),
    val status: String = "Choose a USB MIDI input", val connected: Boolean = false,
    val snapshot: MidiSnapshot = MidiSnapshot(), val hasSelection: Boolean = false)

/** Owns one native port. Discovery and lifetime run on main; copied byte delivery is bounded. */
internal class NativeMidiInput(context: Context, private val onInput: (MidiInputEvent) -> Unit,
    private val onUpdate: (NativeMidiUpdate) -> Unit) {
    private val manager = context.getSystemService(MidiManager::class.java)
    private val preferences = context.getSharedPreferences("midi-input", Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())
    private val gate = Any()
    private val events = OrderedMidiEventBuffer()
    private var generation = 0L
    private var deliveryQueued = false
    private var session: MidiInputSession? = null
    private var device: MidiDevice? = null
    private var port: MidiOutputPort? = null
    private var selectedId: Int? = null
    private var knownId: Int? = null
    private var selected = preferences.getString("source", null)
    private var ambiguousIdentity = preferences.getBoolean("ambiguous", false)
    private var reconnect = preferences.getBoolean("reconnect", false)
    private var active = false
    private var closed = false
    private var sources = emptyList<NativeMidiSource>()
    private var status = "Choose a USB MIDI input"

    private val observer = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(info: MidiDeviceInfo) { discover() }
        override fun onDeviceRemoved(info: MidiDeviceInfo) {
            if (knownId == info.id) knownId = null
            if (selectedId == info.id) closePort("MIDI device removed. Entry paused.")
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
        if (enabled) { discover(); main.post(watchdog) }
        else closePort("MIDI suspended. Entry paused.")
    }

    fun select(source: NativeMidiSource) {
        if (source !in sources) return
        closePort("MIDI source changed. Entry paused.")
        ambiguousIdentity = (selected == source.identity && ambiguousIdentity) || sources.count { it.identity == source.identity } > 1
        selected = source.identity
        knownId = source.device.id
        reconnect = true
        preferences.edit().putString("source", selected).putBoolean("reconnect", true).putBoolean("ambiguous", ambiguousIdentity).apply()
        discover()
    }

    fun connect() {
        reconnect = true
        preferences.edit().putBoolean("reconnect", true).apply()
        discover()
    }

    fun disconnect() {
        reconnect = false
        preferences.edit().putBoolean("reconnect", false).apply()
        closePort("Disconnected. Choose Connect to reconnect.")
    }

    fun clear() = synchronized(gate) { session?.clear()?.let { offer(it) } }

    fun close() {
        foreground(false)
        closed = true
        manager?.unregisterDeviceCallback(observer)
        main.removeCallbacks(watchdog)
    }

    @Suppress("DEPRECATION")
    private fun discover() {
        if (closed) return
        sources = if (manager == null) emptyList() else {
            val devices = if (Build.VERSION.SDK_INT >= 33)
                manager.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM) else manager.devices.toList()
            devices.filter { it.type == MidiDeviceInfo.TYPE_USB }.flatMap { info ->
                info.ports.filter { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }.map { candidate ->
                    val properties = info.properties
                    val usb = properties.getParcelable<UsbDevice>(MidiDeviceInfo.PROPERTY_USB_DEVICE)
                    val computer = usb == null
                    val serial = properties.getString(MidiDeviceInfo.PROPERTY_SERIAL_NUMBER).orEmpty()
                    val name = properties.getString(MidiDeviceInfo.PROPERTY_NAME).orEmpty()
                    val identity = JSONObject().put("name", name)
                        .put("manufacturer", properties.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER).orEmpty())
                        .put("product", properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT).orEmpty())
                        .put("serial", serial).put("vendor", usb?.vendorId ?: -1).put("usbProduct", usb?.productId ?: -1)
                        .put("computer", computer).put("port", candidate.portNumber).toString()
                    NativeMidiSource(info, candidate.portNumber, identity, computer, computer || serial.isNotBlank(),
                        "${if (computer) "Computer via USB" else name.ifBlank { "USB MIDI device" }} · port ${candidate.portNumber + 1}")
                }
            }
        }
        val matches = sources.filter { it.identity == selected }
        if (matches.size > 1 && !ambiguousIdentity) {
            ambiguousIdentity = true
            preferences.edit().putBoolean("ambiguous", true).apply()
        }
        // A user's explicit choice is valid for this attachment, even among identical devices.
        val explicit = matches.singleOrNull { it.device.id == knownId }
        val source = explicit ?: matches.singleOrNull()
        if (selectedId != null && source?.device?.id != selectedId)
            closePort("MIDI identity changed or is ambiguous. Select the input again.")
        if (active && reconnect && selectedId == null) {
            when {
                manager == null -> status = "MIDI is unavailable on this device"
                selected == null -> status = "Choose a USB MIDI input"
                matches.isEmpty() -> status = "Waiting for the selected USB MIDI input"
                source == null -> status = "Several inputs match. Select the input again."
                ambiguousIdentity && source.device.id != knownId -> status = "Input identity was ambiguous. Select it again."
                !source.strongIdentity && source.device.id != knownId -> status = "Input has no stable identity. Select it again."
                else -> open(source)
            }
        }
        publish()
    }

    private fun open(source: NativeMidiSource) {
        val current = synchronized(gate) { ++generation }
        selectedId = source.device.id
        status = "Opening ${source.label}…"
        try {
            manager?.openDevice(source.device, { opened ->
                if (!active || closed || current != synchronized(gate) { generation }) {
                    runCatching { opened?.close() }; return@openDevice
                }
                if (opened == null) { closePort("Cannot open MIDI input. Choose Connect to retry."); return@openDevice }
                try {
                    val output = opened.openOutputPort(source.port) ?: error("Port unavailable")
                    device = opened
                    port = output
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
                } catch (_: Exception) { runCatching { opened.close() }; closePort("MIDI port failed. Choose Connect to retry.") }
            }, main)
        } catch (_: Exception) { closePort("Cannot open MIDI input. Choose Connect to retry.") }
    }

    private fun closePort(reason: String) {
        synchronized(gate) {
            generation++
            session = null
            events.clear()
            status = reason
        }
        val previousPort = port; val previousDevice = device
        port = null; device = null; selectedId = null
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
                    reconnect = false
                    closePort("MIDI input overflow. Choose Connect to retry.")
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
            session?.snapshot ?: MidiSnapshot(), selected != null))
    }
}
