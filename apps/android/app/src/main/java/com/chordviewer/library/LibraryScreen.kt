package com.chordviewer.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.chordviewer.score.NativeScore
import androidx.activity.compose.BackHandler

@Composable
fun LibraryScreen(state: LibraryState, model: LibraryViewModel) {
    var pendingLeave by remember { mutableStateOf<(() -> Unit)?>(null) }
    fun leave(action: () -> Unit) {
        if (state.hasUnsavedChanges) pendingLeave = action else action()
    }
    BackHandler(enabled = state.selected != null && !state.busy) { leave(model::closeSheet) }
    if (pendingLeave != null) AlertDialog(
        onDismissRequest = { pendingLeave = null },
        title = { Text("Discard unsaved changes?") },
        text = { Text("Your title and tutorial edits have not been saved.") },
        confirmButton = { TextButton(onClick = { val action = pendingLeave; pendingLeave = null; action?.invoke() }) { Text("Discard changes") } },
        dismissButton = { TextButton(onClick = { pendingLeave = null }) { Text("Keep editing") } },
    )
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("My library", style = MaterialTheme.typography.headlineMedium)
        state.message?.let { Text(it, modifier = Modifier.semantics { contentDescription = "Library status: $it" }) }
        if (!state.configured) {
            Text("Public hosting is not configured for this release. Use the debug app with the local development service.")
        } else if (state.user == null) {
            AccountForm(state.busy, model::authenticate)
        } else {
            Text("Signed in as ${state.user.name} · ${state.user.email}")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { leave(model::refresh) }, enabled = !state.busy) { Text("Refresh library") }
                OutlinedButton(onClick = { leave(model::signOut) }) { Text("Sign out") }
            }
            val selected = state.selected
            if (selected == null) {
                NewSheetForm(state.busy, model::create)
                if (state.libraryLoaded && state.sheets.isEmpty()) Text("Your library is empty. Create a blank sheet or copy the original example to begin.")
                if (!state.libraryLoaded && !state.busy) Text("Your library has not loaded. Use Refresh library to try again.")
                state.sheets.forEach { sheet ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(sheet.title, style = MaterialTheme.typography.titleMedium)
                            Text("Revision ${sheet.revision}" + if (sheet.tutorialUrl != null) " · Tutorial linked" else "")
                            OutlinedButton(onClick = { model.open(sheet.id) }, enabled = !state.busy) { Text("Open ${sheet.title}") }
                        }
                    }
                }
            } else SavedSheetScreen(state, model::updateDraft, model::save) { leave(model::closeSheet) }
        }
        if (state.busy) CircularProgressIndicator(Modifier.semantics { contentDescription = "Loading library" })
    }
}

@Composable
private fun AccountForm(busy: Boolean, authenticate: (String, String, String?) -> Unit) {
    var createAccount by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    // Deliberately not rememberSaveable: credentials never enter saved instance state.
    var password by remember { mutableStateOf("") }
    Text("Sign in to use your sheets on the web and Android. Sessions last only while this app process stays open.")
    if (createAccount) OutlinedTextField(name, { name = it.take(200) }, label = { Text("Name") }, singleLine = true, enabled = !busy, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(email, { email = it.take(254) }, label = { Text("Email") }, singleLine = true, enabled = !busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(password, { password = it.take(128) }, label = { Text("Password (12–128 characters)") }, singleLine = true, enabled = !busy,
        visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = { val submitted = password; password = ""; authenticate(email, submitted, if (createAccount) name else null) }, enabled = !busy) {
            Text(if (createAccount) "Create account" else "Sign in")
        }
        OutlinedButton(onClick = { createAccount = !createAccount; password = "" }, enabled = !busy) { Text(if (createAccount) "Use existing account" else "New account") }
    }
}

@Composable
private fun NewSheetForm(busy: Boolean, create: (String, Boolean) -> Unit) {
    var title by remember { mutableStateOf("") }
    OutlinedTextField(title, { title = it.take(400) }, label = { Text("New sheet title") }, singleLine = true, enabled = !busy, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = { create(title, false) }, enabled = !busy && title.isNotBlank()) { Text("Create blank sheet") }
        OutlinedButton(onClick = { create(title, true) }, enabled = !busy && title.isNotBlank()) { Text("Copy example") }
    }
}

@Composable
private fun SavedSheetScreen(state: LibraryState, update: (String, String) -> Unit, save: () -> Unit, close: () -> Unit) {
    val sheet = requireNotNull(state.selected)
    val busy = state.busy
    val title = state.draftTitle
    val tutorial = state.draftTutorial
    var melody by remember(sheet.id) { mutableStateOf(true) }
    Text(sheet.score.title, style = MaterialTheme.typography.titleLarge)
    OutlinedTextField(title, { update(it, tutorial) }, label = { Text("Sheet title") }, singleLine = true, enabled = !busy, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(tutorial, { update(title, it) }, label = { Text("YouTube tutorial URL (optional)") }, singleLine = true, enabled = !busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = save, enabled = !busy && title.isNotBlank()) { Text("Save changes") }
        OutlinedButton(onClick = close, enabled = !busy) { Text("Back to library") }
    }
    Text("Revision ${sheet.revision} · Note and chord editing arrives in the next milestone.")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Switch(melody, { melody = it }, modifier = Modifier.semantics { contentDescription = "Show melody notation" })
        Text(if (melody) "Chords and melody · C major · 4/4" else "Chords only · C major · 4/4")
    }
    NativeScore(sheet.score, melody)
}
