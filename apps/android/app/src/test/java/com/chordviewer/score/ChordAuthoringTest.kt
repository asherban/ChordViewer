package com.chordviewer.score

import com.chordviewer.midi.ChordGestureCapture
import com.chordviewer.midi.OrderedMidiEventBuffer
import com.chordviewer.midi.MidiInputEvent
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ChordAuthoringTest {
    private fun fixture(name: String) = javaClass.classLoader!!.getResource(name)!!.readText()
    private val recognizer = ChordRecognizer(fixture("chord-vocabulary-v1.json"))
    private fun JSONArray.ints() = List(length()) { getInt(it) }
    private fun JSONArray.strings() = List(length()) { getString(it) }
    private val sample get() = LeadSheetReader.read(fixture("lead-sheet-v1.json"))
    private fun blank() = LeadSheet("score", "Study", listOf(ScoreMeasure("bar", emptyList(), emptyList())))

    @Test fun sharedRecognitionOrderMatchesWeb() {
        val cases = JSONObject(fixture("chord-authoring-cases.json")).getJSONArray("recognition")
        repeat(cases.length()) { index ->
            val case = cases.getJSONObject(index)
            assertEquals(case.getString("name"), case.getJSONArray("symbols").strings(), recognizer.recognize(case.getJSONArray("midiNotes").ints()).candidates.map { it.symbol })
        }
    }
    @Test fun originalRecognitionIdentityCasesMatch() {
        val cases = JSONObject(fixture("chord-recognition-cases.json")).getJSONArray("cases")
        repeat(cases.length()) { index ->
            val case = cases.getJSONObject(index); val expected = case.getJSONObject("expected")
            val result = recognizer.recognize(case.getJSONArray("midiNotes").ints())
            assertEquals(case.getString("name"), expected.getJSONArray("pitchClasses").ints(), result.pitchClasses)
            assertEquals(if (expected.isNull("bassMidi")) null else expected.getInt("bassMidi"), result.bassMidi)
            if (expected.isNull("chord")) assertTrue(result.candidates.isEmpty()) else {
                assertEquals(expected.getJSONObject("chord").getInt("rootPitchClass"), result.candidates.first().rootPitchClass)
                assertEquals(expected.getJSONObject("chord").getString("quality"), result.candidates.first().quality)
            }
        }
    }
    @Test fun everySharedPhysicalGestureTransitionMatchesWeb() {
        val cases = JSONObject(fixture("chord-authoring-cases.json")).getJSONArray("capture")
        repeat(cases.length()) { index ->
            val case = cases.getJSONObject(index); val received = mutableListOf<List<Int>>()
            val capture = ChordGestureCapture { received.add(it) }
            val steps = case.getJSONArray("steps")
            repeat(steps.length()) { stepIndex ->
                received.clear()
                val step = steps.getJSONObject(stepIndex)
                if (step.has("enable")) { if (step.getBoolean("enable")) capture.arm() else capture.pause() }
                if (step.has("resetHeld")) capture.reset(step.getJSONArray("resetHeld").ints().toSet())
                if (step.has("bytes")) capture.accept(step.getJSONArray("bytes").ints().toIntArray())
                val expected = if (step.has("gesture")) listOf(step.getJSONArray("gesture").ints()) else emptyList()
                assertEquals("${case.getString("name")} step $stepIndex", expected, received)
            }
        }
    }
    @Test fun byteStreamPreservesFastBurstsRunningStatusAndRealtimeBytes() {
        val received = mutableListOf<List<Int>>()
        val capture = ChordGestureCapture { received.add(it) }; capture.arm()
        val burst = IntArray(60 * 17) { 0 }
        val gesture = intArrayOf(144, 60, 90, 248, 64, 90, 67, 90, 128, 60, 0, 64, 0, 67, 0, 248, 248)
        repeat(60) { gesture.copyInto(burst, it * gesture.size) }
        capture.accept(burst)
        assertEquals(60, received.size)
        assertTrue(received.all { it == listOf(60, 64, 67) })
    }
    @Test fun boundedDeliveryPreservesOrderAndOverflowCancelsPartialGesture() {
        val buffer = OrderedMidiEventBuffer(4)
        val delivered = mutableListOf<List<Int>>()
        val capture = ChordGestureCapture { delivered.add(it) }; capture.arm()
        capture.accept(intArrayOf(144, 60, 90))
        repeat(4) { assertTrue(buffer.offer(MidiInputEvent.Bytes(intArrayOf(144, 64 + it, 90)))) }
        assertFalse(buffer.offer(MidiInputEvent.Bytes(intArrayOf(128, 60, 0))))
        val reset = buffer.drain().single() as MidiInputEvent.Reset
        assertFalse(reset.connected)
        capture.reset()
        capture.accept(intArrayOf(128, 60, 0))
        assertTrue(delivered.isEmpty()); assertFalse(capture.armed)
        val first = MidiInputEvent.Bytes(intArrayOf(144, 60, 90)); val second = MidiInputEvent.Bytes(intArrayOf(128, 60, 0))
        buffer.offer(first); buffer.offer(second)
        assertEquals(listOf(first, second), buffer.drain())
        assertTrue(buffer.drain().isEmpty())
    }
    @Test fun insertUsesDurationAndExtendsOnlyWhenNeeded() {
        CHORD_DURATIONS.forEach { duration ->
            val first = ChordEdits.insert(blank(), ScorePosition(), duration, "C")
            assertEquals(duration, first.score.measures.first().chords.single().durationTicks)
            assertEquals(1, first.score.measures.size)
        }
        val full = ChordEdits.insert(blank(), ScorePosition(), 1920, "C")
        assertEquals(ScorePosition(1), full.position)
        assertEquals(1, full.score.measures.size)
        val next = ChordEdits.insert(full.score, full.position, 1920, "Dm")
        assertEquals(2, next.score.measures.size)
    }
    @Test fun rejectOverlapCrossbarBadSymbolsAndMeasureLimitWithoutChangingOriginal() {
        val first = ChordEdits.insert(blank(), ScorePosition(), 960, "C").score
        val before = LeadSheetWriter.write(first)
        expectInvalid { ChordEdits.insert(first, ScorePosition(0, 480), 480, "Dm") }
        expectInvalid { ChordEdits.insert(first, ScorePosition(0, 1440), 960, "Dm") }
        listOf("", " C ", "a\n", "a\u202E", "a\u2028", "a\u0000", "C".repeat(33), "\uD800").forEach { symbol ->
            expectInvalid { ChordEdits.insert(blank(), ScorePosition(), 1920, symbol) }
        }
        assertEquals("😀".repeat(32), ChordEdits.insert(blank(), ScorePosition(), 1920, "😀".repeat(32)).score.measures.first().chords.single().symbol)
        val maximum = blank().copy(measures = List(256) { ScoreMeasure("bar_$it", emptyList(), emptyList()) })
        expectInvalid { ChordEdits.insert(maximum, ScorePosition(256), 1920, "C") }
        assertEquals(before, LeadSheetWriter.write(first))
    }
    @Test fun replaceDeleteAndSerializationKeepIndependentMelody() {
        val original = sample; val chord = original.measures.first().chords.first()
        val edited = ChordEdits.replace(original, chord.id, chord.durationTicks, "Cm").score
        assertEquals(chord.id, edited.measures.first().chords.first().id)
        assertEquals(original.measures.map { it.melody }, edited.measures.map { it.melody })
        val deleted = ChordEdits.delete(edited, chord.id)
        assertEquals(original.measures.map { it.melody }, deleted.measures.map { it.melody })
        assertEquals(deleted, LeadSheetReader.read(LeadSheetWriter.write(deleted)))
        assertEquals(original, LeadSheetReader.read(LeadSheetWriter.write(original)))
        val offGrid = blank().copy(measures = listOf(ScoreMeasure("bar", listOf(ChordEvent("chord", 120, 240, "C")), emptyList())))
        assertEquals(120, ChordEdits.replace(offGrid, "chord", 240, "Cm").score.measures.single().chords.single().offsetTicks)
    }
    @Test fun undoRestoresCursorScoreAndExtensionRedoAndHistoryBound() {
        val editor = ChordEditor(blank())
        repeat(101) { editor.commit(ChordEdits.insert(editor.state.score, editor.state.position, 1920, "C")) }
        repeat(100) { editor.undo() }
        assertFalse(editor.state.canUndo)
        assertEquals(ScorePosition(1), editor.state.position)
        assertEquals(1, editor.state.score.measures.size)
        assertEquals(1, editor.state.score.measures.sumOf { it.chords.size })
        editor.redo(); assertEquals(ScorePosition(2), editor.state.position)
        assertEquals(2, editor.state.score.measures.size)
        editor.commit(ChordEdits.insert(editor.state.score, editor.state.position, 1920, "Dm"))
        assertFalse(editor.state.canRedo)
    }
    private fun expectInvalid(action: () -> Unit) { try { action(); fail("Expected invalid edit") } catch (_: IllegalArgumentException) {} }
}
