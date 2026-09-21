package com.chordviewer.library

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chordviewer.score.*
import com.chordviewer.ui.*

/** Two touch-sized toolbar rows keep the score visible; expanded editing is deliberate. */
@Composable
fun ChordEntryControls(state: LibraryState, model: LibraryViewModel, melody: Boolean, changeMelody: (Boolean) -> Unit) {
    val editor = state.editor ?: return
    val selected = editor.selectedId?.let { ChordEdits.find(editor.score, it)?.first }
    val symbolKey: Any? = editor.pending?.notes ?: editor.selectedId
    var symbol by remember(symbolKey) { mutableStateOf(if (editor.pending != null) editor.alternatives.firstOrNull().orEmpty() else selected?.symbol.orEmpty()) }
    var durationPicker by remember { mutableStateOf(false) }
    var positionPicker by remember { mutableStateOf(false) }
    var chordPicker by remember { mutableStateOf(false) }
    val chords = editor.score.measures.getOrNull(editor.position.measureIndex)?.chords.orEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (editor.mode == EntryMode.PAUSED) "MIDI entry paused" else if (editor.mode == EntryMode.REPLACE) "Replace one chord" else "MIDI entry on", color = AccentColor, style = MaterialTheme.typography.titleMedium)
            Switch(melody, changeMelody, modifier = Modifier.semantics { contentDescription = "Show melody notation" })
            Text("Melody", style = MaterialTheme.typography.bodySmall)
            OutlinedButton(model::undoChord, enabled = !state.busy && editor.canUndo, modifier = Modifier.heightIn(min = 48.dp)) { Text("Undo") }
            OutlinedButton(model::redoChord, enabled = !state.busy && editor.canRedo, modifier = Modifier.heightIn(min = 48.dp)) { Text("Redo") }
            Button(model::save, enabled = !state.busy && state.hasUnsavedChanges, modifier = Modifier.heightIn(min = 48.dp)) { Text("Save sheet") }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { model.pauseEntry(); durationPicker = true }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Choose duration" }) { Text("${chordDurationLabel(editor.duration)} duration") }
            OutlinedButton(onClick = { model.pauseEntry(); positionPicker = true }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Choose insertion position" }) { Text(editor.position.label + if (editor.position.measureIndex == editor.score.measures.size) " · next" else "") }
            if (selected == null && editor.pending == null) {
                Button(onClick = { if (editor.mode == EntryMode.PAUSED) model.armEntry() else model.pauseEntry() },
                    enabled = !state.busy && (state.midiConnected || editor.mode != EntryMode.PAUSED), modifier = Modifier.heightIn(min = 48.dp)) { Text(if (editor.mode == EntryMode.PAUSED) "Start MIDI entry" else "Pause entry") }
                OutlinedButton(onClick = { model.pauseEntry(); chordPicker = true }, enabled = !state.busy && chords.isNotEmpty(),
                    modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Choose chord to change" }) { Text("Change chord") }
                if (editor.lastInsertedId != null) TextButton(onClick = { model.selectChord(editor.lastInsertedId) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Change last") }
            }
        }
        if (selected != null || editor.pending != null) {
            if (editor.pending != null) Text("Pending chord · ${editor.pending.position.label}. Apply it to change the score.", style = MaterialTheme.typography.bodySmall, color = MutedColor)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(symbol, { symbol = it.take(64) }, label = { Text("Chord symbol") }, singleLine = true, enabled = !state.busy, modifier = Modifier.weight(1f))
                Button(onClick = { if (editor.pending != null) model.applyPending(symbol) else model.changeChord(symbol, editor.duration) },
                    enabled = !state.busy && symbol.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp)) { Text(if (editor.pending != null) "Apply chord" else "Apply change") }
            }
            if (editor.alternatives.size > 1) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                editor.alternatives.forEach { candidate -> SuggestionChip(onClick = { symbol = candidate }, label = { Text(candidate) }, modifier = Modifier.heightIn(min = 48.dp)) }
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (editor.pending != null) OutlinedButton(model::discardPending, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Discard pending chord") }
                else {
                    OutlinedButton(onClick = { model.armEntry(true) }, enabled = !state.busy && state.midiConnected && editor.mode == EntryMode.PAUSED, modifier = Modifier.heightIn(min = 48.dp)) { Text("Replace from MIDI") }
                    OutlinedButton(model::deleteChord, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Delete chord") }
                    TextButton(onClick = { model.setPosition(editor.position) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Close selection") }
                }
                if (editor.mode == EntryMode.REPLACE) OutlinedButton(model::pauseEntry, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel replacement") }
            }
        }
        Text(editor.message ?: "Play and release a chord. Sustain does not delay insertion.", color = MutedColor, style = MaterialTheme.typography.bodySmall)
    }
    if (durationPicker) AlertDialog(onDismissRequest = { durationPicker = false }, title = { Text("Chord duration") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            CHORD_DURATIONS.forEach { duration ->
                OutlinedButton(onClick = { model.setDuration(duration); durationPicker = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Duration ${chordDurationLabel(duration)}" }) {
                    Text(chordDurationLabel(duration) + if (duration == editor.duration) " · selected" else "")
                }
            }
        } }, confirmButton = { TextButton(onClick = { durationPicker = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } })
    if (positionPicker) AlertDialog(onDismissRequest = { positionPicker = false }, title = { Text("Insertion position") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { model.setPosition(ScorePosition(editor.position.measureIndex - 1)) }, enabled = editor.position.measureIndex > 0, modifier = Modifier.heightIn(min = 48.dp)) { Text("Previous bar") }
                Text("Bar ${editor.position.measureIndex + 1}", modifier = Modifier.weight(1f))
                OutlinedButton(onClick = { model.setPosition(ScorePosition(editor.position.measureIndex + 1)) }, enabled = editor.position.measureIndex < editor.score.measures.size && editor.position.measureIndex < 255,
                    modifier = Modifier.heightIn(min = 48.dp)) { Text("Next bar") }
            }
            (0 until BAR_TICKS step 240).toList().chunked(4).forEach { group -> Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                group.forEach { offset ->
                    val beat = "${offset / 480 + 1}${if (offset % 480 == 240) ".5" else ""}"
                    FilterChip(selected = editor.position.offsetTicks == offset, onClick = { model.setPosition(editor.position.copy(offsetTicks = offset)) }, label = { Text(beat) }, modifier = Modifier.heightIn(min = 48.dp))
                }
            } }
        } }, confirmButton = { TextButton(onClick = { positionPicker = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } })
    if (chordPicker) AlertDialog(onDismissRequest = { chordPicker = false }, title = { Text("Change a chord · bar ${editor.position.measureIndex + 1}") },
        text = { Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            chords.forEach { chord -> OutlinedButton(onClick = { model.selectChord(chord.id); chordPicker = false },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Select chord ${chord.symbol} at tick ${chord.offsetTicks}" }) {
                Text("${chord.symbol} · beat ${1 + chord.offsetTicks / 480}${if (chord.offsetTicks % 480 == 240) ".5" else ""}")
            } }
        } }, confirmButton = { TextButton(onClick = { chordPicker = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } })
}
