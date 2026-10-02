package com.chordviewer.library

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.SystemClock
import android.view.KeyEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.webkit.WebView
import android.webkit.WebChromeClient
import android.view.View
import android.view.ViewGroup
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import com.chordviewer.MidiInputState
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.score.*
import com.chordviewer.ui.ChordViewerTheme
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Product layout acceptance, using only an unsaved score and no backend writes. */
@RunWith(AndroidJUnit4::class)
class NativeWorkspaceLayoutTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation

    @Test fun videoStaysPinnedAndConsistentWhileScoreUsesLandscapeHeight() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("workspaceLayout") == "true")
        val context = instrumentation.targetContext
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)) as MainActivity
        val score = LeadSheet("workspace-review", "Evening Changes", List(16) { bar ->
            ScoreMeasure("bar-$bar", listOf(ChordEvent("chord-$bar", 0, BAR_TICKS, listOf("Cmaj7", "Am7", "Dm7", "G7")[bar % 4])),
                List(4) { beat -> MelodyEvent("note-$bar-$beat", beat * 480, ScoreDuration(4, 0), ScorePitch(listOf("C", "E", "G", "A")[beat], 0, 4)) })
        })
        val saved = SavedSheet(score.id, score, LeadSheetWriter.write(score), "https://www.youtube.com/watch?v=M7lc1UVf-VE", 1,
            "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z")
        val model = LibraryViewModel(null)
        var mode by mutableStateOf(LibraryMode.CREATE)
        var width by mutableStateOf(1280)
        var fontScale by mutableStateOf(1f)
        instrumentation.runOnMainSync { activity.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, fontScale)) {
                Box(Modifier.width(width.dp).fillMaxHeight()) {
                    ChordViewerTheme { LibraryScreen(LibraryState(selected = saved, mode = mode, draftTitle = score.title,
                        editor = ScoreEditorState(score), practiceScore = score, practice = PracticePosition(bar = 3, eventIndex = 3)),
                        model, MidiInputState(MidiSnapshot(), "Disconnected", false, {}, {})) }
                }
            }
        } }
        try {
            waitFor { has("Evening Changes") && has("ENTRY") }
            val screenshot = requireNotNull(automation.takeScreenshot())
            val height = screenshot.height
            val screenWidth = screenshot.width
            assertTrue("Landscape tablet required", screenshot.width > height)
            screenshot.recycle()
            waitFor { player(activity.window.decorView) != null && iframeSource(activity).contains("/embed/M7lc1UVf-VE?") }
            assertTrue("Use YouTube's standard controls", iframeSource(activity).contains("controls=1"))
            assertTrue("Expose YouTube's fullscreen control", iframeSource(activity).contains("fs=1"))
            assertTrue("Opening the workspace must not autoplay", iframeSource(activity).contains("autoplay=0"))
            assertFalse(has("Play tutorial"))
            assertFalse(has("Video moves independently"))
            val video = playerBounds(activity)
            val notation = bounds(scoreNode())
            assertTrue("Music should start within the top fifth of the screen", notation.top < height / 5)
            assertTrue("Score must sit beside the video", notation.left > video.right)
            val dock = nodes().first { it.isScrollable && bounds(it).left >= video.left - 30 && bounds(it).right <= video.right + 30 && bounds(it).top >= video.bottom }
            assertTrue("Editor dock must scroll independently", dock.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD))
            instrumentation.waitForIdleSync()
            assertEquals("Video must stay pinned when entry controls scroll", video, playerBounds(activity))
            assertEquals("Dock scroll must not move the score", notation, bounds(scoreNode()))
            nodes().first { it.isScrollable && bounds(it).left >= video.left - 30 && bounds(it).right <= video.right + 30 && bounds(it).top >= video.bottom }
                .performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
            capture("workspace-create.png")

            clickDescription("Sheet actions"); waitFor { has("Sheet details") }; back()
            val createPlayer = player(activity.window.decorView)
            instrumentation.runOnMainSync { mode = LibraryMode.PRACTICE }
            waitFor { has("CHART") }
            assertSame("Switching modes must retain the tutorial player", createPlayer, player(activity.window.decorView))
            assertEquals("Video bounds must be identical across modes", video, playerBounds(activity))
            assertFalse("Manual movement has been removed", nodes().any { it.text?.toString() in listOf("Manual", "Next bar", "Previous bar", "Restart", "Hide tutorial") })
            assertFalse("The score must not expose a manual navigation click", scoreNode().isClickable)
            capture("workspace-practice.png")

            // Exercise the WebView fullscreen host without depending on a YouTube network response.
            val fullscreen = View(activity).apply { contentDescription = "Fullscreen video test" }
            var fullscreenExits = 0
            val callback = WebChromeClient.CustomViewCallback { fullscreenExits++ }
            lateinit var chrome: WebChromeClient
            instrumentation.runOnMainSync { chrome = requireNotNull(createPlayer?.webChromeClient); chrome.onShowCustomView(fullscreen, callback) }
            waitFor { nodes().any { it.contentDescription?.toString() == "Fullscreen video test" } }
            val fullscreenBounds = bounds(nodes().first { it.contentDescription?.toString() == "Fullscreen video test" })
            assertTrue("Video should fill the screen width", fullscreenBounds.width() >= screenWidth * .95)
            assertTrue("Video should fill the screen height", fullscreenBounds.height() >= height * .95)
            back()
            waitFor { fullscreen.parent == null && nodes().none { it.contentDescription?.toString() == "Fullscreen video test" } }
            assertEquals("Back must notify the player to leave fullscreen", 1, fullscreenExits)
            assertSame("Fullscreen must retain the inline player", createPlayer, player(activity.window.decorView))
            assertEquals(video, playerBounds(activity))
            instrumentation.runOnMainSync { chrome.onShowCustomView(fullscreen, callback) }
            waitFor { fullscreen.parent != null }
            instrumentation.runOnMainSync { chrome.onHideCustomView() }
            waitFor { fullscreen.parent == null && nodes().none { it.contentDescription?.toString() == "Fullscreen video test" } }
            assertEquals("Player-initiated exit must not call back recursively", 1, fullscreenExits)

            // Enlarged text retains the pinned player. Narrow windows stack content and can scroll back to it.
            instrumentation.runOnMainSync { fontScale = 1.5f }
            waitFor { has("Edit sheet") }
            assertTrue(playerBounds(activity).width() > 0)
            capture("workspace-large-text.png")
            instrumentation.runOnMainSync { width = 420; fontScale = 1f }
            waitFor { has("ChordViewer") }
            waitFor {
                if (has("Tutorial")) true else {
                    nodes().filter { it.isScrollable }.maxByOrNull { bounds(it).height() }
                        ?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
                    false
                }
            }
            capture("workspace-narrow.png")

            instrumentation.runOnMainSync { requireNotNull(player(activity.window.decorView)?.webChromeClient).onShowCustomView(fullscreen, callback) }
            waitFor { fullscreen.parent != null }
            instrumentation.runOnMainSync { assertTrue(activity.moveTaskToBack(true)) }
            waitFor { player(activity.window.decorView) == null && fullscreen.parent == null }
            assertEquals("Backgrounding must close fullscreen", 2, fullscreenExits)
            instrumentation.runOnMainSync {
                activity.startActivity(Intent(activity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
            }
            waitFor { player(activity.window.decorView) != null && iframeSource(activity).contains("autoplay=0") }
        } catch (error: Throwable) {
            capture("workspace-failure.png")
            throw error
        } finally { instrumentation.runOnMainSync { activity.finish() } }
    }

    private fun player(view: View): WebView? = if (view is WebView) view else if (view is ViewGroup)
        (0 until view.childCount).firstNotNullOfOrNull { player(view.getChildAt(it)) } else null
    private fun bounds(node: AccessibilityNodeInfo) = Rect().also(node::getBoundsInScreen)
    private fun scoreNode() = nodes().first { it.contentDescription?.contains("Measure 1:") == true }
    private fun playerBounds(activity: MainActivity) = Rect().also { rect ->
        instrumentation.runOnMainSync { requireNotNull(player(activity.window.decorView)).getGlobalVisibleRect(rect) }
    }
    private fun iframeSource(activity: MainActivity): String {
        val latch = CountDownLatch(1)
        var source = ""
        instrumentation.runOnMainSync {
            val view = player(activity.window.decorView)
            if (view == null) latch.countDown() else view.evaluateJavascript("""(() => {
                const frame = document.querySelector('iframe');
                const bounds = frame?.getBoundingClientRect();
                return bounds && bounds.width >= 320 && bounds.height >= 200 ? frame.src : '';
            })()""") {
                source = it; latch.countDown()
            }
        }
        latch.await(3, TimeUnit.SECONDS)
        return source
    }
    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        fun visit(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
            add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(visit(child)) } }
        }
        return automation.rootInActiveWindow?.let(::visit).orEmpty()
    }
    private fun has(text: String) = nodes().any { it.text?.toString() == text && it.isVisibleToUser }
    private fun clickDescription(text: String) { waitFor { nodes().firstOrNull { it.contentDescription?.toString() == text }?.let(::performClick) == true }; instrumentation.waitForIdleSync() }
    private fun performClick(target: AccessibilityNodeInfo): Boolean {
        var node: AccessibilityNodeInfo? = target
        while (node != null && !node.isClickable) node = node.parent
        return node?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }
    private fun back() { instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); instrumentation.waitForIdleSync() }
    private fun waitFor(predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 12_000
        while (SystemClock.elapsedRealtime() < deadline) { if (predicate()) { instrumentation.waitForIdleSync(); return }; SystemClock.sleep(100) }
        capture("workspace-failure.png")
        error("Workspace UI condition failed: ${nodes().mapNotNull { it.text?.toString() }}")
    }
    private fun capture(name: String) {
        instrumentation.waitForIdleSync(); SystemClock.sleep(250)
        check(nodes().none { it.isPassword })
        val image = requireNotNull(automation.takeScreenshot())
        val directory = File(instrumentation.targetContext.filesDir, "ui-evidence").apply { mkdirs() }
        File(directory, name).outputStream().use { check(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        image.recycle()
    }
}
