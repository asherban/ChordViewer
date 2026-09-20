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
        val x = ScoreLayout.eventX(bar, bar.chords[1].offsetTicks, 84f, 368f)
        assertEquals(x, ScoreLayout.eventX(bar, bar.melody[3].offsetTicks, 84f, 368f), 0f)
        val positions = bar.melody.map { ScoreLayout.eventX(bar, it.offsetTicks, 84f, 368f) }
        assertTrue(positions.zipWithNext().all { (left, right) -> right - left >= 30f })
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
