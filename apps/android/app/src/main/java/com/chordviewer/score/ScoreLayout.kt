package com.chordviewer.score

data class NotationMark(val event: MelodyEvent, val accidental: Int?, val tiedFromPrevious: Boolean)
data class StaffGeometry(val top: Float, val rowHeight: Float)

object ScoreLayout {
    fun geometry(sheet: LeadSheet): StaffGeometry {
        val steps = sheet.measures.flatMap { it.melody }.mapNotNull { it.pitch?.staffStep }
        val top = maxOf(64f, 16f + (steps.maxOrNull() ?: 8) * 6)
        val height = maxOf(190f, top + 48 - (steps.minOrNull() ?: 0) * 6 + 50)
        return StaffGeometry(top, height)
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

    fun minimumMeasureWidth(measure: ScoreMeasure): Float {
        val offsets = (measure.chords.map { it.offsetTicks } + measure.melody.map { it.offsetTicks }).distinct()
        return maxOf(320f, 116f + offsets.size * 40f)
    }

    /** Shared offset positions align chord symbols and melody even when the lanes have different durations. */
    fun eventX(measure: ScoreMeasure, offset: Int, start: Float, end: Float): Float {
        val slots = (measure.chords.map { it.offsetTicks } + measure.melody.map { it.offsetTicks }).distinct().sorted()
        val index = slots.indexOf(offset)
        require(index >= 0 && end > start)
        val minimumGap = 30f
        val elastic = (end - start - slots.size * minimumGap).coerceAtLeast(0f)
        return start + index * minimumGap + offset.toFloat() / BAR_TICKS * elastic
    }
}
