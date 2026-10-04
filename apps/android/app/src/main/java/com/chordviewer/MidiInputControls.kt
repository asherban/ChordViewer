package com.chordviewer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.chordviewer.midi.MidiInputEvent
import com.chordviewer.midi.MidiDeviceSelection
import com.chordviewer.midi.NativeMidiInput
import com.chordviewer.midi.NativeMidiUpdate

@Composable
internal fun rememberMidiInput(selection: MidiDeviceSelection, onEvent: (MidiInputEvent) -> Unit = {}): MidiInputState {
    val context = LocalContext.current.applicationContext
    var update by remember { mutableStateOf(NativeMidiUpdate()) }
    val events = rememberUpdatedState(onEvent)
    val input = remember(context, selection) { NativeMidiInput(context, { events.value(it) }, selection) { update = it } }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(input, lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> input.foreground(true)
                Lifecycle.Event.ON_STOP -> input.foreground(false)
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        input.foreground(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
        onDispose { lifecycle.removeObserver(observer); input.foreground(false) }
    }
    DisposableEffect(input) { onDispose { input.close() } }
    return MidiInputState(update.snapshot, update.status, update.connected, { input.clear() }, input::select,
        update.sources.map { source ->
            val duplicate = update.sources.count { it.label == source.label } > 1
            MidiDeviceOption(source.id, if (duplicate) "${source.label} (${source.id})" else source.label)
        }, update.selectedId)
}
