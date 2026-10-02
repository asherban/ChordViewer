package com.chordviewer.library

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import com.chordviewer.MidiInputState
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.score.LeadSheetReader
import com.chordviewer.score.ScoreEditorState
import com.chordviewer.ui.ChordViewerTheme
import java.io.File
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Product UI acceptance with unsaved synthetic sheets; no account or backend required. */
@RunWith(AndroidJUnit4::class)
class NativeLibraryLayoutTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private val tutorial = "https://www.youtube.com/watch?v=M7lc1UVf-VE"
    private val longTitle = "A long rehearsal title that must remain readable beside the favorite action"

    @Test fun landscapeLibraryLeavesRoomForSongsAndCombinesFilters() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("libraryLayout") == "true")
        val context = instrumentation.targetContext
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)) as MainActivity
        val base = SheetSummary("evening", "Evening study", null, 1, "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z",
            favorite = true, hasChords = true, previewChords = listOf("Cmaj13(#11)/G"))
        val sheets = listOf(base.copy(openedAt = "2026-10-02T12:00:00Z"),
            base.copy(id = "autumn", title = "Autumn changes", hasMelody = true, tutorialUrl = tutorial),
            base.copy(id = "blank", title = "Blank score", favorite = false, hasChords = false),
            base.copy(id = "draft", title = "Draft melody", favorite = false, draft = true, hasChords = false, hasMelody = true),
            base.copy(id = "trash", title = "Discarded song", favorite = false, trashedAt = base.updatedAt),
            base.copy(id = "long", title = longTitle, favorite = false, hasMelody = true, tutorialUrl = tutorial, draft = true)
        ) + List(12) { base.copy(id = "song-$it", title = "Study ${it + 1}", favorite = false) }
        val state = LibraryState(user = Account("visual", "Library review", "visual@example.test"), sheets = sheets, libraryLoaded = true)
        val model = LibraryViewModel(null)
        val scoreJson = context.assets.open("lead-sheet-v1.json").bufferedReader().use { it.readText() }
        val score = LeadSheetReader.read(scoreJson)
        val saved = SavedSheet(score.id, score, scoreJson, null, 1, base.createdAt, base.updatedAt)
        fun render(width: Int = 1280, fontScale: Float = 1f, mode: LibraryMode = LibraryMode.LIBRARY) {
            val screen = if (mode == LibraryMode.LIBRARY) state else state.copy(mode = mode, selected = saved,
                editor = ScoreEditorState(score), draftTitle = score.title, practiceScore = score)
            instrumentation.runOnMainSync { activity.setContent {
                val density = LocalDensity.current.density
                CompositionLocalProvider(LocalDensity provides Density(density, fontScale)) {
                    Box(Modifier.width(width.dp).fillMaxHeight()) {
                        ChordViewerTheme { LibraryScreen(screen, model, MidiInputState(MidiSnapshot(), "Disconnected", false, {}, {})) }
                    }
                }
            } }
            instrumentation.waitForIdleSync()
            waitFor { if (mode == LibraryMode.LIBRARY) nodes().any { it.contentDescription?.toString() == "Edit Autumn changes" }
                else nodes().any { it.contentDescription?.toString() == "Sheet actions" } }
        }
        try {
            render()
            val screenshot = requireNotNull(automation.takeScreenshot())
            val height = screenshot.height
            screenshot.recycle()
            val firstSong = nodes().first { it.text?.toString() == "Evening study" }
            assertTrue("Songs should start in the top quarter of the screen", Rect().also(firstSong::getBoundsInScreen).top < height / 4)
            assertTrue("Several complete rows should fit in landscape", nodes().count {
                it.isVisibleToUser && it.contentDescription?.toString()?.startsWith("Edit ") == true
            } >= 6)
            assertFalse("Chord previews should be removed", nodes().any { it.text?.contains("Cmaj13") == true })
            capture("library-rail-landscape.png")
            for (mode in listOf(LibraryMode.CREATE, LibraryMode.PRACTICE)) {
                render(mode = mode)
                val railItems = nodes().filter { node -> node.isSelected && Rect().also(node::getBoundsInScreen).right <= 80 }
                assertEquals("Only the current sidebar screen should be selected", 1, railItems.size)
                assertTrue("Sidebar should highlight ${mode.label}", descendants(railItems.single()).any { it.text?.toString() == mode.label })
                assertFalse("Wide screens should not retain the old header", has("ChordViewer"))
                capture("${mode.label.lowercase()}-rail-landscape.png")
            }
            render(420)
            capture("library-rail-narrow.png")
            assertTrue(has("New sheet"))
            render(1000, 1.5f)
            capture("library-rail-large-text.png")
            assertTrue(has("New sheet"))
            render()
            val grid = nodes().first { it.isScrollable && Rect().also(it::getBoundsInScreen).width() > 500 }
            assertTrue("Song grid must scroll", grid.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD))
            waitFor { has("Study 9") }
            nodes().first { it.isScrollable && Rect().also(it::getBoundsInScreen).width() > 500 }
                .performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
            waitFor { has("Evening study") }

            click("All sheets"); click("Favorites")
            waitFor { has("2 sheets") }
            click("Filters"); click("Includes melody"); click("Has tutorial")
            capture("library-filters.png")
            back()
            waitFor { has("1 sheet") && has("Autumn changes") }
            assertFalse(has("Evening study"))
            click("Filters (2)"); click("Clear filters"); back()
            waitFor { has("2 sheets") }
            click("Favorites"); click("All sheets")
            click("Filters"); click("Chords only"); back()
            waitFor { has("Filters (1)") }
            assertFalse("Blank scores are not chords-only songs", has("Blank score"))
            assertFalse("Melody scores must be filtered out", has("Autumn changes"))
            click("Filters (1)"); click("Clear filters"); back()

            click("All sheets"); click("Drafts")
            waitFor { has("2 sheets") && has("Draft melody") }
            click("Drafts"); click("Trash")
            waitFor { has("Discarded song") && has("Restore") }
            click("Trash"); click("All sheets")
            search("not a song")
            waitFor { has("No matching sheets.") }
            search("Evening")
            waitFor { has("1 sheet") && has("Evening study") }
            search("")
            click("Recent"); click("Title")
            waitFor { has(longTitle) }
            val firstTitle = nodes().first { it.text?.toString() == longTitle }
            val recentTitle = nodes().first { it.text?.toString() == "Evening study" }
            assertTrue("Title sort must replace recent-open order",
                Rect().also(firstTitle::getBoundsInScreen).top < Rect().also(recentTitle::getBoundsInScreen).top)
            clickDescription("More actions $longTitle")
            waitFor { has("Rename") && has("Duplicate") && has("Move to Trash") }
            back()
            clickDescription("Library actions")
            waitFor { has("Import") && has("Refresh") }
            back()
        } finally { instrumentation.runOnMainSync { activity.finish() } }
    }

    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        return automation.rootInActiveWindow?.let(::descendants).orEmpty()
    }
    private fun descendants(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
        add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(descendants(child)) } }
    }
    private fun has(text: String) = nodes().any { it.text?.toString() == text && it.isVisibleToUser }
    private fun click(text: String) {
        waitFor { nodes().lastOrNull { it.text?.toString() == text && it.isVisibleToUser }?.let(::performClick) == true }
        instrumentation.waitForIdleSync()
    }
    private fun clickDescription(description: String) {
        waitFor { nodes().firstOrNull { it.contentDescription?.toString() == description }?.let(::performClick) == true }
        instrumentation.waitForIdleSync()
    }
    private fun performClick(target: AccessibilityNodeInfo): Boolean {
        var node: AccessibilityNodeInfo? = target
        while (node != null && !node.isClickable) node = node.parent
        return node?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
    }
    private fun search(text: String) {
        waitFor { nodes().firstOrNull { it.isEditable && descendants(it).any { child -> child.text?.toString() == "Search sheets" } }
            ?.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }) == true }
        instrumentation.waitForIdleSync()
    }
    private fun back() { instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); instrumentation.waitForIdleSync() }
    private fun waitFor(predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 10_000
        while (SystemClock.elapsedRealtime() < deadline) { if (predicate()) return; SystemClock.sleep(100) }
        capture("library-layout-failure.png")
        error("Library UI condition failed; visible labels: ${nodes().mapNotNull { it.text?.toString() }}")
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
