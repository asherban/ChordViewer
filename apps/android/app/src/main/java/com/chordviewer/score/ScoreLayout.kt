package com.chordviewer.score

data class NotationMark(val event: MelodyEvent, val accidental: Int?, val tiedFromPrevious: Boolean)
data class StaffGeometry(val top: Float, val rowHeight: Float)
data class MeasureTimeline(val ticks: List<Int>, val positions: List<Float>) {
    val width: Float get() = positions.last()
    fun x(tick: Int, available: Float): Float {
        require(tick in 0..BAR_TICKS && available >= width)
        val next = ticks.indexOfFirst { it >= tick }
        val natural = if (ticks[next] == tick) positions[next] else {
            val fraction = (tick - ticks[next - 1]).toFloat() / (ticks[next] - ticks[next - 1])
            positions[next - 1] + fraction * (positions[next] - positions[next - 1])
        }
        return natural + (available - width) * tick / BAR_TICKS
    }
}
data class ScoreSystem(val first: Int, val count: Int, val columns: Int, val width: Float,
    val geometry: StaffGeometry, val prefix: Float) {
    val measureWidth: Float get() = width / columns
}

object ScoreLayout {
    fun geometry(sheet: LeadSheet): StaffGeometry {
        val steps = sheet.measures.flatMap { it.melody }.mapNotNull { it.pitch?.staffStep }
        val top = maxOf(66f, 26f + (steps.maxOrNull() ?: 8) * 5)
        val height = maxOf(154f, top + 64, top + 40 - (steps.minOrNull() ?: 0) * 5 + 36)
        return StaffGeometry(top, height)
    }

    /** Allocate actual glyph space before distributing spare width by musical time.
     * Even a valid one-tick chord gets enough room without an unbounded duration ratio. */
    fun timeline(measure: ScoreMeasure, melody: Boolean, symbolWidth: (String) -> Float): MeasureTimeline {
        val ticks = (listOf(0, BAR_TICKS) + measure.chords.flatMap { listOf(it.offsetTicks, it.offsetTicks + it.durationTicks) } +
            if (melody) measure.melody.map { it.offsetTicks } else emptyList()).distinct().sorted()
        val gaps = MutableList(ticks.size - 1) { if (melody) 30f else 18f }
        fun reserve(from: Int, to: Int, width: Float) {
            val start = ticks.indexOf(from)
            val end = ticks.indexOf(to)
            val missing = (width - gaps.subList(start, end).sum()).coerceAtLeast(0f)
            for (index in start until end) gaps[index] += missing / (end - start)
        }
        measure.chords.forEach { reserve(it.offsetTicks, it.offsetTicks + it.durationTicks, symbolWidth(it.symbol) + 24) }
        if (melody) {
            // A continuing cross-bar tie may omit an accidental; reserving it here is conservative.
            val notation = marks(LeadSheet("layout", "Layout", listOf(measure))).first()
            notation.zipWithNext().forEach { (previous, next) ->
                val decorated = previous.event.duration.dots == 1 || previous.event.duration.denominator >= 8
                val trailing = if (decorated) 24f else 14f
                reserve(previous.event.offsetTicks, next.event.offsetTicks, trailing + (if (next.accidental != null) 16f else 0f) + 6f)
            }
        }
        val spare = (120f - gaps.sum()).coerceAtLeast(0f)
        val positions = mutableListOf(0f)
        gaps.forEachIndexed { index, gap -> positions += positions.last() + gap + spare * (ticks[index + 1] - ticks[index]) / BAR_TICKS }
        return MeasureTimeline(ticks, positions)
    }

    /** Four compact bars where they fit; dense systems fall back to two or one, then scroll. */
    fun systems(sheet: LeadSheet, timelines: List<MeasureTimeline>, available: Float, melody: Boolean): List<ScoreSystem> {
        require(available > 0 && timelines.size == sheet.measures.size)
        val result = mutableListOf<ScoreSystem>()
        var first = 0
        while (first < sheet.measures.size) {
            val prefix = if (!melody) 0f else if (first == 0) 62f else 36f
            fun minimum(columns: Int): Float = (0 until minOf(columns, sheet.measures.size - first)).maxOf {
                timelines[first + it].width + 32 + if (it == 0) prefix else 0f
            } * columns
            val columns = listOf(4, 2, 1).firstOrNull { minimum(it) <= available } ?: 1
            val count = minOf(columns, sheet.measures.size - first)
            val width = maxOf(available, minimum(columns))
            val geometry = if (melody) geometry(sheet.copy(measures = sheet.measures.subList(first, first + count))) else StaffGeometry(0f, 130f)
            result += ScoreSystem(first, count, columns, width, geometry, prefix)
            first += count
        }
        return result
    }

    /** Accidentals carry for the same spelled pitch/octave until the barline, including natural cancellation. */
    fun marks(sheet: LeadSheet): List<List<NotationMark>> {
        var previous: MelodyEvent? = null
        return sheet.measures.map { measure ->
            val alterations = mutableMapOf<Pair<String, Int>, Int>()
            measure.melody.map { event ->
                val pitch = event.pitch
                val tied = previous?.tieToNext == true
                val accidental = pitch?.let {
                    val key = it.step to it.octave
                    val previousAlter = alterations[key] ?: 0
                    // A tie carries its own pitch across a barline, not an accidental for later new notes.
                    if (!tied) alterations[key] = it.alter
                    if (previousAlter != it.alter && !tied) it.alter else null
                }
                previous = event
                NotationMark(event, accidental, tied)
            }
        }
    }

    fun ledgerSteps(pitch: ScorePitch): List<Int> = when {
        pitch.staffStep < 0 -> (-2 downTo pitch.staffStep step 2).toList()
        pitch.staffStep > 8 -> (10..pitch.staffStep step 2).toList()
        else -> emptyList()
    }

}
