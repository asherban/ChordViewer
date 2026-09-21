package com.chordviewer.score

import org.junit.Assert.*
import org.junit.Test

class ScoreHitTestingTest {
    @Test fun picksClosestHeadAcrossPrefixedAndLaterMeasuresButNotEmptyGaps() {
        val sheet = LeadSheet("sheet", "Hit test", listOf(
            ScoreMeasure("one", emptyList(), listOf(MelodyEvent("c", 0, ScoreDuration(4, 0), ScorePitch("C", 0, 4)))),
            ScoreMeasure("two", emptyList(), listOf(MelodyEvent("rest", 480, ScoreDuration(4, 0), null))),
        ), keySignature = "D", schemaVersion = 2)
        val timelines = sheet.measures.map { ScoreLayout.timeline(it, true, { 40f }, sheet.measureTicks, sheet.keySignature) }
        val system = ScoreLayout.systems(sheet, timelines, 800f, true).first()
        val firstX = scoreEventX(system, timelines, 0, 0)
        assertEquals("c", melodyAt(sheet, system, timelines, firstX + 6, system.geometry.top + 50))
        val restX = scoreEventX(system, timelines, 1, 480)
        assertEquals("rest", melodyAt(sheet, system, timelines, restX + 6, system.geometry.top + 20))
        assertNull(melodyAt(sheet, system, timelines, firstX + 70, system.geometry.top + 50))
        assertNull(melodyAt(sheet, system, timelines, firstX + 6, 5f))
    }
}
