package com.chordviewer.library

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.InputMethodManager
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import com.chordviewer.score.EntryMode
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Two invocations separated by a host force-stop exercise actual recovery files and account authentication. */
@RunWith(AndroidJUnit4::class)
class NativeRecoveryFlowTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private val context get() = instrumentation.targetContext
    private fun fixture(): JSONObject {
        assumeTrue("Explicit recovery acceptance required", InstrumentationRegistry.getArguments().getString("recoveryUi") == "true")
        val file = File(context.filesDir, "ui-fixture.json")
        require(file.length() in 1..8192)
        return try { JSONObject(file.readText()) } finally { check(file.delete()) }
    }
    private fun api(fixture: JSONObject) = LibraryApi("http://127.0.0.1:${fixture.optInt("apiPort", 3001)}", true)
    private fun start(fixture: JSONObject): MainActivity {
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)) as MainActivity
        setField("Email", fixture.getString("email")); setField("Password (12–128 characters)", fixture.getString("password"))
        click("Sign in", last = true)
        waitFor("authenticated Library") { model(activity).state.value.libraryLoaded }
        return activity
    }
    private fun model(activity: MainActivity) = ViewModelProvider(activity)[LibraryViewModel::class.java]
    private fun store() = FileRecoveryStore(File(context.noBackupFilesDir, "drafts"))

    @Test fun writeRecoveryAcrossConnectionLoss() {
        val fixture = fixture(); val api = api(fixture)
        val account = api.signIn(fixture.getString("email"), fixture.getString("password"))
        val original = api.create(account.token, "M7 recovery ${UUID.randomUUID().toString().take(8)}", false)
        val activity = start(fixture)
        try {
            setField("Search sheets", original.score.title); hideKeyboard(activity); click("Edit")
            waitFor("open sheet") { model(activity).state.value.selected?.id == original.id }
            click("Add chord"); setField("Chord symbol", "C"); click("Insert chord")
            clickDescription("Melody entry lane"); click("Add note / rest"); click("D"); click("Insert note")
            waitFor("authored notation") {
                model(activity).state.value.editor?.score?.measures?.first()?.let { it.chords.size == 1 && it.melody.size == 1 } == true
            }
            click("Practice"); click("Next bar"); click("Create"); click("Sheet details")
            setField("Sheet title", "M7 native saved study")
            setField("YouTube tutorial URL (optional)", "https://youtu.be/M7lc1UVf-VE"); click("Done")
            waitFor("confirmed recovery") { model(activity).state.value.recoveryStatus?.startsWith("Local recovery copy updated") == true }
            signal("M7_NATIVE_OFFLINE_READY")
            waitFor("disconnected app route", 30_000) { !appReachable() }
            click("Save sheet")
            waitFor("failed offline save", 30_000) { !model(activity).state.value.busy && model(activity).state.value.message?.contains("reach", true) == true }
            assertTrue(model(activity).state.value.hasUnsavedChanges)
            assertEquals(1, api.get(account.token, original.id).revision)
            signal("M7_NATIVE_ONLINE_READY")
            waitFor("restored app route", 30_000) { appReachable() }
            click("Save sheet")
            waitFor("explicit save") { !model(activity).state.value.busy && !model(activity).state.value.hasUnsavedChanges }
            assertEquals(2, api.get(account.token, original.id).revision)
            click("Sheet details"); setField("Sheet title", "M7 recovered native study"); click("Done")
            waitFor("private file committed") { store().list(account.user.id).copies.singleOrNull()?.title == "M7 recovered native study" }
            val draft = store().list(account.user.id).copies.single()
            assertEquals(2, draft.base.revision)
            assertEquals("D", draft.score.measures.first().melody.first().pitch?.step)
            capture("m7-native-before-restart.png")
        } finally { api.signOut(account.token); instrumentation.runOnMainSync { activity.finish() } }
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
            click("Recover unsaved work (1)"); capture("m7-native-recovery.png"); click("Restore draft")
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
            click("Practice"); click("Next bar"); capture("m7-native-recovered-practice.png")
        } finally { api.signOut(account.token); instrumentation.runOnMainSync { activity.finish() } }
    }
    private fun appReachable(): Boolean = runCatching {
        val c = URI("http://127.0.0.1:3000/api/health").toURL().openConnection() as HttpURLConnection
        try { c.connectTimeout = 500; c.readTimeout = 500; c.responseCode > 0 } finally { c.disconnect() }
    }.getOrDefault(false)
    private fun signal(value: String) = instrumentation.sendStatus(0, Bundle().apply { putString("stream", "$value\n") })
    private fun descendants(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
        add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(descendants(child)) } }
    }
    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        return automation.rootInActiveWindow?.let(::descendants).orEmpty()
    }
    private fun click(text: String, last: Boolean = false) {
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
            nodes().firstOrNull { it.isEditable && descendants(it).any { child -> child.text?.toString() == label } }
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
