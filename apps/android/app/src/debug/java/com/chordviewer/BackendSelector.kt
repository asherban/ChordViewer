package com.chordviewer

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chordviewer.library.LibraryState
import com.chordviewer.library.LibraryViewModel

@Composable
internal fun BackendSelector(state: LibraryState, model: LibraryViewModel, midi: MidiInputState,
    accountDialog: @Composable (@Composable () -> Unit) -> Unit) {
    val context = LocalContext.current
    var open by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var switching by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val production = ApiConfiguration.baseUrl == ApiConfiguration.productionOrigin
    val name = if (production) "chordviewer.app" else "Local backend"
    accountDialog {
        IconButton(onClick = { menu = true }, enabled = !state.busy && !switching, modifier = Modifier.fillMaxSize()) {
            Icon(Icons.Default.MoreVert, contentDescription = "Account options")
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text("Backend: $name") }, onClick = {}, enabled = false)
            DropdownMenuItem(text = { Text("Switch backend") }, onClick = {
                menu = false; model.pauseEntry(); open = true
            }, enabled = !state.busy && !switching)
        }
    }
    if (open) AlertDialog(
        onDismissRequest = { if (!switching) open = false },
        title = { Text("Switch backend") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Current: ${ApiConfiguration.baseUrl}")
                Text("Switch to: ${if (production) ApiConfiguration.localOrigin else ApiConfiguration.productionOrigin}")
                Text("You will be signed out. Sign in with an account for the selected backend.")
                if (state.hasUnsavedChanges) Text("Unsaved changes will close. The last confirmed recovery copy stays with the current backend; save or export first if local recovery is unavailable.")
                if (state.editor?.pending != null || state.editor?.pendingMelody != null || state.importPreview != null)
                    Text("Pending input and the import preview will be discarded.")
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (switching) Text("Switching…")
            }
        },
        confirmButton = {
            TextButton(enabled = !state.busy && !switching, onClick = {
                switching = true
                error = null
                midi.clear()
                model.signOut { cleared ->
                    if (!cleared) {
                        switching = false
                        error = model.state.value.message
                    } else {
                        // Commit this one boolean and restart together on the main thread: a cancelled
                        // composition must not leave new settings paired with the previous ViewModel.
                        val saved = runCatching { ApiConfiguration.selectProduction(context, !production) }.getOrDefault(false)
                        if (saved) {
                            // recreate() retains ViewModels. A fresh task drops the old API client and all account UI state.
                            context.startActivity(Intent(context, MainActivity::class.java).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                            })
                        } else {
                            switching = false
                            error = "Could not save the backend choice. Check device storage and try again."
                        }
                    }
                }
            }) { Text(if (production) "Use local backend" else "Use chordviewer.app") }
        },
        dismissButton = { TextButton(enabled = !switching, onClick = { open = false }) { Text("Cancel") } },
    )
}
