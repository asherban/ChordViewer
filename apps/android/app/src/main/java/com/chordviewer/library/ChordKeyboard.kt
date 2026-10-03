package com.chordviewer.library

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.chordviewer.score.ScoreEditorState

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ChordKeyboard(editor: ScoreEditorState, enabled: Boolean, symbol: String, change: (String) -> Unit, insert: (String) -> Unit, pin: (String) -> Unit) {
    var root by remember { mutableStateOf("C") }
    var quality by remember { mutableStateOf("") }
    var accidental by remember { mutableStateOf("") }
    var bass by remember { mutableStateOf(false) }
    val pinned = editor.pinnedChords
    val recent = (pinned + editor.score.measures.flatMap { it.chords }.map { it.symbol }.asReversed() + listOf("C", "F", "G", "Am")).distinct().take(8)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Recent and pinned chords", style = MaterialTheme.typography.labelMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            recent.forEach { chord -> SuggestionChip(onClick = { insert(chord) }, enabled = enabled, label = { Text(chord) }) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            "CDEFGAB".forEach { value ->
                OutlinedButton(onClick = {
                    if (bass) { change(symbol.substringBefore('/') + "/" + value + accidental); bass = false }
                    else { root = value.toString(); change(root + accidental + quality) }
                }, enabled = enabled, contentPadding = PaddingValues(0.dp), modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(value.toString()) }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("" to "Major", "m" to "Minor", "7" to "7", "maj7" to "maj7", "m7" to "m7", "dim" to "dim", "sus4" to "sus4").forEach { (suffix, label) ->
                FilterChip(selected = quality == suffix, onClick = { quality = suffix; change(root + accidental + quality) }, enabled = enabled, label = { Text(label) })
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf("b" to "♭", "" to "♮", "#" to "♯").forEach { (value, label) ->
                FilterChip(selected = accidental == value, onClick = { accidental = value; if (!bass) change(root + accidental + quality) }, enabled = enabled, label = { Text(label) })
            }
            FilterChip(selected = bass, onClick = { bass = !bass }, enabled = enabled, label = { Text("Slash bass") })
            FilterChip(selected = symbol.trim() in pinned, onClick = { pin(symbol) }, enabled = enabled && symbol.isNotBlank() && symbol.trim().codePointCount(0, symbol.trim().length) <= 32,
                label = { Text(if (symbol.trim() in pinned) "Unpin chord" else "Pin chord") })
        }
    }
}
