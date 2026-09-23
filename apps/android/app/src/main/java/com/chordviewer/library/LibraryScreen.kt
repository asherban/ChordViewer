package com.chordviewer.library

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import com.chordviewer.MidiInputState
import com.chordviewer.score.LeadSheetReader
import com.chordviewer.ui.*

@Composable
fun LibraryScreen(state: LibraryState, model: LibraryViewModel, midi: MidiInputState) {
    var showAccount by remember { mutableStateOf(false) }
    var showNew by remember { mutableStateOf(false) }
    var showDetails by remember { mutableStateOf(false) }
    var showMidi by remember { mutableStateOf(false) }
    var showSample by remember(state.user?.id) { mutableStateOf(false) }
    var showMelody by remember(state.selected?.id) { mutableStateOf(true) }
    var previousUserId by remember { mutableStateOf(state.user?.id) }
    var pendingLeave by remember { mutableStateOf<(() -> Unit)?>(null) }
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(lifecycle, model) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) model.onAppBackground() }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    val documents = rememberSheetDocuments(model, state.user?.id)
    val sample = remember { runCatching {
        context.assets.open("lead-sheet-v1.json").bufferedReader().use { LeadSheetReader.read(it.readText()) }
    }.getOrNull() }
    fun leave(action: () -> Unit) { model.pauseEntry(); if (model.state.value.hasUnsavedChanges) pendingLeave = action else action() }
    fun details() { model.pauseEntry(); model.setPracticeBlocked(true); showDetails = true }
    fun midiSetup() { model.pauseEntry(); model.setPracticeBlocked(true); showMidi = true }
    fun account() { model.pauseEntry(); model.setPracticeBlocked(true); showAccount = true }
    fun open(id: String, mode: LibraryMode) {
        if (model.state.value.selected?.id == id) { model.changeMode(mode); model.touch(id) }
        else leave { model.open(id, mode) }
    }
    fun newSheet() { model.pauseEntry(); model.setPracticeBlocked(true); if (state.user == null) showAccount = true else leave { showNew = true } }
    LaunchedEffect(showAccount, showNew, showDetails, showMidi, state.importPreview, pendingLeave, state.busy) {
        model.setPracticeBlocked(showAccount || showNew || showDetails || showMidi || state.importPreview != null || pendingLeave != null || state.busy)
    }
    LaunchedEffect(state.selected?.id) { showNew = false; showDetails = false; showSample = false }
    LaunchedEffect(state.user?.id) {
        if (previousUserId != null && state.user == null) midi.disconnect()
        previousUserId = state.user?.id
        showAccount = false; showNew = false; showDetails = false; pendingLeave = null
    }
    BackHandler(enabled = state.mode != LibraryMode.LIBRARY && !state.busy && !showDetails && !showMidi) {
        model.changeMode(LibraryMode.LIBRARY)
    }
    Scaffold(containerColor = CanvasColor) { insets ->
        Column(Modifier.fillMaxSize().padding(insets)) {
            AppHeader(state, midi, model::changeMode, ::midiSetup, ::account)
            HorizontalDivider(color = BorderColor)
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.message?.let { message ->
                Surface(color = SageColor, modifier = Modifier.fillMaxWidth()) {
                    Text(message, Modifier.padding(horizontal = 24.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium)
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (state.mode == LibraryMode.LIBRARY) {
                    if (state.user == null) AccountLanding(state, model::authenticate, {
                        if (sample != null) { showSample = true; model.previewPractice(sample) }
                    })
                    else LibraryCards(state, model, model::refresh, ::newSheet, documents.importSheet, ::open,
                        { id -> leave { model.open(id, LibraryMode.CREATE) } },
                        { id -> if (state.selected?.id == id) leave { model.transition(id, false) } else model.transition(id, false) },
                        { id, title -> if (state.selected?.id == id) leave { model.updateMetadata(id, title = title) } else model.updateMetadata(id, title = title) })
                } else {
                    val score = (if (state.mode == LibraryMode.PRACTICE) state.practiceScore else null)?.copy(title = state.draftTitle)
                        ?: state.editor?.score?.copy(title = state.draftTitle) ?: state.selected?.score ?: if (showSample) sample else null
                    if (score == null) WorkspacePicker(state, ::newSheet,
                        { model.changeMode(LibraryMode.LIBRARY) }, { if (sample != null) { showSample = true; model.previewPractice(sample) } })
                    else ScoreWorkspace(state, score, state.selected == null, midi, showMelody, { showMelody = it },
                        ::midiSetup, ::details, model::editFromPractice, model)
                }
            }
        }
    }
    if (showAccount) AccountDialog(state, model::authenticate, {
        showAccount = false; leave { midi.disconnect(); model.signOut() }
    }, { showAccount = false })
    if (showNew) NewSheetDialog(state, model::create) { showNew = false }
    if (showDetails && state.selected != null) SheetDetailsDialog(state, model::updateDraftTitle, model::updateDraftTutorial,
        model::updateScoreSettings, documents.exportSheet, model::save) { showDetails = false }
    if (state.importPreview != null) ImportPreviewDialog(state, model) { leave(model::saveImport) }
    if (showMidi) AlertDialog(
        onDismissRequest = { showMidi = false }, title = { Text("MIDI connection") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            midi.controls()
            Text("Received ${midi.snapshot.messagesReceived} messages", style = MaterialTheme.typography.bodySmall)
        } },
        confirmButton = { TextButton(onClick = { showMidi = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } },
    )
    if (pendingLeave != null) AlertDialog(
        onDismissRequest = { pendingLeave = null }, title = { Text("Discard unsaved changes?") },
        text = { Text("Your score, title and tutorial changes have not been saved.") },
        confirmButton = { TextButton(onClick = { val next = pendingLeave; pendingLeave = null; next?.invoke() }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Discard changes") } },
        dismissButton = { TextButton(onClick = { pendingLeave = null }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Keep editing") } },
    )
}

@Composable
private fun AppHeader(state: LibraryState, midi: MidiInputState, navigate: (LibraryMode) -> Unit, openMidi: () -> Unit, account: () -> Unit) {
    Surface(color = PaperColor) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val wide = maxWidth >= 840.dp
            val compact = maxWidth < 600.dp
            Column(Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) {
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 20.dp)) {
                    Text("ChordViewer", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = if (compact) 24.sp else 28.sp, color = InkColor)
                    if (wide) ModeTabs(state, navigate)
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = openMidi, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(if (midi.connected) { if (compact) "● MIDI" else "●  MIDI connected" } else "○  MIDI", color = if (midi.connected) AccentColor else MutedColor)
                    }
                    TextButton(onClick = account, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(if (state.user != null) "Account" else "Sign in", maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (!wide) ModeTabs(state, navigate)
            }
        }
    }
}

@Composable
private fun ModeTabs(state: LibraryState, navigate: (LibraryMode) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        LibraryMode.entries.forEach { mode ->
            TextButton(onClick = { navigate(mode) }, enabled = !state.busy,
                modifier = Modifier.heightIn(min = 48.dp).semantics { selected = state.mode == mode },
                shape = MaterialTheme.shapes.small,
                colors = ButtonDefaults.textButtonColors(containerColor = if (state.mode == mode) SageColor else PaperColor, contentColor = InkColor)) {
                Text(mode.label, Modifier.padding(horizontal = 12.dp), fontWeight = if (state.mode == mode) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}
