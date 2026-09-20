package com.chordviewer.midi

import android.os.Handler
import android.os.Looper
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.concurrent.thread

internal data class RelayUpdate(val status: String, val connected: Boolean, val snapshot: MidiSnapshot = MidiSnapshot())

/** Only connects to adb's reverse mapping on emulator loopback. Never listens on the network. */
internal class DebugMidiRelay(private val onUpdate: (RelayUpdate) -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private val lock = Any()
    private var generation = 0L
    private var socket: Socket? = null
    private var queuedUpdate: Pair<Long, RelayUpdate>? = null
    private var deliveryQueued = false

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
                    publish(current, RelayUpdate("Connected · local MIDI bridge", true, snapshot))
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
            generation
        }
        publish(current, RelayUpdate("Disconnected", false))
    }

    private fun publish(current: Long, update: RelayUpdate) = synchronized(lock) {
        if (current != generation) return@synchronized
        queuedUpdate = current to update
        if (deliveryQueued) return@synchronized
        deliveryQueued = true
        main.post {
            val next = synchronized(lock) {
                deliveryQueued = false
                queuedUpdate.also { queuedUpdate = null }
            }
            if (next != null && synchronized(lock) { generation == next.first }) onUpdate(next.second)
        }
    }
}
