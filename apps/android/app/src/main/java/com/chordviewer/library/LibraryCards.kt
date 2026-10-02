package com.chordviewer.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chordviewer.ui.*

@Composable
fun LibraryCards(state: LibraryState, model: LibraryViewModel, refresh: () -> Unit, newSheet: () -> Unit, importSheet: () -> Unit,
    open: (String, LibraryMode) -> Unit, reload: (String) -> Unit, trash: (String) -> Unit, rename: (String, String) -> Unit,
    recover: (RecoveryDraft) -> Unit) {
    var recoveryOpen by remember { mutableStateOf(false) }
    var query by remember(state.user?.id) { mutableStateOf("") }
    var filter by remember(state.user?.id) { mutableStateOf("All sheets") }
    var content by remember(state.user?.id) { mutableStateOf("Any") }
    var tutorial by remember(state.user?.id) { mutableStateOf(false) }
    var sort by remember(state.user?.id) { mutableStateOf("Recent") }
    val gridState = rememberLazyGridState()
    LaunchedEffect(query, filter, content, tutorial, sort) { gridState.scrollToItem(0) }
    val visible = state.sheets.filter { sheet ->
        (if (filter == "Trash") sheet.trashedAt != null else sheet.trashedAt == null) &&
            (filter != "Favorites" || sheet.favorite) && (filter != "Drafts" || sheet.draft) &&
            (content == "Any" || content == "Includes melody" && sheet.hasMelody || content == "Chords only" && sheet.hasChords && !sheet.hasMelody) &&
            (!tutorial || sheet.tutorialUrl != null) && sheet.title.contains(query.trim(), ignoreCase = true)
    }.let { sheets -> if (sort == "Title") sheets.sortedWith(compareBy<SheetSummary> { it.title.lowercase() }.thenBy { it.id })
        else sheets.sortedWith(compareByDescending<SheetSummary> { it.openedAt ?: it.updatedAt }.thenBy { it.title }.thenBy { it.id }) }
    BoxWithConstraints(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
        val fontScale = LocalDensity.current.fontScale.coerceAtLeast(1f)
        val wide = maxWidth >= (1000 * fontScale).dp
        val columns = if (maxWidth >= (720 * fontScale).dp) 2 else 1
        val menus: @Composable () -> Unit = {
            LibraryMenus(filter, { filter = it }, content, { content = it }, tutorial, { tutorial = it }, sort, { sort = it })
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column {
                    Text("Library", style = MaterialTheme.typography.headlineSmall)
                    Text(if (state.libraryLoaded) "${visible.size} ${if (visible.size == 1) "sheet" else "sheets"}" else "Not loaded",
                        color = MutedColor, style = MaterialTheme.typography.bodySmall)
                }
                if (wide) {
                    OutlinedTextField(query, { query = it }, label = { Text("Search sheets") },
                        leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true,
                        modifier = Modifier.weight(1f).semantics { contentDescription = "Search sheets" })
                    menus()
                } else Spacer(Modifier.weight(1f))
                LibraryActions(state, refresh, newSheet, importSheet, { recoveryOpen = true })
            }
            if (!wide) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(query, { query = it }, label = { Text("Search sheets") },
                    leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true,
                    modifier = Modifier.width((220 * fontScale).dp).semantics { contentDescription = "Search sheets" })
                menus()
            }
            if (state.sheets.isEmpty()) {
                Surface(Modifier.fillMaxWidth(), color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
                    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (state.libraryLoaded) "Your first sheet starts here" else "Your library is not loaded", style = MaterialTheme.typography.titleLarge)
                        Text(if (state.libraryLoaded) "Create a blank sheet or make your own copy of the example." else "Refresh your library when the service is available.", color = MutedColor)
                    }
                }
            } else if (visible.isEmpty()) {
                val emptyTrash = filter == "Trash" && state.sheets.none { it.trashedAt != null }
                Text(if (emptyTrash) "Trash is empty." else "No matching sheets.", color = MutedColor)
            } else LazyVerticalGrid(columns = GridCells.Fixed(columns), state = gridState, modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 8.dp)) {
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
private fun LibraryMenus(filter: String, setFilter: (String) -> Unit, content: String, setContent: (String) -> Unit,
    tutorial: Boolean, setTutorial: (Boolean) -> Unit, sort: String, setSort: (String) -> Unit) {
    var collectionOpen by remember { mutableStateOf(false) }
    var filtersOpen by remember { mutableStateOf(false) }
    var sortOpen by remember { mutableStateOf(false) }
    val activeFilters = (if (content != "Any") 1 else 0) + (if (tutorial) 1 else 0)
    Box {
        OutlinedButton(onClick = { collectionOpen = true }, shape = MaterialTheme.shapes.small, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(filter)
            Icon(Icons.Default.ArrowDropDown, null)
        }
        DropdownMenu(collectionOpen, { collectionOpen = false }) {
            listOf("All sheets", "Favorites", "Drafts", "Trash").forEach { choice ->
                DropdownMenuItem(text = { Text(choice) }, onClick = { setFilter(choice); collectionOpen = false },
                    modifier = Modifier.semantics { selected = filter == choice },
                    trailingIcon = { if (filter == choice) Icon(Icons.Default.Check, null) })
            }
        }
    }
    Box {
        OutlinedButton(onClick = { filtersOpen = true }, shape = MaterialTheme.shapes.small, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(if (activeFilters == 0) "Filters" else "Filters ($activeFilters)")
        }
        DropdownMenu(filtersOpen, { filtersOpen = false }) {
            Text("Content", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.labelLarge)
            listOf("Any", "Chords only", "Includes melody").forEach { choice ->
                DropdownMenuItem(text = { Text(choice) }, onClick = { setContent(choice) },
                    modifier = Modifier.semantics { selected = content == choice },
                    trailingIcon = { RadioButton(selected = content == choice, onClick = null) })
            }
            HorizontalDivider(color = BorderColor)
            DropdownMenuItem(text = { Text("Has tutorial") }, onClick = { setTutorial(!tutorial) },
                modifier = Modifier.semantics { selected = tutorial },
                trailingIcon = { Checkbox(checked = tutorial, onCheckedChange = null) })
            DropdownMenuItem(text = { Text("Clear filters") }, enabled = activeFilters > 0,
                onClick = { setContent("Any"); setTutorial(false) })
        }
    }
    Box {
        OutlinedButton(onClick = { sortOpen = true }, shape = MaterialTheme.shapes.small, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(sort)
            Icon(Icons.Default.ArrowDropDown, null)
        }
        DropdownMenu(sortOpen, { sortOpen = false }) {
            listOf("Recent", "Title").forEach { choice ->
                DropdownMenuItem(text = { Text(choice) }, onClick = { setSort(choice); sortOpen = false },
                    modifier = Modifier.semantics { selected = sort == choice },
                    trailingIcon = { if (sort == choice) Icon(Icons.Default.Check, null) })
            }
        }
    }
}

@Composable
private fun LibraryActions(state: LibraryState, refresh: () -> Unit, newSheet: () -> Unit, importSheet: () -> Unit, recover: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Button(onClick = newSheet, enabled = !state.busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) {
        Icon(Icons.Default.Add, null)
        Text("New sheet")
    }
    Box {
        val recoveryCount = state.recoveryCopies.size + state.recoveryUnreadableCount
        IconButton(onClick = { menu = true }, enabled = !state.busy) {
            BadgedBox(badge = { if (recoveryCount > 0) Badge { Text(recoveryCount.toString()) } }) {
                Icon(Icons.Default.MoreVert, "Library actions")
            }
        }
        DropdownMenu(menu, { menu = false }) {
            DropdownMenuItem(text = { Text("Import") }, onClick = { menu = false; importSheet() })
            DropdownMenuItem(text = { Text("Refresh") }, onClick = { menu = false; refresh() })
            if (recoveryCount > 0) DropdownMenuItem(text = { Text("Recover unsaved work (${state.recoveryCopies.size})") },
                onClick = { menu = false; recover() })
        }
    }
}

@Composable
private fun SheetCard(sheet: SheetSummary, busy: Boolean, isOpen: Boolean, unsaved: Boolean,
    practice: () -> Unit, open: () -> Unit, favorite: () -> Unit,
    draft: () -> Unit, duplicate: () -> Unit, trash: () -> Unit, restore: () -> Unit, rename: (String) -> Unit, reload: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var title by remember(sheet.title) { mutableStateOf(sheet.title) }
    Surface(color = PaperColor, shape = MaterialTheme.shapes.medium, border = BorderStroke(1.dp, BorderColor)) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f).padding(top = 4.dp)) {
                    Text(sheet.title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("${sheet.keySignature} · ${sheet.meter}", color = MutedColor, style = MaterialTheme.typography.bodySmall)
                }
                IconButton(onClick = favorite, enabled = !busy && sheet.trashedAt == null,
                    modifier = Modifier.semantics { contentDescription = if (sheet.favorite) "Remove favorite ${sheet.title}" else "Favorite ${sheet.title}" }) {
                    Text(if (sheet.favorite) "★" else "☆", fontSize = 24.sp, color = AccentColor)
                }
                if (sheet.trashedAt == null) Box {
                    IconButton(onClick = { menu = true }, enabled = !busy) {
                        Icon(Icons.Default.MoreVert, "More actions ${sheet.title}")
                    }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(text = { Text("Rename") }, onClick = { menu = false; renaming = true })
                        if (isOpen) DropdownMenuItem(text = { Text("Reload saved version") }, onClick = { menu = false; reload() })
                        DropdownMenuItem(text = { Text("Duplicate") }, onClick = { menu = false; duplicate() })
                        DropdownMenuItem(text = { Text(if (sheet.draft) "Mark complete" else "Mark draft") }, onClick = { menu = false; draft() })
                        DropdownMenuItem(text = { Text("Move to Trash") }, onClick = { menu = false; trash() })
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) {
                    Surface(color = SageColor, shape = MaterialTheme.shapes.small) {
                        Text("${if (sheet.hasMelody) if (sheet.hasChords) "Chords + melody" else "Melody only" else if (sheet.hasChords) "Chords only" else "Blank score"}${if (sheet.tutorialUrl != null) " · Tutorial" else ""}${if (sheet.draft) " · Draft" else ""}",
                            Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall)
                    }
                    if (isOpen || unsaved || sheet.trashedAt != null) Text(
                        if (sheet.trashedAt != null) "In Trash" else if (unsaved) "● Unsaved changes" else "● Open · saved",
                        color = MutedColor, style = MaterialTheme.typography.labelSmall)
                }
                if (sheet.trashedAt != null) OutlinedButton(onClick = restore, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Restore") }
                else {
                    Button(onClick = practice, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Practice") }
                    IconButton(onClick = open, enabled = !busy) { Icon(Icons.Default.Edit, "Edit ${sheet.title}", tint = AccentColor) }
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
