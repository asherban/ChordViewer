package com.chordviewer.library

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.text.DateFormat
import java.util.Date

@Composable
fun RecoveryDialog(state: LibraryState, model: LibraryViewModel, restore: (RecoveryDraft) -> Unit, close: () -> Unit) {
    var deleting by remember { mutableStateOf<RecoveryDraft?>(null) }
    AlertDialog(onDismissRequest = close, title = { Text("Recover unsaved work") }, text = {
        Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("These copies stay on this device. Restore keeps the original revision; Save remains explicit.")
            state.recoveryCopies.forEach { draft ->
                HorizontalDivider()
                Text(draft.title.ifBlank { "Untitled draft" }, style = MaterialTheme.typography.titleMedium)
                Text("${DateFormat.getDateTimeInstance().format(Date(draft.updatedAt))} · revision ${draft.base.revision}", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { restore(draft) }, enabled = !state.busy) { Text("Restore draft") }
                    TextButton(onClick = { deleting = draft }, enabled = !state.busy) { Text("Delete copy") }
                }
            }
            if (state.recoveryCopies.isEmpty()) Text("No local recovery copies.")
        }
    }, confirmButton = { TextButton(onClick = close) { Text("Close") } })
    deleting?.let { draft -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text("Delete recovery copy?") },
        text = { Text("This only removes the local copy. The saved sheet is unchanged.") },
        confirmButton = { TextButton(onClick = { model.deleteRecovery(draft); deleting = null }) { Text("Delete copy") } },
        dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancel") } }) }
}
