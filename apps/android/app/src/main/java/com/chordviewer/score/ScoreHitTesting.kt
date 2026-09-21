package com.chordviewer.score

import kotlin.math.abs

internal fun scoreEventX(system: ScoreSystem, timelines: List<MeasureTimeline>, index: Int, tick: Int): Float {
    val left = (index - system.first) * system.measureWidth
    val start = left + 16 + if (index == system.first) system.prefix else 0f
    val available = (left + system.measureWidth - 16 - start).coerceAtLeast(timelines[index].width)
    return start + timelines[index].x(tick, available)
}

/** Pick the closest visible notehead/rest inside a touch-sized target; gaps do not select music. */
internal fun melodyAt(sheet: LeadSheet, system: ScoreSystem, timelines: List<MeasureTimeline>, x: Float, y: Float): String? =
    (system.first until system.first + system.count).flatMap { index ->
        sheet.measures[index].melody.map { event ->
            val noteX = scoreEventX(system, timelines, index, event.offsetTicks) + 6
            val noteY = system.geometry.top + if (event.pitch == null) 20f else 40f - event.pitch.staffStep * 5
            Triple(event.id, abs(noteX - x), abs(noteY - y))
        }
    }.filter { it.second <= 24 && it.third <= 24 }.minByOrNull { it.second * it.second + it.third * it.third }?.first
