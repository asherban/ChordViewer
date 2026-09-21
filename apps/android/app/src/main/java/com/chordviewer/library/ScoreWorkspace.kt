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
    BoxWithConstraints(Modifier.fillMaxSize().padding(20.dp)) {
        if (maxWidth >= 900.dp) {
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.width(280.dp).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    TutorialPanel(state.selected?.tutorialUrl, !sample && state.mode == LibraryMode.CREATE, details)
                    PlayedNotesPanel(midi, state.liveChord, setupMidi)
                }
                ScorePaper(state, score, sample, melody, changeMelody, details, createMode, model, Modifier.weight(1f).fillMaxHeight())
            }
        } else {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                ScorePaper(state, score, sample, melody, changeMelody, details, createMode, model, Modifier.fillMaxWidth(), scroll = false)
                TutorialPanel(state.selected?.tutorialUrl, !sample && state.mode == LibraryMode.CREATE, details)
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
                val scoreModifier = if (scroll) Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()) else Modifier.fillMaxWidth()
                Column(scoreModifier, verticalArrangement = Arrangement.spacedBy(if (displayToggle) 8.dp else 12.dp)) {
                    if (!sample && state.mode == LibraryMode.CREATE) ScoreEntryControls(state, model, melody, changeMelody)
                    HorizontalDivider(color = BorderColor)
                    NativeScore(score, melody, if (state.mode == LibraryMode.CREATE) state.editor?.selectedMelodyId else null,
                        if (!sample && state.mode == LibraryMode.CREATE && !state.busy) model::selectMelody else null)
                }
                Text(if (state.mode == LibraryMode.CREATE) if (sample) "Save your own sheet from Library to enter music." else "Enter chords and melody in separate passes. Tap a note or choose Change melody to edit it."
                    else "Read your score alongside the notes you play. Guided practice controls are coming later.",
                    color = MutedColor, style = MaterialTheme.typography.bodySmall)
            }
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
private fun TutorialPanel(url: String?, editable: Boolean, details: () -> Unit) {
    Surface(color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        Column {
            Surface(color = SageColor, modifier = Modifier.fillMaxWidth().height(110.dp)) {
                Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("▶", color = AccentColor, fontSize = 28.sp)
                    Text("YouTube tutorial", color = InkColor, style = MaterialTheme.typography.titleMedium)
                }
            }
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (url == null) "No tutorial linked" else "Linked tutorial", style = MaterialTheme.typography.titleMedium)
                if (url != null) Text(url, color = MutedColor, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                Text("Video playback will be available with the practice tools.", color = MutedColor, style = MaterialTheme.typography.bodySmall)
                if (editable) OutlinedButton(onClick = details, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) {
                    Text(if (url == null) "Add tutorial link" else "Edit tutorial link")
                }
            }
        }
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
