package com.chordviewer.library

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chordviewer.score.*
import com.chordviewer.ui.*

/** Entry lives beside the score; corrections wrap inside the independently scrolling dock. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ScoreEntryControls(state: LibraryState, model: LibraryViewModel, changeMelody: (Boolean) -> Unit) {
    val editor = state.editor ?: return
    val selected = editor.selectedId?.let { ChordEdits.find(editor.score, it)?.first }
    val symbolKey: Any? = editor.pending?.notes ?: editor.selectedId
    var symbol by remember(symbolKey) { mutableStateOf(if (editor.pending != null) editor.alternatives.firstOrNull().orEmpty() else selected?.symbol.orEmpty()) }
    var durationPicker by remember { mutableStateOf(false) }
    var positionPicker by remember { mutableStateOf(false) }
    var chordPicker by remember { mutableStateOf(false) }
    var manual by remember(editor.lane) { mutableStateOf(editor.lane == EntryLane.CHORDS) }
    val melodyLane = editor.lane == EntryLane.MELODY
    val selectedNote = editor.selectedMelodyId?.let { MelodyEdits.find(editor.score, it)?.first }
    val hasSelection = selected != null || selectedNote != null
    val hasPending = editor.pending != null || editor.pendingMelody != null
    val chords = editor.score.measures.getOrNull(editor.position.measureIndex)?.chords.orEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("ENTRY", style = MaterialTheme.typography.labelLarge, color = MutedColor)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            EntryLane.entries.forEach { lane -> FilterChip(selected = editor.lane == lane, onClick = { model.setLane(lane); if (lane == EntryLane.MELODY) changeMelody(true) }, enabled = !state.busy,
                label = { Text(if (lane == EntryLane.CHORDS) "Chords" else "Melody") }, modifier = Modifier.weight(1f).heightIn(min = 48.dp).semantics { contentDescription = "${lane.name.lowercase().replaceFirstChar { it.uppercase() }} entry lane" }) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (!melodyLane) OutlinedButton(onClick = { durationPicker = true }, enabled = !state.busy,
                shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Choose duration" }) {
                    Text(if (!hasSelection && editor.duration == editor.score.measureTicks) "To bar end ▾" else "${chordDurationLabel(editor.duration, editor.score.measureTicks)} duration ▾")
                }
            if (!melodyLane) OutlinedButton(onClick = { model.pauseEntry(); positionPicker = true }, enabled = !state.busy,
                shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Choose insertion position" }) { Text(positionLabel(editor.position, editor.score.timeSignature) + if (editor.position.measureIndex == editor.score.measures.size) " · next" else " ▾") }
            if (!hasSelection && !hasPending) {
                Button(onClick = { if (editor.mode == EntryMode.PAUSED) model.armEntry() else model.pauseEntry() },
                    enabled = !state.busy && (state.midiConnected || editor.mode != EntryMode.PAUSED), shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (editor.mode == EntryMode.PAUSED) "Start MIDI entry" else "Pause entry") }
                if (!melodyLane) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    OutlinedButton(onClick = { model.pauseEntry(); manual = !manual }, enabled = !state.busy, shape = MaterialTheme.shapes.small,
                        contentPadding = PaddingValues(8.dp), modifier = Modifier.heightIn(min = 48.dp)) { Text(if (melodyLane) "Add note / rest" else "Add chord") }
                    OutlinedButton(onClick = { model.pauseEntry(); chordPicker = true }, enabled = !state.busy && (if (melodyLane) editor.score.measures.getOrNull(editor.position.measureIndex)?.melody?.isNotEmpty() == true else chords.isNotEmpty()),
                        shape = MaterialTheme.shapes.small, contentPadding = PaddingValues(8.dp),
                        modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = if (melodyLane) "Choose melody to change" else "Choose chord to change" }) { Text(if (melodyLane) "Change melody" else "Change chord") }
                }
            }
        }
        if (!melodyLane && (selected != null || editor.pending != null || manual)) {
            if (manual && selected == null && editor.pending == null) ChordKeyboard(editor, !state.busy, symbol, { symbol = it }, model::addChord, model::togglePinnedChord)
            if (editor.pending != null) Text("Pending chord · ${positionLabel(editor.pending.position, editor.score.timeSignature)}. Apply it to change the score.", style = MaterialTheme.typography.bodySmall, color = MutedColor)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(symbol, { model.pauseEntry(); symbol = it.take(64) }, label = { Text("Chord symbol") }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth().onFocusChanged { if (it.isFocused) model.pauseEntry() })
                Button(onClick = { if (editor.pending != null) model.applyPending(symbol) else if (selected != null) model.changeChord(symbol, editor.duration) else model.addChord(symbol) },
                    enabled = !state.busy && symbol.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp)) { Text(if (editor.pending != null) "Apply chord" else if (selected != null) "Apply change" else "Insert chord") }
            }
            if (editor.alternatives.size > 1) FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                editor.alternatives.forEach { candidate -> SuggestionChip(onClick = { model.pauseEntry(); symbol = candidate }, label = { Text(candidate) }, modifier = Modifier.heightIn(min = 48.dp)) }
            }
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (editor.pending != null) OutlinedButton(model::discardPending, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Discard pending chord") }
                else if (selected != null) {
                    OutlinedButton(onClick = { model.armEntry(true) }, enabled = !state.busy && state.midiConnected && editor.mode == EntryMode.PAUSED, modifier = Modifier.heightIn(min = 48.dp)) { Text("Replace from MIDI") }
                    OutlinedButton(model::deleteChord, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Delete chord") }
                    TextButton(onClick = { model.setPosition(editor.position) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Close selection") }
                }
                if (manual) TextButton(onClick = { manual = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Close input") }
                if (editor.mode == EntryMode.REPLACE) OutlinedButton(model::pauseEntry, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel replacement") }
            }
        }
        if (melodyLane && editor.pendingMelody != null) {
            Text(editor.message ?: "The captured note could not be inserted.", style = MaterialTheme.typography.bodySmall)
            Row {
                TextButton(onClick = { model.applyMelody(editor.pendingMelody.pitch) }, enabled = !state.busy) { Text("Retry capture") }
                TextButton(model::discardPending, enabled = !state.busy) { Text("Discard capture") }
            }
        }
        if (melodyLane && selectedNote != null && state.midiConnected) {
            OutlinedButton(onClick = { model.armEntry(true) }, enabled = !state.busy) { Text("Replace from MIDI") }
        }
        if (!melodyLane) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            OutlinedButton(onClick = { model.addBar() }, enabled = !state.busy && !hasPending && editor.score.measures.size < 256) { Text("+ Bar") }
            if (editor.position.measureIndex < editor.score.measures.size) {
                TextButton(onClick = { model.addBar(editor.position.measureIndex) }, enabled = !state.busy && !hasPending && editor.score.measures.size < 256) { Text("+ Before") }
                TextButton(onClick = { model.addBar(editor.position.measureIndex + 1) }, enabled = !state.busy && !hasPending && editor.score.measures.size < 256) { Text("+ After") }
            }
        }
        if (editor.message != null && !editor.message.startsWith("Inserted ") && editor.message !in listOf("Melody updated.", "Chord changed."))
            Text(editor.message, color = MutedColor, style = MaterialTheme.typography.bodySmall)
    }
    if (durationPicker) AlertDialog(onDismissRequest = { durationPicker = false }, title = { Text(if (melodyLane) "Melody duration" else "Chord duration") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (melodyLane) MELODY_DURATIONS.forEach { duration ->
                OutlinedButton(onClick = { model.setMelodyDuration(duration); durationPicker = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Duration ${melodyDurationLabel(duration)}" }) { Text(melodyDurationLabel(duration)) }
            } else (CHORD_DURATIONS + editor.score.measureTicks).distinct().sorted().forEach { duration ->
                OutlinedButton(onClick = { model.setDuration(duration); durationPicker = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Duration ${chordDurationLabel(duration, editor.score.measureTicks)}" }) {
                    Text(chordDurationLabel(duration, editor.score.measureTicks) + if (duration == editor.duration) " · selected" else "")
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
            Column(Modifier.heightIn(max = 300.dp).verticalScroll(rememberScrollState())) { (0 until editor.score.measureTicks step (if (melodyLane) 60 else 240)).toList().chunked(if (melodyLane) 3 else 4).forEach { group -> Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                group.forEach { offset ->
                    val beat = tickLabel(offset, editor.score.timeSignature)
                    FilterChip(selected = editor.position.offsetTicks == offset, onClick = { model.setPosition(editor.position.copy(offsetTicks = offset)) }, label = { Text(beat) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp))
                }
            } } }
            Text("Beats follow ${editor.score.timeSignature.numerator}/${editor.score.timeSignature.denominator}; fractions mark subdivisions.", style = MaterialTheme.typography.bodySmall)
        } }, confirmButton = { TextButton(onClick = { positionPicker = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } })
    if (chordPicker) AlertDialog(onDismissRequest = { chordPicker = false }, title = { Text("Change ${if (melodyLane) "melody" else "a chord"} · bar ${editor.position.measureIndex + 1}") },
        text = { Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (melodyLane) editor.score.measures.getOrNull(editor.position.measureIndex)?.melody.orEmpty().forEach { note ->
                OutlinedButton(onClick = { model.selectMelody(note.id); chordPicker = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Select melody ${note.pitch?.label ?: "rest"} at tick ${note.offsetTicks}" }) { Text("${note.pitch?.label ?: "Rest"} · beat ${tickLabel(note.offsetTicks, editor.score.timeSignature)} · ${melodyDurationLabel(note.duration)}") }
            } else chords.forEach { chord -> OutlinedButton(onClick = { model.selectChord(chord.id); chordPicker = false },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Select chord ${chord.symbol} at tick ${chord.offsetTicks}" }) {
                Text("${chord.symbol} · beat ${tickLabel(chord.offsetTicks, editor.score.timeSignature)}")
            } }
        } }, confirmButton = { TextButton(onClick = { chordPicker = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } })
}

internal fun melodyDurationLabel(value: ScoreDuration) = when (value.denominator) { 1 -> "Whole"; 2 -> "Half"; 4 -> "Quarter"; 8 -> "Eighth"; 16 -> "Sixteenth"; else -> "Thirty-second" } + if (value.dots == 1) " dotted" else ""
private fun tickLabel(offset: Int, time: ScoreTimeSignature): String {
    val unit = BAR_TICKS / time.denominator
    return (1 + offset / unit).toString() + if (offset % unit == 0) "" else "." + (offset % unit * 10000 / unit).toString().padStart(4, '0').trimEnd('0')
}
private fun positionLabel(position: ScorePosition, time: ScoreTimeSignature) = "Bar ${position.measureIndex + 1}, beat ${tickLabel(position.offsetTicks, time)}"
