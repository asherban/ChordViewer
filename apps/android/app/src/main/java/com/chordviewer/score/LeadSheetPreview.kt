package com.chordviewer.score

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chordviewer.R

@Composable
fun LeadSheetPreview() {
    val context = LocalContext.current
    val sample = remember {
        runCatching { context.assets.open("lead-sheet-v1.json").bufferedReader().use { LeadSheetReader.read(it.readText()) } }
    }
    var showMelody by remember { mutableStateOf(true) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Developer score sample", style = MaterialTheme.typography.titleLarge)
        Text("This original sample checks the shared score format. It is separate from your personal library.")
        val sheet = sample.getOrNull()
        if (sheet == null) {
            Text("The score sample could not be loaded.")
        } else {
            Text(sheet.title, style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Switch(checked = showMelody, onCheckedChange = { showMelody = it },
                    modifier = Modifier.semantics { contentDescription = "Show melody notation" })
                Text(if (showMelody) "Chords and melody · C major · 4/4" else "Chords only · C major · 4/4")
            }
            NativeScore(sheet, showMelody)
        }
    }
}

@Composable
fun NativeScore(sheet: LeadSheet, showMelody: Boolean) {
    val context = LocalContext.current
    val musicFont = remember { context.resources.getFont(R.font.bravura) }
    val marks = remember(sheet) { ScoreLayout.marks(sheet) }
    val geometry = remember(sheet) { ScoreLayout.geometry(sheet) }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val minimum = sheet.measures.maxOf(ScoreLayout::minimumMeasureWidth)
        val perRow = if (maxWidth.value >= minimum * 2) 2 else 1
        val width = maxOf(maxWidth.value, minimum)
        val rows = (sheet.measures.size + perRow - 1) / perRow
        val rowHeight = if (showMelody) geometry.rowHeight else 92f
        val description = buildString {
            append("${sheet.title}. C major, four-four time. ")
            sheet.measures.forEachIndexed { index, measure ->
                append("Measure ${index + 1}: chords ${measure.chords.joinToString { it.symbol }}. ")
                if (showMelody) append(measure.melody.joinToString { event ->
                    (event.pitch?.label ?: "rest") + ", ${event.duration.denominator} denominator" +
                        (if (event.duration.dots == 1) ", dotted" else "") + (if (event.tieToNext) ", tied" else "")
                } + ". ")
            }
        }
        Column(Modifier.horizontalScroll(rememberScrollState())) {
            Canvas(Modifier.width(width.dp).height((rows * rowHeight).dp)
                .semantics { contentDescription = description }) {
                val scale = density
                val measureWidth = width / perRow
                val painter = StaffPainter(this, musicFont, scale, geometry.top)
                sheet.measures.forEachIndexed { index, measure ->
                    val row = index / perRow
                    val column = index % perRow
                    painter.measure(measure, marks[index], index, column * measureWidth, row * rowHeight,
                        measureWidth, column == 0, showMelody)
                }
                if (showMelody) sheet.measures.forEachIndexed { index, measure ->
                    measure.melody.filter { it.tieToNext }.forEach { event ->
                        val nextInMeasure = measure.melody.firstOrNull { it.offsetTicks == event.offsetTicks + event.duration.ticks }
                        val targetIndex = if (nextInMeasure != null) index else index + 1
                        val target = nextInMeasure ?: sheet.measures[targetIndex].melody.first()
                        painter.tie(measure, event, index, sheet.measures[targetIndex], target, targetIndex, perRow, measureWidth, rowHeight)
                    }
                }
            }
        }
    }
}

private class StaffPainter(val scope: DrawScope, musicFont: Typeface, val scale: Float, val staffTop: Float) {
    private val ink = Color(0xFF1D2939)
    private val staff = Color(0xFF98A2B3)
    private val gap = 12f
    private val music = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = musicFont; textSize = gap * 4 * scale; color = ink.toArgb() }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Typeface.DEFAULT; textSize = 15 * scale; color = ink.toArgb() }

    private fun glyph(value: Char, x: Float, y: Float) = scope.drawContext.canvas.nativeCanvas.drawText(value.toString(), x * scale, y * scale, music)
    private fun line(x1: Float, y1: Float, x2: Float, y2: Float, color: Color = ink, width: Float = 1f) =
        scope.drawLine(color, Offset(x1 * scale, y1 * scale), Offset(x2 * scale, y2 * scale), width * scale)
    private fun label(value: String, x: Float, y: Float) = scope.drawContext.canvas.nativeCanvas.drawText(value, x * scale, y * scale, text)
    private fun x(measure: ScoreMeasure, offset: Int, left: Float, width: Float) = ScoreLayout.eventX(measure, offset, left + 84, left + width - 32)
    private fun y(pitch: ScorePitch, top: Float) = top + staffTop + 4 * gap - pitch.staffStep * gap / 2

    fun measure(measure: ScoreMeasure, marks: List<NotationMark>, index: Int, left: Float, top: Float,
        width: Float, startOfRow: Boolean, showMelody: Boolean) {
        label("${index + 1}", left + 8, top + 18)
        measure.chords.forEach { label(it.symbol, x(measure, it.offsetTicks, left, width), top + 42) }
        if (!showMelody) {
            line(left + 6, top + 60, left + width - 6, top + 60, staff)
            line(left + width - 6, top + 30, left + width - 6, top + 68, staff)
            return
        }
        repeat(5) { line(left + 6, top + staffTop + it * gap, left + width - 6, top + staffTop + it * gap, staff) }
        line(left + width - 6, top + staffTop, left + width - 6, top + staffTop + 4 * gap, staff)
        if (startOfRow) {
            glyph('\uE050', left + 12, top + staffTop + 3 * gap)
            glyph('\uE084', left + 48, top + staffTop + gap)
            glyph('\uE084', left + 48, top + staffTop + 3 * gap)
        }
        marks.forEach { mark ->
            val event = mark.event
            val noteX = x(measure, event.offsetTicks, left, width)
            val pitch = event.pitch
            if (pitch == null) {
                val rest = when (event.duration.denominator) { 1 -> '\uE4E3'; 2 -> '\uE4E4'; 4 -> '\uE4E5'; 8 -> '\uE4E6'; else -> '\uE4E7' }
                val restY = top + staffTop + (if (event.duration.denominator == 1) 1 else 2) * gap
                glyph(rest, noteX, restY)
                if (event.duration.dots == 1) glyph('\uE1E7', noteX + 18, restY - gap / 2)
            } else {
                val noteY = y(pitch, top)
                ScoreLayout.ledgerSteps(pitch).forEach { step ->
                    val ledgerY = top + staffTop + 4 * gap - step * gap / 2
                    line(noteX - 4, ledgerY, noteX + 19, ledgerY, staff)
                }
                mark.accidental?.let { glyph(when (it) { -1 -> '\uE260'; 1 -> '\uE262'; else -> '\uE261' }, noteX - 18, noteY) }
                val head = when (event.duration.denominator) { 1 -> '\uE0A2'; 2 -> '\uE0A3'; else -> '\uE0A4' }
                glyph(head, noteX, noteY)
                if (event.duration.denominator != 1) {
                    val up = pitch.staffStep < 4
                    val stemX = noteX + if (up) 13f else 0.7f
                    val stemEnd = noteY + if (up) -42f else 42f
                    line(stemX, noteY, stemX, stemEnd, width = 1.2f)
                    if (event.duration.denominator >= 8) {
                        val flag = if (event.duration.denominator == 8) { if (up) '\uE240' else '\uE241' }
                            else { if (up) '\uE242' else '\uE243' }
                        glyph(flag, stemX, stemEnd)
                    }
                }
                if (event.duration.dots == 1) glyph('\uE1E7', noteX + 20, noteY - if (pitch.staffStep % 2 == 0) gap / 2 else 0f)
            }
        }
    }

    fun tie(fromBar: ScoreMeasure, from: MelodyEvent, fromIndex: Int, toBar: ScoreMeasure, to: MelodyEvent,
        toIndex: Int, perRow: Int, width: Float, rowHeight: Float) {
        val startX = x(fromBar, from.offsetTicks, fromIndex % perRow * width, width) + 8
        val endX = x(toBar, to.offsetTicks, toIndex % perRow * width, width) + 5
        val fromY = y(requireNotNull(from.pitch), fromIndex / perRow * rowHeight) + 14
        val toY = y(requireNotNull(to.pitch), toIndex / perRow * rowHeight) + 14
        if (fromIndex / perRow == toIndex / perRow) curve(startX, fromY, endX, toY)
        else {
            curve(startX, fromY, perRow * width - 8, fromY)
            curve(72f, toY, endX, toY)
        }
    }

    private fun curve(x1: Float, y1: Float, x2: Float, y2: Float) {
        val path = Path().apply {
            moveTo(x1 * scale, y1 * scale)
            cubicTo((x1 + (x2 - x1) / 3) * scale, (y1 + 14) * scale,
                (x1 + (x2 - x1) * 2 / 3) * scale, (y2 + 14) * scale, x2 * scale, y2 * scale)
        }
        scope.drawPath(path, ink, style = Stroke(1.5f * scale))
    }
}
