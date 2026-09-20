package com.chordviewer.midi

data class MidiNote(val channel: Int, val pitch: Int) {
    val name: String
        get() = "${PITCH_NAMES[pitch % 12]}${pitch / 12 - 1}"

    private companion object {
        val PITCH_NAMES = arrayOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    }
}

data class MidiSnapshot(
    val held: List<MidiNote> = emptyList(),
    val sounding: List<MidiNote> = emptyList(),
    val sustainChannels: List<Int> = emptyList(),
    val messagesReceived: Long = 0,
)

/** A transport-independent MIDI 1.0 byte stream. One owner feeds each instance. */
class MidiState {
    private val held = Array(16) { BooleanArray(128) }
    private val sounding = Array(16) { BooleanArray(128) }
    private val sustain = BooleanArray(16)
    private var status = 0
    private var needed = 0
    private var count = 0
    private val pending = IntArray(2)
    private var inSysEx = false
    private var messages = 0L

    fun accept(bytes: IntArray): MidiSnapshot {
        require(bytes.all { it in 0..255 }) { "MIDI bytes must be between 0 and 255" }
        bytes.forEach(::acceptByte)
        return snapshot()
    }

    fun reset(): MidiSnapshot {
        held.forEach { it.fill(false) }
        sounding.forEach { it.fill(false) }
        sustain.fill(false)
        status = 0
        needed = 0
        count = 0
        inSysEx = false
        messages = 0
        return snapshot()
    }

    fun snapshot() = MidiSnapshot(
        held = notesIn(held),
        sounding = notesIn(sounding),
        sustainChannels = sustain.indices.filter { sustain[it] },
        messagesReceived = messages,
    )

    private fun notesIn(states: Array<BooleanArray>): List<MidiNote> = buildList {
        states.forEachIndexed { channel, pitches ->
            pitches.forEachIndexed { pitch, active -> if (active) add(MidiNote(channel, pitch)) }
        }
    }

    private fun acceptByte(byte: Int) {
        // Realtime bytes can occur between any two bytes of a message.
        if (byte >= 0xF8) {
            if (byte == 0xFF) reset()
            return
        }
        if (byte >= 0x80) {
            inSysEx = byte == 0xF0
            count = 0
            status = byte
            needed = when (byte) {
                in 0x80..0xBF, in 0xE0..0xEF -> 2
                in 0xC0..0xDF, 0xF1, 0xF3 -> 1
                0xF2 -> 2
                else -> 0
            }
            return
        }
        if (inSysEx || needed == 0) return
        pending[count++] = byte
        if (count != needed) return
        if (status < 0xF0) applyChannelMessage(status, pending[0], pending[1])
        count = 0
        // System-common messages cancel running status; channel messages retain it.
        if (status >= 0xF0) needed = 0
    }

    private fun applyChannelMessage(status: Int, first: Int, second: Int) {
        messages++
        val channel = status and 0x0F
        when (status and 0xF0) {
            0x80 -> release(channel, first)
            0x90 -> if (second == 0) release(channel, first) else {
                held[channel][first] = true
                sounding[channel][first] = true
            }
            0xB0 -> when (first) {
                64 -> {
                    sustain[channel] = second >= 64
                    if (!sustain[channel]) dropReleased(channel)
                }
                120 -> {
                    held[channel].fill(false)
                    sounding[channel].fill(false)
                }
                121 -> {
                    sustain[channel] = false
                    dropReleased(channel)
                }
                123, 124, 125, 126, 127 -> {
                    held[channel].fill(false)
                    if (!sustain[channel]) sounding[channel].fill(false)
                }
            }
        }
    }

    private fun release(channel: Int, pitch: Int) {
        held[channel][pitch] = false
        if (!sustain[channel]) sounding[channel][pitch] = false
    }

    private fun dropReleased(channel: Int) {
        sounding[channel].indices.forEach { pitch -> sounding[channel][pitch] = held[channel][pitch] }
    }
}
