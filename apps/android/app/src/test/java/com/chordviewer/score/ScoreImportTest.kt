package com.chordviewer.score

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ScoreImportTest {
    @Test fun everyMusicXmlHarmonyKindProducesFaithfulLegalNotation() {
        val cases=JSONObject(javaClass.getResource("/chord-symbol-aliases.json")!!.readText()).getJSONArray("musicXmlKinds")
        for(i in 0 until cases.length()) {
            val f=cases.getJSONObject(i); val kind=f.getString("kind")
            val xml="""<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes><harmony><root><root-step>C</root-step></root><kind>$kind</kind></harmony><note><rest/><duration>4</duration><type>whole</type></note></measure></part></score-partwise>"""
            val score=ScoreImport.read(xml,"kinds.musicxml").score; assertEquals(f.getString("symbol"),score.measures[0].chords[0].symbol)
            assertEquals(f.getJSONArray("pitchClasses").let { a -> List(a.length()) { a.getInt(it) } },ChordDefinition.parse(score.measures[0].chords[0].symbol)!!.pitchClasses())
            val shifted=PracticeRules(javaClass.getResource("/chord-vocabulary-v1.json")!!.readText()).transpose(score,2)
            assertEquals(shifted,LeadSheetReader.read(LeadSheetWriter.write(shifted)))
        }
    }
    private fun cases() = JSONObject(requireNotNull(javaClass.classLoader?.getResource("import/cases.json")).readText()).getJSONArray("cases")

    @Test fun sharedImportFixturesMatchBrowserNotationAndRejections() {
        val cases = cases()
        assertTrue(cases.length() >= 30)
        for (index in 0 until cases.length()) {
            val case = cases.getJSONObject(index)
            val source = case.getString("source")
            val name = case.getString("fileName")
            if (!case.getBoolean("valid")) assertThrows(case.getString("name"), IllegalArgumentException::class.java) { ScoreImport.read(source, name) }
            else {
                val imported = ScoreImport.read(source, name)
                assertEquals(case.getString("name"), LeadSheetReader.read(case.getJSONObject("expected").toString()), imported.score)
                assertEquals(if (name.endsWith(".json")) "json" else "musicxml", imported.format)
                assertEquals(if (imported.format == "json") 0 else 1, imported.warnings.size)
            }
        }
    }

    @Test fun importedFileLimitCountsUtf8BytesAndAcceptsJsonBom() {
        assertThrows(IllegalArgumentException::class.java) { ScoreImport.read("🎹".repeat(ScoreImport.MAX_BYTES / 4 + 1), "score.json") }
        val cases = cases()
        val json = (0 until cases.length()).map { cases.getJSONObject(it) }.first { it.getString("fileName") == "study.json" }
        assertEquals(LeadSheetReader.read(json.getString("source")), ScoreImport.read("\uFEFF" + json.getString("source"), "study.json").score)
    }
}
