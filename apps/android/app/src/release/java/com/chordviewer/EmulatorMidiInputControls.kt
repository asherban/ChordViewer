package com.chordviewer

import android.content.Intent
import androidx.compose.runtime.Composable
import com.chordviewer.midi.MidiInputEvent

@Suppress("UNUSED_PARAMETER")
fun emulatorMidiRequested(intent: Intent): Boolean = false

@Composable
@Suppress("UNUSED_PARAMETER")
fun rememberEmulatorMidiInput(initialIntent: Intent, enabled: Boolean, onEvent: (MidiInputEvent) -> Unit): MidiInputState? = null
