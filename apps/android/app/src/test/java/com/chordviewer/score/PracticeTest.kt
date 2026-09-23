package com.chordviewer.score

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PracticeTest {
    private fun resource(name: String) = requireNotNull(javaClass.classLoader?.getResourceAsStream(name)).bufferedReader().use { it.readText() }
    private val rules by lazy { PracticeRules(resource("chord-vocabulary-v1.json")) }
    private fun score(vararg symbols: String) = LeadSheet("practice", "Practice", symbols.mapIndexed { index, symbol ->
        ScoreMeasure("bar_$index", if (symbol.isEmpty()) emptyList() else listOf(ChordEvent("chord_$index", 0, 1920, symbol)), emptyList())
    })

    @Test fun sharedExactMatchingAndEnharmonicSlashBass() {
        val cases = JSONObject(resource("practice-cases.json")).getJSONArray("matches")
        for (index in 0 until cases.length()) {
            val test = cases.getJSONObject(index)
            val notes = test.getJSONArray("notes").let { values -> List(values.length()) { values.getInt(it) } }
            assertEquals(test.getString("symbol"), test.getBoolean("result"), rules.matches(test.getString("symbol"), notes))
        }
    }

    @Test fun emptyBarsRepeatedEventsAndMovedIdentity() {
        val original = score("C", "", "C", "F")
        val session = PracticeSession(rules, original)
        session.advance(true)
        session.receive(listOf(60, 64, 67))
        assertEquals(2, session.position.bar)
        session.selectBar(1)
        assertEquals(-1, session.position.eventIndex)
        session.receive(listOf(60, 64, 67))
        assertEquals(1, session.position.bar)
        session.selectBar(2)
        session.receive(listOf(60, 64, 67))
        assertEquals(3, session.position.bar)
        session.receive(listOf(65, 69, 72))
        assertTrue(session.position.complete)
        session.selectEvent(1)
        session.setScore(original.copy(measures = original.measures.toMutableList().apply {
            add(2, ScoreMeasure("inserted", emptyList(), emptyList()))
        }))
        assertEquals(3, session.position.bar)
    }

    @Test fun temporaryTranspositionPreservesAuthoredScoreAndRejectsInvalidSymbolsRange() {
        val original = LeadSheetReader.read(resource("lead-sheet-v1.json"))
        val shifted = rules.transpose(original, 1)
        assertEquals(2, shifted.schemaVersion)
        assertEquals("C#", shifted.keySignature)
        assertEquals("C", original.keySignature)
        assertEquals(original.measures.flatMap { it.melody }.map { it.tieToNext }, shifted.measures.flatMap { it.melody }.map { it.tieToNext })
        val minor = original.copy(schemaVersion = 2, keySignature = "Am", measures = original.measures.mapIndexed { index, measure ->
            if (index == 0) measure.copy(chords = measure.chords.toMutableList().apply { set(0, first().copy(symbol = "Am/C")) }) else measure
        })
        for ((semitones, key, chord, firstPitch) in listOf(
            listOf(2, "Bm", "Bm/D", ScorePitch("D", 0, 4)),
            listOf(-2, "Gm", "Gm/Bb", ScorePitch("B", -1, 3)))) {
            val result = rules.transpose(minor, semitones as Int)
            assertEquals(key, result.keySignature)
            assertEquals(chord, result.measures[0].chords[0].symbol)
            assertEquals(firstPitch, result.measures[0].melody[0].pitch)
            assertEquals(minor.measures.map { it.id }, result.measures.map { it.id })
            assertEquals(minor.measures.flatMap { it.chords }.map { Triple(it.id, it.offsetTicks, it.durationTicks) },
                result.measures.flatMap { it.chords }.map { Triple(it.id, it.offsetTicks, it.durationTicks) })
            assertEquals(minor.measures.flatMap { it.melody }.map { listOf(it.id, it.offsetTicks, it.duration, it.tieToNext) },
                result.measures.flatMap { it.melody }.map { listOf(it.id, it.offsetTicks, it.duration, it.tieToNext) })
            assertNull(result.measures[0].melody[3].pitch)
        }
        assertEquals("Am", minor.keySignature)
        assertEquals("Am/C", minor.measures[0].chords[0].symbol)
        assertThrows(IllegalArgumentException::class.java) { rules.transpose(score("verse"), 1) }
        val high = score("").copy(measures = listOf(ScoreMeasure("high", emptyList(), listOf(
            MelodyEvent("note", 0, ScoreDuration(4, 0), ScorePitch("B", 0, 6))))))
        assertThrows(IllegalArgumentException::class.java) { rules.transpose(high, 1) }
    }
}
