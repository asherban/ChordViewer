package com.chordviewer.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chordviewer.ui.*

@Composable
fun LibraryCards(state: LibraryState, refresh: () -> Unit, newSheet: () -> Unit, open: (String, LibraryMode) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().padding(24.dp)) {
        val wide = maxWidth >= 720.dp
        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("My library", style = MaterialTheme.typography.headlineLarge)
                Text(if (state.libraryLoaded) "${state.sheets.size} ${if (state.sheets.size == 1) "sheet" else "sheets"}" else "Not loaded", color = MutedColor)
                if (wide) {
                    Spacer(Modifier.weight(1f))
                    LibraryActions(state.busy, refresh, newSheet)
                }
            }
            if (!wide) LibraryActions(state.busy, refresh, newSheet)
            if (state.sheets.isEmpty()) {
                Surface(Modifier.fillMaxWidth(), color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
                    Column(Modifier.padding(32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(if (state.libraryLoaded) "Your first sheet starts here" else "Your library is not loaded", style = MaterialTheme.typography.titleLarge)
                        Text(if (state.libraryLoaded) "Create a blank sheet or make your own copy of the example." else "Refresh your library when the service is available.", color = MutedColor)
                    }
                }
            } else LazyVerticalGrid(columns = GridCells.Fixed(if (wide) 2 else 1), modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp),
                contentPadding = PaddingValues(bottom = 16.dp)) {
                items(state.sheets, key = { it.id }) { sheet ->
                    SheetCard(sheet, state.busy, { open(sheet.id, LibraryMode.PRACTICE) }, { open(sheet.id, LibraryMode.CREATE) })
                }
            }
        }
    }
}

@Composable
private fun LibraryActions(busy: Boolean, refresh: () -> Unit, newSheet: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(onClick = refresh, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Refresh") }
        Button(onClick = newSheet, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("+  New sheet") }
    }
}

@Composable
private fun SheetCard(sheet: SheetSummary, busy: Boolean, practice: () -> Unit, open: () -> Unit) {
    Surface(color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Surface(color = SageColor, shape = MaterialTheme.shapes.small) {
                    // Decorative empty staff icon: it does not claim to preview this sheet's contents.
                    Canvas(Modifier.size(64.dp, 52.dp).padding(10.dp)) {
                        repeat(5) { line -> drawLine(MutedColor.copy(alpha = 0.55f), Offset(0f, size.height * line / 4), Offset(size.width, size.height * line / 4), 1.dp.toPx()) }
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(sheet.title, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("C major · 4/4", color = MutedColor, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = SageColor, shape = MaterialTheme.shapes.small) {
                    Text(if (sheet.tutorialUrl == null) "No tutorial" else "Tutorial linked", Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelMedium)
                }
                Spacer(Modifier.weight(1f))
                Text("● Saved · revision ${sheet.revision}", color = MutedColor, style = MaterialTheme.typography.labelMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = practice, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Practice") }
                OutlinedButton(onClick = open, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = 48.dp), shape = MaterialTheme.shapes.small) { Text("Open sheet") }
            }
        }
    }
}
