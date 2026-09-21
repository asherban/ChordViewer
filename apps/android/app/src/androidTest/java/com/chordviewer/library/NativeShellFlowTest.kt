package com.chordviewer.library

import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import java.io.File
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in real UI acceptance. The host streams a fixture into app-private storage; no credentials are arguments. */
@RunWith(AndroidJUnit4::class)
class NativeShellFlowTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation

    @Test fun nativeLibraryModesRetainDraftsAndSaveToSharedBackend() {
        assumeTrue("Explicit native UI fixture required", InstrumentationRegistry.getArguments().getString("shellUi") == "true")
        val context = instrumentation.targetContext
        val file = File(context.filesDir, "ui-fixture.json")
        require(file.length() in 1..8192)
        val fixture = try { JSONObject(file.readText()) } finally { check(file.delete()) }
        val port = fixture.optInt("apiPort", 3001).also { require(it in 1024..65535) }
        val api = LibraryApi("http://127.0.0.1:$port", true)
        val account = api.signIn(fixture.getString("email"), fixture.getString("password"))
        val summaries = api.list(account.token)
        require(summaries.isNotEmpty())
        val original = api.get(account.token, (summaries.firstOrNull { it.title.startsWith("Evening study") } ?: summaries.first()).id)
        val title = "Evening study revised"
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        val midiToken = fixture.optString("midiToken")
        if (midiToken.matches(Regex("[a-f0-9]{64}"))) intent.putExtra("chordviewer.midi.token", midiToken)
        val activity = instrumentation.startActivitySync(intent)
        try {
            setField("Email", fixture.getString("email"))
            setField("Password (12–128 characters)", fixture.getString("password"))
            click("Sign in", last = true)
            waitFor("loaded library") { nodes().any { it.text?.toString() == original.score.title } }
            capture("ui-native-library.png")
            openCard(original.score.title)
            waitFor("selected sheet") { nodes().any { it.text?.toString() == "Sheet details" } }
            capture("ui-native-create.png")
            val expectMidi = fixture.optBoolean("expectMidi", false)
            if (expectMidi) {
                instrumentation.sendStatus(0, Bundle().apply { putString("stream", "NATIVE_UI_MIDI_READY\n") })
                waitFor("held MIDI note", 30_000) { heldNotePresent() }
            }
            click("Sheet details")
            setField("Sheet title", title)
            click("Done")
            click("Library")
            click("Create")
            click("Sheet details")
            assertTrue("Metadata draft was lost across navigation", field("Sheet title").text?.toString() == title)
            click("Save changes")
            waitFor("saved changes") { nodes().any { it.text?.toString() == "Changes saved." } }
            click("Done")
            click("Practice")
            waitFor("saved practice title") { nodes().any { it.text?.toString() == title } }
            assertTrue("Native save did not reach the shared API", api.get(account.token, original.id).score.title == title)
            if (expectMidi) assertTrue("Navigation or metadata save reset the held MIDI gesture", heldNotePresent())
            capture("ui-native-practice.png")
            clickDescription("Show melody notation")
            click("Library")
            click("Practice")
            waitFor("preserved chord-only view") { nodes().any { it.text?.toString() == "Chords only" } }
            capture("ui-native-chords.png")
            click("Account")
            click("Sign out")
            waitFor("signed-out library") { nodes().any { it.text?.toString() == "Sign in to your library" } }
            assertFalse("Sign-out must disconnect MIDI", nodes().any { it.text?.toString()?.contains("MIDI connected") == true })
        } finally {
            try { api.signOut(account.token) } finally { instrumentation.runOnMainSync { activity.finish() } }
        }
    }

    private fun heldNotePresent() = nodes().any { it.contentDescription?.toString()?.startsWith("Held notes: C4 (ch 1)") == true }
    private fun nodes(): List<AccessibilityNodeInfo> = automation.rootInActiveWindow?.let(::descendants) ?: emptyList()
    private fun descendants(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
        add(node)
        repeat(node.childCount) { index -> node.getChild(index)?.let { addAll(descendants(it)) } }
    }
    private fun field(label: String): AccessibilityNodeInfo {
        var found: AccessibilityNodeInfo? = null
        waitFor("input field") {
            found = nodes().firstOrNull { it.isEditable && descendants(it).any { child -> child.text?.toString() == label } }
            found != null
        }
        return requireNotNull(found)
    }
    private fun setField(label: String, value: String) {
        assertTrue("Input action failed", field(label).performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,
            Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value) }))
        instrumentation.waitForIdleSync()
    }
    private fun click(text: String, last: Boolean = false) {
        waitFor("control $text") {
            val matches = nodes().filter { it.text?.toString() == text }
            val target = if (last) matches.lastOrNull() else matches.firstOrNull()
            target != null && performClick(target)
        }
        instrumentation.waitForIdleSync()
    }
    private fun openCard(title: String) {
        waitFor("selected library card") {
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
    private fun clickDescription(description: String) {
        waitFor("notation switch") {
            nodes().firstOrNull { it.contentDescription?.toString() == description }?.let(::performClick) == true
        }
        instrumentation.waitForIdleSync()
    }
    private fun performClick(target: AccessibilityNodeInfo): Boolean {
        var node: AccessibilityNodeInfo? = target
        while (node != null && !node.isClickable) node = node.parent
        return node?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }
    private fun waitFor(description: String, timeoutMs: Long = 10_000, ready: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline) {
            if (ready()) return
            SystemClock.sleep(100)
        }
        throw AssertionError("Timed out waiting for $description")
    }
    private fun capture(name: String) {
        // Capture only after authentication; editable credentials are never included in evidence.
        check(nodes().none { it.isPassword })
        instrumentation.waitForIdleSync()
        SystemClock.sleep(200)
        val image = requireNotNull(automation.takeScreenshot())
        val directory = File(instrumentation.targetContext.filesDir, "ui-evidence").apply { mkdirs() }
        File(directory, name).outputStream().use { check(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        image.recycle()
    }
}
