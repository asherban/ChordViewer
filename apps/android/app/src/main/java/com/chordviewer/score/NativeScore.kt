package com.chordviewer.score

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlin.math.roundToInt
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.TextButton
import com.chordviewer.R

@Composable
fun NativeScore(sheet: LeadSheet, showMelody: Boolean, selectedMelodyId: String? = null, selectMelody: ((String) -> Unit)? = null,
    practiceBar: Int? = null, selectPracticeBar: ((Int) -> Unit)? = null,
    practiceChordId: String? = null, selectPracticeChord: ((String) -> Unit)? = null,
    entryPosition: ScorePosition? = null, selectPosition: ((ScorePosition) -> Unit)? = null,
    selectChord: ((String) -> Unit)? = null, moveChord: ((String, ScorePosition) -> Unit)? = null,
    pauseEntry: (() -> Unit)? = null, melodyEntry: Boolean = false, entryDuration: ScoreDuration = ScoreDuration(4, 0),
    placeNote: ((ScorePosition, ScorePitch, String?) -> Unit)? = null, enterRest: (() -> Unit)? = null, setTie: ((Boolean) -> Unit)? = null,
    deleteNote: (() -> Unit)? = null, durationControl: @Composable () -> Unit = {}) {
    val cursor = if (melodyEntry) FastEntry.nextMelodyPosition(sheet) else entryPosition
    val editableIds = remember(sheet) { sheet.measures.flatMap { it.melody }.map { it.id }.toSet() }
    val displayed = remember(sheet, cursor, showMelody) {
        val complete = if (showMelody) ScoreLayout.withRests(sheet) else sheet
        // The next-bar entry target is temporary space, not a bar of written rests.
        if (cursor?.measureIndex == sheet.measures.size && sheet.measures.size < 256)
            complete.copy(measures = complete.measures + ScoreMeasure("next-bar-preview", emptyList(), emptyList())) else complete
    }
    EditableNativeScore(displayed, showMelody, selectedMelodyId, selectMelody, practiceBar, selectPracticeBar,
        practiceChordId, selectPracticeChord, cursor, selectPosition, selectChord, moveChord, pauseEntry, melodyEntry, entryDuration, placeNote, enterRest, setTie, deleteNote, durationControl, editableIds)
}

@Composable
private fun EditableNativeScore(sheet: LeadSheet, showMelody: Boolean, selectedMelodyId: String?, selectMelody: ((String) -> Unit)?,
    practiceBar: Int?, selectPracticeBar: ((Int) -> Unit)?, practiceChordId: String?, selectPracticeChord: ((String) -> Unit)?,
    entryPosition: ScorePosition?, selectPosition: ((ScorePosition) -> Unit)?, selectChord: ((String) -> Unit)?,
    moveChord: ((String, ScorePosition) -> Unit)?, pauseEntry: (() -> Unit)?, melodyEntry: Boolean,
    entryDuration: ScoreDuration, placeNote: ((ScorePosition, ScorePitch, String?) -> Unit)?, enterRest: (() -> Unit)?, setTie: ((Boolean) -> Unit)?,
    deleteNote: (() -> Unit)?, durationControl: @Composable () -> Unit, editableIds: Set<String>) {
    val context = LocalContext.current
    val musicFont = remember { context.resources.getFont(R.font.bravura) }
    val chordSize = if (showMelody) 26f else 44f
    val measureText = remember(chordSize) { Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create("serif", Typeface.BOLD); textSize = chordSize
    } }
    val marks = remember(sheet) { ScoreLayout.marks(sheet) }
    val timelines = remember(sheet, showMelody) { sheet.measures.map { ScoreLayout.timeline(it, showMelody, measureText::measureText, sheet.measureTicks, sheet.keySignature) } }
    val density = LocalDensity.current.density
    var drop by remember(sheet) { mutableStateOf<ScorePosition?>(null) }
    var ghost by remember(sheet) { mutableStateOf<Pair<Int, MelodyEvent>?>(null) }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val viewportWidth = maxWidth.value
        val systems = remember(sheet, timelines, maxWidth, showMelody, melodyEntry) { ScoreLayout.systems(sheet, timelines, maxWidth.value, showMelody).map {
            if (melodyEntry) it.copy(geometry = it.geometry.copy(rowHeight = it.geometry.rowHeight + 124)) else it
        } }
        Column {
            systems.forEach { system ->
                val requester = remember(system.first) { BringIntoViewRequester() }
                val horizontal = rememberScrollState()
                val focused = selectedMelodyId?.let { MelodyEdits.find(sheet, it)?.second } ?: entryPosition
                LaunchedEffect(focused, system.first) {
                    if (melodyEntry && focused?.measureIndex in system.first until system.first + system.count) requester.bringIntoView()
                }
                LaunchedEffect(practiceBar, practiceChordId, system.first, system.width, system.measureWidth, viewportWidth, horizontal.maxValue) {
                    if (practiceBar != null && practiceBar in system.first until system.first + system.count) {
                        requester.bringIntoView()
                        val event = sheet.measures[practiceBar].chords.firstOrNull { it.id == practiceChordId }
                        val center = if (event != null) {
                            if (showMelody) scoreEventX(system, timelines, practiceBar, event.offsetTicks) +
                                measureText.measureText(event.symbol) / 2f
                            else (scoreEventX(system, timelines, practiceBar, event.offsetTicks) +
                                scoreEventX(system, timelines, practiceBar, event.offsetTicks + event.durationTicks)) / 2f
                        } else (practiceBar - system.first + .5f) * system.measureWidth
                        val target = ((center - viewportWidth / 2f) * density).roundToInt().coerceIn(0, horizontal.maxValue)
                        horizontal.scrollTo(target)
                    }
                }
                // Only an unusually dense system scrolls; ordinary rows retain the viewport width.
                Column(Modifier.bringIntoViewRequester(requester).horizontalScroll(horizontal)) {
                  Box {
                    Canvas(Modifier.width(system.width.dp).height(system.geometry.rowHeight.dp)
                        .then(if (selectPracticeBar != null) Modifier.pointerInput(sheet, system, density, selectPracticeBar) {
                            detectTapGestures { point ->
                                val x = point.x / density
                                val index = system.first + (x / system.measureWidth).toInt().coerceIn(0, system.count - 1)
                                fun center(event: ChordEvent): Float = if (showMelody) scoreEventX(system, timelines, index, event.offsetTicks) +
                                    measureText.measureText(event.symbol) / 2f else
                                    (scoreEventX(system, timelines, index, event.offsetTicks) +
                                        scoreEventX(system, timelines, index, event.offsetTicks + event.durationTicks)) / 2f
                                val nearest = sheet.measures[index].chords.minByOrNull { kotlin.math.abs(center(it) - x) }
                                if (nearest != null && selectPracticeChord != null &&
                                    kotlin.math.abs(center(nearest) - x) <= maxOf(30f, measureText.measureText(nearest.symbol) / 2f + 12f))
                                    selectPracticeChord(nearest.id)
                                else selectPracticeBar(index)
                            }
                        } else if (selectPosition != null) Modifier.pointerInput(sheet, system, density, showMelody, melodyEntry, entryDuration) {
                            awaitEachGesture {
                                val down = awaitFirstDown(requireUnconsumed = false)
                                val point = down.position / density
                                val index = system.first + (point.x / system.measureWidth).toInt().coerceIn(0, system.count - 1)
                                fun chordCenter(event: ChordEvent) = if (showMelody) scoreEventX(system, timelines, index, event.offsetTicks) + measureText.measureText(event.symbol) / 2
                                        else (scoreEventX(system, timelines, index, event.offsetTicks) + scoreEventX(system, timelines, index, event.offsetTicks + event.durationTicks)) / 2
                                val chord = sheet.measures[index].chords.minByOrNull { kotlin.math.abs(chordCenter(it) - point.x) }
                                    ?.takeIf { point.y in (if (showMelody) 10f..58f else 30f..98f) &&
                                        kotlin.math.abs(chordCenter(it) - point.x) <= maxOf(24f, measureText.measureText(it.symbol) / 2 + 8) }
                                val cursorX = entryPosition?.takeIf { it.measureIndex in system.first until system.first + system.count }
                                    ?.let { scoreEventX(system, timelines, it.measureIndex, it.offsetTicks) }
                                val onCursor = melodyEntry && cursorX != null && kotlin.math.abs(point.x - cursorX) <= 10
                                val note = if (showMelody && chord == null && !onCursor) melodyAt(sheet, system, timelines, point.x, point.y) else null
                                val editableNote = note?.takeIf { it in editableIds }
                                val located = editableNote?.let { MelodyEdits.find(sheet, it) }
                                val original = located?.first
                                val newNote = melodyEntry && chord == null && editableNote == null && cursorX != null &&
                                    kotlin.math.abs(point.x - cursorX) <= 22 && point.y in (system.geometry.top - 30)..(system.geometry.top + 70)
                                fun pitch(step: Int): ScorePitch {
                                    val absolute = (step + 30).coerceIn(21, 48)
                                    val name = "CDEFGAB"[absolute % 7].toString()
                                    return ScorePitch(name, keyAccidentals(sheet.keySignature).getValue(name), absolute / 7)
                                }
                                val noteGesture = melodyEntry && placeNote != null && (original != null || newNote)
                                val notePosition = located?.second ?: entryPosition
                                val initial = if (noteGesture) original ?: MelodyEvent("entry-ghost", entryPosition!!.offsetTicks, entryDuration,
                                    pitch(((system.geometry.top + 40 - point.y) / 5).roundToInt())) else null
                                var candidate = initial
                                fun destination(x: Float, y: Float): ScorePosition? {
                                    val origin = systems.takeWhile { it.first != system.first }.sumOf { it.geometry.rowHeight.toDouble() }.toFloat()
                                    var top = 0f
                                    val target = systems.firstOrNull { row ->
                                        val within = y + origin >= top && y + origin < top + row.geometry.rowHeight
                                        top += row.geometry.rowHeight
                                        within
                                    } ?: return null
                                    if (x < 0 || x >= target.width) return null
                                    val bar = target.first + (x / target.measureWidth).toInt().coerceIn(0, target.count - 1)
                                    val tick = (0 until sheet.measureTicks step 60).minBy { kotlin.math.abs(scoreEventX(target, timelines, bar, it) - x) }
                                    return ScorePosition(bar, tick)
                                }
                                var target = destination(point.x, point.y)
                                var moved = false
                                var cancelled = false
                                if (chord != null || noteGesture) { down.consume(); pauseEntry?.invoke() }
                                if (noteGesture) ghost = notePosition!!.measureIndex to initial!!
                                try {
                                    while (true) {
                                        val event = awaitPointerEvent()
                                        val change = event.changes.firstOrNull { it.id == down.id }
                                        if (change == null || change.isConsumed || event.changes.count { it.pressed } > 1) { cancelled = true; break }
                                        val pos = change.position / density
                                        moved = moved || (pos - point).getDistance() > 6
                                        if (noteGesture) {
                                            if (pos.x !in 0f..system.width || pos.y !in 0f..system.geometry.rowHeight) { cancelled = true; break }
                                            val shift = ((point.y - pos.y) / 5).roundToInt()
                                            moved = moved || shift != 0
                                            candidate = initial!!.copy(pitch = if (shift == 0) initial.pitch else pitch((initial.pitch?.staffStep ?: 4) + shift))
                                            ghost = notePosition!!.measureIndex to candidate!!
                                            change.consume()
                                        }
                                        if (chord != null && moved) { target = destination(pos.x, pos.y); drop = target; change.consume() }
                                        if (!change.pressed) break
                                    }
                                    if (!cancelled) {
                                        if (chord != null) { if (moved) target?.let { moveChord?.invoke(chord.id, it) } else selectChord?.invoke(chord.id) }
                                        else if (noteGesture) {
                                            if (original != null && !moved) selectMelody?.invoke(original.id)
                                            else candidate?.pitch?.let { placeNote?.invoke(notePosition!!, it, original?.id) }
                                        }
                                        else if (!moved) { if (editableNote != null) selectMelody?.invoke(editableNote) else (if (melodyEntry) entryPosition else target)?.let(selectPosition) }
                                    }
                                } finally { drop = null; ghost = null }
                            }
                        } else if (showMelody && selectMelody != null) Modifier.pointerInput(sheet, system, density, selectMelody) {
                            detectTapGestures { point -> melodyAt(sheet, system, timelines, point.x / density, point.y / density)?.takeIf { it in editableIds }?.let(selectMelody) }
                        } else Modifier)
                        .semantics { contentDescription = description(sheet, system, showMelody) + if (melodyEntry) " Tap the entry line or drag a note to change its pitch." else "" }) {
                        if (practiceBar != null && practiceBar in system.first until system.first + system.count)
                            drawRect(Color(0xFFE6EEE7), topLeft = Offset((practiceBar - system.first) * system.measureWidth * density, 0f),
                                size = androidx.compose.ui.geometry.Size(system.measureWidth * density, size.height))
                        val target = drop ?: entryPosition
                        if (target != null && target.measureIndex in system.first until system.first + system.count) {
                            val x = scoreEventX(system, timelines, target.measureIndex, target.offsetTicks)
                            if (melodyEntry) drawLine(Color(0x33176F5B), Offset(x * density, (system.geometry.top - 12) * density), Offset(x * density, (system.geometry.top + 52) * density), 18 * density)
                            drawLine(Color(0xFF176F5B), Offset(x * density, (if (melodyEntry) system.geometry.top - 12 else 22f) * density), Offset(x * density, (if (melodyEntry) system.geometry.top + 52 else system.geometry.rowHeight - 16) * density), 2 * density)
                        }
                        val painter = StaffPainter(this, musicFont, system, timelines, showMelody, sheet.keySignature, sheet.timeSignature, selectedMelodyId?.let { FastEntry.melodyGroup(sheet, it)?.ids } ?: emptySet(), practiceChordId)
                        painter.system()
                        (system.first until system.first + system.count).forEach { index ->
                            val preview = ghost?.takeIf { it.first == index }?.second
                            val displayedMarks = if (preview == null) marks[index] else marks[index].filter { it.event.id != preview.id } + NotationMark(preview, preview.pitch?.alter, false)
                            painter.measure(sheet.measures[index], displayedMarks, index)
                        }
                        if (showMelody) (maxOf(0, system.first - 1) until system.first + system.count).forEach { index ->
                            val measure = sheet.measures[index]
                            measure.melody.filter { it.tieToNext }.forEach { event ->
                                val next = measure.melody.firstOrNull { it.offsetTicks == event.offsetTicks + event.duration.ticks }
                                val targetIndex = if (next != null) index else index + 1
                                val target = next ?: sheet.measures[targetIndex].melody.first()
                                painter.tie(event, index, target, targetIndex)
                            }
                        }
                    }
                    if (melodyEntry && enterRest != null) {
                        val selected = selectedMelodyId?.let { MelodyEdits.find(sheet, it) }
                        val at = selected?.second ?: entryPosition
                        if (at != null && at.measureIndex in system.first until system.first + system.count) {
                            val pitch = selected?.first?.pitch
                            val x = scoreEventX(system, timelines, at.measureIndex, at.offsetTicks).coerceIn(8f, maxOf(8f, system.width - 320))
                            Column(Modifier.offset(x.dp, (system.geometry.rowHeight - 124).dp).width(minOf(320f, system.width - 16).dp)) {
                              durationControl()
                              Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                FilledTonalButton(onClick = enterRest, modifier = Modifier.height(44.dp), contentPadding = PaddingValues(horizontal = 12.dp)) {
                                    Text(if (selected != null) "Rest" else "+ Rest")
                                }
                                if (pitch != null) {
                                    listOf(-1 to "♭", 0 to "♮", 1 to "♯").forEach { (alter, label) ->
                                        TextButton(onClick = { placeNote?.invoke(at, pitch.copy(alter = alter), selected.first.id) },
                                            contentPadding = PaddingValues(0.dp), modifier = Modifier.width(40.dp).height(44.dp)
                                                .semantics { contentDescription = when (alter) { -1 -> "Flat"; 1 -> "Sharp"; else -> "Natural" } }) { Text(label) }
                                    }
                                    TextButton(onClick = { setTie?.invoke(!selected.first.tieToNext) }, contentPadding = PaddingValues(4.dp),
                                        modifier = Modifier.height(44.dp)) { Text("Tie") }
                                }
                                if (selected != null) TextButton(onClick = { deleteNote?.invoke() }, modifier = Modifier.height(44.dp).semantics { contentDescription = "Delete selected note" }, contentPadding = PaddingValues(4.dp)) { Text("Delete") }
                              }
                            }
                        }
                    }
                  }
                }
            }
        }
    }
}

private fun description(sheet: LeadSheet, system: ScoreSystem, melody: Boolean) = buildString {
    append("${sheet.title}. ${keyLabel(sheet.keySignature)}, ${sheet.timeSignature.numerator}/${sheet.timeSignature.denominator} time. ")
    (system.first until system.first + system.count).forEach { index ->
        val measure = sheet.measures[index]
        append("Measure ${index + 1}: chords ${measure.chords.joinToString { it.symbol }}. ")
        if (melody) append(measure.melody.joinToString { event ->
            (event.pitch?.label ?: "rest") + ", ${event.duration.denominator} denominator" +
                (if (event.duration.dots == 1) ", dotted" else "") + (if (event.tieToNext) ", tied" else "")
        } + ". ")
    }
}

internal class StaffPainter(val scope: DrawScope, musicFont: Typeface, val layout: ScoreSystem,
    val timelines: List<MeasureTimeline>, val melody: Boolean, val keySignature: String, val time: ScoreTimeSignature,
    val selectedIds: Set<String>, val practiceChordId: String?) {
    private val scale = scope.density
    private val ink = Color(0xFF34453D)
    private val muted = Color(0xFF697A73)
    private val gap = 10f
    private val music = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = musicFont; textSize = gap * 4 * scale; color = ink.toArgb() }
    private val chord = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create("serif", Typeface.BOLD); textSize = (if (melody) 26 else 44) * scale; color = ink.toArgb()
    }
    private val number = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.DEFAULT; textSize = 12 * scale; color = muted.toArgb() }
    private val end = layout.measureWidth * layout.count - 8

    private fun glyph(value: Char, x: Float, y: Float) = scope.drawContext.canvas.nativeCanvas.drawText(value.toString(), x * scale, y * scale, music)
    private fun line(x1: Float, y1: Float, x2: Float, y2: Float, width: Float = 1f) =
        scope.drawLine(ink, Offset(x1 * scale, y1 * scale), Offset(x2 * scale, y2 * scale), width * scale)
    private fun left(index: Int) = (index - layout.first) * layout.measureWidth
    private fun start(index: Int) = left(index) + 16 + if (index == layout.first) layout.prefix else 0f
    private fun x(index: Int, offset: Int) = scoreEventX(layout, timelines, index, offset)
    private fun y(pitch: ScorePitch) = layout.geometry.top + 4 * gap - pitch.staffStep * gap / 2
    private fun contains(index: Int) = index in layout.first until layout.first + layout.count

    fun system() {
        if (!melody) return
        repeat(5) { line(8f, layout.geometry.top + it * gap, end, layout.geometry.top + it * gap, .8f) }
        glyph('\uE050', 12f, layout.geometry.top + 3 * gap)
        val fifths = KEY_SIGNATURES.getValue(keySignature).fifths
        val steps = if (fifths < 0) listOf(4, 7, 3, 6, 2, 5, 1) else listOf(8, 5, 9, 6, 3, 7, 4)
        steps.take(kotlin.math.abs(fifths)).forEachIndexed { index, step ->
            glyph(if (fifths < 0) '\uE260' else '\uE262', 40f + index * 12, layout.geometry.top + 40 - step * 5)
        }
        if (layout.first == 0) {
            val timeX = 45f + kotlin.math.abs(fifths) * 12 + if (fifths == 0) 0 else 6
            fun digits(value: Int, y: Float) {
                val text = value.toString()
                val centered = if (time.numerator >= 10 && text.length == 1) 8f else 0f
                text.forEachIndexed { index, digit -> glyph((0xE080 + digit.digitToInt()).toChar(), timeX + centered + index * 16, y) }
            }
            digits(time.numerator, layout.geometry.top + gap)
            digits(time.denominator, layout.geometry.top + 3 * gap)
        }
    }

    fun measure(measure: ScoreMeasure, marks: List<NotationMark>, index: Int) {
        val left = left(index)
        val right = left + layout.measureWidth - if (index == layout.first + layout.count - 1) 8 else 0
        scope.drawContext.canvas.nativeCanvas.drawText("${index + 1}", (left + 8) * scale, 18 * scale, number)
        measure.chords.forEach { event ->
            val center = (x(index, event.offsetTicks) + x(index, event.offsetTicks + event.durationTicks)) / 2
            val labelX = if (melody) x(index, event.offsetTicks) * scale else center * scale - chord.measureText(event.symbol) / 2
            if (event.id == practiceChordId) scope.drawRoundRect(Color(0xFFCEE2D3),
                topLeft = Offset(labelX - 5 * scale, (if (melody) 13f else 38f) * scale),
                size = androidx.compose.ui.geometry.Size(chord.measureText(event.symbol) + 10 * scale, 48 * scale),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(6 * scale))
            scope.drawContext.canvas.nativeCanvas.drawText(event.symbol, labelX,
                (if (melody) 43f else 78f) * scale, chord)
        }
        if (!melody) {
            line(right, 28f, right, 96f, .8f)
            return
        }
        line(right, layout.geometry.top, right, layout.geometry.top + 4 * gap, .8f)
        marks.forEach { mark ->
            val event = mark.event
            val noteX = x(index, event.offsetTicks)
            val pitch = event.pitch
            if (event.id in selectedIds) scope.drawCircle(Color(0xFFDDE9DD), 18 * scale,
                Offset((noteX + 6) * scale, (pitch?.let(::y) ?: (layout.geometry.top + 20)) * scale))
            if (pitch == null) {
                val rest = when (event.duration.denominator) { 1 -> '\uE4E3'; 2 -> '\uE4E4'; 4 -> '\uE4E5'; 8 -> '\uE4E6'; 16 -> '\uE4E7'; else -> '\uE4E8' }
                val restY = layout.geometry.top + (if (event.duration.denominator == 1) 1 else 2) * gap
                glyph(rest, noteX, restY)
                if (event.duration.dots == 1) glyph('\uE1E7', noteX + 16, restY - gap / 2)
            } else {
                val noteY = y(pitch)
                ScoreLayout.ledgerSteps(pitch).forEach { step ->
                    val ledgerY = layout.geometry.top + 4 * gap - step * gap / 2
                    line(noteX - 4, ledgerY, noteX + 17, ledgerY, .8f)
                }
                mark.accidental?.let { glyph(when (it) { -1 -> '\uE260'; 1 -> '\uE262'; else -> '\uE261' }, noteX - 16, noteY) }
                val head = when (event.duration.denominator) { 1 -> '\uE0A2'; 2 -> '\uE0A3'; else -> '\uE0A4' }
                glyph(head, noteX, noteY)
                if (event.duration.denominator != 1) {
                    val up = pitch.staffStep < 4
                    val stemX = noteX + if (up) 11f else .6f
                    val stemEnd = noteY + if (up) -35f else 35f
                    line(stemX, noteY, stemX, stemEnd, 1.1f)
                    if (event.duration.denominator >= 8) {
                        val flag = if (event.duration.denominator == 8) { if (up) '\uE240' else '\uE241' }
                            else if (event.duration.denominator == 16) { if (up) '\uE242' else '\uE243' }
                            else { if (up) '\uE244' else '\uE245' }
                        glyph(flag, stemX, stemEnd)
                    }
                }
                if (event.duration.dots == 1) glyph('\uE1E7', noteX + 17, noteY - if (pitch.staffStep % 2 == 0) gap / 2 else 0f)
            }
        }
    }

    fun tie(from: MelodyEvent, fromIndex: Int, to: MelodyEvent, toIndex: Int) {
        if (!contains(fromIndex) && !contains(toIndex)) return
        val fromY = y(requireNotNull(from.pitch)) + 13
        val toY = y(requireNotNull(to.pitch)) + 13
        if (contains(fromIndex) && contains(toIndex)) curve(x(fromIndex, from.offsetTicks) + 6, fromY, x(toIndex, to.offsetTicks) + 4, toY)
        else if (contains(fromIndex)) curve(x(fromIndex, from.offsetTicks) + 6, fromY, end, fromY)
        else curve(start(toIndex) - 14, toY, x(toIndex, to.offsetTicks) + 4, toY)
    }

    private fun curve(x1: Float, y1: Float, x2: Float, y2: Float) {
        val path = Path().apply {
            moveTo(x1 * scale, y1 * scale)
            cubicTo((x1 + (x2 - x1) / 3) * scale, (y1 + 11) * scale,
                (x1 + (x2 - x1) * 2 / 3) * scale, (y2 + 11) * scale, x2 * scale, y2 * scale)
        }
        scope.drawPath(path, ink, style = Stroke(1.3f * scale))
    }
}
