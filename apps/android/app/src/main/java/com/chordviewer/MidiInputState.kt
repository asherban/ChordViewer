package com.chordviewer

import androidx.compose.runtime.Composable
import com.chordviewer.midi.MidiSnapshot

/** The app shell owns this transport state; opening or closing its controls never owns the connection. */
class MidiInputState(
    val snapshot: MidiSnapshot,
    val status: String,
    val connected: Boolean,
    val disconnect: () -> Unit,
    val controls: @Composable () -> Unit,
)
