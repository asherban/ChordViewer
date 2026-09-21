package com.chordviewer

import android.content.Intent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.midi.MidiInputEvent

@Composable
@Suppress("UNUSED_PARAMETER")
fun rememberMidiInput(initialIntent: Intent, onEvent: (MidiInputEvent) -> Unit = {}): MidiInputState = MidiInputState(MidiSnapshot(), "Not connected", false, {}) {
    Text("USB and Bluetooth MIDI support will be available in a later version.")
}
