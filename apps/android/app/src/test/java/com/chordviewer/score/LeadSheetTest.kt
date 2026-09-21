package com.chordviewer.score

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class LeadSheetTest {
    private fun fixture() = requireNotNull(javaClass.classLoader?.getResource("lead-sheet-v1.json")).readText()

    @Test fun sharedConformanceCasesAgreeAcrossNativeAndWeb() {
        val text = requireNotNull(javaClass.classLoader?.getResource("score-validation-cases.json")).readText()
        val cases = JSONObject(text).getJSONArray("cases")
        assertTrue("The shared contract must include its conformance matrix", cases.length() >= 30)
        for (index in 0 until cases.length()) {
            val case = cases.getJSONObject(index)
            val accepted = runCatching { LeadSheetReader.read(case.getJSONObject("score").toString()) }.isSuccess
            assertEquals(case.getString("name"), case.getBoolean("valid"), accepted)
        }
    }

    @Test fun sharedFixturePreservesMusicalDurationsSpellingAndCrossBarTies() {
        val sheet = LeadSheetReader.read(fixture())
        assertEquals("First Sketch", sheet.title)
        assertEquals(4, sheet.measures.size)
        assertTrue(sheet.measures.all { it.melody.sumOf { note -> note.duration.ticks } == BAR_TICKS })
        assertEquals(720, sheet.measures[1].melody[0].duration.ticks)
        assertEquals(360, sheet.measures[1].melody[3].duration.ticks)
        assertEquals(120, sheet.measures[1].melody[4].duration.ticks)
        assertEquals(2, sheet.measures.flatMap { it.melody }.count { it.tieToNext })
        assertEquals(ScorePitch("B", -1, 4), sheet.measures[1].melody[2].pitch)
    }

    @Test fun notationMarksIncludeSharpNaturalCancellationFlatAndTieContinuations() {
        val marks = ScoreLayout.marks(LeadSheetReader.read(fixture())).flatten().associateBy { it.event.id }
        assertEquals(1, marks.getValue("note-b1-f-sharp").accidental)
        assertEquals(0, marks.getValue("note-b1-f-natural").accidental)
        assertEquals(-1, marks.getValue("note-b2-b-flat").accidental)
        assertTrue(marks.getValue("note-b2-g").tiedFromPrevious)
        assertTrue(marks.getValue("note-b4-c").tiedFromPrevious)
    }

    @Test fun pitchPlacementUsesSpellingInsteadOfChromaticPitchAndHasCorrectLedgerLines() {
        assertEquals(ScorePitch("F", 1, 4).staffStep, ScorePitch("F", 0, 4).staffStep)
        assertEquals(0, ScorePitch("E", 0, 4).staffStep)
        assertEquals(8, ScorePitch("F", 0, 5).staffStep)
        assertEquals(listOf(-2), ScoreLayout.ledgerSteps(ScorePitch("C", 0, 4)))
        assertEquals(listOf(10, 12), ScoreLayout.ledgerSteps(ScorePitch("C", 0, 6)))
    }

    @Test fun chordAndMelodyOnsetsUseOneSharedHorizontalPosition() {
        val bar = LeadSheetReader.read(fixture()).measures[0]
        val timeline = ScoreLayout.timeline(bar, true) { 60f }
        val x = timeline.x(bar.chords[1].offsetTicks, 300f)
        assertEquals(x, timeline.x(bar.melody[3].offsetTicks, 300f), 0f)
        val positions = bar.melody.map { timeline.x(it.offsetTicks, 300f) }
        assertTrue(positions.zipWithNext().all { (left, right) -> right - left >= 30f })
    }

    @Test fun systemsFitFourNormalBarsAndLeaveAnIncompleteSystemCompact() {
        val bar = ScoreMeasure("bar", listOf(ChordEvent("chord", 0, BAR_TICKS, "Cmaj7")),
            List(4) { MelodyEvent("n$it", it * 480, ScoreDuration(4, 0), ScorePitch("C", 0, 4)) })
        val sheet = LeadSheet("score", "Study", List(5) { bar.copy(id = "bar$it") })
        val timelines = sheet.measures.map { ScoreLayout.timeline(it, true) { 80f } }
        val systems = ScoreLayout.systems(sheet, timelines, 900f, true)
        assertEquals(listOf(4, 1), systems.map { it.count })
        assertEquals(listOf(4, 4), systems.map { it.columns })
        assertTrue(systems.all { it.width == 900f && it.geometry.rowHeight in 150f..170f })
        val narrow = ScoreLayout.systems(sheet, timelines, 450f, true)
        assertEquals(2, narrow.first().columns)
        assertEquals(1, ScoreLayout.systems(sheet, timelines, 230f, true).first().columns)
    }

    @Test fun aVeryShortLongNamedChordGetsFiniteSpaceAndDoesNotWidenOtherSystems() {
        val empty = ScoreMeasure("bar", emptyList(), emptyList())
        val dense = empty.copy(chords = listOf(ChordEvent("c", 959, 1, "A".repeat(32))))
        val sheet = LeadSheet("score", "Study", listOf(dense) + List(4) { empty })
        val timelines = sheet.measures.map { ScoreLayout.timeline(it, false) { 700f } }
        val systems = ScoreLayout.systems(sheet, timelines, 640f, false)
        assertEquals(1, systems.first().columns)
        assertTrue(systems.first().width in 750f..850f)
        assertEquals(640f, systems[1].width)
        assertEquals(4, systems[1].columns)
        assertTrue(timelines[0].x(960, timelines[0].width) - timelines[0].x(959, timelines[0].width) >= 724f)
    }

    @Test fun chordSpansRespectTimingAndAllocateRoomForEachLabel() {
        val bar = ScoreMeasure("bar", listOf(ChordEvent("c", 0, 480, "Cmaj7"), ChordEvent("g", 960, 960, "G7")), emptyList())
        val timeline = ScoreLayout.timeline(bar, false) { if (it == "Cmaj7") 140f else 60f }
        val width = timeline.width + 100
        assertTrue(timeline.x(480, width) - timeline.x(0, width) >= 164f)
        assertTrue(timeline.x(1920, width) - timeline.x(960, width) >= 84f)
        assertTrue(timeline.x(960, width) > timeline.x(480, width))
        assertEquals(width, timeline.x(BAR_TICKS, width), .001f)
        val whole = ScoreLayout.timeline(bar.copy(chords = listOf(ChordEvent("f", 0, BAR_TICKS, "F"))), false) { 40f }
        assertEquals(width / 2, (whole.x(0, width) + whole.x(BAR_TICKS, width)) / 2, .001f)
    }

    @Test fun extremeLedgerNotesHaveRoomAboveAndBelowTheSystemIncludingTies() {
        val events = listOf(ScorePitch("B", 0, 6), ScorePitch("C", 0, 3)).mapIndexed { index, pitch ->
            MelodyEvent("n$index", index * 480, ScoreDuration(4, 0), pitch)
        }
        val geometry = ScoreLayout.geometry(LeadSheet("s", "Extremes", listOf(ScoreMeasure("b", emptyList(), events))))
        assertTrue(geometry.top + 40 - events[0].pitch!!.staffStep * 5 - 8 >= 50f)
        assertTrue(geometry.rowHeight - (geometry.top + 40 - events[1].pitch!!.staffStep * 5) >= 36f)
        val highOnly = ScoreLayout.geometry(LeadSheet("h", "High", listOf(ScoreMeasure("b", emptyList(), events.take(1)))))
        assertTrue(highOnly.rowHeight >= highOnly.top + 64f)
    }

    @Test fun dottedNotesAndFlagsLeaveRoomForTheFollowingAccidentalAtMinimumWidth() {
        val bar = ScoreMeasure("bar", emptyList(), listOf(
            MelodyEvent("dotted", 0, ScoreDuration(8, 1), ScorePitch("C", 0, 4)),
            MelodyEvent("sharp", 360, ScoreDuration(16, 0), ScorePitch("F", 1, 4)),
            MelodyEvent("natural", 480, ScoreDuration(4, 0), ScorePitch("F", 0, 4)),
        ))
        val timeline = ScoreLayout.timeline(bar, true) { 0f }
        assertTrue(timeline.x(360, timeline.width) - timeline.x(0, timeline.width) >= 46f)
        assertTrue(timeline.x(480, timeline.width) - timeline.x(360, timeline.width) >= 46f)
    }

    @Test fun aTiedAccidentalDoesNotChangeNewNotesInTheFollowingBar() {
        val pitch = ScorePitch("F", 1, 4)
        val sheet = LeadSheet("score", "Tie", listOf(
            ScoreMeasure("one", emptyList(), listOf(MelodyEvent("a", 1440, ScoreDuration(4, 0), pitch, true))),
            ScoreMeasure("two", emptyList(), listOf(
                MelodyEvent("b", 0, ScoreDuration(4, 0), pitch),
                MelodyEvent("c", 480, ScoreDuration(4, 0), pitch),
            )),
        ))
        val marks = ScoreLayout.marks(sheet)
        assertEquals(null, marks[1][0].accidental)
        assertEquals(1, marks[1][1].accidental)
    }

    @Test fun malformedFieldsOverlapsAndInvalidTiesAreRejectedBeforeRendering() {
        val mutations: List<(JSONObject) -> Unit> = listOf(
            { it.put("schemaVersion", "1") },
            { it.put("unknown", true) },
            { it.getJSONArray("measures").getJSONObject(0).put("id", it.getString("id")) },
            { it.event(0, 1).put("offsetTicks", 479) },
            { it.event(0, 0).getJSONObject("duration").put("denominator", 3) },
            { it.event(0, 3).put("pitch", JSONObject().put("step", "C").put("alter", 0).put("octave", 4)) },
            { it.event(0, 4).getJSONObject("pitch").put("alter", 1) },
            { it.event(3, 3).put("tieToNext", true) },
            { it.event(0, 0).put("offsetTicks", -1) },
            { it.event(0, 0).put("tieToNext", "false") },
        )
        mutations.forEach { mutate ->
            val json = JSONObject(fixture()).apply(mutate)
            assertThrows(IllegalArgumentException::class.java) { LeadSheetReader.read(json.toString()) }
        }
    }

    @Test fun chordOnlyAndGapsAreValidAndUnicodeLengthMatchesJsonSchema() {
        val json = JSONObject(fixture())
        for (index in 0 until 4) json.getJSONArray("measures").getJSONObject(index).put("melody", org.json.JSONArray())
        json.put("title", "🎹".repeat(200))
        val sheet = LeadSheetReader.read(json.toString())
        assertTrue(sheet.measures.all { it.melody.isEmpty() })
        json.put("title", "🎹".repeat(201))
        assertThrows(IllegalArgumentException::class.java) { LeadSheetReader.read(json.toString()) }
    }

    private fun JSONObject.event(bar: Int, event: Int) = getJSONArray("measures").getJSONObject(bar).getJSONArray("melody").getJSONObject(event)
}
