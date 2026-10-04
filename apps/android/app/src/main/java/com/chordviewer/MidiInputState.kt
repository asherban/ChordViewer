package com.chordviewer

import com.chordviewer.midi.MidiSnapshot

data class MidiDeviceOption(val id: String, val label: String)

/** Opening the device picker never owns or resets the input connection. */
class MidiInputState(
    val snapshot: MidiSnapshot,
    val status: String,
    val connected: Boolean,
    val clear: () -> Unit,
    val select: (String) -> Unit,
    val devices: List<MidiDeviceOption> = emptyList(),
    val selectedId: String? = null,
)
