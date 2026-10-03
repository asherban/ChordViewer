package com.chordviewer

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.chordviewer.midi.MidiInputEvent
import com.chordviewer.midi.NativeMidiInput
import com.chordviewer.midi.NativeMidiUpdate

@Composable
fun rememberMidiInput(initialIntent: Intent, onEvent: (MidiInputEvent) -> Unit = {}): MidiInputState {
    var emulator by remember { mutableStateOf(emulatorMidiRequested(initialIntent)) }
    val owner = rememberUpdatedState(emulator)
    val events = rememberUpdatedState(onEvent)
    val native = rememberNativeMidiInput(!emulator) { if (!owner.value) events.value(it) }
    val debug = rememberEmulatorMidiInput(initialIntent, emulator) { if (owner.value) events.value(it) }
    val current = if (emulator) debug ?: native else native
    return MidiInputState(current.snapshot, current.status, current.connected, current.disconnect) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (debug != null) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = {
                    current.disconnect()
                    events.value(MidiInputEvent.Reset(false, "MIDI source changed. Entry paused."))
                    emulator = false
                }, enabled = emulator) { Text("USB MIDI") }
                OutlinedButton(onClick = {
                    current.disconnect()
                    events.value(MidiInputEvent.Reset(false, "MIDI source changed. Entry paused."))
                    emulator = true
                }, enabled = !emulator) { Text("Emulator bridge") }
            }
            current.controls()
        }
    }
}

@Composable
private fun rememberNativeMidiInput(enabled: Boolean, onEvent: (MidiInputEvent) -> Unit): MidiInputState {
    val context = LocalContext.current.applicationContext
    var update by remember { mutableStateOf(NativeMidiUpdate()) }
    val input = remember(context) { NativeMidiInput(context, onEvent) { update = it } }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(input, lifecycle, enabled) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> input.foreground(enabled)
                Lifecycle.Event.ON_STOP -> input.foreground(false)
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        input.foreground(enabled && lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
        onDispose { lifecycle.removeObserver(observer); input.foreground(false) }
    }
    DisposableEffect(input) { onDispose { input.close() } }
    return MidiInputState(update.snapshot, update.status, update.connected, input::disconnect) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("USB MIDI")
            Text(update.status)
            if (update.sources.isEmpty()) Text("Connect a piano, or connect the computer and select MIDI in the tablet's USB preferences.")
            update.sources.forEach { source ->
                OutlinedButton(onClick = { input.select(source) }) { Text("Use ${source.label}") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = input::connect, enabled = update.hasSelection && !update.connected) { Text("Connect") }
                OutlinedButton(onClick = input::disconnect) { Text("Disconnect") }
                OutlinedButton(onClick = { input.clear() }, enabled = update.connected) { Text("Clear notes") }
            }
        }
    }
}
