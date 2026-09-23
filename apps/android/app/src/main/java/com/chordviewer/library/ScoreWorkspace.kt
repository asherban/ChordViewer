package com.chordviewer.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.CompositionLocalProvider
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
    val practicing = state.mode == LibraryMode.PRACTICE
    BoxWithConstraints(Modifier.fillMaxSize().padding(20.dp)) {
        if (maxWidth >= 900.dp) {
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.width(if (practicing && !state.tutorialVisible) 260.dp else 300.dp).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    if (!practicing || state.tutorialVisible) TutorialPanel(state.selected?.tutorialUrl, !sample && state.mode == LibraryMode.CREATE, details, state.selected?.id, state.user?.id)
                    if (practicing) PracticeFeedback(state, score, model)
                    PlayedNotesPanel(midi, state.liveChord, setupMidi)
                }
                ScorePaper(state, score, sample, melody, changeMelody, details, createMode, model, Modifier.weight(1f).fillMaxHeight())
            }
        } else {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                ScorePaper(state, score, sample, melody, changeMelody, details, createMode, model, Modifier.fillMaxWidth(), scroll = false)
                if (!practicing || state.tutorialVisible) TutorialPanel(state.selected?.tutorialUrl, !sample && state.mode == LibraryMode.CREATE, details, state.selected?.id, state.user?.id)
                if (practicing) PracticeFeedback(state, score, model)
                PlayedNotesPanel(midi, state.liveChord, setupMidi)
            }
        }
    }
}

@Composable
private fun ScorePaper(state: LibraryState, score: LeadSheet, sample: Boolean, melody: Boolean,
    changeMelody: (Boolean) -> Unit, details: () -> Unit, createMode: () -> Unit, model: LibraryViewModel, modifier: Modifier, scroll: Boolean = true) {
    Surface(modifier, color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        BoxWithConstraints {
            val displayToggle = sample || state.mode != LibraryMode.CREATE
            val inlineToggle = displayToggle && maxWidth >= 700.dp
            Column(Modifier.padding(horizontal = 24.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(score.title, style = MaterialTheme.typography.headlineMedium)
                        Text("${keyLabel(score.keySignature)} · ${score.timeSignature.numerator}/${score.timeSignature.denominator} · " + if (sample) "Example · not saved" else if (state.hasUnsavedChanges) "Unsaved changes" else "Saved · revision ${state.selected?.revision}", color = MutedColor, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (inlineToggle) MelodyToggle(melody, changeMelody)
                    if (!sample) OutlinedButton(onClick = if (state.mode == LibraryMode.PRACTICE) createMode else details,
                        enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) {
                        Text(if (state.mode == LibraryMode.PRACTICE) "Edit sheet" else "Sheet details")
                    }
                }
                if (displayToggle && !inlineToggle) MelodyToggle(melody, changeMelody)
                if (state.mode == LibraryMode.PRACTICE) PracticeControls(state, score, model)
                val scoreModifier = if (scroll) Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()) else Modifier.fillMaxWidth()
                Column(scoreModifier, verticalArrangement = Arrangement.spacedBy(if (displayToggle) 8.dp else 12.dp)) {
                    if (!sample && state.mode == LibraryMode.CREATE) ScoreEntryControls(state, model, melody, changeMelody)
                    HorizontalDivider(color = BorderColor)
                    val density = LocalDensity.current
                    CompositionLocalProvider(LocalDensity provides Density(density.density * if (state.mode == LibraryMode.PRACTICE) state.practiceSize / 100f else 1f, density.fontScale)) {
                        NativeScore(score, melody, if (state.mode == LibraryMode.CREATE) state.editor?.selectedMelodyId else null,
                            if (!sample && state.mode == LibraryMode.CREATE && !state.busy) model::selectMelody else null,
                            if (state.mode == LibraryMode.PRACTICE) state.practice.bar else null,
                            if (state.mode == LibraryMode.PRACTICE) model::practiceBar else null,
                            if (state.mode == LibraryMode.PRACTICE) score.measures.flatMap { it.chords }.getOrNull(state.practice.eventIndex)?.id else null,
                            if (state.mode == LibraryMode.PRACTICE) model::practiceChord else null)
                    }
                }
                Text(if (state.mode == LibraryMode.CREATE) if (sample) "Save your own sheet from Library to enter music." else "Enter chords and melody in separate passes. Tap a note or choose Change melody to edit it."
                    else "Practice reads this score without changing it. Video and score movement stay independent.",
                    color = MutedColor, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PracticeFeedback(state: LibraryState, score: LeadSheet, model: LibraryViewModel) {
    val events = score.measures.flatMapIndexed { bar, measure -> measure.chords.map { bar to it } }
    val current = events.getOrNull(state.practice.eventIndex)?.second
    Surface(color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("CURRENT CHART CHORD", color = MutedColor, style = MaterialTheme.typography.labelLarge)
            Text(current?.symbol ?: "No chord in this bar", style = MaterialTheme.typography.headlineLarge)
            Text(state.practice.feedback ?: if (current == null) "Move to a bar with a chord, or practice manually."
                else if (!state.practiceTargetSupported) "This symbol needs manual advance." else "Play a chord or move manually.",
                color = MutedColor, style = MaterialTheme.typography.bodyMedium)
            Text(when (state.practiceLiveMatch) {
                true -> "Held notes match this chord."
                false -> "Held notes differ from this chord."
                null -> "Play notes to compare with this chord."
            }, color = if (state.practiceLiveMatch == true) AccentColor else MutedColor)
            val inBar = events.mapIndexedNotNull { index, (bar, event) -> if (bar == state.practice.bar) index to event else null }
            if (inBar.size > 1) {
                Text("Chords in this bar", style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    inBar.forEach { (index, event) -> FilterChip(selected = state.practice.eventIndex == index,
                        onClick = { model.practiceEvent(index) }, label = { Text(event.symbol) }) }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PracticeControls(state: LibraryState, score: LeadSheet, model: LibraryViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(verticalArrangement = Arrangement.spacedBy(6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = { model.practiceBar(state.practice.bar - 1) }, enabled = state.practice.bar > 0) { Text("Previous bar") }
            Text("Bar ${state.practice.bar + 1} of ${score.measures.size}")
            OutlinedButton(onClick = { model.practiceBar(state.practice.bar + 1) }, enabled = state.practice.bar < score.measures.lastIndex) { Text("Next bar") }
            FilterChip(selected = !state.practice.advanceOnMatch, onClick = { model.practiceAdvance(false) }, label = { Text("Manual") })
            FilterChip(selected = state.practice.advanceOnMatch, onClick = { model.practiceAdvance(true) }, label = { Text("On match") })
            TextButton(onClick = { model.practiceBar(0) }) { Text("Restart") }
        }
        FlowRow(verticalArrangement = Arrangement.spacedBy(6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Score size")
            OutlinedButton(onClick = { model.practiceSize(state.practiceSize - 10) }, enabled = state.practiceSize > 70) { Text("−") }
            Text("${state.practiceSize}%")
            OutlinedButton(onClick = { model.practiceSize(state.practiceSize + 10) }, enabled = state.practiceSize < 150) { Text("+") }
            Text("Transpose")
            OutlinedButton(onClick = { model.practiceShift(state.practiceShift - 1) }, enabled = state.practiceShift > -12) { Text("−") }
            Text("${if (state.practiceShift > 0) "+" else ""}${state.practiceShift}")
            OutlinedButton(onClick = { model.practiceShift(state.practiceShift + 1) }, enabled = state.practiceShift < 12) { Text("+") }
            TextButton(onClick = { model.tutorialVisible(!state.tutorialVisible) }) { Text(if (state.tutorialVisible) "Hide tutorial" else "Show tutorial") }
        }
    }
}

@Composable
private fun MelodyToggle(melody: Boolean, changeMelody: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Switch(melody, changeMelody, modifier = Modifier.semantics { contentDescription = "Show melody notation" })
        Text(if (melody) "Chords and melody" else "Chords only", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PlayedNotesPanel(midi: MidiInputState, liveChord: String?, setup: () -> Unit) {
    Surface(color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("${if (midi.connected) "●" else "○"}  LIVE MIDI", color = if (midi.connected) AccentColor else MutedColor, style = MaterialTheme.typography.labelLarge)
            Text(liveChord ?: "Play a chord", style = MaterialTheme.typography.headlineLarge)
            Text("Held notes", style = MaterialTheme.typography.labelMedium, color = MutedColor)
            Text(midi.snapshot.held.noteNames(), style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { contentDescription = "Held notes: ${midi.snapshot.held.noteNames()}" })
            HorizontalDivider(color = BorderColor)
            Text("Sounding notes", style = MaterialTheme.typography.labelMedium, color = MutedColor)
            Text(midi.snapshot.sounding.noteNames(), style = MaterialTheme.typography.titleMedium)
            Text("Sustain: " + if (midi.snapshot.sustainChannels.isEmpty()) "Off" else "On · channel ${midi.snapshot.sustainChannels.joinToString { "${it + 1}" }}", color = MutedColor, style = MaterialTheme.typography.bodySmall)
            if (!midi.connected) OutlinedButton(onClick = setup, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("MIDI setup") }
        }
    }
}

private fun List<MidiNote>.noteNames() = if (isEmpty()) "None" else joinToString(" · ") { "${it.name} (ch ${it.channel + 1})" }
