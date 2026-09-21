package com.chordviewer.score

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ScoreImportTest {
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
