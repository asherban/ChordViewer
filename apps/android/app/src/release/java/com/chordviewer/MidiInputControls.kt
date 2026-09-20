package com.chordviewer

import android.content.Intent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.chordviewer.midi.MidiSnapshot

@Composable
@Suppress("UNUSED_PARAMETER")
fun MidiInputControls(initialIntent: Intent, onSnapshot: (MidiSnapshot) -> Unit) {
    Text("Device MIDI connection will be added in a later milestone.")
}
