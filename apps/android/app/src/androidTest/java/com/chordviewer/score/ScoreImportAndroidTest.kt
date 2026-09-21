package com.chordviewer.score

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Uses Android's actual XML parser implementation, complementing the shared desktop JVM fixtures. */
@RunWith(AndroidJUnit4::class)
class ScoreImportAndroidTest {
    private val xml = """<score-partwise version="4.0"><work><work-title>Tablet import</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>-2</fifths><mode>major</mode></key><time><beats>6</beats><beat-type>8</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>G</step><octave>4</octave></pitch><duration>3</duration><type>quarter</type><dot/></note><note><rest/><duration>3</duration><type>quarter</type><dot/></note></measure></part></score-partwise>"""
    @Test fun readsSupportedMusicXmlOnAndroid() {
        val result = ScoreImport.read(xml, "tablet.musicxml")
        assertEquals("Bb", result.score.keySignature)
        assertEquals(ScoreTimeSignature(6, 8), result.score.timeSignature)
        assertEquals(listOf(0, 720), result.score.measures.single().melody.map { it.offsetTicks })
        assertEquals(ScorePitch("G", 0, 4), result.score.measures.single().melody.first().pitch)
        assertNull(result.score.measures.single().melody.last().pitch)
        assertEquals(result.score, LeadSheetReader.read(LeadSheetWriter.write(result.score)))
        assertEquals(result.score, ScoreImport.read("\uFEFF$xml", "tablet.xml").score)
    }
    @Test fun rejectsExternalDeclarationsBeforeAndroidXmlParser() {
        try {
            ScoreImport.read("<!DOCTYPE score-partwise SYSTEM \"https://example.invalid/external.dtd\">$xml", "unsafe.xml")
            fail("External declarations must be rejected")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message.orEmpty().contains("DTD", ignoreCase = true) || expected.message.orEmpty().contains("DOCTYPE", ignoreCase = true))
        }
    }
}
