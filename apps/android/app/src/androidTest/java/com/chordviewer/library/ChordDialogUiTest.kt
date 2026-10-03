package com.chordviewer.library

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.accessibilityservice.AccessibilityServiceInfo
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import com.chordviewer.MidiInputState
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.score.*
import com.chordviewer.ui.ChordViewerTheme
import java.io.File
import java.util.UUID
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Genuine UI acceptance with an isolated account/model; normal session and recovery stores are never attached. */
@RunWith(AndroidJUnit4::class)
class ChordDialogUiTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private fun main(action: () -> Unit) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync() }

    @Test fun legalImportedAliasOpensCompleteBuilderImmediately() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("chordDialogUi") == "true")
        val accessibility=automation.serviceInfo
        accessibility.flags=accessibility.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        automation.serviceInfo=accessibility
        val context=instrumentation.targetContext; val model=LibraryViewModel(LibraryApi("http://127.0.0.1:3001",true)); val nonce=UUID.randomUUID().toString()
        main { model.authenticate("legal-$nonce@example.test","Legal-$nonce","Legal chord acceptance") }
        await("isolated account") { model.state.value.user != null && !model.state.value.busy }
        main { model.create("Legal imported chord",false) }; await("isolated sheet") { model.state.value.editor != null && !model.state.value.busy }
        val saved=model.state.value.selected!!
        val score=saved.score.copy(schemaVersion=2,measures=listOf(saved.score.measures.first().copy(chords=listOf(ChordEvent("alias",0,960,"Cm(add9)")))))
        main { model.restoreRecovery(RecoveryDraft(UUID.randomUUID().toString(),model.state.value.user!!.id,1,saved,score,score.title,"",ScorePosition())) }
        val activity=instrumentation.startActivitySync(Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        main { activity.setContent { val state by model.state.collectAsState(); ChordViewerTheme { LibraryScreen(state,model,MidiInputState(MidiSnapshot(),"Disconnected",false,{},{})) } } }
        try {
            await("alias score target") { nodes().any { it.contentDescription?.toString()=="Edit chord Cm(add9) in bar 1" } }
            clickDescription("Edit chord Cm(add9) in bar 1")
            await("complete legal builder") { nodes().any { it.contentDescription?.toString()=="Chord preview Cmadd9" } }
            await("Minor and C selected in complete builder") {
                nodes().any { it.contentDescription?.toString()=="Type Minor" && nativeSelected(it) } &&
                    nodes().any { it.contentDescription?.toString()=="Root C" && nativeSelected(it) }
            }
            assertTrue("Minor type selected",nativeSelected(findDescription("Type Minor")))
            assertTrue("C root selected",nativeSelected(findDescription("Root C")))
            assertFalse(nodes().any { it.text?.toString() in listOf("Replace with constructed chord","Imported symbol. Its spelling is preserved. Duration and Delete remain available.") })
            assertTrue(nodes().any { it.text?.toString()=="Custom tones" }); assertTrue(textNode("Apply").isEnabled)
            capture("13-legal-imported-chord"); assertPlacement(activity,"alias")
            progress("Selected chord duration",0); assertEquals("Cm(add9)",model.state.value.editor!!.score.measures[0].chords[0].symbol)
            assertEquals(480,model.state.value.editor!!.score.measures[0].chords[0].durationTicks)
            clickDescription("Root D"); clickText("Apply")
            val applied=model.state.value.editor!!.score; val chord=applied.measures[0].chords[0]
            assertEquals("Dmadd9",chord.symbol); assertEquals(listOf(2,4,5,9),chord.definition!!.pitchClasses()); assertEquals("alias",chord.id); assertEquals(480,chord.durationTicks)
            assertEquals(score.measures[0].melody,applied.measures[0].melody)
            clickDescription("Close chord dialog"); clickText("Undo"); assertEquals("Cm(add9)",model.state.value.editor!!.score.measures[0].chords[0].symbol)
        } catch(error:Throwable) { capture("legal-failure"); throw error }
        finally { main { model.signOut(); activity.finish() } }
    }

    @Test fun completeBuilderTimelineHistoryAndPersistence() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("chordDialogUi") == "true")
        val context = instrumentation.targetContext
        val model = LibraryViewModel(LibraryApi("http://127.0.0.1:3001", true))
        val nonce = UUID.randomUUID().toString()
        main { model.authenticate("harmony-$nonce@example.test", "Harmony-$nonce", "Chord dialog acceptance") }
        await("isolated account") { model.state.value.user != null && !model.state.value.busy }
        main { model.create("Complete chord dialog study", false) }
        await("isolated sheet") { model.state.value.editor != null && !model.state.value.busy }
        var constrained by mutableStateOf(false)
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        val accessibility=automation.serviceInfo
        accessibility.flags=accessibility.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        automation.serviceInfo=accessibility
        main {
            model.configureChordVocabulary(context.assets.open("chord-vocabulary-v1.json").bufferedReader().use { it.readText() })
            model.setDuration(480); model.addChord("C"); model.addChord("G"); model.addChord("Am")
            model.setLane(EntryLane.MELODY); model.enterRest(); model.applyMelody(ScorePitch("E",0,4)); model.setLane(EntryLane.CHORDS)
            val legacy = model.state.value.editor!!.score.let { score -> score.copy(schemaVersion=2,measures=score.measures.map { m -> m.copy(chords=m.chords.map { it.copy(logicalId=null,definition=null) }) }) }
            model.restoreRecovery(RecoveryDraft(UUID.randomUUID().toString(),model.state.value.user!!.id,1,model.state.value.selected!!,legacy,legacy.title,"",ScorePosition()))
            model.setDuration(480)
            activity.setContent {
                val state by model.state.collectAsState()
                val density = LocalDensity.current
                    CompositionLocalProvider(LocalDensity provides if (constrained) Density(density.density * 1.7f, 1.35f) else density) {
                    ChordViewerTheme { LibraryScreen(state, model, MidiInputState(MidiSnapshot(), "Disconnected", false, {}, {})) }
                }
            }
        }
        val midi = MidiProductFixture(model)
        fun editor() = model.state.value.editor!!
        fun group() = ChordTimeline.find(editor().score, editor().selectedId!!)!!
        try {
            await("score targets") { nodes().any { it.contentDescription?.toString() == "Edit chord C in bar 1" } }
            assertFalse(nodes().any { it.className?.toString() == "android.widget.EditText" })
            assertFalse("Legacy chords have no selection until tapped", nodes().any { it.contentDescription?.toString()?.startsWith("Edit chord ")==true && nativeSelected(it) })
            assertFalse(nodes().any { it.text?.toString() in listOf("+ Bar","+ Before","+ After","Insert chord","Change chord") })
            val original = editor().score; val melody = original.measures.map { it.melody }
            midi.connect(); clickText("Start MIDI entry"); assertEquals(EntryMode.INSERT, editor().mode)
            clickDescription("Edit chord C in bar 1"); await("Edit chord") { nodes().any { it.text?.toString() == "Edit chord" } }
            assertEquals(EntryMode.PAUSED, editor().mode)
            midi.chord(60,64,67); assertEquals(original,editor().score)
            listOf("C","D","E","F","G","A","B").forEach { assertTrue(nodes().any { n -> n.contentDescription?.toString() == "Root $it" }) }
            listOf("Major","Minor","7","maj7","m7","dim","aug","sus2","sus4").forEach { assertTrue(nodes().any { n -> n.contentDescription?.toString() == "Type $it" }) }
            capture("01-full-dialog")
            clickDescription("Root F"); clickDescription("Accidental ♯"); clickDescription("Type Minor")
            bass("Bass Root","A",1)
            clickDescription("Additional types"); clickDescription("Additional type m(maj7)")
            assertEquals(original,editor().score)
            clickText("Apply"); assertEquals("F#m(maj7)/A#",group().event.symbol); assertEquals(480,group().ticks)
            clickDescription("Root C"); clickDescription("Accidental ♮"); clickDescription("Type 7")
            assertTrue(nodes().any { it.contentDescription?.toString() == "Bass A#" })
            bass("Bass A#","G",0)
            clickDescription("Alterations b9"); clickDescription("Alterations #11")
            capture("02-slash-altered-draft")
            clickText("Apply"); assertEquals("C7(b9,#11)/G",group().event.symbol)
            assertEquals(original.measures.flatMap { it.chords }.map { it.offsetTicks },editor().score.measures.flatMap { it.chords }.map { it.offsetTicks })
            val applied = editor().score
            clickDescription("Root D"); clickDescription("Type Minor"); clickDescription("Close chord dialog"); assertEquals(applied,editor().score)
            clickText("Undo"); assertEquals("F#m(maj7)/A#",ChordTimeline.groups(editor().score)[0].event.symbol)
            clickText("Redo"); assertEquals(applied,editor().score)
            clickDescription("Edit chord C7(b9,#11)/G in bar 1")
            val selectedDuration = findDescription("Selected chord duration")
            val bounds = Rect().also(selectedDuration::getBoundsInScreen)
            gesture(bounds.left + bounds.width()*.15f,bounds.centerY().toFloat(),bounds.right-bounds.width()*.15f,bounds.centerY().toFloat(),true)
            assertEquals(applied,editor().score)
            gesture(bounds.left + bounds.width()*.15f,bounds.centerY().toFloat(),bounds.right-bounds.width()*.15f,bounds.centerY().toFloat(),false)
            clickDescription("Close chord dialog")
            assertEquals(1920,ChordTimeline.groups(editor().score).first().ticks)
            clickText("Undo"); assertEquals(applied,editor().score)
            clickDescription("Edit chord C7(b9,#11)/G in bar 1")
            progress("Selected chord duration",2)
            await("duration release") { group().ticks == 1440 }
            assertEquals(listOf(0,1440,1920),ChordTimeline.groups(editor().score).map { it.start })
            assertEquals(melody[0],editor().score.measures[0].melody); assertEquals(480,editor().duration)
            capture("03-duration-shift")
            clickDescription("Close chord dialog"); clickText("Undo"); assertEquals(applied,editor().score)
            clickDescription("Edit chord G in bar 1"); clickText("Delete")
            assertEquals(listOf("C7(b9,#11)/G","Am"),ChordTimeline.groups(editor().score).map { it.event.symbol }); assertEquals(480,ChordTimeline.groups(editor().score)[1].start)
            capture("04-delete-result"); clickText("Undo"); assertEquals(applied,editor().score)
            clickDescription("Add chord after last chord"); await("Add chord") { nodes().any { it.text?.toString() == "Add chord" } }
            progress("New chord duration",3); clickDescription("Root E"); clickDescription("Type Minor"); clickText("Add")
            assertEquals(2,editor().score.measures.size); assertTrue(editor().chordDialogOpen); assertNull(editor().selectedId)
            val appended = ChordTimeline.groups(editor().score).last(); assertEquals(1440,appended.start); assertEquals(1920,appended.ticks)
            capture("05-append-new-bar"); clickText("Add"); assertEquals("Em",ChordTimeline.groups(editor().score).last().event.symbol); assertEquals(3,editor().score.measures.size)
            clickDescription("Close chord dialog")
            // A continuation is editable as one chord; shortening removes the tapped fragment.
            clickDescription("Edit chord Em in bar 2"); assertEquals(appended.event.id,editor().selectedId); assertEquals(1920,group().ticks)
            progress("Selected chord duration",0); assertEquals(480,group().ticks); assertEquals(1920,editor().duration)
            assertTrue(nodes().any { it.text?.toString() == "Edit chord" }); capture("06-continuation-shortened")
            clickDescription("Close chord dialog"); clickText("Undo")
            clickDescription("Add chord after last chord"); clickText("Custom tones")
            clickDescription("Custom interval 1"); clickDescription("Custom interval 6"); clickText("Add")
            assertEquals("custom",ChordTimeline.groups(editor().score).last().event.definition!!.kind)
            clickText("Polychord"); clickDescription("Root D"); clickDescription("Type Major")
            bass("Component bass Root","E",0); bass("Stack bass Root","F",1)
            clickText("Add"); val stack=ChordTimeline.groups(editor().score).last().event.definition!!
            assertEquals("polychord",stack.kind); assertEquals(ChordSpelling("E"),stack.components[1].bass); assertEquals(ChordSpelling("F",1),stack.bass)
            capture("07-polychord")
            clickDescription("Close chord dialog")
            val last=ChordTimeline.groups(editor().score).last()
            main { model.selectChord(last.event.id) }
            clickText("Alter degree ▾"); clickDescription("Degree 3"); clickDescription("Tone accidental b"); clickText("Toggle b3"); clickText("Apply")
            assertTrue(ChordTimeline.groups(editor().score).last().event.definition!!.components.any { ChordDegree(3,-1) in it.alterations })
            clickText("Add tone ▾"); clickDescription("Degree 2"); clickDescription("Tone accidental #"); clickText("Toggle add#2")
            clickText("Omit tone ▾"); clickDescription("Degree 5"); clickText("Toggle no5"); clickText("Apply")
            assertTrue(ChordTimeline.groups(editor().score).last().event.definition!!.components.any { ChordDegree(2,1) in it.additions && 5 in it.omissions })
            clickDescription("Close chord dialog")
            val expected=editor().score
            main { model.save() }; await("API save") { !model.state.value.busy && !model.state.value.hasUnsavedChanges }
            val saved=model.state.value.selected!!; assertEquals(expected,saved.score)
            main { model.open(saved.id) }; await("reopen v3") { !model.state.value.busy && editor().score == expected }
            assertEquals(1920,ChordTimeline.find(editor().score,appended.event.id)!!.ticks)
            val exported=model.exportScore()!!; assertEquals(expected,ScoreImport.read(exported,"harmony.json").score)
            main { model.changeMode(LibraryMode.PRACTICE) }
            await("practice chart") { nodes().any { it.text?.toString() == "CHART" } }
            assertEquals(ChordTimeline.groups(expected).size,PracticeRules(context.assets.open("chord-vocabulary-v1.json").bufferedReader().use { it.readText() }).events(expected).size)
            // Bar 2 contains the continuation and a separately entered Em. Identify
            // their score positions so an equal display label cannot alias the target.
            click(practiceFragments(2).first())
            await("practice continuation target") { model.state.value.practice.eventIndex==3 && nodes().any { it.contentDescription?.toString()=="Practice target Em" } }
            await("selected continuation semantics") { practiceFragments(2).map(::nativeSelected) == listOf(true,false) }
            assertTrue(nativeSelected(findDescription("Practice chord Em in bar 1")))
            midi.chord(64,67,71)
            await("next logical practice target") { model.state.value.practice.eventIndex==4 && nodes().any { it.contentDescription?.toString()=="Practice target Em" } }
            await("next selected fragment semantics") { practiceFragments(2).map(::nativeSelected) == listOf(false,true) && nodes().any { it.contentDescription?.toString()=="Practice chord Em in bar 3" && nativeSelected(it) } }
            capture("10-practice-logical-target")
            main { model.changeMode(LibraryMode.CREATE); constrained = true; model.selectChord(appended.ids.last()) }
            await("constrained chord popup") { nodes().any { it.text?.toString() == "Edit chord" } }
            capture("08-constrained-large-text")
            assertPlacement(activity,editor().selectedId!!)
            clickDescription("Root B"); clickDescription("Close chord dialog"); assertEquals(expected,editor().score)
            main { constrained=false; model.setDuration(1920); repeat(12) { model.addChord(if (it%2==0) "F" else "G") }; model.selectChord(appended.ids.last()) }
            await("middle continuation popup") { nodes().any { it.text?.toString() == "Edit chord" } }
            progress("Selected chord duration",0); assertEquals(appended.event.id,editor().selectedId)
            capture("09-middle-anchor-many-bars")
            assertPlacement(activity,editor().selectedId!!)
            clickDescription("Close chord dialog")
            assertEquals(melody[0],editor().score.measures[0].melody)
            // Unknown physical capture can be reopened and assigned without replaying it.
            main { model.openChordDialog(); model.closeChordDialog(); model.armEntry() }
            midi.chord(60,61,62); await("unknown capture") { editor().pending != null }
            val unassigned=editor().score; clickDescription("Close chord dialog")
            clickText("Assign captured chord"); assertEquals(listOf(60,61,62),editor().pending!!.notes)
            clickDescription("Root C"); clickText("Add"); assertNull(editor().pending)
            assertEquals("custom",ChordTimeline.groups(editor().score).last().event.definition!!.kind)
            assertEquals(unassigned.measures.map { it.melody },editor().score.measures.take(unassigned.measures.size).map { it.melody })
            capture("11-unknown-capture-assigned"); clickDescription("Close chord dialog")
            // A real Add failure at the 64-event boundary retains the captured correction.
            val dense=expected.copy(measures=listOf(expected.measures.first().copy(chords=(0..63).map { ChordEvent("dense-$it",it,1,"C") })))
            val base=model.state.value.selected!!
            main { model.restoreRecovery(RecoveryDraft(UUID.randomUUID().toString(),model.state.value.user!!.id,1,base,dense,dense.title,"",ScorePosition())); model.armEntry() }
            midi.chord(60,61,62); await("dense pending capture") { editor().pending != null }
            clickText("Add"); assertNotNull(editor().pending); assertEquals(dense,editor().score)
            assertNotNull(editor().message); assertTrue(editor().chordDialogOpen)
            capture("12-pending-limit-correction"); clickText("Discard"); assertNull(editor().pending)
            // Keyboard regression follows the mandatory builder/layout evidence so its
            // dispatch diagnostics cannot hide already-completed acceptance phases.
            val beforeEscape=editor().score; val escapeId=ChordTimeline.groups(beforeEscape).first().event.id
            main { model.selectChord(escapeId) }
            val keyboardSlider=findDescription("Selected chord duration")
            assertTrue("Slider accepts keyboard focus in window ${keyboardSlider.windowId}",keyboardSlider.performAction(AccessibilityNodeInfo.ACTION_FOCUS))
            await("slider keyboard focus") { nodes().any { it.contentDescription?.toString()=="Selected chord duration" && it.isFocused } }
            val keyDown=SystemClock.uptimeMillis()
            assertTrue(automation.injectInputEvent(KeyEvent(keyDown,keyDown,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_ESCAPE,0,0,android.view.KeyCharacterMap.VIRTUAL_KEYBOARD,0,0,InputDevice.SOURCE_KEYBOARD),true))
            assertTrue(automation.injectInputEvent(KeyEvent(keyDown,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,KeyEvent.KEYCODE_ESCAPE,0,0,android.view.KeyCharacterMap.VIRTUAL_KEYBOARD,0,0,InputDevice.SOURCE_KEYBOARD),true))
            await("Escape dismissal") { !editor().chordDialogOpen }
            main { model.selectChord(escapeId) }
            progress("Selected chord duration",1); assertEquals(480,group().ticks)
            clickDescription("Close chord dialog"); clickText("Undo"); assertEquals(beforeEscape,editor().score)

        } catch(error:Throwable) { capture("failure"); throw error }
        finally { main { model.signOut(); activity.finish() } }
    }

    private fun nodes(): List<AccessibilityNodeInfo> {
        if(Build.VERSION.SDK_INT>=34) automation.clearCache()
        fun walk(n:AccessibilityNodeInfo):List<AccessibilityNodeInfo> = buildList { add(n); repeat(n.childCount) { n.getChild(it)?.let { child -> addAll(walk(child)) } } }
        return automation.rootInActiveWindow?.let(::walk).orEmpty()
    }
    private fun assertPlacement(activity:MainActivity,id:String) {
        val viewport=Rect(); main { activity.window.decorView.getWindowVisibleDisplayFrame(viewport) }
        val apply=textNode("Apply"); val actions=Rect().also(apply::getBoundsInScreen)
        assertTrue("Footer clears navigation/taskbar: $actions in $viewport",actions.bottom<=viewport.bottom)
        val popup=Rect().also { rect -> requireNotNull(automation.windows.firstOrNull { it.id==apply.windowId }).getBoundsInScreen(rect) }
        // Android hides background semantics while a focusable popup is open.
        // Verify the actual chart highlight, unique to its selected logical chord,
        // in screenshot pixels outside the popup and within the usable viewport.
        val shot=requireNotNull(automation.takeScreenshot())
        try {
            val pixels=IntArray(shot.width*shot.height); shot.getPixels(pixels,0,shot.width,0,0,shot.width,shot.height)
            var count=0; var left=shot.width; var top=shot.height; var right=0; var bottom=0
            for(y in viewport.top.coerceAtLeast(0) until minOf(viewport.bottom,shot.height) step 4) {
                for(x in viewport.left.coerceAtLeast(0) until minOf(viewport.right,shot.width) step 4) {
                    if(!popup.contains(x,y) && pixels[y*shot.width+x] == 0xFFCEE2D3.toInt()) {
                        count++; left=minOf(left,x); top=minOf(top,y); right=maxOf(right,x+4); bottom=maxOf(bottom,y+4)
                    }
                }
            }
            val highlight=Rect(left,top,right,bottom)
            assertTrue("Selected chord $id remains visibly highlighted beside popup: $highlight / $count samples, popup=$popup, viewport=$viewport",count>=32 && highlight.width()>=40 && highlight.height()>=40)
        } finally { shot.recycle() }
    }
    private fun textNode(s:String) = nodes().firstOrNull { it.text?.toString()==s } ?: throw AssertionError("Missing text $s. Visible: ${nodes().mapNotNull { it.text?.toString() }}")
    // Compose exposes Selected through Android checked state. A Surface's label can
    // be a separate child; read the owning clickable node, as click() does below.
    private fun nativeSelected(node:AccessibilityNodeInfo):Boolean {
        var owner:AccessibilityNodeInfo?=node
        while(owner!=null && !owner.isClickable) owner=owner.parent
        return owner?.let { it.isSelected || it.isChecked } ?: (node.isSelected || node.isChecked)
    }
    private fun practiceFragments(bar:Int) = nodes().filter { it.contentDescription?.toString()=="Practice chord Em in bar $bar" }
        .sortedBy { Rect().also(it::getBoundsInScreen).left }
    private fun findDescription(s:String) = reveal { nodes().firstOrNull { it.contentDescription?.toString()==s } }
    private fun reveal(find:()->AccessibilityNodeInfo?):AccessibilityNodeInfo {
        repeat(12) {
            val n=find(); if(n != null && n.isVisibleToUser) { val r=Rect().also(n::getBoundsInScreen); if(r.height()>0 && r.width()>0) return n }
            val scroll=nodes().filter { it.isScrollable }; if(scroll.isEmpty()) { SystemClock.sleep(250); return@repeat }
            val control=scroll.maxBy { node -> Rect().also(node::getBoundsInScreen).height() }
            val bounds=Rect().also(control::getBoundsInScreen); val target=Rect().also { n?.getBoundsInScreen(it) }
            control.performAction(if (n != null && target.top < bounds.top) AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD); instrumentation.waitForIdleSync(); SystemClock.sleep(100)
        }
        return find() ?: throw AssertionError("Control cannot be reached. Visible: ${nodes().map { it.text?.toString() ?: it.contentDescription?.toString() }}")
    }
    private fun click(n:AccessibilityNodeInfo) { var p:AccessibilityNodeInfo?=n; while(p!=null && !p.isClickable) p=p.parent; check(p?.performAction(AccessibilityNodeInfo.ACTION_CLICK)==true); instrumentation.waitForIdleSync(); SystemClock.sleep(100) }
    private fun clickText(s:String) = click(reveal { nodes().lastOrNull { it.text?.toString()==s } })
    private fun clickDescription(s:String) = click(reveal { nodes().firstOrNull { it.contentDescription?.toString()==s } })
    private fun bass(control:String,step:String,alter:Int) {
        clickDescription(control); clickDescription("Bass note $step")
        val label=ChordSpelling(step,alter).label; clickText(label)
    }
    private fun progress(description:String,index:Int) {
        val node=reveal { nodes().firstOrNull { it.contentDescription?.toString()==description } }
        assertTrue(node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id,Bundle().apply { putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE,index.toFloat()) }))
        instrumentation.waitForIdleSync(); SystemClock.sleep(150)
    }
    private fun capture(name:String) {
        instrumentation.waitForIdleSync(); SystemClock.sleep(200)
        val screenshot=requireNotNull(automation.takeScreenshot()); val context=instrumentation.targetContext
        File(context.getExternalFilesDir(null),"chord-dialog-$name.png").outputStream().use { screenshot.compress(Bitmap.CompressFormat.PNG,100,it) }; screenshot.recycle()
    }
    private fun gesture(x:Float,y:Float,toX:Float,toY:Float,cancel:Boolean) {
        val start=SystemClock.uptimeMillis()
        fun send(action:Int,px:Float,py:Float) { val e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,px,py,0).apply { source=InputDevice.SOURCE_TOUCHSCREEN }; try { check(automation.injectInputEvent(e,true)) } finally { e.recycle() } }
        send(MotionEvent.ACTION_DOWN,x,y); for(i in 1..5) { SystemClock.sleep(20); send(MotionEvent.ACTION_MOVE,x+(toX-x)*i/5,y+(toY-y)*i/5) }; send(if(cancel) MotionEvent.ACTION_CANCEL else MotionEvent.ACTION_UP,toX,toY); instrumentation.waitForIdleSync()
    }
    private fun await(description:String,condition:()->Boolean) { val until=SystemClock.elapsedRealtime()+20_000; while(SystemClock.elapsedRealtime()<until) { if(condition()) return; SystemClock.sleep(100) }; throw AssertionError("Timed out: $description") }
}
