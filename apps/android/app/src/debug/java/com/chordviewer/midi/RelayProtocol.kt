package com.chordviewer.midi

import java.io.InputStream
import org.json.JSONObject

/** Debug-only framing; rejects missing, reordered or oversized input before changing MIDI state. */
internal class RelayProtocol {
    private var expectedSequence = 0L
    private var previousTimestamp = 0L
    private val midi = MidiState()
    var lastEvent: MidiInputEvent = MidiInputEvent.Reset(); private set

    fun accept(line: String): MidiSnapshot {
        val frame = JSONObject(line)
        val sequence = frame.integer("sequence")
        val timestamp = frame.integer("timestampMs")
        require(sequence == expectedSequence && timestamp >= previousTimestamp) { "Out-of-order MIDI frame" }
        require(expectedSequence < Long.MAX_VALUE) { "Sequence exhausted" }
        val type = frame.getString("type")
        require(sequence != 0L || type == "reset") { "Expected initial MIDI reset" }
        val result = when (type) {
            "reset" -> midi.reset().also { lastEvent = MidiInputEvent.Reset(true, "MIDI connected. Choose a position and arm entry.") }
            "midi" -> {
                val data = frame.getJSONArray("data")
                require(data.length() in 1..256) { "Invalid MIDI frame length" }
                val bytes = IntArray(data.length()) { index ->
                    val value = data.get(index)
                    require(value is Int && value in 0..255) { "Invalid MIDI byte" }
                    value
                }
                midi.accept(bytes).also { lastEvent = MidiInputEvent.Bytes(bytes) }
            }
            else -> throw IllegalArgumentException("Unknown MIDI frame")
        }
        expectedSequence++
        previousTimestamp = timestamp
        return result
    }

    private fun JSONObject.integer(name: String): Long {
        val value = get(name)
        require(value is Int || value is Long) { "Invalid integer" }
        return (value as Number).toLong().also { require(it >= 0) { "Negative integer" } }
    }
}

/** Keep memory bounded even if a local process sends an unterminated line. */
internal fun InputStream.readRelayLine(): String? {
    val bytes = ByteArray(4096)
    var length = 0
    while (true) {
        val byte = read()
        if (byte == -1) {
            require(length == 0) { "Truncated MIDI frame" }
            return null
        }
        if (byte == 13) {
            require(read() == 10) { "Invalid MIDI frame ending" }
            return String(bytes, 0, length, Charsets.US_ASCII)
        }
        if (byte == 10) return String(bytes, 0, length, Charsets.US_ASCII)
        require(length < bytes.size && byte in 32..126) { "Invalid or oversized MIDI frame" }
        bytes[length++] = byte.toByte()
    }
}
