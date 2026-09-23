package com.chordviewer.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.chordviewer.ui.*
import com.chordviewer.score.*

@Composable
fun AccountLanding(state: LibraryState, authenticate: (String, String, String?) -> Unit, preview: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
        Surface(Modifier.widthIn(max = 500.dp).fillMaxWidth(), color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
            Column(Modifier.padding(28.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text("Sign in to your library", style = MaterialTheme.typography.headlineMedium)
                if (state.configured) AccountFields(state.busy, authenticate)
                else Text("Public hosting is not configured for this release. Use the debug app with your local service.", color = MutedColor)
                HorizontalDivider(color = BorderColor)
                TextButton(onClick = preview, modifier = Modifier.heightIn(min = 48.dp)) { Text("Explore the example sheet") }
            }
        }
    }
}

@Composable
fun AccountDialog(state: LibraryState, authenticate: (String, String, String?) -> Unit, signOut: () -> Unit, close: () -> Unit) {
    AlertDialog(onDismissRequest = close, title = { Text(if (state.user == null) "Your account" else state.user.name) },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (state.user == null && state.configured) AccountFields(state.busy, authenticate)
            else if (state.user != null) {
                Text(state.user.email)
                Text("Your sheets are saved to your account. This app keeps your session only while its process stays open.", color = MutedColor)
            } else Text("Public hosting is not configured for this release.")
            state.message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        } },
        confirmButton = { TextButton(onClick = close, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } },
        dismissButton = { if (state.user != null) TextButton(onClick = signOut, modifier = Modifier.heightIn(min = 48.dp)) { Text("Sign out") } },
    )
}

@Composable
private fun AccountFields(busy: Boolean, authenticate: (String, String, String?) -> Unit) {
    var create by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    // Credentials are intentionally excluded from saved instance state.
    var password by remember { mutableStateOf("") }
    Text(if (create) "Create an account for your own lead sheets." else "Use the same account on the web and your tablet.", color = MutedColor)
    if (create) OutlinedTextField(name, { name = it.take(200) }, label = { Text("Name") }, singleLine = true, enabled = !busy, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(email, { email = it.take(254) }, label = { Text("Email") }, singleLine = true, enabled = !busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(password, { password = it.take(128) }, label = { Text("Password (12–128 characters)") }, singleLine = true, enabled = !busy,
        visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
    Button(onClick = { val submitted = password; password = ""; authenticate(email, submitted, if (create) name else null) }, enabled = !busy,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text(if (create) "Create account" else "Sign in") }
    TextButton(onClick = { create = !create; password = "" }, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(if (create) "Use an existing account" else "Create an account")
    }
}

@Composable
fun NewSheetDialog(state: LibraryState, create: (String, Boolean, String, ScoreTimeSignature) -> Unit, close: () -> Unit) {
    var title by remember { mutableStateOf("") }
    var key by remember { mutableStateOf("C") }
    var time by remember { mutableStateOf(ScoreTimeSignature()) }
    AlertDialog(onDismissRequest = { if (!state.busy) close() }, title = { Text("New sheet") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Start with a blank sheet or make your own copy of the original example.", color = MutedColor)
            OutlinedTextField(title, { title = it.take(400) }, label = { Text("Sheet title") }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            ScoreSettingsFields(key, time, !state.busy, { key = it }, { time = it })
            state.message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            OutlinedButton(onClick = { create(title, true, "C", ScoreTimeSignature()) }, enabled = !state.busy && title.isNotBlank(),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Copy example") }
            Text("The example keeps its original C major and 4/4 settings.", style = MaterialTheme.typography.bodySmall)
        } },
        confirmButton = { Button(onClick = { create(title, false, key, time) }, enabled = !state.busy && title.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Create blank sheet") } },
        dismissButton = { TextButton(onClick = close, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel") } },
    )
}

@Composable
fun SheetDetailsDialog(state: LibraryState, updateTitle: (String) -> Unit, updateTutorial: (String) -> Unit,
    settings: (String, ScoreTimeSignature) -> Unit, export: () -> Unit, save: () -> Unit, close: () -> Unit) {
    val score = state.editor?.score ?: state.selected?.score ?: return
    var key by remember(score.keySignature) { mutableStateOf(score.keySignature) }
    var time by remember(score.timeSignature) { mutableStateOf(score.timeSignature) }
    AlertDialog(onDismissRequest = close, title = { Text("Sheet details") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            OutlinedTextField(state.draftTitle, updateTitle, label = { Text("Sheet title") }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(state.draftTutorial, updateTutorial, label = { Text("YouTube tutorial URL (optional)") }, singleLine = true, enabled = !state.busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
            ScoreSettingsFields(key, time, !state.busy, { key = it }, { time = it })
            OutlinedButton(onClick = { settings(key, time) }, enabled = !state.busy && (key != score.keySignature || time != score.timeSignature), modifier = Modifier.heightIn(min = 48.dp)) { Text("Apply key and meter") }
            Text("Pitches stay unchanged. A shorter meter is accepted only when every event fits.", style = MaterialTheme.typography.bodySmall, color = MutedColor)
            state.editor?.message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            OutlinedButton(onClick = export, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Export ChordViewer JSON") }
            Text(if (state.hasUnsavedChanges) "Unsaved changes stay here until you save or discard them." else "Saved · revision ${state.selected?.revision}", color = MutedColor, style = MaterialTheme.typography.bodySmall)
            state.message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        } },
        confirmButton = { Button(onClick = save, enabled = !state.busy && state.draftTitle.isNotBlank() && state.hasUnsavedChanges,
            modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Save changes") } },
        dismissButton = { TextButton(onClick = close, modifier = Modifier.heightIn(min = 48.dp)) { Text("Done") } },
    )
}

@Composable
private fun ScoreSettingsFields(key: String, time: ScoreTimeSignature, enabled: Boolean, changeKey: (String) -> Unit, changeTime: (ScoreTimeSignature) -> Unit) {
    var keyPicker by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { keyPicker = true }, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Key: ${keyLabel(key)}") }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Meter ${time.numerator}/${time.denominator}", modifier = Modifier.weight(1f))
        OutlinedButton(onClick = { changeTime(time.copy(numerator = time.numerator - 1)) }, enabled = enabled && time.numerator > 1, modifier = Modifier.heightIn(min = 48.dp)) { Text("− beat") }
        OutlinedButton(onClick = { changeTime(time.copy(numerator = time.numerator + 1)) }, enabled = enabled && time.numerator < 12, modifier = Modifier.heightIn(min = 48.dp)) { Text("+ beat") }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Beat unit")
        listOf(2, 4, 8).forEach { value -> FilterChip(time.denominator == value, { changeTime(time.copy(denominator = value)) }, enabled = enabled, label = { Text("1/$value") }, modifier = Modifier.heightIn(min = 48.dp)) }
    }
    if (keyPicker) AlertDialog(onDismissRequest = { keyPicker = false }, title = { Text("Key signature") }, text = {
        Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState())) { SUPPORTED_KEYS.forEach { value ->
            TextButton(onClick = { changeKey(value); keyPicker = false }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(keyLabel(value)) }
        } }
    }, confirmButton = { TextButton(onClick = { keyPicker = false }) { Text("Done") } })
}

@Composable
fun ImportPreviewDialog(state: LibraryState, model: LibraryViewModel, save: () -> Unit) {
    val preview = state.importPreview ?: return
    AlertDialog(onDismissRequest = model::dismissImport, title = { Text("Import preview") }, text = {
        Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(state.importTitle, model::updateImportTitle, label = { Text("Imported sheet title") }, enabled = !state.busy, singleLine = true, modifier = Modifier.fillMaxWidth())
            Text("${preview.score.measures.size} bars · ${keyLabel(preview.score.keySignature)} · ${preview.score.timeSignature.numerator}/${preview.score.timeSignature.denominator}")
            Text("This preview is local. Saving creates a new sheet in your library.", color = MutedColor)
            preview.warnings.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
            NativeScore(preview.score, true)
            state.message?.let { Text(it) }
        }
    }, confirmButton = { Button(onClick = save, enabled = !state.busy && state.importTitle.isNotBlank(), modifier = Modifier.heightIn(min = 48.dp)) { Text("Save as new sheet") } },
        dismissButton = { TextButton(onClick = model::dismissImport, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Cancel import") } })
}
