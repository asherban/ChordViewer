package com.chordviewer.score

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MelodyAuthoringTest {
    private fun fixture(name: String) = javaClass.classLoader!!.getResource(name)!!.readText()
    private val cases get() = JSONObject(fixture("melody-authoring-cases.json"))
    private fun blank() = LeadSheet("score", "Study", listOf(ScoreMeasure("bar", emptyList(), emptyList())))
    private val quarter = MelodySpec(ScoreDuration(4, 0), ScorePitch("C", 0, 4))
    private fun JSONObject.pitch() = ScorePitch(getString("step"), getInt("alter"), getInt("octave"))
    private fun JSONObject.position() = ScorePosition(getInt("measureIndex"), getInt("offsetTicks"))
    private fun JSONObject.spec(): MelodySpec {
        val duration = getJSONObject("duration")
        return MelodySpec(ScoreDuration(duration.getInt("denominator"), duration.getInt("dots")), if (getString("kind") == "note") getJSONObject("pitch").pitch() else null)
    }
    private fun issue(code: String, block: () -> Unit) {
        try { block(); fail("Expected rejected melody edit: $code") }
        catch (error: MelodyEntryException) { assertEquals(code, error.code) }
    }
    private fun invalid(block: () -> Unit) { try { block(); fail("Expected invalid score") } catch (_: IllegalArgumentException) {} }

    @Test fun sharedMidiSpellingMatchesWeb() {
        val rows = cases.getJSONArray("midi")
        repeat(rows.length()) { index ->
            val case = rows.getJSONObject(index)
            if (case.has("code")) issue(case.getString("code")) { midiToPitch(case.getInt("midi"), case.getString("key")) }
            else assertEquals(case.getJSONObject("pitch").pitch(), midiToPitch(case.getInt("midi"), case.getString("key")))
        }
    }

    @Test fun sharedMutationCasesMatchExactlyAndLeaveSourceScoreAndChordLaneUntouched() {
        val fixtures = cases
        val rows = fixtures.getJSONArray("cases")
        repeat(rows.length()) { index ->
            val case = rows.getJSONObject(index)
            val input = JSONObject(fixtures.getJSONObject("baseScore").toString()).put("measures", case.getJSONArray("measures"))
            case.optJSONObject("overrides")?.let { overrides -> overrides.keys().forEach { input.put(it, overrides.get(it)) } }
            var score = LeadSheetReader.read(input.toString())
            val chords = score.measures.map { it.chords }
            val actions = case.getJSONArray("actions")
            repeat(actions.length()) { actionIndex ->
                val action = actions.getJSONObject(actionIndex)
                val original = score
                val before = LeadSheetWriter.write(original)
                fun run(): LeadSheet {
                    val operation = action.getString("op")
                    if (operation == "insert" || operation == "replace") {
                        var idIndex = 0
                        val result = if (operation == "insert") MelodyEdits.insert(score, action.getJSONObject("position").position(), action.getJSONObject("spec").spec()) {
                            action.getJSONArray("ids").getString(idIndex++)
                        } else MelodyEdits.replace(score, action.getString("id"), action.getJSONObject("spec").spec())
                        if (action.has("cursor")) assertEquals(action.getJSONObject("cursor").position(), result.position)
                        if (action.has("tieExpected")) assertEquals(action.getBoolean("tieExpected"), MelodyEdits.find(result.score, result.eventId)!!.first.tieToNext)
                        return result.score
                    }
                    return if (operation == "delete") MelodyEdits.delete(score, action.getString("id"))
                        else MelodyEdits.setTie(score, action.getString("id"), action.getBoolean("enabled"))
                }
                if (action.has("code")) issue(action.getString("code")) { run() } else score = run()
                assertEquals("${case.getString("name")} mutated its source", before, LeadSheetWriter.write(original))
                assertEquals(chords, score.measures.take(chords.size).map { it.chords })
                assertEquals(score, LeadSheetReader.read(LeadSheetWriter.write(score)))
            }
            val expected = JSONObject(LeadSheetWriter.write(score))
            val melody = case.getJSONArray("expectedMelody")
            assertEquals(melody.length(), score.measures.size)
            repeat(melody.length()) { expected.getJSONArray("measures").getJSONObject(it).put("melody", melody.getJSONArray(it)) }
            assertEquals(case.getString("name"), LeadSheetReader.read(expected.toString()).measures.map { it.melody }, score.measures.map { it.melody })
        }
    }

    @Test fun everyDurationIsExactAndDottedWholeFitsThreeTwoButNotFourFour() {
        val score = changeScoreSettings(blank(), "C", ScoreTimeSignature(3, 2))
        MELODY_DURATIONS.forEach { duration ->
            val result = MelodyEdits.insert(score, ScorePosition(), MelodySpec(duration)) { "rest" }
            assertEquals(duration, MelodyEdits.find(result.score, "rest")!!.first.duration)
            assertEquals(if (duration.ticks == 2880) ScorePosition(1) else ScorePosition(0, duration.ticks), result.position)
        }
        issue("barline") { MelodyEdits.insert(blank(), ScorePosition(), MelodySpec(ScoreDuration(1, 1))) }
    }

    @Test fun validOffGridOffsetAndIdentitySurviveDeleteAsRestAndReplacement() {
        val score = MelodyEdits.insert(blank(), ScorePosition(0, 121), quarter) { "note" }.score
        val deleted = MelodyEdits.delete(score, "note")
        val event = MelodyEdits.find(deleted, "note")!!
        assertEquals(ScorePosition(0, 121), event.second)
        assertNull(event.first.pitch); assertEquals(quarter.duration, event.first.duration)
        assertEquals(score, MelodyEdits.replace(deleted, "note", quarter).score)
    }

    @Test fun rejectsInvalidPositionsSpecsIdsLimitsAndTiesWithoutMutation() {
        listOf(ScorePosition(-1), ScorePosition(2), ScorePosition(0, 1920)).forEach { position -> issue("position") { MelodyEdits.insert(blank(), position, quarter) } }
        listOf(ScoreDuration(0, 0), ScoreDuration(3, 0), ScoreDuration(4, 2)).forEach { duration -> issue("duration") { MelodyEdits.insert(blank(), ScorePosition(), MelodySpec(duration)) } }
        listOf(ScorePitch("H", 0, 4), ScorePitch("C", 2, 4), ScorePitch("C", 0, 2)).forEach { pitch -> issue("pitch") { MelodyEdits.insert(blank(), ScorePosition(), MelodySpec(quarter.duration, pitch)) } }
        listOf("", "score", "bar", "bad\n", "n".repeat(65)).forEach { id -> issue("id") { MelodyEdits.insert(blank(), ScorePosition(), quarter) { id } } }
        issue("id") { MelodyEdits.insert(blank(), ScorePosition(1), quarter) { "same" } }
        issue("missing") { MelodyEdits.replace(blank(), "missing", quarter) }
        issue("missing") { MelodyEdits.delete(blank(), "missing") }
        issue("missing") { MelodyEdits.setTie(blank(), "missing", true) }
        val rest = MelodyEdits.insert(blank(), ScorePosition(), MelodySpec(quarter.duration)) { "rest" }.score
        issue("tie") { MelodyEdits.setTie(rest, "rest", true) }
        assertEquals(rest, MelodyEdits.setTie(rest, "rest", false))
        var idsUsed = 0
        val maximum = blank().copy(measures = List(256) { ScoreMeasure("bar_$it", emptyList(), emptyList()) })
        issue("limit") { MelodyEdits.insert(maximum, ScorePosition(256), quarter) { "unused_${idsUsed++}" } }
        val large = changeScoreSettings(blank(), "C", ScoreTimeSignature(12, 2))
        val events = List(64) { MelodyEvent("rest_$it", it * 120, ScoreDuration(16, 0), null) }
        val full = large.copy(measures = listOf(large.measures.first().copy(melody = events)))
        issue("limit") { MelodyEdits.insert(full, ScorePosition(0, 7680), quarter) { "unused_${idsUsed++}" } }
        assertEquals(0, idsUsed)
    }

    @Test fun longerReplacementCannotOverwriteFollowingNote() {
        val first = MelodyEdits.insert(blank(), ScorePosition(), quarter) { "a" }.score
        val score = MelodyEdits.insert(first, ScorePosition(0, 480), quarter) { "b" }.score
        val before = LeadSheetWriter.write(score)
        issue("occupied") { MelodyEdits.replace(score, "a", quarter.copy(duration = ScoreDuration(2, 0))) }
        assertEquals(before, LeadSheetWriter.write(score))
    }

    @Test fun allKeysAndMetersRoundTripAndMidiSpellingNeverTransposes() {
        assertEquals(30, SUPPORTED_KEYS.size)
        val naturals = mapOf("C" to 0, "D" to 2, "E" to 4, "F" to 5, "G" to 7, "A" to 9, "B" to 11)
        SUPPORTED_KEYS.forEach { key ->
            val score = changeScoreSettings(blank(), key, ScoreTimeSignature())
            assertEquals(score, LeadSheetReader.read(LeadSheetWriter.write(score)))
            assertEquals(kotlin.math.abs(KEY_SIGNATURES.getValue(key).fifths), keyAccidentals(key).values.count { it != 0 })
            (48..95).forEach { midi ->
                val pitch = midiToPitch(midi, key)
                assertEquals(midi, (pitch.octave + 1) * 12 + naturals.getValue(pitch.step) + pitch.alter)
                assertTrue(pitch.octave in 3..6)
            }
        }
        assertEquals("F♯ minor", keyLabel("F#m")); assertEquals("B♭ major", keyLabel("Bb"))
        for (denominator in listOf(2, 4, 8)) for (numerator in 1..12) {
            val score = changeScoreSettings(blank(), "C", ScoreTimeSignature(numerator, denominator))
            assertEquals(numerator * 1920 / denominator, score.measureTicks)
            assertEquals(score, LeadSheetReader.read(LeadSheetWriter.write(score)))
        }
    }

    @Test fun v1RemainsStrictAndV2RejectsUnknownKeysMetersAndFields() {
        val base = JSONObject(LeadSheetWriter.write(blank()))
        invalid { LeadSheetReader.read(JSONObject(base.toString()).put("keySignature", "G").toString()) }
        invalid { LeadSheetReader.read(JSONObject(base.toString()).put("timeSignature", JSONObject().put("numerator", 3).put("denominator", 4)).toString()) }
        invalid { LeadSheetReader.read(JSONObject(base.toString()).put("schemaVersion", 3).toString()) }
        listOf("H", "__proto__").forEach { key -> invalid { changeScoreSettings(blank(), key, ScoreTimeSignature()) } }
        listOf(ScoreTimeSignature(0, 4), ScoreTimeSignature(13, 4), ScoreTimeSignature(4, 16)).forEach { time -> invalid { changeScoreSettings(blank(), "C", time) } }
        invalid { LeadSheetReader.read(JSONObject(base.toString()).put("schemaVersion", 2).put("extra", true).toString()) }
    }

    @Test fun metadataChangesPreservePitchRejectTruncationAndRemoveOnlyInvalidatedCrossBarTies() {
        fun note(id: String, offset: Int, tie: Boolean = false) = MelodyEvent(id, offset, quarter.duration, quarter.pitch, tie)
        val score = blank().copy(measures = listOf(
            ScoreMeasure("bar", emptyList(), listOf(note("a", 0, true), note("b", 480), note("c", 1440, true))),
            ScoreMeasure("bar2", emptyList(), listOf(note("d", 0))),
        ))
        val before = LeadSheetWriter.write(score)
        assertEquals(score.measures, changeScoreSettings(score, "F", ScoreTimeSignature()).measures)
        invalid { changeScoreSettings(score, "F", ScoreTimeSignature(3, 4)) }
        val expanded = changeScoreSettings(score, "F", ScoreTimeSignature(5, 4))
        assertTrue(MelodyEdits.find(expanded, "a")!!.first.tieToNext)
        assertFalse(MelodyEdits.find(expanded, "c")!!.first.tieToNext)
        assertEquals(before, LeadSheetWriter.write(score))
    }

    @Test fun dynamicChordLimitsAndKeySignatureAccidentalsAgreeWithStoredTiming() {
        listOf(ScoreTimeSignature(3, 8), ScoreTimeSignature(5, 4), ScoreTimeSignature(12, 2)).forEach { time ->
            val score = changeScoreSettings(blank(), "C", time)
            val inserted = ChordEdits.insert(score, ScorePosition(), score.measureTicks, "C")
            assertEquals(ScorePosition(1), inserted.position)
            assertEquals("Dm", ChordEdits.replace(inserted.score, inserted.eventId, score.measureTicks, "Dm").score.measures.first().chords.first().symbol)
            assertEquals(score, ChordEdits.delete(inserted.score, inserted.eventId))
            invalid { ChordEdits.insert(score, ScorePosition(0, score.measureTicks - 120), 240, "C") }
        }
        val notes = listOf(1, 0, 1).mapIndexed { index, alter -> MelodyEvent("n$index", index * 480, quarter.duration, ScorePitch("F", alter, 4)) }
        val score = changeScoreSettings(blank(), "G", ScoreTimeSignature()).copy(measures = listOf(ScoreMeasure("bar", emptyList(), notes)))
        assertEquals(listOf(null, 0, 1), ScoreLayout.marks(score).first().map { it.accidental })
        val timeline = ScoreLayout.timeline(score.measures.first(), true, { 40f }, 1920, "G")
        assertEquals(1920, timeline.ticks.last())
        val threeEight = changeScoreSettings(blank(), "F", ScoreTimeSignature(3, 8))
        val shortTimeline = ScoreLayout.timeline(threeEight.measures.first(), true, { 0f }, threeEight.measureTicks, "F")
        assertEquals(shortTimeline.width, shortTimeline.x(720, shortTimeline.width), .001f)
        invalid { shortTimeline.x(721, shortTimeline.width) }
    }
}
