package com.chordviewer.midi

/** Product input policy, independent of Android callbacks and presentation. Times are monotonic. */
class MidiInputSession(private val computerBridge: Boolean) {
    private val state = MidiState()
    private val decoder = ChannelMessageDecoder()
    private var sensing = false
    private var lastArrival = 0L
    var ready = !computerBridge
        private set
    val snapshot get() = state.snapshot()

    fun opened(): List<MidiInputEvent> = reset(!computerBridge,
        if (computerBridge) "Computer via USB · waiting for router" else "USB MIDI connected. Resume entry when ready.")

    fun clear(): List<MidiInputEvent> = reset(ready, "Notes cleared. Resume entry when ready.")

    fun expire(nowMs: Long): List<MidiInputEvent> {
        if (!sensing || nowMs - lastArrival < 300L) return emptyList()
        sensing = false
        return reset(!computerBridge, "MIDI signal stopped. Notes cleared and entry paused.")
    }

    fun accept(data: IntArray, arrivalMs: Long): List<MidiInputEvent> {
        require(data.all { it in 0..255 })
        val result = expire(arrivalMs).toMutableList()
        if (data.isEmpty()) return result
        lastArrival = arrivalMs
        for (byte in data) {
            when (byte) {
                0xFE -> {
                    sensing = true
                    if (!ready) {
                        result.addAll(reset(true, "Computer via USB ready. Resume entry when ready."))
                    }
                }
                0xFF -> {
                    result.clear()
                    result.addAll(reset(!computerBridge, "MIDI reset. Entry paused."))
                    sensing = false
                }
                else -> decoder.accept(byte)?.let { message ->
                    if (computerBridge && message[0] and 0xF0 == 0xB0 &&
                        message[1] in listOf(120, 123) && message[2] == 0) {
                        // A restart can be shorter than the health timeout. Cleanup is its boundary.
                        result.clear()
                        result.addAll(reset(false, "Computer MIDI restarted or cleared. Entry paused."))
                        sensing = false
                    } else if (ready) {
                        state.accept(message)
                        result.add(MidiInputEvent.Bytes(message))
                    }
                }
            }
        }
        return result
    }

    private fun reset(connected: Boolean, reason: String): List<MidiInputEvent> {
        ready = connected
        state.reset()
        decoder.reset()
        return listOf(MidiInputEvent.Reset(connected, reason))
    }
}

/** Reconstruct complete channel messages; realtime bytes never disturb running status. */
private class ChannelMessageDecoder {
    private var status = 0
    private var needed = 0
    private var count = 0
    private val data = IntArray(2)
    private var sysex = false

    fun reset() { status = 0; needed = 0; count = 0; sysex = false }

    fun accept(byte: Int): IntArray? {
        if (byte >= 0xF8) { return null }
        if (byte >= 0x80) {
            status = byte
            count = 0
            sysex = byte == 0xF0
            needed = when (byte) {
                in 0x80..0xBF, in 0xE0..0xEF -> 2
                in 0xC0..0xDF, 0xF1, 0xF3 -> 1
                0xF2 -> 2
                else -> 0
            }
            return null
        }
        if (sysex || needed == 0) { return null }
        data[count++] = byte
        if (count != needed) { return null }
        count = 0
        if (status >= 0xF0) { needed = 0; return null }
        return if (needed == 1) intArrayOf(status, data[0]) else intArrayOf(status, data[0], data[1])
    }
}
