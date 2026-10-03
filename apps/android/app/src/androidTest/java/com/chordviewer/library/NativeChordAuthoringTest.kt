package com.chordviewer.library

import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import com.chordviewer.MidiInputState
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.score.*
import com.chordviewer.ui.ChordViewerTheme
import java.util.UUID
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Product MIDI, correction, melody and persistence regression using an isolated account/model. */
@RunWith(AndroidJUnit4::class)
class NativeChordAuthoringTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val automation get()=instrumentation.uiAutomation
    private fun main(action:()->Unit) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync() }
    @Test fun nativeAuthoringCapturesMidiEventsAndKeepsPracticeReadOnly() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("authoringUi")=="true")
        val context=instrumentation.targetContext; val nonce=UUID.randomUUID().toString()
        val model=LibraryViewModel(LibraryApi("http://127.0.0.1:3001",true))
        main { model.authenticate("midi-$nonce@example.test","Midi-$nonce","MIDI regression") }
        await("account") { model.state.value.user != null && !model.state.value.busy }
        main { model.create("Native MIDI regression",false); model.configureChordVocabulary(context.assets.open("chord-vocabulary-v1.json").bufferedReader().use { it.readText() }) }
        await("sheet") { model.state.value.editor != null && !model.state.value.busy }
        val activity=instrumentation.startActivitySync(Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        main { activity.setContent { val state by model.state.collectAsState(); ChordViewerTheme { LibraryScreen(state,model,MidiInputState(MidiSnapshot(),"Disconnected",false,{},{})) } } }
        val midi=MidiProductFixture(model)
        fun score()=model.state.value.editor!!.score
        fun symbols()=ChordTimeline.groups(score()).map { it.event.symbol }
        try {
            midi.connect(); main { model.setDuration(480) }; clickText("Start MIDI entry")
            midi.bytes(0xb0,64,127); midi.chord(60,64,67); midi.chord(62,65,69); midi.bytes(0xb0,64,0)
            await("physical releases with sustain") { symbols()==listOf("C","Dm") }
            clickText("Undo"); assertEquals(listOf("C"),symbols()); clickText("Redo")
            clickDescription("Edit chord C in bar 1"); clickDescription("Type maj7"); clickText("Apply"); clickDescription("Close chord dialog")
            assertEquals(listOf("Cmaj7","Dm"),symbols())
            clickDescription("Edit chord Dm in bar 1"); clickText("Delete"); assertEquals(listOf("Cmaj7"),symbols()); clickText("Undo")
            val second=ChordTimeline.groups(score())[1].event.id
            // Explicit one-shot product replacement remains available to capture adapters.
            main { model.selectChord(second); model.armEntry(true) }; midi.chord(65,69,72); midi.chord(64,68,71)
            assertEquals(listOf("Cmaj7","F"),symbols()); assertEquals(EntryMode.PAUSED,model.state.value.editor!!.mode)
            main { model.selectChord(second); model.setChordDialogDuration(1920); model.armEntry(true) }; midi.chord(67,71,74)
            assertEquals(listOf("Cmaj7","G"),symbols()); assertEquals(1920,ChordTimeline.groups(score())[1].ticks)
            assertEquals(480,score().measures[1].chords.single().durationTicks)
            main { model.closeChordDialog(); model.undoChord(); model.undoChord(); model.selectChord(second); model.applyChordDefinition(ChordDefinition.parse("G")!!); model.closeChordDialog(); model.save() }
            await("save") { !model.state.value.busy && !model.state.value.hasUnsavedChanges }
            val saved=model.state.value.selected!!; assertEquals(listOf(480,480),ChordTimeline.groups(saved.score).map { it.ticks })
            main { model.changeMode(LibraryMode.PRACTICE) }; midi.hold(60,64,67)
            await("live practice input") { model.state.value.liveChord=="C" }; midi.release(60,64,67)
            assertEquals(saved.score,score()); assertFalse(model.state.value.hasUnsavedChanges)
            main { model.changeMode(LibraryMode.CREATE) }; midi.disconnect(); midi.connect()
            assertEquals(EntryMode.PAUSED,model.state.value.editor!!.mode)
            main { model.openChordDialog(); model.closeChordDialog(); model.armEntry() }; midi.chord(67,71,74)
            assertEquals(listOf("Cmaj7","G","G"),symbols())
            main { model.setLane(EntryLane.MELODY); model.armEntry() }; midi.chord(60); midi.chord(62)
            assertEquals(listOf(ScorePitch("C",0,4),ScorePitch("D",0,4)),score().measures[0].melody.map { it.pitch })
            midi.chord(64,67); assertTrue(model.state.value.editor!!.message!!.contains("one pitch"))
            main { model.selectMelody(score().measures[0].melody[1].id); model.armEntry(true) }; midi.chord(65)
            assertEquals(ScorePitch("F",0,4),score().measures[0].melody[1].pitch)
            main { model.resumeMelodyEntry(); model.enterRest() }; assertNull(score().measures[0].melody[2].pitch)
            main { model.undoChord(); model.redoChord(); val rest=score().measures[0].melody[2]; model.placeNote(ScorePosition(0,960),ScorePitch("F",0,4),rest.id); model.selectMelody(score().measures[0].melody[1].id); model.setMelodyTie(true) }
            assertTrue(score().measures[0].melody[1].tieToNext)
            main { model.selectMelody(score().measures[0].melody[2].id); model.enterRest() }; assertFalse(score().measures[0].melody[1].tieToNext)
            main { model.undoChord(); model.updateDraftTitle("Saved MIDI and melody"); model.updateDraftTutorial("https://youtu.be/dQw4w9WgXcQ"); model.save() }
            await("full save") { !model.state.value.busy && !model.state.value.hasUnsavedChanges }
            val complete=model.state.value.selected!!; main { model.open(complete.id) }; await("reopen") { !model.state.value.busy && score()==complete.score }
            assertEquals(complete.score,ScoreImport.read(model.exportScore()!!,"score.json").score)
            main { model.previewImport(model.documentRequest(),model.exportScore()!!,"score.json") }; await("import preview") { model.state.value.importPreview != null }; assertEquals(complete.score,model.state.value.importPreview!!.score)
            main { model.updateImportTitle("Imported MIDI copy"); model.saveImport() }; await("new imported identity") { !model.state.value.busy && model.state.value.selected?.id != complete.id }
            assertEquals(complete.score.measures,model.state.value.selected!!.score.measures)
        } finally { midi.disconnect(); main { model.signOut(); activity.finish() } }
    }
    private fun nodes():List<AccessibilityNodeInfo> {
        if(Build.VERSION.SDK_INT>=34) automation.clearCache()
        fun walk(n:AccessibilityNodeInfo):List<AccessibilityNodeInfo> = buildList { add(n); repeat(n.childCount) { n.getChild(it)?.let { c->addAll(walk(c)) } } }
        return automation.rootInActiveWindow?.let(::walk).orEmpty()
    }
    private fun clickText(s:String)=click { nodes().firstOrNull { it.text?.toString()==s } }
    private fun clickDescription(s:String)=click { nodes().firstOrNull { it.contentDescription?.toString()==s } }
    private fun click(find:()->AccessibilityNodeInfo?) { await("control") { var n=find(); while(n!=null && !n.isClickable) n=n.parent; n?.performAction(AccessibilityNodeInfo.ACTION_CLICK)==true }; instrumentation.waitForIdleSync(); SystemClock.sleep(150) }
    private fun await(s:String,ready:()->Boolean) { val end=SystemClock.elapsedRealtime()+20_000; while(SystemClock.elapsedRealtime()<end) { if(ready()) return; SystemClock.sleep(100) }; throw AssertionError("Timed out: $s") }
}
