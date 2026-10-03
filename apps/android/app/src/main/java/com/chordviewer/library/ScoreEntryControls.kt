package com.chordviewer.library

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chordviewer.score.*
import com.chordviewer.ui.*

/** Capture controls remain in the dock; manual harmony is entered directly on the score. */
@Composable
fun ScoreEntryControls(state: LibraryState, model: LibraryViewModel, changeMelody: (Boolean) -> Unit) {
    val editor = state.editor ?: return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("ENTRY", style = MaterialTheme.typography.labelLarge, color = MutedColor)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            EntryLane.entries.forEach { lane -> FilterChip(selected = editor.lane == lane,
                onClick = { model.setLane(lane); if (lane == EntryLane.MELODY) changeMelody(true) }, enabled = !state.busy,
                label = { Text(if (lane == EntryLane.CHORDS) "Chords" else "Melody") },
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).semantics { contentDescription = "${lane.name.lowercase().replaceFirstChar { it.uppercase() }} entry lane" }) }
        }
        Button(onClick = { if (editor.mode == EntryMode.PAUSED) model.armEntry() else model.pauseEntry() },
            enabled = !state.busy && (state.midiConnected || editor.mode != EntryMode.PAUSED) && editor.pending == null && editor.pendingMelody == null,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text(if (editor.mode == EntryMode.PAUSED) "Start MIDI entry" else "Pause entry") }
        if (editor.lane == EntryLane.CHORDS) {
            Text("Tap a chord to edit. Tap + after the last chord to add.", style = MaterialTheme.typography.bodySmall, color = MutedColor)
            if (editor.pending != null) {
                TextButton(model::openChordDialog, modifier = Modifier.heightIn(min = 48.dp)) { Text("Assign captured chord") }
                TextButton(model::discardPending, modifier = Modifier.heightIn(min = 48.dp)) { Text("Discard capture") }
            }
        } else if (editor.pendingMelody != null) {
            Text(editor.message ?: "The captured note could not be inserted.", style = MaterialTheme.typography.bodySmall)
            Row {
                TextButton({ model.applyMelody(editor.pendingMelody.pitch) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Retry capture") }
                TextButton(model::discardPending, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Discard capture") }
            }
        }
        if (editor.lane == EntryLane.MELODY && editor.selectedMelodyId != null && state.midiConnected) {
            OutlinedButton({ model.armEntry(true) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Replace from MIDI") }
        }
        if (editor.message != null && editor.pending == null && editor.pendingMelody == null && !editor.message.startsWith("Inserted ")) Text(editor.message, color = MutedColor, style = MaterialTheme.typography.bodySmall)
    }
}
internal fun melodyDurationLabel(value: ScoreDuration) = when (value.denominator) { 1 -> "Whole"; 2 -> "Half"; 4 -> "Quarter"; 8 -> "Eighth"; 16 -> "Sixteenth"; else -> "Thirty-second" } + if (value.dots == 1) " dotted" else ""
