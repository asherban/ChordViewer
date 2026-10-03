package com.chordviewer.library

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.InputMethodManager
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.chordviewer.MidiInputState
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.ui.ChordViewerTheme
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import com.chordviewer.score.EntryMode
import java.io.File
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Two separate instrumentation processes exercise actual isolated recovery files and account authentication. */
@RunWith(AndroidJUnit4::class)
class NativeRecoveryFlowTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private val context get() = instrumentation.targetContext
    private lateinit var isolated: LibraryViewModel
    @Volatile private var offline=false
    private fun fixture(create:Boolean=false): JSONObject {
        assumeTrue("Explicit recovery acceptance required", InstrumentationRegistry.getArguments().getString("recoveryUi") == "true")
        val file=File(context.filesDir,"chord-dialog-recovery-fixture.json")
        if(create) {
            val nonce=UUID.randomUUID().toString(); val f=JSONObject().put("email","recovery-$nonce@example.test").put("password","Recovery-$nonce").put("apiPort",3001)
            api(f).signIn(f.getString("email"),f.getString("password"),"Isolated recovery regression")
            file.writeText(f.toString())
        }
        return JSONObject(file.readText())
    }
    private fun api(fixture: JSONObject) = LibraryApi("http://127.0.0.1:${fixture.optInt("apiPort", 3001)}", true)
    private fun start(fixture: JSONObject): MainActivity {
        val real=api(fixture)
        isolated=LibraryViewModel(object:LibraryGateway by real { override fun save(token:String,sheet:SavedSheet,title:String,tutorialUrl:String?):SavedSheet { if(offline) throw java.io.IOException("Offline acceptance transport"); return real.save(token,sheet,title,tutorialUrl) } })
        instrumentation.runOnMainSync { isolated.configureRecovery(store()); isolated.authenticate(fixture.getString("email"),fixture.getString("password"),null) }
        waitFor("isolated authentication") { isolated.state.value.user != null && !isolated.state.value.busy }
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        instrumentation.runOnMainSync { activity.setContent { val state by isolated.state.collectAsState(); ChordViewerTheme { LibraryScreen(state,isolated,MidiInputState(MidiSnapshot(),"Disconnected",false,{},{})) } } }
        return activity
    }
    private fun model(@Suppress("UNUSED_PARAMETER") activity: MainActivity) = isolated
    private fun store() = FileRecoveryStore(File(context.noBackupFilesDir, "chord-dialog-acceptance-drafts"))

    @Test fun writeRecoveryAcrossConnectionLoss() {
        val fixture = fixture(create=true); val api = api(fixture)
        val account = api.signIn(fixture.getString("email"), fixture.getString("password"))
        val original = api.create(account.token, "M7 recovery ${UUID.randomUUID().toString().take(8)}", false)
        val activity = start(fixture)
        try {
            setField("Search sheets", original.score.title); hideKeyboard(activity); clickDescription("Edit ${original.score.title}")
            waitFor("open sheet") { model(activity).state.value.selected?.id == original.id }
            clickDescription("Add chord after last chord"); clickDescription("Root C"); clickDescription("Type Major"); click("Add"); clickDescription("Close chord dialog")
            clickDescription("Melody entry lane")
            // Gesture behavior is covered by FastEntryUiTest; this suite exercises durable recovery.
            instrumentation.runOnMainSync { model(activity).placeNote(com.chordviewer.score.ScorePosition(), com.chordviewer.score.ScorePitch("D", 0, 4)) }
            waitFor("authored notation") {
                model(activity).state.value.editor?.score?.measures?.first()?.let { it.chords.size == 1 && it.melody.size == 1 } == true
            }
            click("Practice"); click("Create"); click("Sheet details")
            setField("Sheet title", "M7 native saved study")
            setField("YouTube tutorial URL (optional)", "https://youtu.be/M7lc1UVf-VE"); click("Done")
            waitFor("confirmed recovery") { model(activity).state.value.recoveryCopies.isNotEmpty() }
            offline=true
            click("Save sheet")
            waitFor("failed offline save", 30_000) { !model(activity).state.value.busy && model(activity).state.value.message != null }
            assertTrue(model(activity).state.value.hasUnsavedChanges)
            assertEquals(1, api.get(account.token, original.id).revision)
            offline=false
            click("Save sheet")
            waitFor("explicit save") { !model(activity).state.value.busy && !model(activity).state.value.hasUnsavedChanges }
            assertEquals(2, api.get(account.token, original.id).revision)
            click("Sheet details"); setField("Sheet title", "M7 recovered native study"); click("Done")
            waitFor("private file committed") { store().list(account.user.id).copies.singleOrNull()?.title == "M7 recovered native study" }
            val draft = store().list(account.user.id).copies.single()
            assertEquals(2, draft.base.revision)
            assertEquals("D", draft.score.measures.first().melody.first().pitch?.step)
            capture("m7-native-before-restart.png")
        } finally { api.signOut(account.token); instrumentation.runOnMainSync { isolated.signOut(); activity.finish() } }
    }

    @Test fun restoreAfterProcessRestartAndSaveConflictAsNew() {
        val fixture = fixture(); val api = api(fixture)
        val account = api.signIn(fixture.getString("email"), fixture.getString("password"))
        val draft = store().list(account.user.id).copies.single()
        val latest = api.get(account.token, draft.base.id)
        val remote = api.save(account.token, latest, "M7 other device version", latest.tutorialUrl)
        val activity = start(fixture)
        try {
            waitFor("local chooser") { model(activity).state.value.recoveryCopies.size == 1 }
            clickDescription("Library actions"); click("Recover unsaved work (1)"); capture("m7-native-recovery.png"); click("Restore draft")
            waitFor("recovered conflict") { model(activity).state.value.conflict }
            val value = model(activity).state.value
            assertEquals(draft.score, value.editor?.score); assertEquals(draft.title, value.draftTitle)
            assertEquals(draft.tutorial, value.draftTutorial); assertEquals(draft.base.revision, value.selected?.revision)
            assertEquals(EntryMode.PAUSED, value.editor?.mode)
            capture("m7-native-conflict.png"); click("Save as new sheet")
            waitFor("new sheet saved") { !model(activity).state.value.busy && model(activity).state.value.selected?.id != draft.base.id }
            val copied = api.get(account.token, requireNotNull(model(activity).state.value.selected).id)
            assertEquals(draft.title, copied.score.title); assertEquals(draft.score.measures, copied.score.measures)
            assertEquals(draft.tutorial, copied.tutorialUrl); assertEquals(remote, api.get(account.token, remote.id))
            waitFor("consumed files removed") { store().list(account.user.id).copies.isEmpty() }
            click("Practice"); capture("m7-native-recovered-practice.png")
        } finally { api.signOut(account.token); instrumentation.runOnMainSync { isolated.signOut(); activity.finish() } }
    }
    private fun descendants(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
        add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(descendants(child)) } }
    }
    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        return automation.rootInActiveWindow?.let(::descendants).orEmpty()
    }
    private fun click(text: String, last: Boolean = false) {
        if (text == "Sheet details") clickDescription("Sheet actions")
        waitFor("control $text") {
            val matches = nodes().filter { it.text?.toString() == text }
            (if (last) matches.lastOrNull() else matches.firstOrNull())?.let(::performClick) == true
        }
        instrumentation.waitForIdleSync()
    }
    private fun clickDescription(description: String) {
        waitFor("control $description") { nodes().firstOrNull { it.contentDescription?.toString() == description }?.let(::performClick) == true }
        instrumentation.waitForIdleSync()
    }
    private fun performClick(target: AccessibilityNodeInfo): Boolean {
        var node: AccessibilityNodeInfo? = target
        while (node != null && !node.isClickable) node = node.parent
        return node?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }
    private fun setField(label: String, value: String) {
        waitFor("input $label") {
            nodes().firstOrNull { it.isEditable && (it.contentDescription?.toString() == label || descendants(it).any { child -> child.text?.toString() == label }) }
                ?.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,
                    Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value) }) == true
        }
        instrumentation.waitForIdleSync()
    }
    private fun hideKeyboard(activity: MainActivity) {
        instrumentation.runOnMainSync {
            (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
            activity.currentFocus?.clearFocus()
        }
        instrumentation.waitForIdleSync()
    }
    private fun waitFor(description: String, timeout: Long = 15_000, ready: () -> Boolean) {
        val end = SystemClock.elapsedRealtime() + timeout
        while (SystemClock.elapsedRealtime() < end) { if (ready()) return; SystemClock.sleep(100) }
        throw AssertionError("Timed out waiting for $description")
    }
    private fun capture(name: String) {
        check(nodes().none { it.isPassword }); instrumentation.waitForIdleSync(); SystemClock.sleep(250)
        val image = requireNotNull(automation.takeScreenshot())
        val directory = File(context.filesDir, "ui-evidence").apply { mkdirs() }
        File(directory, name).outputStream().use { check(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }; image.recycle()
    }
}
