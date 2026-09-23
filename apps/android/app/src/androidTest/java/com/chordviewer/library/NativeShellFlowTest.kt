package com.chordviewer.library

import android.content.Intent
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.lifecycle.ViewModelProvider
import com.chordviewer.MainActivity
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
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
        val title = "Evening study M6 ${UUID.randomUUID().toString().take(8)}"
        val intent = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        val midiToken = fixture.optString("midiToken")
        if (midiToken.matches(Regex("[a-f0-9]{64}"))) intent.putExtra("chordviewer.midi.token", midiToken)
        val activity = instrumentation.startActivitySync(intent)
        try {
            setField("Email", fixture.getString("email"))
            setField("Password (12–128 characters)", fixture.getString("password"))
            click("Sign in", last = true)
            waitFor("Library search") { nodes().any { it.text?.toString() == "Search sheets" } }
            setField("Search sheets", original.score.title)
            hideKeyboard(activity)
            waitFor("loaded library") { nodes().any { it.text?.toString() == original.score.title } }
            capture("ui-native-library.png")
            openCard(original.score.title)
            waitFor("selected sheet") { nodes().any { it.text?.toString() == "Sheet details" } }
            capture("ui-native-create.png")
            val expectMidi = fixture.optBoolean("expectMidi", false)
            if (expectMidi) {
                waitFor("native MIDI connection") { ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java].state.value.midiConnected }
                instrumentation.sendStatus(0, Bundle().apply { putString("stream", "NATIVE_UI_MIDI_READY\n") })
                waitFor("held MIDI note", 30_000) {
                    if (heldNotePresent()) true else { scrollSidebar(true); false }
                }
                repeat(5) { scrollSidebar(false) }
            }
            click("Sheet details")
            setField("Sheet title", title)
            setField("YouTube tutorial URL (optional)", "https://youtu.be/M7lc1UVf-VE")
            click("Done")
            click("Library")
            click("Create")
            click("Sheet details")
            assertEquals("Metadata draft was lost across navigation", title, field("Sheet title").text?.toString())
            click("Save changes")
            waitFor("saved changes") { nodes().any { it.text?.toString() == "Changes saved." } }
            click("Done")
            val savedRevision = api.get(account.token, original.id).revision
            click("Practice")
            waitFor("saved practice title") { nodes().any { it.text?.toString() == title } }
            assertTrue("Native save did not reach the shared API", api.get(account.token, original.id).score.title == title)
            if (expectMidi) assertTrue("Navigation or metadata save disconnected MIDI",
                ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java].state.value.midiConnected)
            capture("ui-native-practice.png")
            waitFor("manual Practice default") { nodes().any { it.text?.toString() == "Manual" } }
            if (expectMidi) {
                waitFor("held C4 after navigation and save") {
                    if (heldNotePresent()) true else { scrollSidebar(true); false }
                }
                repeat(5) { scrollSidebar(false) }
            }
            click("Restart")
            waitFor("Practice restart") { ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java].state.value.practice.bar == 0 }
            click("Next bar")
            try { waitFor("Practice bar navigation") { ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java].state.value.practice.bar == 1 } }
            catch (error: AssertionError) {
                capture("m6-native-navigation-diagnostic.png")
                val modelBar = ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java].state.value.practice.bar
                throw AssertionError("Practice navigation showed ${nodes().mapNotNull { it.text?.toString() }.filter { it.startsWith("Bar ") }}, model bar=$modelBar", error)
            }
            click("On match")
            if (expectMidi) {
                instrumentation.sendStatus(0, Bundle().apply { putString("stream", "M6_NATIVE_MATCH_READY\n") })
                waitFor("fresh G7 Practice match", 30_000) {
                    ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java].state.value.practice.bar == 2
                }
            }
            click("Play tutorial")
            SystemClock.sleep(8000)
            val html = playerHtml(activity)
            instrumentation.sendStatus(0, Bundle().apply { putString("stream", "M6_PLAYER_HTML $html\n") })
            assertTrue("Native player must render its own HTML and iframe: $html", mountedPlayerHtml(html, activity))
            capture("m6-native-practice-player.png")
            click("Stop video")
            waitFor("player released after Stop") { currentPlayer(activity) == null }
            click("Play tutorial")
            waitFor("player reloaded after Stop", 10_000) { mountedPlayerHtml(playerHtml(activity), activity) }
            click("Hide tutorial")
            waitFor("tutorial hidden") { nodes().any { it.text?.toString() == "Show tutorial" } }
            waitFor("player released after Hide") { currentPlayer(activity) == null }
            capture("m6-native-practice.png")
            click("Show tutorial")
            click("Play tutorial")
            waitFor("player loaded before leaving Practice", 10_000) { mountedPlayerHtml(playerHtml(activity), activity) }
            click("Library")
            waitFor("player released after leaving Practice") { currentPlayer(activity) == null }
            click("Practice")
            val afterPractice = api.get(account.token, original.id)
            assertEquals("Practice must not change the saved score", title, afterPractice.score.title)
            assertEquals("Practice must not advance the musical revision", savedRevision, afterPractice.revision)
            clickDescription("Show melody notation")
            click("Library")
            click("Practice")
            try {
                waitFor("preserved chord-only view") {
                    nodes().any { it.contentDescription?.toString() == "Show melody notation" && it.isChecked == false }
                }
            } catch (error: AssertionError) {
                capture("m6-native-display-diagnostic.png")
                throw error
            }
            capture("ui-native-chords.png")
            click("Play tutorial")
            waitFor("player loaded before app background", 10_000) { mountedPlayerHtml(playerHtml(activity), activity) }
            var backgrounded = false
            instrumentation.runOnMainSync { backgrounded = activity.moveTaskToBack(true) }
            assertTrue("Could not background native player", backgrounded)
            waitFor("player released after app background", 10_000) { currentPlayer(activity) == null }
            instrumentation.runOnMainSync {
                activity.startActivity(Intent(activity, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
            }
            waitFor("Practice restored after app background") { nodes().any { it.text?.toString() == "Practice" } }
            assertNull("Backgrounded player must stay stopped", currentPlayer(activity))
            click("Account")
            click("Sign out")
            waitFor("signed-out library") { nodes().any { it.text?.toString() == "Sign in to your library" } }
            assertFalse("Sign-out must disconnect MIDI", nodes().any { it.text?.toString()?.contains("MIDI connected") == true })
        } catch (error: Throwable) {
            if (nodes().none { it.isPassword }) runCatching { capture("m6-native-failure-diagnostic.png") }
            throw error
        } finally {
            try { api.signOut(account.token) } finally { instrumentation.runOnMainSync { activity.finish() } }
        }
    }

    @Test fun nativeLibraryOrganizationActions() {
        assumeTrue("Explicit native UI fixture required", InstrumentationRegistry.getArguments().getString("shellUi") == "true")
        val context = instrumentation.targetContext
        val file = File(context.filesDir, "ui-fixture.json")
        require(file.length() in 1..8192)
        val fixture = try { JSONObject(file.readText()) } finally { check(file.delete()) }
        val port = fixture.optInt("apiPort", 3001).also { require(it in 1024..65535) }
        val api = LibraryApi("http://127.0.0.1:$port", true)
        val account = api.signIn(fixture.getString("email"), fixture.getString("password"))
        val title = "M6 organization ${UUID.randomUUID().toString().take(8)}"
        val original = api.create(account.token, title, true)
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        try {
            setField("Email", fixture.getString("email"))
            setField("Password (12–128 characters)", fixture.getString("password"))
            click("Sign in", last = true)
            waitFor("Library search") { nodes().any { it.text?.toString() == "Search sheets" } }
            setField("Search sheets", title)
            hideKeyboard(activity)
            waitFor("organization card") { nodes().any { it.text?.toString() == title && !it.isEditable } }
            val model = ViewModelProvider(activity as MainActivity)[LibraryViewModel::class.java]
            tapFavorite(title)
            waitFor("favorite saved") { !model.state.value.busy && model.state.value.sheets.firstOrNull { it.id == original.id }?.favorite == true }
            clickCardAction(title, "More actions")
            click("Mark draft")
            waitFor("Draft saved") { !model.state.value.busy && model.state.value.sheets.firstOrNull { it.id == original.id }?.draft == true }
            capture("m6-native-library-organized.png")
            clickCardAction(title, "More actions")
            click("Duplicate")
            val copyTitle = "$title (copy)"
            waitFor("duplicate saved") { !model.state.value.busy && model.state.value.sheets.any { it.title == copyTitle } }
            setField("Search sheets", copyTitle)
            hideKeyboard(activity)
            waitFor("duplicate card") { nodes().any { it.text?.toString() == copyTitle && !it.isEditable } }
            clickCardAction(copyTitle, "More actions")
            click("Move to Trash")
            waitFor("copy moved to Trash") { !model.state.value.busy && model.state.value.sheets.firstOrNull { it.title == copyTitle }?.trashedAt != null }
            click("Trash")
            waitFor("recoverable Trash card") { nodes().any { it.text?.toString() == copyTitle } }
            clickCardAction(copyTitle, "Restore")
            waitFor("copy restored") { !model.state.value.busy && model.state.value.sheets.firstOrNull { it.title == copyTitle }?.let { it.trashedAt == null } == true }
            assertTrue("Restored copy should leave Trash", api.list(account.token).any { it.title == copyTitle && it.trashedAt == null })
        } catch (error: Throwable) {
            if (nodes().none { it.isPassword }) runCatching { capture("m6-native-failure-diagnostic.png") }
            throw error
        } finally {
            try { api.signOut(account.token) } finally { instrumentation.runOnMainSync { activity.finish() } }
        }
    }

    private fun heldNotePresent() = nodes().any { it.contentDescription?.toString()?.startsWith("Held notes: C4 (ch 1)") == true }
    private fun scrollSidebar(forward: Boolean): Boolean {
        val bounds = Rect()
        val scrollable = nodes().firstOrNull { node ->
            node.getBoundsInScreen(bounds)
            node.isScrollable && bounds.centerX() < 400
        } ?: return false
        return scrollable.performAction(if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
    }
    private fun nodes(): List<AccessibilityNodeInfo> = automation.rootInActiveWindow?.let(::descendants) ?: emptyList()
    private fun descendantsViews(view: View): List<View> = buildList {
        add(view)
        if (view is ViewGroup) repeat(view.childCount) { index -> addAll(descendantsViews(view.getChildAt(index))) }
    }
    private fun currentPlayer(activity: android.app.Activity): WebView? {
        var player: WebView? = null
        instrumentation.runOnMainSync {
            player = descendantsViews(activity.window.decorView).filterIsInstance<WebView>().firstOrNull()
        }
        return player
    }
    private fun mountedPlayerHtml(html: String, activity: android.app.Activity): Boolean =
        html.contains("https://${activity.packageName}/|rgb(0, 0, 0)|1") &&
            (html.contains("interactive|https://") || html.contains("complete|https://"))
    private fun playerHtml(activity: android.app.Activity): String {
        val player = currentPlayer(activity) ?: return "no WebView"
        val latch = CountDownLatch(1)
        var result = "no callback"
        var pageUrl = ""
        instrumentation.runOnMainSync {
            pageUrl = player.url.orEmpty()
            player.evaluateJavascript("document.readyState+'|'+document.baseURI+'|'+getComputedStyle(document.body).backgroundColor+'|'+document.querySelectorAll('iframe').length") {
                result = it.take(120)
                latch.countDown()
            }
        }
        latch.await(3, TimeUnit.SECONDS)
        return "url=$pageUrl state=$result"
    }
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
    private fun hideKeyboard(activity: android.app.Activity) {
        instrumentation.runOnMainSync {
            (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
                .hideSoftInputFromWindow(activity.window.decorView.windowToken, 0)
            activity.currentFocus?.clearFocus()
        }
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
    private fun openCard(title: String) = clickCardAction(title, "Edit")
    private fun tapFavorite(title: String) {
        val visible = nodes()
        val heading = visible.filter { it.text?.toString() == title && !it.isEditable }
            .maxByOrNull { node -> Rect().also(node::getBoundsInScreen).top }
            ?: throw AssertionError("Filtered card heading is not visible")
        val headingBounds = Rect().also(heading::getBoundsInScreen)
        val cardBounds = Rect().also(requireNotNull(heading.parent)::getBoundsInScreen)
        check(cardBounds.width() in 400..800 && cardBounds.height() in 200..550 && cardBounds.contains(headingBounds)) {
            "Favorite card geometry changed: heading=$headingBounds card=$cardBounds"
        }
        val x = (cardBounds.right - 50).toFloat()
        val y = (headingBounds.centerY() + 12).toFloat()
        check(cardBounds.contains(x.toInt(), y.toInt()))
        tapAt(x, y)
        instrumentation.waitForIdleSync()
    }
    private fun tapAt(x: Float, y: Float) {
        val time = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, x, y, 0)
        val up = MotionEvent.obtain(time, time + 90, MotionEvent.ACTION_UP, x, y, 0)
        try {
            assertTrue("UI touch down failed", automation.injectInputEvent(down, true))
            assertTrue("UI touch up failed", automation.injectInputEvent(up, true))
        } finally { down.recycle(); up.recycle() }
    }
    private fun clickCardAction(title: String, action: String) {
        try {
            var sawCard = false
            waitFor("selected library card") {
                val visible = nodes()
                if (visible.any { it.text?.toString() == title }) sawCard = true
                var node: AccessibilityNodeInfo? = visible.firstOrNull { it.text?.toString() == title }
                var grid: AccessibilityNodeInfo? = null
                while (node != null) {
                    val button = descendants(node).firstOrNull { it.text?.toString() == action }
                    if (button != null && performClick(button)) return@waitFor true
                    if (node.isScrollable && grid == null) grid = node
                    node = node.parent
                }
                val buttons = visible.filter { it.text?.toString() == action }
                if (sawCard && buttons.size == 1 && performClick(buttons.single())) return@waitFor true
                if (action == "More actions" && sawCard) {
                    val heading = visible.filter { it.text?.toString() == title && !it.isEditable }
                        .maxByOrNull { candidate -> Rect().also(candidate::getBoundsInScreen).top }
                    val card = heading?.parent?.let { Rect().also(it::getBoundsInScreen) }
                    if (card != null && card.width() in 400..800 && card.bottom in 630..708) {
                        tapAt((card.left + 90).toFloat(), (card.bottom - 42).toFloat())
                        return@waitFor true
                    }
                    val gridNode = grid ?: visible.firstOrNull { candidate ->
                        val bounds = Rect().also(candidate::getBoundsInScreen)
                        candidate.isScrollable && bounds.left < 100 && bounds.right > 600 && bounds.bottom in 700..740
                    }
                    if (card != null && card.width() in 400..800 && gridNode != null &&
                        gridNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
                        SystemClock.sleep(350) // The accessibility cache can retain pre-scroll bounds.
                        val viewport = Rect().also(gridNode::getBoundsInScreen)
                        check(viewport.bottom in 700..740 && card.left in 0..100)
                        tapAt((card.left + 90).toFloat(), (viewport.bottom - 60).toFloat())
                        return@waitFor true
                    }
                }
                val bounds = Rect()
                (grid ?: visible.firstOrNull { it.isScrollable && it.getBoundsInScreen(bounds).let { bounds.centerX() >= 400 } })
                    ?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
                false
            }
        } catch (error: AssertionError) {
            capture("m6-native-library-action-diagnostic.png")
            val details = nodes().filter { node ->
                val bounds = Rect().also(node::getBoundsInScreen)
                !node.isPassword && bounds.left < 700 && bounds.top in 400..740 &&
                    (node.text != null || node.contentDescription != null)
            }.take(20).map { node ->
                val bounds = Rect().also(node::getBoundsInScreen)
                "${node.text?.toString()?.take(40) ?: node.contentDescription?.toString()?.take(40)}@$bounds clickable=${node.isClickable}"
            }
            throw AssertionError("${error.message}; visible card nodes=$details", error)
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
