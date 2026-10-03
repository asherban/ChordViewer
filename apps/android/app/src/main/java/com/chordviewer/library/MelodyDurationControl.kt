package com.chordviewer.library

import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.*
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chordviewer.score.*
import kotlin.math.roundToInt

@Composable
fun MelodyDurationControl(state: LibraryState, model: LibraryViewModel) {
    val editor = state.editor ?: return
    val selected = if (editor.pendingMelody == null) editor.selectedMelodyId?.let { FastEntry.melodyGroup(editor.score, it) } else null
    val duration = selected?.ticks ?: (editor.pendingMelody?.duration ?: editor.melodyDuration).ticks
    val choices = remember(duration) { (MELODY_DURATIONS.map { it.ticks } + duration).distinct().sorted() }
    fun label(ticks: Int) = MELODY_DURATIONS.find { it.ticks == ticks }?.let(::melodyDurationLabel) ?: "${ticks / 480f} beats"
    var preview by remember(selected?.event?.id, duration) { mutableStateOf(duration) }
    val sliderInteractions = remember { MutableInteractionSource() }
    LaunchedEffect(sliderInteractions, duration) {
        sliderInteractions.interactions.collect { if (it is DragInteraction.Cancel) preview = duration }
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(selected?.let { "Selected ${it.event.pitch?.label ?: "rest"}" } ?: "Next note", style = MaterialTheme.typography.labelLarge)
            Text(label(preview), style = MaterialTheme.typography.labelLarge)
        }
        Slider(value = choices.indexOf(preview).toFloat(), onValueChange = { preview = choices[it.roundToInt()] },
            onValueChangeFinished = { MELODY_DURATIONS.find { it.ticks == preview }?.let(model::setMelodyDuration) }, valueRange = 0f..choices.lastIndex.toFloat(), steps = choices.size - 2,
            enabled = !state.busy, interactionSource = sliderInteractions, modifier = Modifier.fillMaxWidth().semantics {
                contentDescription = if (selected == null) "New note duration" else "Selected note duration"
                stateDescription = label(preview)
            }.onPreviewKeyEvent { if (it.key == Key.Escape) { preview = duration; true } else false })
    }
}
