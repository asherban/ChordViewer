package com.chordviewer.library

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.view.MotionEvent
import android.view.InputDevice
import android.os.Bundle
import android.os.Build
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.lifecycle.ViewModelProvider
import com.chordviewer.MainActivity
import com.chordviewer.score.*
import java.io.File
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in native UI + real host MIDI + API persistence acceptance. Credentials arrive by private stdin fixture. */
@RunWith(AndroidJUnit4::class)
class NativeChordAuthoringTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private var model: LibraryViewModel? = null

    @Test fun nativeAuthoringCapturesBroadcastMidiAndKeepsPracticeReadOnly() {
        assumeTrue("Explicit native authoring fixture required", InstrumentationRegistry.getArguments().getString("authoringUi") == "true")
        val context = instrumentation.targetContext
        val file = File(context.filesDir, "ui-fixture.json")
        require(file.length() in 1..8192)
        val fixture = try { JSONObject(file.readText()) } finally { check(file.delete()) }
        val port = fixture.optInt("apiPort", 3001).also { require(it in 1024..65535) }
        val api = LibraryApi("http://127.0.0.1:$port", true)
        val account = api.signIn(fixture.getString("email"), fixture.getString("password"))
        val sheet = api.create(account.token, "M4 native study ${System.currentTimeMillis()}", false)
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        val token = fixture.getString("midiToken").also { require(it.matches(Regex("[a-f0-9]{64}"))) }
        intent.putExtra("chordviewer.midi.token", token)
        val activity = instrumentation.startActivitySync(intent)
        instrumentation.runOnMainSync { model = ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java] }
        try {
            setField("Email", fixture.getString("email")); setField("Password (12–128 characters)", fixture.getString("password"))
            click("Sign in", last = true)
            waitFor("loaded library") { nodes().any { it.text?.toString() == sheet.score.title } }
            openCard(sheet.score.title)
            clickDescription("Duration ¼")
            click("Start MIDI entry")
            capture("m4-native-entry-before.png")
            signal("M4_NATIVE_ENTRY_READY")
            waitFor("two automatically inserted chords", 30_000) { chordSymbols() == listOf("C", "Dm") }
            capture("m4-native-entry.png")
            click("Undo")
            waitFor("undo") { chordSymbols() == listOf("C") }
            click("Redo")
            waitFor("redo") { chordSymbols() == listOf("C", "Dm") }
            clickDescription("Select chord C at tick 0")
            setField("Chord symbol", "Cmaj7")
            click("Apply change")
            waitFor("manual correction") { chordSymbols() == listOf("Cmaj7", "Dm") }
            clickDescription("Select chord Dm at tick 480")
            click("Delete chord")
            waitFor("delete") { chordSymbols() == listOf("Cmaj7") }
            click("Undo")
            clickDescription("Select chord Dm at tick 480")
            click("Replace from MIDI")
            signal("M4_NATIVE_REPLACE_READY")
            waitFor("one-shot MIDI replacement", 30_000) { chordSymbols() == listOf("Cmaj7", "F") }
            clickDescription("Select chord F at tick 480")
            clickDescription("Duration Whole bar")
            click("Replace from MIDI")
            signal("M4_NATIVE_PENDING_REPLACE_READY")
            waitFor("captured pending symbol", 30_000) { nodes().any { it.isEditable && it.text?.toString() == "G" } }
            assertEquals("Rejected replacement must preserve the prior chord", listOf("Cmaj7", "F"), chordSymbols())
            clickDescription("Duration ¼")
            click("Apply chord")
            waitFor("pending replacement correction") { chordSymbols() == listOf("Cmaj7", "G") }
            click("Save sheet")
            waitFor("save") { api.get(account.token, sheet.id).revision == 2 }
            var saved = api.get(account.token, sheet.id)
            assertEquals(listOf("Cmaj7", "G"), saved.score.measures.first().chords.map { it.symbol })
            assertEquals(listOf(480, 480), saved.score.measures.first().chords.map { it.durationTicks })
            click("Practice")
            signal("M4_NATIVE_PRACTICE_READY")
            waitFor("practice receives live MIDI", 30_000) { nodes().any { it.contentDescription?.toString()?.startsWith("Held notes: C4") == true } }
            SystemClock.sleep(700)
            assertEquals(saved.score, api.get(account.token, sheet.id).score)
            assertEquals(listOf("Cmaj7", "G"), chordSymbols())
            capture("m4-native-practice.png")
            click("Create")
            // A disconnect resets entry; reconnect does not arm automatically.
            clickMidi()
            click("Disconnect / clear"); click("Connect"); click("Done")
            waitFor("reconnected") { nodes().any { it.text?.toString()?.contains("MIDI connected") == true } }
            assertEquals(EntryMode.PAUSED, model?.state?.value?.editor?.mode)
            clickDescription("Choose insertion position"); click("Next bar"); click("Done"); click("Start MIDI entry")
            signal("M4_NATIVE_RECONNECT_READY")
            waitFor("fresh chord after reconnect", 30_000) { chordSymbols(1) == listOf("G") }
            click("Sheet details"); setField("Sheet title", "Native MIDI saved study")
            setField("YouTube tutorial URL (optional)", "https://youtu.be/dQw4w9WgXcQ")
            click("Save changes")
            waitFor("full save") { api.get(account.token, sheet.id).revision == 3 }
            click("Done"); click("Library"); click("Refresh")
            waitFor("refreshed library") { model?.state?.value?.let { !it.busy && it.selected == null && it.libraryLoaded } == true && nodes().any { it.text?.toString() == "Native MIDI saved study" } }
            openCard("Native MIDI saved study")
            waitFor("reopened authored score") { chordSymbols(1) == listOf("G") }
            assertEquals("Reopen must select the newly saved sheet", sheet.id, model?.state?.value?.selected?.id)
            saved = api.get(account.token, sheet.id)
            assertEquals("Native MIDI saved study", saved.score.title)
            assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", saved.tutorialUrl)
            assertEquals(listOf("Cmaj7", "G", "G"), saved.score.measures.flatMap { it.chords }.map { it.symbol })
            capture("m4-native-reopened.png")

            // M5: a separate melody pass starts at the beginning of the existing harmony.
            clickDescription("Melody entry lane")
            assertEquals(ScorePosition(), model?.state?.value?.editor?.position)
            click("Start MIDI entry"); signal("M5_NATIVE_MELODY_READY")
            waitFor("two physical-release melody notes", 30_000) { melodyPitches() == listOf(ScorePitch("C", 0, 4), ScorePitch("D", 0, 4)) }
            assertEquals(listOf("Cmaj7", "G"), chordSymbols())
            tapFirstMelodyNote()
            waitFor("native Canvas note selection") { model?.state?.value?.editor?.selectedMelodyId == model?.state?.value?.editor?.score?.measures?.first()?.melody?.first()?.id }
            click("Close input"); click("Start MIDI entry")
            signal("M5_NATIVE_POLYPHONY_READY")
            waitFor("overlapping pitches rejected", 30_000) { model?.state?.value?.editor?.message?.contains("one pitch") == true }
            assertEquals(2, melodyPitches().size)
            clickDescription("Select melody D4 at tick 480"); click("Replace from MIDI"); signal("M5_NATIVE_REPLACE_READY")
            waitFor("one-shot melody replacement", 30_000) { melodyPitches() == listOf(ScorePitch("C", 0, 4), ScorePitch("F", 0, 4)) }
            assertEquals(EntryMode.PAUSED, model?.state?.value?.editor?.mode)
            click("Add note / rest"); click("Rest"); click("Insert rest")
            waitFor("manual rest") { melodyPitches().size == 3 && melodyPitches().last() == null }
            click("Undo"); assertEquals(2, melodyPitches().size); click("Redo")
            clickDescription("Select melody rest at tick 960"); click("F"); click("Natural"); click("Apply note change")
            waitFor("rest changed to note") { melodyPitches().last() == ScorePitch("F", 0, 4) }
            clickDescription("Select melody F4 at tick 480"); click("Tie to next note")
            waitFor("explicit tie") { model?.state?.value?.editor?.score?.measures?.first()?.melody?.get(1)?.tieToNext == true }
            click("Close input")
            clickDescription("Select melody F4 at tick 960"); click("Delete note to rest")
            waitFor("note deletion retains rest and removes invalid tie") { melodyPitches().last() == null && model?.state?.value?.editor?.score?.measures?.first()?.melody?.get(1)?.tieToNext == false }
            click("Undo")
            val melodyTitle = "M5 native melody ${System.currentTimeMillis()}"
            click("Sheet details"); setField("Sheet title", melodyTitle)
            click("Key: C major"); click("D major"); click("− beat"); click("Apply key and meter")
            waitFor("key and meter change") { model?.state?.value?.editor?.score?.let { it.keySignature == "D" && it.timeSignature == ScoreTimeSignature(3, 4) } == true }
            click("Save changes"); waitFor("melody save") { api.get(account.token, sheet.id).revision == 4 }
            click("Done"); click("Practice")
            saved = api.get(account.token, sheet.id)
            assertEquals(3, saved.score.measures.first().melody.size)
            assertTrue(saved.score.measures.first().melody[1].tieToNext)
            assertEquals("D", saved.score.keySignature); assertEquals(ScoreTimeSignature(3, 4), saved.score.timeSignature)
            capture("m5-native-melody.png")
            click("Library"); click("Refresh")
            waitFor("melody library refresh") { model?.state?.value?.let { !it.busy && it.selected == null } == true }
            openCard(melodyTitle)
            waitFor("reopened saved melody") { model?.state?.value?.editor?.score == saved.score }
            assertEquals(saved.score, model?.state?.value?.editor?.score)
            click("Sheet details"); click("Export ChordViewer JSON")
            waitFor("system save document") { nodes().firstOrNull { it.text?.toString()?.equals("Save", ignoreCase = true) == true }?.let(::performClick) == true }
            waitFor("JSON export completion") { model?.state?.value?.message?.startsWith("JSON exported") == true }
            click("Done"); click("Library"); click("Import")
            waitFor("exported JSON in document picker", 20_000) { nodes().firstOrNull { it.text?.toString() == "$melodyTitle.json" }?.let(::performClick) == true }
            waitFor("local import preview") { model?.state?.value?.importPreview != null }
            assertEquals(saved.score, model?.state?.value?.importPreview?.score)
            assertEquals(sheet.id, model?.state?.value?.selected?.id)
            capture("m5-native-import.png")
            setField("Imported sheet title", "$melodyTitle copy"); click("Save as new sheet")
            waitFor("import gets new server identity") { model?.state?.value?.let { !it.busy && it.importPreview == null && it.selected?.id != sheet.id } == true }
            val imported = requireNotNull(model?.state?.value?.selected)
            assertEquals(saved.score.measures, imported.score.measures)
            assertNotEquals(sheet.id, imported.id)
            click("Practice"); capture("m5-native-imported.png")
        } finally {
            try { api.signOut(account.token) } finally { instrumentation.runOnMainSync { activity.finish() } }
        }
    }

    private fun signal(name: String) = instrumentation.sendStatus(0, Bundle().apply { putString("stream", "$name\n") })
    // Assert the real activity model; clipping can remove Canvas semantics from UiAutomation.
    // Screenshots separately verify the visible native staff and symbols. No MIDI is injected here.
    private fun chordSymbols(measure: Int = 0) = model?.state?.value?.editor?.score?.measures?.getOrNull(measure)?.chords?.map { it.symbol }.orEmpty()
    private fun melodyPitches() = model?.state?.value?.editor?.score?.measures?.first()?.melody?.map { it.pitch }.orEmpty()
    private fun tapFirstMelodyNote() {
        val canvas = nodes().first { it.contentDescription?.toString()?.contains("Measure 1:") == true }
        val bounds = Rect().also(canvas::getBoundsInScreen)
        val density = instrumentation.targetContext.resources.displayMetrics.density
        val score = requireNotNull(model?.state?.value?.editor?.score)
        val top = ScoreLayout.geometry(score).top
        val x = bounds.left + 84 * density // first row: 16 padding + 62 clef/meter prefix + notehead center
        val y = bounds.top + (top + 40 - score.measures.first().melody.first().pitch!!.staffStep * 5) * density
        val now = SystemClock.uptimeMillis()
        listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP).forEach { action ->
            val event = MotionEvent.obtain(now, now + if (action == MotionEvent.ACTION_UP) 50 else 0, action, x, y, 0)
            event.source = InputDevice.SOURCE_TOUCHSCREEN
            try { check(automation.injectInputEvent(event, true)) } finally { event.recycle() }
        }
        instrumentation.waitForIdleSync()
    }
    private fun nodes(): List<AccessibilityNodeInfo> {
        // Compose can reuse virtual node IDs after a correction panel disappears.
        // Refresh the public API 34+ cache before traversing the current hierarchy.
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        return automation.rootInActiveWindow?.let(::descendants) ?: emptyList()
    }
    private fun descendants(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList { add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(descendants(child)) } } }
    private fun setField(label: String, value: String) {
        waitFor("input $label") {
            val node = nodes().firstOrNull { it.isEditable && descendants(it).any { child -> child.text?.toString() == label } }
            node?.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value) }) == true
        }
        instrumentation.waitForIdleSync()
    }
    private fun click(text: String, last: Boolean = false) {
        waitFor("control $text") {
            val matches = nodes().filter { it.text?.toString() == text }
            (if (last) matches.lastOrNull() else matches.firstOrNull())?.let(::performClick) == true
        }
        instrumentation.waitForIdleSync()
    }
    private fun clickDescription(description: String) {
        if (description.startsWith("Duration ")) clickDescription("Choose duration")
        if (description.startsWith("Select chord ")) clickDescription("Choose chord to change")
        if (description.startsWith("Select melody ")) clickDescription("Choose melody to change")
        waitFor(description) { nodes().firstOrNull { it.contentDescription?.toString() == description }?.let(::performClick) == true }
        instrumentation.waitForIdleSync()
    }
    private fun clickMidi() {
        waitFor("MIDI control") { nodes().firstOrNull { it.text?.toString()?.contains("MIDI connected") == true }?.let(::performClick) == true }
        instrumentation.waitForIdleSync()
    }
    private fun openCard(title: String) {
        waitFor("library card") {
            var node: AccessibilityNodeInfo? = nodes().firstOrNull { it.text?.toString() == title }
            while (node != null) {
                val button = descendants(node).firstOrNull { it.text?.toString() == "Open sheet" }
                if (button != null) return@waitFor performClick(button)
                node = node.parent
            }
            false
        }
        instrumentation.waitForIdleSync()
    }
    private fun performClick(target: AccessibilityNodeInfo): Boolean {
        var node: AccessibilityNodeInfo? = target
        while (node != null && !node.isClickable) node = node.parent
        return node?.takeIf { it.isEnabled }?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }
    private fun waitFor(description: String, timeout: Long = 15_000, predicate: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + timeout
        while (SystemClock.elapsedRealtime() < until) { if (predicate()) return; SystemClock.sleep(100) }
        if (nodes().none { it.isPassword }) capture("m4-native-failure.png")
        val state = model?.state?.value
        val editor = state?.editor
        throw AssertionError("Timed out waiting for $description; connected=${state?.midiConnected}, entry=${editor?.mode}, chords=${editor?.score?.measures?.flatMap { it.chords }?.map { it.symbol }}, target=${editor?.position}, feedback=${editor?.message}")
    }
    private fun capture(name: String) {
        check(nodes().none { it.isPassword }); instrumentation.waitForIdleSync()
        val image = requireNotNull(automation.takeScreenshot())
        val directory = File(instrumentation.targetContext.filesDir, "ui-evidence").apply { mkdirs() }
        File(directory, name).outputStream().use { check(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }; image.recycle()
    }
}
