package com.chordviewer.library

import androidx.compose.foundation.horizontalScroll
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

/** Two touch-sized toolbar rows keep the score visible; expanded editing is deliberate. */
@Composable
fun ScoreEntryControls(state: LibraryState, model: LibraryViewModel, melody: Boolean, changeMelody: (Boolean) -> Unit) {
    val editor = state.editor ?: return
    val selected = editor.selectedId?.let { ChordEdits.find(editor.score, it)?.first }
    val symbolKey: Any? = editor.pending?.notes ?: editor.selectedId
    var symbol by remember(symbolKey) { mutableStateOf(if (editor.pending != null) editor.alternatives.firstOrNull().orEmpty() else selected?.symbol.orEmpty()) }
    var durationPicker by remember { mutableStateOf(false) }
    var positionPicker by remember { mutableStateOf(false) }
    var chordPicker by remember { mutableStateOf(false) }
    var manual by remember(editor.lane, editor.lastInsertedId, editor.lastMelodyId) { mutableStateOf(false) }
    val melodyLane = editor.lane == EntryLane.MELODY
    val selectedNote = editor.selectedMelodyId?.let { MelodyEdits.find(editor.score, it)?.first }
    val hasSelection = selected != null || selectedNote != null
    val hasPending = editor.pending != null || editor.pendingMelody != null
    val chords = editor.score.measures.getOrNull(editor.position.measureIndex)?.chords.orEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            EntryLane.entries.forEach { lane -> FilterChip(selected = editor.lane == lane, onClick = { model.setLane(lane); if (lane == EntryLane.MELODY) changeMelody(true) }, enabled = !state.busy,
                label = { Text(if (lane == EntryLane.CHORDS) "Chords" else "Melody") }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "${lane.name.lowercase().replaceFirstChar { it.uppercase() }} entry lane" }) }
            Switch(melody, changeMelody, modifier = Modifier.semantics { contentDescription = "Show melody notation" })
            Text("Melody", style = MaterialTheme.typography.bodySmall)
            OutlinedButton(model::undoChord, enabled = !state.busy && editor.canUndo, modifier = Modifier.heightIn(min = 48.dp)) { Text("Undo") }
            OutlinedButton(model::redoChord, enabled = !state.busy && editor.canRedo, modifier = Modifier.heightIn(min = 48.dp)) { Text("Redo") }
            Button(model::save, enabled = !state.busy && state.hasUnsavedChanges, modifier = Modifier.heightIn(min = 48.dp)) { Text("Save sheet") }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { model.pauseEntry(); durationPicker = true }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Choose duration" }) { Text("${if (melodyLane) melodyDurationLabel(editor.melodyDuration) else chordDurationLabel(editor.duration, editor.score.measureTicks)} duration") }
            OutlinedButton(onClick = { model.pauseEntry(); positionPicker = true }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Choose insertion position" }) { Text(positionLabel(editor.position, editor.score.timeSignature) + if (editor.position.measureIndex == editor.score.measures.size) " · next" else "") }
            if (!hasSelection && !hasPending) {
                Button(onClick = { if (editor.mode == EntryMode.PAUSED) model.armEntry() else model.pauseEntry() },
                    enabled = !state.busy && !manual && (state.midiConnected || editor.mode != EntryMode.PAUSED), modifier = Modifier.heightIn(min = 48.dp)) { Text(if (editor.mode == EntryMode.PAUSED) "Start MIDI entry" else "Pause entry") }
                OutlinedButton(onClick = { model.pauseEntry(); manual = !manual }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (melodyLane) "Add note / rest" else "Add chord") }
                OutlinedButton(onClick = { model.pauseEntry(); chordPicker = true }, enabled = !state.busy && (if (melodyLane) editor.score.measures.getOrNull(editor.position.measureIndex)?.melody?.isNotEmpty() == true else chords.isNotEmpty()),
                    modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = if (melodyLane) "Choose melody to change" else "Choose chord to change" }) { Text(if (melodyLane) "Change melody" else "Change chord") }
                val last = if (melodyLane) editor.lastMelodyId else editor.lastInsertedId
                if (last != null) TextButton(onClick = { if (melodyLane) model.selectMelody(last) else model.selectChord(last) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Change last") }
            }
        }
        if (!melodyLane && (selected != null || editor.pending != null || manual)) {
            if (editor.pending != null) Text("Pending chord · ${positionLabel(editor.pending.position, editor.score.timeSignature)}. Apply it to change the score.", style = MaterialTheme.typography.bodySmall, color = MutedColor)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(symbol, { model.pauseEntry(); symbol = it.take(64) }, label = { Text("Chord symbol") }, singleLine = true, enabled = !state.busy, modifier = Modifier.weight(1f).onFocusChanged { if (it.isFocused) model.pauseEntry() })
                Button(onClick = { if (editor.pending != null) model.applyPending(symbol) else if (selected != null) model.changeChord(symbol, editor.duration) else model.addChord(symbol) },
                    enabled = !state.busy && symbol.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp)) { Text(if (editor.pending != null) "Apply chord" else if (selected != null) "Apply change" else "Insert chord") }
            }
            if (editor.alternatives.size > 1) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                editor.alternatives.forEach { candidate -> SuggestionChip(onClick = { model.pauseEntry(); symbol = candidate }, label = { Text(candidate) }, modifier = Modifier.heightIn(min = 48.dp)) }
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
        if (melodyLane && (selectedNote != null || editor.pendingMelody != null || manual)) MelodyInput(state, model, selectedNote) { manual = false }
        Text(editor.message ?: if (melodyLane) "Play and release one note, or add a note / rest. Sustain does not delay insertion." else "Play and release a chord, or add its symbol. Sustain does not delay insertion.", color = MutedColor, style = MaterialTheme.typography.bodySmall)
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

internal fun melodyDurationLabel(value: ScoreDuration) = when (value.denominator) { 1 -> "Whole"; 2 -> "Half"; 4 -> "Quarter"; 8 -> "Eighth"; else -> "Sixteenth" } + if (value.dots == 1) " dotted" else ""
private fun tickLabel(offset: Int, time: ScoreTimeSignature): String {
    val unit = BAR_TICKS / time.denominator
    return (1 + offset / unit).toString() + if (offset % unit == 0) "" else "." + (offset % unit * 10000 / unit).toString().padStart(4, '0').trimEnd('0')
}
private fun positionLabel(position: ScorePosition, time: ScoreTimeSignature) = "Bar ${position.measureIndex + 1}, beat ${tickLabel(position.offsetTicks, time)}"

@Composable
private fun MelodyInput(state: LibraryState, model: LibraryViewModel, selected: MelodyEvent?, close: () -> Unit) {
    val editor = state.editor ?: return
    val key: Any? = editor.pendingMelody?.pitch ?: editor.selectedMelodyId
    val initial = if (editor.pendingMelody != null) editor.pendingMelody.pitch else selected?.pitch
    var rest by remember(key) { mutableStateOf(if (editor.pendingMelody != null || selected != null) initial == null else false) }
    var step by remember(key) { mutableStateOf(initial?.step ?: "C") }
    var alter by remember(key) { mutableIntStateOf(initial?.alter ?: 0) }
    var octave by remember(key) { mutableIntStateOf(initial?.octave ?: 4) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (editor.pendingMelody != null) Text("Pending melody · ${positionLabel(editor.pendingMelody.position, editor.score.timeSignature)}. Correct its pitch, duration or position and apply.", style = MaterialTheme.typography.bodySmall)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            FilterChip(rest, { model.pauseEntry(); rest = !rest }, enabled = !state.busy, label = { Text("Rest") }, modifier = Modifier.heightIn(min = 48.dp))
            "CDEFGAB".forEach { value -> FilterChip(!rest && step == value.toString(), { model.pauseEntry(); step = value.toString(); rest = false }, enabled = !state.busy, label = { Text(value.toString()) }, modifier = Modifier.heightIn(min = 48.dp)) }
        }
        if (!rest) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            listOf(-1 to "Flat", 0 to "Natural", 1 to "Sharp").forEach { (value, label) -> FilterChip(alter == value, { model.pauseEntry(); alter = value }, enabled = !state.busy, label = { Text(label) }, modifier = Modifier.heightIn(min = 48.dp)) }
            Text("Octave")
            OutlinedButton(onClick = { model.pauseEntry(); octave-- }, enabled = !state.busy && octave > 3, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Lower octave" }) { Text("−") }
            Text(octave.toString())
            OutlinedButton(onClick = { model.pauseEntry(); octave++ }, enabled = !state.busy && octave < 6, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Higher octave" }) { Text("+") }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { model.applyMelody(if (rest) null else ScorePitch(step, alter, octave)) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (editor.pendingMelody != null) "Apply melody" else if (selected != null) "Apply note change" else if (rest) "Insert rest" else "Insert note") }
            if (editor.pendingMelody != null) OutlinedButton(model::discardPending, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Discard pending melody") }
            else if (selected != null) {
                OutlinedButton(onClick = { model.armEntry(true) }, enabled = !state.busy && state.midiConnected && editor.mode == EntryMode.PAUSED, modifier = Modifier.heightIn(min = 48.dp)) { Text("Replace from MIDI") }
                if (selected.pitch != null) {
                    OutlinedButton(model::deleteMelody, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Delete note to rest") }
                    OutlinedButton(onClick = { model.setMelodyTie(!selected.tieToNext) }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (selected.tieToNext) "Remove tie" else "Tie to next note") }
                }
            }
            TextButton(onClick = { model.setPosition(editor.position); close() }, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Close input") }
            if (editor.mode == EntryMode.REPLACE) OutlinedButton(model::pauseEntry, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel replacement") }
        }
    }
}
