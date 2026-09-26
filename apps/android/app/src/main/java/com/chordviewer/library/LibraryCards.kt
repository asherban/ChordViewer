package com.chordviewer.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chordviewer.ui.*

@Composable
fun LibraryCards(state: LibraryState, model: LibraryViewModel, refresh: () -> Unit, newSheet: () -> Unit, importSheet: () -> Unit,
    open: (String, LibraryMode) -> Unit, reload: (String) -> Unit, trash: (String) -> Unit, rename: (String, String) -> Unit,
    recover: (RecoveryDraft) -> Unit) {
    var recoveryOpen by remember { mutableStateOf(false) }
    var query by remember(state.user?.id) { mutableStateOf("") }
    var filter by remember(state.user?.id) { mutableStateOf("All") }
    var content by remember(state.user?.id) { mutableStateOf("Any") }
    var tutorial by remember(state.user?.id) { mutableStateOf(false) }
    var sort by remember(state.user?.id) { mutableStateOf("Recent") }
    val visible = state.sheets.filter { sheet ->
        if (filter == "Trash" && sheet.trashedAt == null) false else (filter == "Trash" || sheet.trashedAt == null) &&
            (filter != "Favorites" || sheet.favorite) && (filter != "Drafts" || sheet.draft) &&
            (content == "Any" || content == "Melody" && sheet.hasMelody || content == "Chords only" && !sheet.hasMelody) &&
            (!tutorial || sheet.tutorialUrl != null) && sheet.title.contains(query.trim(), ignoreCase = true)
    }.let { sheets -> if (sort == "Title") sheets.sortedWith(compareBy<SheetSummary> { it.title.lowercase() }.thenBy { it.id })
        else sheets.sortedWith(compareByDescending<SheetSummary> { it.openedAt ?: it.updatedAt }.thenBy { it.title }.thenBy { it.id }) }
    BoxWithConstraints(Modifier.fillMaxSize().padding(24.dp)) {
        val wide = maxWidth >= 720.dp
        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("My library", style = MaterialTheme.typography.headlineLarge)
                val count = state.sheets.count { it.trashedAt == null }
                Text(if (state.libraryLoaded) "$count ${if (count == 1) "sheet" else "sheets"}" else "Not loaded", color = MutedColor)
                if (wide) {
                    Spacer(Modifier.weight(1f))
                    LibraryActions(state.busy, refresh, newSheet, importSheet)
                }
            }
            if (!wide) LibraryActions(state.busy, refresh, newSheet, importSheet)
            if (state.recoveryCopies.isNotEmpty()) OutlinedButton(onClick = { recoveryOpen = true }, enabled = !state.busy) {
                Text("Recover unsaved work (${state.recoveryCopies.size})")
            }
            if (state.sheets.isNotEmpty()) {
                OutlinedTextField(query, { query = it }, label = { Text("Search sheets") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("All", "Favorites", "Drafts", "Trash").forEach { choice ->
                        FilterChip(selected = filter == choice, onClick = { filter = choice }, label = { Text(choice) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Content")
                    listOf("Any", "Chords only", "Melody").forEach { choice ->
                        FilterChip(selected = content == choice, onClick = { content = choice }, label = { Text(choice) })
                    }
                    Spacer(Modifier.weight(1f))
                    Text("Tutorial")
                    Switch(tutorial, { tutorial = it })
                    TextButton(onClick = { sort = if (sort == "Recent") "Title" else "Recent" }) { Text("Sort: $sort") }
                }
            }
            if (state.sheets.isEmpty()) {
                Surface(Modifier.fillMaxWidth(), color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
                    Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(if (state.libraryLoaded) "Your first sheet starts here" else "Your library is not loaded", style = MaterialTheme.typography.titleLarge)
                        Text(if (state.libraryLoaded) "Create a blank sheet or make your own copy of the example." else "Refresh your library when the service is available.", color = MutedColor)
                    }
                }
            } else if (visible.isEmpty()) {
                val emptyTrash = filter == "Trash" && state.sheets.none { it.trashedAt != null }
                Text(if (emptyTrash) "Trash is empty." else "No matching sheets.", color = MutedColor)
            } else LazyVerticalGrid(columns = GridCells.Fixed(if (wide) 2 else 1), modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp),
                contentPadding = PaddingValues(bottom = 16.dp)) {
                items(visible, key = { it.id }) { sheet ->
                    SheetCard(sheet, state.busy, state.selected?.id == sheet.id, state.selected?.id == sheet.id && state.hasUnsavedChanges,
                        { open(sheet.id, LibraryMode.PRACTICE) }, { open(sheet.id, LibraryMode.CREATE) },
                        { model.updateMetadata(sheet.id, favorite = !sheet.favorite) }, { model.updateMetadata(sheet.id, draft = !sheet.draft) },
                        { model.duplicate(sheet.id) }, { trash(sheet.id) }, { model.transition(sheet.id, true) },
                        { title -> rename(sheet.id, title) }, { reload(sheet.id) })
                }
            }
        }
    }
    if (recoveryOpen) RecoveryDialog(state, model, { recoveryOpen = false; recover(it) }, { recoveryOpen = false })
}

@Composable
private fun LibraryActions(busy: Boolean, refresh: () -> Unit, newSheet: () -> Unit, importSheet: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(onClick = refresh, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Refresh") }
        OutlinedButton(onClick = importSheet, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Import") }
        Button(onClick = newSheet, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("+  New sheet") }
    }
}

@Composable
private fun SheetCard(sheet: SheetSummary, busy: Boolean, isOpen: Boolean, unsaved: Boolean,
    practice: () -> Unit, open: () -> Unit, favorite: () -> Unit,
    draft: () -> Unit, duplicate: () -> Unit, trash: () -> Unit, restore: () -> Unit, rename: (String) -> Unit, reload: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var title by remember(sheet.title) { mutableStateOf(sheet.title) }
    Surface(color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Surface(modifier = Modifier.fillMaxWidth(), color = SageColor, shape = MaterialTheme.shapes.small) {
                Text(sheet.previewChords.ifEmpty { listOf("No chords in first bar") }.joinToString("  ·  "),
                    Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium, maxLines = 2,
                    overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(sheet.title, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("${sheet.keySignature} · ${sheet.meter}", color = MutedColor, style = MaterialTheme.typography.bodyMedium)
                }
                TextButton(onClick = favorite, enabled = !busy && sheet.trashedAt == null,
                    modifier = Modifier.semantics { contentDescription = if (sheet.favorite) "Remove favorite ${sheet.title}" else "Favorite ${sheet.title}" }) {
                    Text(if (sheet.favorite) "★" else "☆")
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = SageColor, shape = MaterialTheme.shapes.small) {
                    Text("${if (sheet.hasMelody) if (sheet.hasChords) "Chords + melody" else "Melody only" else if (sheet.hasChords) "Chords only" else "Blank score"}${if (sheet.tutorialUrl != null) " · Tutorial" else ""}${if (sheet.draft) " · Draft" else ""}",
                        Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelMedium)
                }
                Spacer(Modifier.weight(1f))
                Text(if (sheet.trashedAt != null) "In Trash" else if (unsaved) "● Unsaved changes" else if (isOpen) "● Open · saved" else "● Saved",
                    color = MutedColor, style = MaterialTheme.typography.labelMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (sheet.trashedAt != null) OutlinedButton(onClick = restore, enabled = !busy) { Text("Restore") }
                else {
                    Button(onClick = practice, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Practice") }
                    OutlinedButton(onClick = open, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Edit") }
                }
            }
            if (sheet.trashedAt == null) Box {
                TextButton(onClick = { menu = true }, enabled = !busy) { Text("More actions") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Rename") }, onClick = { menu = false; renaming = true })
                    if (isOpen) DropdownMenuItem(text = { Text("Reload saved version") }, onClick = { menu = false; reload() })
                    DropdownMenuItem(text = { Text("Duplicate") }, onClick = { menu = false; duplicate() })
                    DropdownMenuItem(text = { Text(if (sheet.draft) "Mark complete" else "Mark draft") }, onClick = { menu = false; draft() })
                    DropdownMenuItem(text = { Text("Move to Trash") }, onClick = { menu = false; trash() })
                }
            }
        }
    }
    if (renaming) AlertDialog(onDismissRequest = { renaming = false }, title = { Text("Rename sheet") },
        text = { OutlinedTextField(title, { value ->
            title = value.substring(0, value.offsetByCodePoints(0, minOf(200, value.codePointCount(0, value.length))))
        }, label = { Text("Title") }) },
        confirmButton = { TextButton(onClick = { renaming = false; rename(title.trim()) }, enabled = title.isNotBlank()) { Text("Rename") } },
        dismissButton = { TextButton(onClick = { renaming = false }) { Text("Cancel") } })
}
