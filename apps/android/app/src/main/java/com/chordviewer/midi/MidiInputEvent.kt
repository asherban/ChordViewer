package com.chordviewer.midi

/** Ordered transport events. Authoring must consume these, never a coalesced screen snapshot. */
sealed interface MidiInputEvent {
    data class Bytes(val data: IntArray) : MidiInputEvent
    data class Reset(val connected: Boolean = false, val reason: String = "MIDI entry paused. Reconnect and arm when ready.") : MidiInputEvent
}

/** Single-owner bounded handoff. Overflow invalidates all queued gesture history. */
class OrderedMidiEventBuffer(private val capacity: Int = 1024) {
    private val events = ArrayDeque<MidiInputEvent>()
    init { require(capacity in 1..4096) }
    fun offer(event: MidiInputEvent): Boolean {
        if (events.size >= capacity) {
            events.clear()
            events.addLast(MidiInputEvent.Reset(false, "MIDI input was too fast. Reconnect and arm entry again."))
            return false
        }
        events.addLast(event)
        return true
    }
    fun clear() = events.clear()
    fun drain(): List<MidiInputEvent> = events.toList().also { events.clear() }
}

/** Physical-key gesture capture; sustain affects sound, never the insertion boundary. */
class ChordGestureCapture(private val completed: (List<Int>) -> Unit) {
    private val held = mutableSetOf<Int>()
    private val gesture = mutableSetOf<Int>()
    private var enabled = false
    private var waiting = false
    private var status = 0
    private var needed = 0
    private val data = IntArray(2)
    private var count = 0
    private var sysex = false
    val waitingForRelease get() = waiting
    val armed get() = enabled
    val heldKeys get() = held.toSet()

    fun arm() { enabled = true; gesture.clear(); waiting = held.isNotEmpty() }
    fun pause() { enabled = false; gesture.clear(); waiting = held.isNotEmpty() }
    fun reset(heldIds: Set<Int> = emptySet()) {
        require(heldIds.all { it in 0..2047 })
        held.clear(); held.addAll(heldIds); pause()
        status = 0; needed = 0; count = 0; sysex = false
    }
    fun accept(bytes: IntArray) {
        require(bytes.all { it in 0..255 })
        bytes.forEach { byte ->
            if (byte >= 0xF8) {
                if (byte == 0xFF) reset()
            } else if (byte >= 0x80) {
                sysex = byte == 0xF0; count = 0; status = byte
                needed = when (byte) {
                    in 0x80..0xBF, in 0xE0..0xEF -> 2
                    in 0xC0..0xDF, 0xF1, 0xF3 -> 1
                    0xF2 -> 2
                    else -> 0
                }
            } else if (!sysex && needed > 0) {
                data[count++] = byte
                if (count == needed) {
                    if (status < 0xF0) message(status, data[0], data[1])
                    count = 0
                    if (status >= 0xF0) needed = 0
                }
            }
        }
    }
    private fun message(status: Int, first: Int, second: Int) {
        val channel = status and 15
        val identity = channel * 128 + first
        when (status and 0xF0) {
            0x90 -> if (second > 0) {
                held.add(identity)
                if (enabled && !waiting) gesture.add(first)
            } else release(identity)
            0x80 -> release(identity)
            0xB0 -> if (first == 120 || first in 123..127) {
                held.removeAll { it / 128 == channel }
                gesture.clear(); waiting = held.isNotEmpty()
            }
        }
    }
    private fun release(identity: Int) {
        if (!held.remove(identity) || held.isNotEmpty()) return
        if (waiting) { waiting = false; gesture.clear(); return }
        val notes = gesture.sorted(); gesture.clear()
        if (enabled && notes.isNotEmpty()) completed(notes)
    }
}
