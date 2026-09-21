package com.chordviewer.midi

import android.os.Handler
import android.os.Looper
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.concurrent.thread

internal data class RelayUpdate(val status: String, val connected: Boolean, val snapshot: MidiSnapshot = MidiSnapshot())

/** Only connects to adb's reverse mapping on emulator loopback. Never listens on the network. */
internal class DebugMidiRelay(private val onInput: (MidiInputEvent) -> Unit = {}, private val onUpdate: (RelayUpdate) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val lock = Any()
    private var generation = 0L
    private var socket: Socket? = null
    private var queuedUpdate: Pair<Long, RelayUpdate>? = null
    private var deliveryQueued = false
    private val events = OrderedMidiEventBuffer()

    fun connect(token: String) {
        require(token.matches(Regex("[a-fA-F0-9]{64}"))) { "Expected a 64-character bridge token" }
        disconnect()
        val current = synchronized(lock) { generation }
        publish(current, RelayUpdate("Connecting to local MIDI bridge…", false))
        thread(name = "chordviewer-debug-midi", isDaemon = true) {
            val connection = Socket()
            try {
                synchronized(lock) {
                    if (generation != current) return@thread
                    socket = connection
                }
                connection.connect(InetSocketAddress("127.0.0.1", 39173), 3000)
                connection.soTimeout = 5000
                connection.getOutputStream().apply {
                    write("{\"type\":\"hello\",\"token\":\"$token\"}\n".toByteArray(Charsets.US_ASCII))
                    flush()
                }
                val protocol = RelayProtocol()
                val input = connection.getInputStream().buffered()
                var firstFrame = true
                while (true) {
                    val line = input.readRelayLine() ?: break
                    val snapshot = protocol.accept(line)
                    if (firstFrame) {
                        connection.soTimeout = 0
                        firstFrame = false
                    }
                    publish(current, RelayUpdate("Connected · local MIDI bridge", true, snapshot), protocol.lastEvent)
                }
                publish(current, RelayUpdate("Disconnected · reconnect when the bridge is ready", false))
            } catch (_: Exception) {
                // Never log input frames, the token, or exception text containing input.
                publish(current, RelayUpdate("Connection closed · check bridge, token and adb reverse", false))
            } finally {
                runCatching { connection.close() }
                synchronized(lock) { if (socket === connection) socket = null }
            }
        }
    }

    fun disconnect() {
        val current = synchronized(lock) {
            generation++
            runCatching { socket?.close() }
            socket = null
            events.clear()
            generation
        }
        publish(current, RelayUpdate("Disconnected", false))
    }

    private fun publish(current: Long, update: RelayUpdate, event: MidiInputEvent? = null) = synchronized(lock) {
        if (current != generation) return@synchronized
        queuedUpdate = current to update
        val input = event ?: if (!update.connected) MidiInputEvent.Reset(false, update.status) else null
        if (input != null) {
            if (!events.offer(input)) {
                // One bounded main-thread delivery owns all events. Losing even one note-off
                // invalidates a gesture, so overflow disconnects and resets instead of dropping notes.
                generation++
                runCatching { socket?.close() }
                socket = null
                queuedUpdate = generation to RelayUpdate("Input overflow · reconnect MIDI", false)
            }
        }
        if (deliveryQueued) return@synchronized
        deliveryQueued = true
        main.post {
            val next = synchronized(lock) {
                deliveryQueued = false
                queuedUpdate?.let { Triple(it.first, it.second, events.drain()) }.also { queuedUpdate = null }
            }
            if (next != null && synchronized(lock) { generation == next.first }) {
                next.third.forEach(onInput)
                onUpdate(next.second)
            }
        }
    }
}
