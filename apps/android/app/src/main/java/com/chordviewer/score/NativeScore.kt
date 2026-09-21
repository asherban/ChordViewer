package com.chordviewer.score

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import com.chordviewer.R

@Composable
fun NativeScore(sheet: LeadSheet, showMelody: Boolean, selectedMelodyId: String? = null, selectMelody: ((String) -> Unit)? = null) {
    val context = LocalContext.current
    val musicFont = remember { context.resources.getFont(R.font.bravura) }
    val chordSize = if (showMelody) 26f else 44f
    val measureText = remember(chordSize) { Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create("serif", Typeface.BOLD); textSize = chordSize
    } }
    val marks = remember(sheet) { ScoreLayout.marks(sheet) }
    val timelines = remember(sheet, showMelody) { sheet.measures.map { ScoreLayout.timeline(it, showMelody, measureText::measureText, sheet.measureTicks, sheet.keySignature) } }
    val density = LocalDensity.current.density
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val systems = remember(sheet, timelines, maxWidth, showMelody) { ScoreLayout.systems(sheet, timelines, maxWidth.value, showMelody) }
        Column {
            systems.forEach { system ->
                // Only an unusually dense system scrolls; ordinary rows retain the viewport width.
                Column(Modifier.horizontalScroll(rememberScrollState())) {
                    Canvas(Modifier.width(system.width.dp).height(system.geometry.rowHeight.dp)
                        .then(if (showMelody && selectMelody != null) Modifier.pointerInput(sheet, system, density, selectMelody) {
                            detectTapGestures { point -> melodyAt(sheet, system, timelines, point.x / density, point.y / density)?.let(selectMelody) }
                        } else Modifier)
                        .semantics { contentDescription = description(sheet, system, showMelody) }) {
                        val painter = StaffPainter(this, musicFont, system, timelines, showMelody, sheet.keySignature, sheet.timeSignature, selectedMelodyId)
                        painter.system()
                        (system.first until system.first + system.count).forEach { index ->
                            painter.measure(sheet.measures[index], marks[index], index)
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

private class StaffPainter(val scope: DrawScope, musicFont: Typeface, val layout: ScoreSystem,
    val timelines: List<MeasureTimeline>, val melody: Boolean, val keySignature: String, val time: ScoreTimeSignature, val selectedId: String?) {
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
            if (event.id == selectedId) scope.drawCircle(Color(0xFFDDE9DD), 18 * scale,
                Offset((noteX + 6) * scale, (pitch?.let(::y) ?: (layout.geometry.top + 20)) * scale))
            if (pitch == null) {
                val rest = when (event.duration.denominator) { 1 -> '\uE4E3'; 2 -> '\uE4E4'; 4 -> '\uE4E5'; 8 -> '\uE4E6'; else -> '\uE4E7' }
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
                            else { if (up) '\uE242' else '\uE243' }
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
