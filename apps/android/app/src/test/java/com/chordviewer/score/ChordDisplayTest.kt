package com.chordviewer.score

import org.junit.Assert.*
import org.junit.Test

class ChordDisplayTest {
    private val recognizer = ChordRecognizer(javaClass.classLoader!!.getResource("chord-vocabulary-v1.json")!!.readText())
    private fun names(key: String?, vararg notes: Int) = recognizer.recognize(notes.toList()).displayNames(key)

    @Test fun keySelectsRootAndSlashBassSpellingsWithoutChangingRecognition() {
        assertEquals(listOf("C#", "Db"), names("D", 61, 65, 68))
        assertEquals(listOf("Db", "C#"), names("Db", 61, 65, 68))
        assertEquals(listOf("Bb", "A#"), names("F", 58, 62, 65))
        assertEquals(listOf("C#/G#", "Db/Ab"), names("A", 56, 61, 65))
        assertEquals(listOf("Db/Ab", "C#/G#"), names("Db", 56, 61, 65))
        assertEquals(listOf("Db", "C#"), recognizer.recognize(listOf(61, 65, 68)).candidates.map { it.symbol })
    }

    @Test fun minorKeysAndChromaticNotesUseTheKeySignature() {
        assertEquals("G#m", names("G#m", 56, 59, 63).first())
        assertEquals("Bb", names("Dm", 58, 62, 65).first())
        assertEquals("Gb", names("Cm", 54, 58, 61).first())
        assertEquals(listOf("Gb", "F#"), names("Am", 54, 58, 61)) // Neutral signature keeps the existing flat-first tie.
    }

    @Test fun distinctInterpretationsComeBeforeEnharmonicDuplicatesAndKeepBassPriority() {
        assertEquals(listOf("F#m7", "A6/F#", "Gbm7", "A6/Gb"), names("D", 54, 57, 61, 64))
        assertEquals(listOf("C6", "Am7/C"), names("C", 60, 64, 67, 69))
        assertEquals(listOf("Am7", "C6/A"), names("C", 57, 60, 64, 67))
        assertEquals(names("D", 54, 57, 61, 64), names("D", 54, 57, 61, 64, 66, 69, 73, 76))
    }

    @Test fun unavailableKeyAndUnrecognizedNotesHaveStableFallbacks() {
        assertEquals(listOf("Db", "C#"), names(null, 61, 65, 68))
        assertEquals(listOf("Db", "C#"), names("unknown", 61, 65, 68))
        assertTrue(names("D").isEmpty())
        assertTrue(names("D", 60, 72).isEmpty())
        assertTrue(names("D", 60, 61, 62).isEmpty())
    }
}
