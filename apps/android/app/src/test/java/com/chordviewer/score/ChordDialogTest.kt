package com.chordviewer.score

import com.chordviewer.library.RecoveryDraft
import com.chordviewer.library.RecoveryJson
import com.chordviewer.library.SavedSheet
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class ChordDialogTest {
    private fun blank() = LeadSheet("sheet", "Harmony", listOf(ScoreMeasure("bar", emptyList(), emptyList())), schemaVersion = 2)
    private fun ids(): () -> String { var i = 0; return { "new-${++i}" } }
    private fun rules() = PracticeRules(javaClass.getResource("/chord-vocabulary-v1.json")!!.readText())
    @Test fun everyMidiVocabularySpellingAndLegalAliasResolvesFaithfully() {
        val v=JSONObject(javaClass.getResource("/chord-vocabulary-v1.json")!!.readText()); val entries=v.getJSONArray("entries"); val names=v.getJSONArray("flatNames")
        for(root in 0..11) for(i in 0 until entries.length()) for(bass in listOf("","/B")) {
            val entry=entries.getJSONObject(i); val symbol=names.getString(root)+entry.getString("suffix")+bass
            val d=requireNotNull(ChordDefinition.parse(symbol)); d.validate()
            val expected=entry.getJSONArray("intervals").let { a -> List(a.length()) { (a.getInt(it)+root)%12 } } + if(bass.isEmpty()) emptyList() else listOf(11)
            assertEquals(symbol,expected.distinct().sorted(),d.pitchClasses()); assertEquals(d.semanticKey(),ChordDefinition.parse(d.symbol)!!.semanticKey())
            LeadSheetWriter.write(blank().copy(measures=listOf(ScoreMeasure("bar",listOf(ChordEvent("text",0,480,symbol)),emptyList()))))
        }
        val fixture=JSONObject(javaClass.getResource("/chord-symbol-aliases.json")!!.readText())
        for(key in listOf("aliases","musicXmlKinds")) {
            val cases=fixture.getJSONArray(key)
            for(i in 0 until cases.length()) {
                val f=cases.getJSONObject(i); val symbol=f.getString("symbol"); val d=requireNotNull(ChordDefinition.parse(symbol))
                val expected=f.getJSONArray("pitchClasses").let { a -> List(a.length()) { a.getInt(it) } }; assertEquals(expected,d.pitchClasses())
                if(f.has("canonical")) assertEquals(f.getString("canonical"),d.symbol)
                val score=blank().copy(measures=listOf(ScoreMeasure("bar",listOf(ChordEvent("text",0,77,symbol)),emptyList())))
                assertEquals(symbol,ChordTimeline.change(score,"text",symbol,121).score.measures[0].chords[0].symbol)
                val shifted=rules().transpose(score,2); LeadSheetReader.read(LeadSheetWriter.write(shifted))
                val e=shifted.measures[0].chords[0]; assertEquals(expected.map { (it+2)%12 }.sorted(),ChordDefinition.parse(e.symbol)!!.pitchClasses())
                assertEquals("text",e.id); assertEquals(77,e.durationTicks); assertTrue(rules().supported(e.symbol)); assertTrue(rules().matches(e.symbol,expected.map { 60+(it+2)%12 }))
            }
        }
    }
    @Test fun malformedTextCannotEnterAnyScoreVersionOrSubstituteAMajorChord() {
        val invalid=JSONObject(javaClass.getResource("/chord-symbol-aliases.json")!!.readText()).getJSONArray("invalidSymbols")
        for(i in 0 until invalid.length()) {
            val symbol=invalid.getString(i); assertNull(symbol,ChordDefinition.parse(symbol)); assertFalse(rules().supported(symbol))
            for(version in 1..3) {
                val score=blank().copy(schemaVersion=version,measures=listOf(ScoreMeasure("bar",listOf(ChordEvent("bad",0,480,symbol)),emptyList())))
                assertThrows(IllegalArgumentException::class.java) { LeadSheetWriter.write(score) }
            }
            assertThrows(IllegalArgumentException::class.java) { ChordTimeline.append(blank(),symbol,480) }
        }
    }
    @Test fun sharedDefinitionsRoundTripTransposeAndPractice() {
        val cases = JSONObject(javaClass.getResource("/chord-construction-v3.json")!!.readText()).getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val f = cases.getJSONObject(i); val d = ChordDefinition.read(f.getJSONObject("definition")); val symbol = f.getString("symbol")
            assertEquals(f.getString("name"), symbol, d.symbol)
            val notes = f.getJSONArray("pitchClasses").let { a -> List(a.length()) { a.getInt(it) } }
            assertEquals(notes, d.pitchClasses())
            val score = ChordTimeline.append(blank(), symbol, 2400, d, ids()).score
            assertEquals(score, LeadSheetReader.read(LeadSheetWriter.write(score)))
            assertEquals(2400, ChordTimeline.find(score, score.measures[1].chords[0].id)!!.ticks)
            assertEquals(1, rules().events(score).size)
            val shifted = rules().transpose(score, 2)
            assertEquals(3, shifted.schemaVersion); assertEquals(notes.map { (it + 2) % 12 }.sorted(), shifted.measures[0].chords[0].definition!!.pitchClasses())
            if (d.kind != "none") assertTrue(rules().matches(symbol, listOf(48 + (d.bass?.pitchClass ?: notes[0])) + notes.map { 60 + it }, d))
        }
    }
    @Test fun allRootBassClassesAndCustomToneSets() {
        val names = listOf("C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B")
        for (root in 0..11) for (bass in 0..11) assertEquals(listOf(root,(root+4)%12,(root+7)%12,bass).distinct().sorted(), ChordDefinition.parse("${names[root]}/${names[bass]}")!!.pitchClasses())
        for (mask in 1..4095) {
            val tones = (0..11).filter { mask and (1 shl it) != 0 }; val d = ChordDefinition(kind = "custom", family = null, tones = tones)
            d.validate(); assertEquals(tones, d.pitchClasses())
        }
        for (symbol in listOf("C7","Cm7","Cmaj7")) {
            val d = ChordDefinition.parse(symbol)!!; val notes = d.pitchClasses().filter { it != 7 }.map { it + 60 }
            assertTrue(rules().matches(symbol,notes)); assertTrue(rules().matches(symbol,notes,d))
        }
    }
    @Test fun exactTimelineGroupsGapsMelodyAndLegacy() {
        val id = ids(); val rest = MelodyEvent("rest",0,ScoreDuration(1,0),null)
        var score = blank().copy(measures = listOf(blank().measures[0].copy(melody = listOf(rest))))
        score = ChordTimeline.append(score,"C",480,factory=id).score
        score = ChordTimeline.append(score,"G",2400,factory=id).score
        score = ChordTimeline.append(score,"G",480,factory=id).score
        val old = LeadSheetWriter.write(score); val groups = ChordTimeline.groups(score)
        val changed = ChordTimeline.change(score,groups[1].ids.last(),"Am",3840,factory=id).score
        assertEquals(listOf(0,480,4320),ChordTimeline.groups(changed).map { it.start })
        assertEquals(groups[2].event.id,ChordTimeline.groups(changed)[2].event.id)
        assertSame(score.measures[0].melody,changed.measures[0].melody); assertEquals(old,LeadSheetWriter.write(score))
        val removed = ChordTimeline.delete(changed,ChordTimeline.groups(changed)[1].ids.last(),id)
        assertEquals(listOf(0,480),ChordTimeline.groups(removed).map { it.start }); assertEquals(1,removed.measures.size)
        val gap = blank().copy(measures = listOf(ScoreMeasure("bar",listOf(ChordEvent("a",0,480,"C"),ChordEvent("b",960,480,"G")), emptyList())))
        assertEquals(1440,ChordTimeline.groups(ChordTimeline.change(gap,"a","C",960).score)[1].start)
        for (symbol in listOf("C+","Cm(add9)")) {
            val original = ChordTimeline.append(blank(),symbol,77,factory=ids()).score
            val timed = ChordTimeline.change(original,original.measures[0].chords[0].id,symbol,121).score
            assertEquals(symbol,timed.measures[0].chords[0].symbol); assertNull(timed.measures[0].chords[0].definition)
        }
    }
    @Test fun allBeatPartitionsMetersImportedDurationsAndBarInsertion() {
        val patterns = mutableListOf<List<Int>>()
        fun partition(left: Int, parts: List<Int>) { if (left == 0) patterns.add(parts) else for (n in 1..left) partition(left-n,parts+n) }; partition(4, emptyList())
        assertEquals(8,patterns.size)
        patterns.forEach { pattern -> var score=blank(); val id=ids(); pattern.forEach { score=ChordTimeline.append(score,"C",it*480,factory=id).score }
            assertEquals(1,score.measures.size); assertEquals(pattern.map { it*480 },ChordTimeline.groups(score).map { it.ticks }); assertEquals(pattern.size,ChordTimeline.groups(score).size) }
        val compound=blank().copy(timeSignature=ScoreTimeSignature(6,8)); assertEquals(listOf(240,480,720,960,1200,1440),ChordTimeline.durations(compound)); assertEquals("2 eighth notes",ChordTimeline.durationLabel(compound,480))
        assertTrue(3000 in ChordTimeline.durations(blank(),3000))
        val score=ChordTimeline.append(blank(),"C",3840,factory=ids()).score
        val inserted=FastEntry.insertBar(score,1); assertEquals(5760,ChordTimeline.groups(inserted).single().ticks); assertEquals(1,rules().events(inserted).size)
    }
    @Test fun strictSharedStructureAndCanonicalModifierOrder() {
        val d=ChordDefinition(seventh="dominant",alterations=listOf(ChordDegree(11,1),ChordDegree(9,-1)), additions=(1..13).map { ChordDegree(it) })
        assertTrue(d.symbol.length > 32)
        val score=ChordTimeline.append(blank(),d.symbol,2400,d,ids()).score
        val reversed=score.copy(measures=score.measures.mapIndexed { i,m -> if(i==1) m.copy(chords=m.chords.map { it.copy(definition=d.copy(alterations=d.alterations.reversed())) }) else m })
        LeadSheetWriter.write(reversed)
        val bad=listOf("""{"kind":"none","tones":[]}""","""{"kind":"tonal","root":{"step":"C","alter":0},"family":"major","additions":false}""","""{"kind":"tonal","root":{"step":"C","alter":0},"family":"major","extension":6}""")
        bad.forEach { try { ChordDefinition.read(JSONObject(it)); fail("Accepted malformed structure: $it") } catch (_: IllegalArgumentException) {} }
        try { ChordDefinition(seventh="diminished").validate(); fail() } catch (_: IllegalArgumentException) {}
    }
    @Test fun undoRecoveryExportAndRestProtection() {
        val id=ids(); val base=blank().copy(measures=blank().measures + ScoreMeasure("rest-bar",emptyList(),listOf(MelodyEvent("rest",0,ScoreDuration(1,0),null))) + ScoreMeasure("empty",emptyList(),emptyList()))
        val editor=ScoreEditor(base); assertEquals(2,editor.state.score.measures.size)
        val added=ChordTimeline.append(editor.state.score,"C",4800,factory=id); editor.commit(added)
        val original=editor.state.score; val selected=ChordTimeline.groups(original).single()
        editor.update { it.copy(selectedId=selected.event.id,position=selected.position) }
        editor.commit(ChordTimeline.change(original,selected.ids.last(),"C7",960,factory=id)); assertEquals(2,editor.state.score.measures.size)
        editor.undo(); assertEquals(original,editor.state.score); assertEquals(selected.event.id,editor.state.selectedId); editor.redo(); assertEquals(2,editor.state.score.measures.size)
        val saved=SavedSheet(base.id,base,LeadSheetWriter.write(base),null,1,"2026-01-01T00:00:00Z","2026-01-01T00:00:00Z")
        val recovery=RecoveryDraft(UUID.randomUUID().toString(),"account",1,saved,original,original.title,"",ChordTimeline.next(original))
        val restored=RecoveryJson.read(RecoveryJson.write(recovery),"account").score
        assertEquals(original,restored); assertEquals(4800,ChordTimeline.groups(ScoreImport.read(LeadSheetWriter.write(restored),"harmony.json").score).single().ticks)
        val deleted=ChordTimeline.delete(restored,selected.ids.last()); assertEquals(2,deleted.measures.size); assertEquals(base.measures[1].melody,deleted.measures[1].melody)
    }
    @Test fun limitsAndInvalidGroupsFailAtomically() {
        val score=ChordTimeline.append(blank(),"C",2400,factory=ids()).score; val before=LeadSheetWriter.write(score)
        try { ChordTimeline.change(score,score.measures[0].chords[0].id,"C",256*1920+1); fail() } catch (_: IllegalArgumentException) {}
        assertEquals(before,LeadSheetWriter.write(score))
        val broken=score.copy(measures=score.measures.mapIndexed { i,m -> if(i==1) m.copy(chords=m.chords.map { it.copy(logicalId="missing") }) else m })
        try { LeadSheetWriter.write(broken); fail() } catch (_: IllegalArgumentException) {}
        val dense=blank().copy(measures=listOf(ScoreMeasure("bar",(0..63).map { ChordEvent("dense-$it",it,1,"C") },emptyList())))
        try { ChordTimeline.append(dense,"C",1); fail() } catch (_: IllegalArgumentException) {}; assertEquals(64,dense.measures[0].chords.size)
    }
    @Test fun longComplexScoreFitsSaveEnvelopeAndTwoScoreRecovery() {
        val d=ChordDefinition(seventh="dominant",additions=(1..13).map { ChordDegree(it) },alterations=(1..13).map { ChordDegree(it,1) })
        val score=blank().copy(schemaVersion=3,measures=(0..63).map { b -> ScoreMeasure("bar-$b",(0..15).map { i -> ChordEvent("chord-$b-$i",i*120,120,d.symbol,definition=d) },emptyList()) })
        val json=LeadSheetWriter.write(score)
        assertTrue(json.toByteArray(Charsets.UTF_8).size>500_000)
        assertTrue(JSONObject().put("score",JSONObject(json)).put("tutorialUrl",JSONObject.NULL).put("expectedRevision",1).toString().toByteArray(Charsets.UTF_8).size<1_048_576)
        val saved=SavedSheet(score.id,score,json,null,1,"2026-01-01T00:00:00Z","2026-01-01T00:00:00Z")
        val copy=RecoveryDraft(UUID.randomUUID().toString(),"account",1,saved,score,score.title,"",ScorePosition())
        assertEquals(score,RecoveryJson.read(RecoveryJson.write(copy),"account").score)
        val oversized=score.copy(measures=score.measures+score.measures.mapIndexed { b,m -> m.copy(id="extra-bar-$b",chords=m.chords.mapIndexed { i,e -> e.copy(id="extra-chord-$b-$i") }) })
        try { LeadSheetWriter.write(oversized); fail() } catch (_:IllegalArgumentException) {}
    }
}
