package com.chordviewer.score

import org.junit.Assert.*
import org.junit.Test

class FastEntryTest {
    @Test fun onlyTrailingSilentBarsAreRemoved() {
        val original = sheet()
        val silent = ScoreMeasure("silence", emptyList(), listOf(MelodyEvent("rest", 0, ScoreDuration(1, 0), null)))
        val chordOnly = ScoreMeasure("chord-only", listOf(ChordEvent("g", 0, 1920, "G")), emptyList())
        val trailing = ScoreMeasure("trailing", emptyList(), listOf(MelodyEvent("tail-rest", 0, ScoreDuration(1, 0), null)))
        val score = original.copy(measures = original.measures + listOf(silent, chordOnly, trailing, ScoreMeasure("empty", emptyList(), emptyList())))
        val trimmed = FastEntry.trimTrailingSilentBars(score)
        assertEquals(score.measures.take(3), trimmed.measures)
        assertEquals(5, score.measures.size)
        assertSame(trimmed, FastEntry.trimTrailingSilentBars(trimmed))
        assertEquals(4, FastEntry.trimTrailingSilentBars(score, 4).measures.size)
        assertEquals(listOf(silent), FastEntry.trimTrailingSilentBars(score.copy(measures = listOf(silent, trailing))).measures)
    }

    @Test fun changingDeletingAndShorteningTheLastNoteTrimsBarsAndUndoRestoresThem() {
        val pitch = ScorePitch("C", 0, 4)
        val first = ScoreMeasure("first", emptyList(), listOf(MelodyEvent("whole", 0, ScoreDuration(1, 0), pitch)))
        val last = ScoreMeasure("last", emptyList(), listOf(MelodyEvent("quarter", 0, ScoreDuration(4, 0), pitch)))
        val score = sheet().copy(measures = listOf(first, last))
        val editor = ScoreEditor(score)
        editor.commit(FastEntry.changeMelodyAndShift(score, "quarter", MelodySpec(ScoreDuration(4, 0))))
        editor.update { it.copy(selectedMelodyId = "quarter") }
        assertEquals(listOf(first), editor.state.score.measures)
        assertNull(editor.state.selectedMelodyId)
        assertNull(editor.state.lastMelodyId)
        editor.undo(); assertEquals(score, editor.state.score)
        editor.commitScore(FastEntry.deleteMelodyAndShift(score, "quarter"), ScorePosition(2))
        assertEquals(1, editor.state.score.measures.size)
        assertEquals(ScorePosition(1), editor.state.position)
        editor.undo()
        editor.commit(FastEntry.changeMelodyAndShift(score, "whole", MelodySpec(ScoreDuration(2, 0), pitch)))
        assertEquals(1, editor.state.score.measures.size)
        assertEquals(listOf(0, 960), editor.state.score.measures[0].melody.map { it.offsetTicks })
        editor.undo(); assertEquals(score, editor.state.score)
        editor.redo(); assertEquals(1, editor.state.score.measures.size)
    }

    @Test fun restEntryAndExplicitlyAddedBarsRemainAvailableForTheNextNote() {
        val editor = ScoreEditor(sheet())
        editor.commit(FastEntry.melody(editor.state.score, ScorePosition(1), MelodySpec(ScoreDuration(4, 0))), preserveTrailingRests = true)
        editor.commit(FastEntry.melody(editor.state.score, FastEntry.nextMelodyPosition(editor.state.score), MelodySpec(ScoreDuration(4, 0), ScorePitch("G", 0, 4))))
        assertEquals(listOf(0, 480), editor.state.score.measures[1].melody.map { it.offsetTicks })
        assertNull(editor.state.score.measures[1].melody[0].pitch)
        editor.commitScore(FastEntry.insertBar(editor.state.score, 2), ScorePosition(2), minimumBars = 3)
        editor.commit(FastEntry.chord(editor.state.score, editor.state.position, "G", 1920))
        assertEquals("G", editor.state.score.measures[2].chords.single().symbol)
    }
    @Test fun tiedNoteEditingAndDeletionUseTheWholeChain() {
        val blank = sheet().copy(measures = listOf(sheet().measures[0].copy(melody = emptyList())))
        val written = FastEntry.melody(blank, ScorePosition(0, 1440), MelodySpec(ScoreDuration(2, 0), ScorePitch("C", 0, 4))).score
        val score = written.copy(measures = written.measures.mapIndexed { index, bar -> if (index != 1) bar else bar.copy(melody = bar.melody + MelodyEvent("later", 480, ScoreDuration(4, 0), null)) })
        val tail = score.measures[1].melody[0].id
        val group = FastEntry.melodyGroup(score, tail)!!
        assertEquals(960, group.ticks); assertEquals(2, group.ids.size)
        val changed = FastEntry.changeMelodyAndShift(score, tail, MelodySpec(group.event.duration, ScorePitch("G", 0, 4)), ticks = group.ticks).score
        assertTrue(changed.measures.flatMap { it.melody }.filter { it.pitch != null }.all { it.pitch == ScorePitch("G", 0, 4) })
        assertEquals(480, changed.measures[1].melody.first { it.id == "later" }.offsetTicks)
        val resized = FastEntry.changeMelodyAndShift(score, tail, MelodySpec(ScoreDuration(4, 0), ScorePitch("D", 0, 4))).score
        assertEquals("later", resized.measures[1].melody.single().id)
        assertEquals(0, resized.measures[1].melody.single().offsetTicks)
        val editor = ScoreEditor(score)
        editor.commitScore(FastEntry.deleteMelodyAndShift(score, tail), ScorePosition(0))
        assertEquals(listOf(MelodyEvent("later", 1440, ScoreDuration(4, 0), null)), editor.state.score.measures[0].melody)
        assertEquals(score.measures[0].chords, editor.state.score.measures[0].chords)
        editor.undo(); assertEquals(score, editor.state.score)
    }
    @Test fun incompleteMeasuresShowExactRestsWithoutChangingEnteredMusic() {
        val score = sheet().copy(measures = listOf(sheet().measures[0].copy(melody = listOf(
            MelodyEvent("one", 0, ScoreDuration(4, 0), ScorePitch("E", 0, 4)),
            MelodyEvent("two", 540, ScoreDuration(2, 0), ScorePitch("G", 0, 4))
        ))))
        val complete = ScoreLayout.withRests(score)
        assertEquals(1920, complete.measures[0].melody.sumOf { it.duration.ticks })
        assertEquals(ScoreDuration(32, 0), complete.measures[0].melody.first { it.offsetTicks == 480 }.duration)
        assertEquals(ScorePosition(0, 1500), FastEntry.nextMelodyPosition(score))
        assertEquals(2, score.measures[0].melody.size)
    }
    @Test fun shortNotesLeaveRoomForTheNextEntryCursor() {
        val bar = ScoreMeasure("bar", emptyList(), listOf(MelodyEvent("short", 0, ScoreDuration(16, 0), ScorePitch("E", 0, 4))))
        val timeline = ScoreLayout.timeline(bar, true, { 0f })
        assertTrue(timeline.x(120, timeline.width) - timeline.x(0, timeline.width) >= 30f)
    }
    @Test fun durationChangesShiftLaterMelodyAcrossBarsAndUndoAsOneAction() {
        val original = sheet().copy(measures = listOf(sheet().measures[0].copy(melody = "CDEF".mapIndexed { i, pitch ->
            MelodyEvent("n$i", i * 480, ScoreDuration(4, 0), ScorePitch(pitch.toString(), 0, 4))
        })))
        val editor = ScoreEditor(original)
        editor.commit(FastEntry.changeMelodyAndShift(original, "n1", MelodySpec(ScoreDuration(2, 1))))
        val result = editor.state.score
        assertEquals(listOf("n2", "n3"), result.measures[1].melody.map { it.id })
        assertEquals(listOf(0, 480), result.measures[1].melody.map { it.offsetTicks })
        assertEquals(original.measures[0].chords, result.measures[0].chords)
        assertEquals(ScorePosition(1, 960), FastEntry.nextMelodyPosition(result))
        val shorter = FastEntry.changeMelodyAndShift(result, "n1", MelodySpec(ScoreDuration(8, 0))).score
        assertEquals(listOf(0, 480, 720, 1200), shorter.measures[0].melody.map { it.offsetTicks })
        editor.undo()
        assertEquals(original, editor.state.score)
        editor.redo()
        assertEquals(result, editor.state.score)
    }
    @Test fun shiftedNoteSplitsAtBarlineAndOverflowLeavesInputUnchanged() {
        val original = sheet().copy(measures = listOf(sheet().measures[0].copy(melody = listOf(
            MelodyEvent("a", 0, ScoreDuration(2, 0), null), MelodyEvent("b", 960, ScoreDuration(2, 0), ScorePitch("G", 0, 4))
        ))))
        val result = FastEntry.changeMelodyAndShift(original, "a", MelodySpec(ScoreDuration(2, 1))).score
        assertTrue(result.measures[0].melody.last().tieToNext)
        assertEquals(ScoreDuration(4, 0), result.measures[1].melody.single().duration)
        val full = sheet().copy(measures = List(256) { i -> ScoreMeasure("b$i", emptyList(), if (i == 255) sheet().measures[0].melody else emptyList()) })
        assertThrows(IllegalArgumentException::class.java) { FastEntry.changeMelodyAndShift(full, "n", MelodySpec(ScoreDuration(1, 1))) }
        assertEquals(256, full.measures.size)
    }
    private fun sheet() = LeadSheet("sheet", "Entry study", listOf(ScoreMeasure("bar", listOf(ChordEvent("c", 0, 1920, "C")),
        listOf(MelodyEvent("n", 0, ScoreDuration(1, 0), ScorePitch("C", 0, 4))))), schemaVersion = 2)
    @Test fun overwritePreservesBothTailsAndOtherLane() {
        val original = sheet()
        val result = FastEntry.chord(original, ScorePosition(0, 480), "Dm7", 480).score
        assertEquals(listOf("C", "Dm7", "C"), result.measures[0].chords.map { it.symbol })
        assertEquals(listOf(480, 480, 960), result.measures[0].chords.map { it.durationTicks })
        assertEquals(original.measures[0].melody, result.measures[0].melody)
        assertEquals(1920, original.measures[0].chords.single().durationTicks)
    }
    @Test fun noteCrossesBarlineAndTiesFragments() {
        val result = FastEntry.melody(sheet(), ScorePosition(0, 1440), MelodySpec(ScoreDuration(2, 0), ScorePitch("D", 0, 5)))
        assertTrue(result.score.measures[0].melody.last().tieToNext)
        assertEquals(ScoreDuration(4, 0), result.score.measures[1].melody.single().duration)
        assertEquals(ScorePosition(1, 480), result.position)
        val inserted = FastEntry.insertBar(result.score, 1)
        assertFalse(inserted.measures[0].melody.last().tieToNext)
        assertEquals(result.score.measures[1], inserted.measures[2])
    }
    @Test fun exactFragmentsAndAtomicFailure() {
        assertEquals(300, FastEntry.splitDuration(300).sumOf { it.ticks })
        assertEquals(listOf(60), FastEntry.splitDuration(60).map { it.ticks })
        val original = sheet()
        assertThrows(IllegalArgumentException::class.java) { FastEntry.melody(original, ScorePosition(0, 1), MelodySpec(ScoreDuration(4, 0))) }
        assertEquals(ScoreDuration(1, 0), original.measures[0].melody.single().duration)
    }
    @Test fun moveAndUndoRestoreWholeAction() {
        val original = sheet()
        val editor = ScoreEditor(original)
        editor.commit(FastEntry.chord(original, ScorePosition(1), "C", 1920, "c"))
        assertTrue(editor.state.score.measures[0].chords.isEmpty())
        assertEquals("c", editor.state.score.measures[1].chords.single().id)
        editor.undo()
        assertEquals(original, editor.state.score)
    }
}
