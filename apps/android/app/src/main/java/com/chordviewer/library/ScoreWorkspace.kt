package com.chordviewer.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.chordviewer.MidiInputState
import com.chordviewer.midi.MidiNote
import com.chordviewer.score.LeadSheet
import com.chordviewer.score.NativeScore
import com.chordviewer.score.keyLabel
import com.chordviewer.ui.*

@Composable
fun WorkspacePicker(state: LibraryState, newSheet: () -> Unit, library: () -> Unit, example: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.TopCenter) {
        Surface(Modifier.widthIn(max = 680.dp).fillMaxWidth(), color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
            Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text(if (state.mode == LibraryMode.CREATE) "Choose a sheet to work on" else "Choose a sheet to practice", style = MaterialTheme.typography.headlineMedium)
                Text("Open a sheet from your library, or explore the original example.", color = MutedColor)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = library, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("My library") }
                    OutlinedButton(onClick = example, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Explore example") }
                }
                if (state.mode == LibraryMode.CREATE) TextButton(onClick = newSheet, modifier = Modifier.heightIn(min = 48.dp)) { Text("Create a new sheet") }
            }
        }
    }
}

@Composable
fun ScoreWorkspace(state: LibraryState, score: LeadSheet, sample: Boolean, midi: MidiInputState, melody: Boolean, changeMelody: (Boolean) -> Unit,
    setupMidi: () -> Unit, details: () -> Unit, createMode: () -> Unit, model: LibraryViewModel) {
    BoxWithConstraints(Modifier.fillMaxSize().padding(8.dp)) {
        val wide = maxWidth >= 760.dp
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            WorkspaceToolbar(state, score, sample, melody, changeMelody, details, createMode, model, wide)
            if (wide) {
                Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.width(if (LocalDensity.current.fontScale > 1.3f) 300.dp else 248.dp).fillMaxHeight(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Keep the player in the same composition slot and outside the controls' scroll area.
                        TutorialPanel(state.selected?.tutorialUrl, !sample && state.mode == LibraryMode.CREATE, details, state.selected?.id, state.user?.id)
                        Surface(Modifier.weight(1f).fillMaxWidth(), color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
                            Column(Modifier.verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                WorkspaceControls(state, score, sample, midi, changeMelody, setupMidi, model)
                            }
                        }
                    }
                    ScorePaper(state, score, sample, melody, model, Modifier.weight(1f).fillMaxHeight())
                }
            } else {
                Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    TutorialPanel(state.selected?.tutorialUrl, !sample && state.mode == LibraryMode.CREATE, details, state.selected?.id, state.user?.id)
                    WorkspaceControls(state, score, sample, midi, changeMelody, setupMidi, model)
                    ScorePaper(state, score, sample, melody, model, Modifier.fillMaxWidth(), scroll = false)
                }
            }
        }
    }
}

@Composable
private fun WorkspaceToolbar(state: LibraryState, score: LeadSheet, sample: Boolean, melody: Boolean, changeMelody: (Boolean) -> Unit,
    details: () -> Unit, createMode: () -> Unit, model: LibraryViewModel, wide: Boolean) {
    val title: @Composable () -> Unit = {
        Column {
            Text(score.title, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${keyLabel(score.keySignature)} · ${score.timeSignature.numerator}/${score.timeSignature.denominator} · " +
                if (sample) "Example · not saved" else if (state.hasUnsavedChanges) "Unsaved changes" else "Saved",
                style = MaterialTheme.typography.bodySmall, color = MutedColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
    val actions: @Composable () -> Unit = {
        if (!sample && state.mode == LibraryMode.CREATE) {
            TextButton(model::undoChord, enabled = !state.busy && state.editor?.canUndo == true, modifier = Modifier.heightIn(min = 48.dp)) { Text("Undo") }
            TextButton(model::redoChord, enabled = !state.busy && state.editor?.canRedo == true, modifier = Modifier.heightIn(min = 48.dp)) { Text("Redo") }
            Button(model::save, enabled = !state.busy && !state.conflict && state.hasUnsavedChanges,
                modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Save sheet") }
        }
        if (!sample && state.mode == LibraryMode.PRACTICE) OutlinedButton(createMode, enabled = !state.busy,
            modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Edit sheet") }
        // A compact switch retains the accessible checked state and needs only one tap.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(melody, changeMelody, modifier = Modifier.semantics { contentDescription = "Show melody notation" })
            Text("Melody", style = MaterialTheme.typography.bodyMedium)
        }
        if (!sample) {
            var expanded by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { expanded = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Sheet actions") }
                DropdownMenu(expanded, { expanded = false }) {
                    DropdownMenuItem(text = { Text("Sheet details") }, enabled = !state.busy, onClick = { expanded = false; details() })
                }
            }
        }
    }
    Surface(color = PaperColor) {
        if (wide) Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp).heightIn(min = 64.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.weight(1f).padding(end = 8.dp)) { title() }
            actions()
        } else Column(Modifier.fillMaxWidth().padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            title()
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)) { actions() }
        }
    }
}

@Composable
private fun WorkspaceControls(state: LibraryState, score: LeadSheet, sample: Boolean, midi: MidiInputState,
    changeMelody: (Boolean) -> Unit, setupMidi: () -> Unit, model: LibraryViewModel) {
    if (state.mode == LibraryMode.CREATE) {
        if (sample) Text("Save your own sheet from Library to enter music.", color = MutedColor)
        else ScoreEntryControls(state, model, changeMelody)
        HorizontalDivider(color = BorderColor)
    }
    PlayedNotesPanel(state, score, midi, setupMidi)
    if (state.mode == LibraryMode.PRACTICE) {
        HorizontalDivider(color = BorderColor)
        PracticeControls(state, score, model)
    }
}

@Composable
private fun ScorePaper(state: LibraryState, score: LeadSheet, sample: Boolean, melody: Boolean, model: LibraryViewModel,
    modifier: Modifier, scroll: Boolean = true) {
    Surface(modifier, color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        val content = if (scroll) Modifier.fillMaxSize().verticalScroll(rememberScrollState()) else Modifier.fillMaxWidth()
        Column(content.padding(4.dp)) {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density * if (state.mode == LibraryMode.PRACTICE) state.practiceSize / 100f else 1f, density.fontScale)) {
                NativeScore(score, melody, if (state.mode == LibraryMode.CREATE) state.editor?.selectedMelodyId else null,
                    if (!sample && state.mode == LibraryMode.CREATE && !state.busy) model::selectMelody else null,
                    practiceBar = if (state.mode == LibraryMode.PRACTICE) state.practice.bar else null,
                    practiceChordId = if (state.mode == LibraryMode.PRACTICE) score.measures.flatMap { it.chords }.getOrNull(state.practice.eventIndex)?.id else null)
            }
        }
    }
}

@Composable
private fun PracticeControls(state: LibraryState, score: LeadSheet, model: LibraryViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("ADVANCE", style = MaterialTheme.typography.labelLarge, color = MutedColor)
            Text("Bar ${state.practice.bar + 1} / ${score.measures.size}", style = MaterialTheme.typography.bodySmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            FilterChip(selected = true, onClick = { model.practiceAdvance(true) }, label = { Text("On match") }, modifier = Modifier.weight(1f).heightIn(min = 48.dp))
            // Reserve the agreed mode without pretending a beat clock already exists.
            OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.weight(1f).heightIn(min = 48.dp), contentPadding = PaddingValues(8.dp),
                shape = MaterialTheme.shapes.small) { Text("Metronome") }
        }
        Text("Advance when the chord matches.", style = MaterialTheme.typography.bodySmall, color = MutedColor)
        HorizontalDivider(color = BorderColor)
        var sizeMenu by remember { mutableStateOf(false) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Score size", Modifier.weight(1f))
            Box {
                OutlinedButton({ sizeMenu = true }, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("${state.practiceSize}% ▾") }
                DropdownMenu(sizeMenu, { sizeMenu = false }) {
                    (70..150 step 10).forEach { size -> DropdownMenuItem(text = { Text("$size%") }, onClick = { model.practiceSize(size); sizeMenu = false }) }
                }
            }
        }
        var shiftMenu by remember { mutableStateOf(false) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Transpose", Modifier.weight(1f))
            Box {
                OutlinedButton({ shiftMenu = true }, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) {
                    Text("${if (state.practiceShift > 0) "+" else ""}${state.practiceShift} ▾")
                }
                DropdownMenu(shiftMenu, { shiftMenu = false }) {
                    (-12..12).forEach { shift -> DropdownMenuItem(text = { Text(if (shift > 0) "+$shift" else "$shift") },
                        onClick = { model.practiceShift(shift); shiftMenu = false }) }
                }
            }
        }
    }
}

@Composable
private fun PlayedNotesPanel(state: LibraryState, score: LeadSheet, midi: MidiInputState, setup: () -> Unit) {
    val practicing = state.mode == LibraryMode.PRACTICE
    val current = score.measures.flatMap { it.chords }.getOrNull(state.practice.eventIndex)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (practicing) Column(Modifier.weight(1f)) {
                Text("CHART", color = MutedColor, style = MaterialTheme.typography.labelLarge)
                Text(current?.symbol ?: "—", style = MaterialTheme.typography.headlineMedium)
            }
            Column(Modifier.weight(1f)) {
                Text(if (practicing) "PLAYED" else "LIVE INPUT", color = MutedColor, style = MaterialTheme.typography.labelLarge)
                Text(state.liveChord ?: "—", style = MaterialTheme.typography.headlineMedium)
            }
        }
        if (practicing) Text(when {
            state.practice.complete -> "Complete. Reopen this sheet to practice again."
            current == null -> "No chords to match. Add chords in Create."
            !state.practiceTargetSupported -> "Chord matching is unavailable for this symbol. Edit it in Create."
            state.practiceLiveMatch == true -> "Match · release to advance"
            state.practiceLiveMatch == false -> "Held notes differ from this chord."
            else -> state.practice.feedback ?: "Play the chart chord."
        }, color = if (state.practiceLiveMatch == true) AccentColor else MutedColor, style = MaterialTheme.typography.bodySmall)
        Text("Held  ${midi.snapshot.held.noteNames()}", style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.semantics { contentDescription = "Held notes: ${midi.snapshot.held.noteNames()}" })
        Text("Sounding  ${midi.snapshot.sounding.noteNames()}", style = MaterialTheme.typography.bodySmall)
        Text("Sustain: " + if (midi.snapshot.sustainChannels.isEmpty()) "Off" else "On · channel ${midi.snapshot.sustainChannels.joinToString { "${it + 1}" }}",
            color = MutedColor, style = MaterialTheme.typography.bodySmall)
        if (midi.connected) Text("● MIDI connected", color = AccentColor, style = MaterialTheme.typography.bodySmall)
        else OutlinedButton(onClick = setup, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("MIDI setup") }
    }
}

private fun List<MidiNote>.noteNames() = if (isEmpty()) "None" else joinToString(" · ") { "${it.name} (ch ${it.channel + 1})" }
