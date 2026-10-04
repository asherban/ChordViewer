package com.chordviewer.library

import android.content.Intent
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
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
import com.chordviewer.midi.MidiInputEvent
import com.chordviewer.midi.MidiState
import com.chordviewer.score.*
import com.chordviewer.ui.ChordViewerTheme
import java.io.File
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Product display acceptance with an unsaved score, isolated MIDI and no backend writes. */
@RunWith(AndroidJUnit4::class)
class PlayedChordUiTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private fun main(action: () -> Unit) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync() }

    @Test fun sustainedChordShowsKeyAwareAlternativesThatFitAndClear() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("playedChordUi") == "true")
        val accessibility = automation.serviceInfo
        accessibility.flags = accessibility.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        automation.serviceInfo = accessibility
        val context = instrumentation.targetContext
        val model = LibraryViewModel(null)
        val score = LeadSheet("played-chord", "Evening practice", List(8) { bar ->
            ScoreMeasure("bar-$bar", listOf(ChordEvent("chord-$bar", 0, 1920, listOf("F#m7", "G", "A7", "D")[bar % 4])), emptyList())
        }, schemaVersion = 2, keySignature = "D")
        val saved = SavedSheet(score.id, score, LeadSheetWriter.write(score), null, 1, "2026-10-04T00:00:00Z", "2026-10-04T00:00:00Z")
        val midi = MidiState()
        var snapshot by mutableStateOf(midi.snapshot())
        var width by mutableStateOf(1280)
        var fontScale by mutableStateOf(1f)
        main {
            model.configureChordVocabulary(context.assets.open("chord-vocabulary-v1.json").bufferedReader().use { it.readText() })
            model.onMidiEvent(MidiInputEvent.Reset(true)); model.previewPractice(score)
        }
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        main { activity.setContent {
            val state by model.state.collectAsState()
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, fontScale)) {
                Box(Modifier.width(width.dp).fillMaxHeight()) {
                    ChordViewerTheme { LibraryScreen(state.copy(selected = saved, draftTitle = score.title), model,
                        MidiInputState(snapshot, "Connected", true, {}, {})) }
                }
            }
        } }
        fun bytes(vararg data: Int) = main { snapshot = midi.accept(data); model.onMidiEvent(MidiInputEvent.Bytes(data)) }
        fun checkAlternatives() {
            val names = model.state.value.liveChordAlternatives.take(3)
            val rows = nodes().filter { n -> n.text?.toString()?.split(" · ")?.any { it in names } == true }
            assertTrue("At most two rows of complete names", rows.size in 1..2)
            assertTrue(rows.flatMap { it.text.toString().split(" · ") }.all { it in names })
            assertTrue(rows.sumOf { it.text.toString().split(" · ").size } <= 3)
            val left = bounds(rows.first()).left
            val panelWidth = if (width < 760) width - 16 else 312
            rows.forEach { assertTrue("Names must stay inside the panel", bounds(it).left == left && bounds(it).right <= left + (panelWidth * context.resources.displayMetrics.density).toInt() + 2) }
            assertFalse(nodes().any {
                val text = it.text?.toString().orEmpty()
                text.contains("Play the chart chord") || text.startsWith("Held ") || text.startsWith("Sounding ") ||
                    text.startsWith("Sustain:") || text == "● MIDI connected" || text == "MIDI setup" ||
                    text == "Match · release to advance" || text == "Played notes differ from this chord."
            })
        }
        try {
            waitFor { nodes().any { it.text?.toString() == "PLAYED" } }
            assertTrue(nodes().any { it.contentDescription?.toString() == "Sustain pedal off" })
            assertFalse(nodes().any { it.text?.toString() == "ALSO" })
            bytes(176, 64, 127, 144, 54, 90, 128, 54, 0, 144, 57, 90, 144, 61, 90, 144, 64, 90)
            waitFor { nodes().any { it.text?.startsWith("A6/F#") == true } }
            assertTrue(nodes().any { it.contentDescription?.toString() == "Sustain pedal on" })
            assertEquals("F#m7", model.state.value.liveChord)
            assertEquals(true, model.state.value.practiceLiveMatch)
            checkAlternatives(); capture("played-chord-tablet.png")
            val normalTextHeight = bounds(nodes().first { it.text?.startsWith("A6/F#") == true }).height()
            main { fontScale = 2f }
            waitFor { nodes().any { it.text?.startsWith("A6/F#") == true && bounds(it).height() > normalTextHeight * 1.4 } }
            checkAlternatives(); capture("played-chord-large-text.png")
            bytes(176, 64, 0, 128, 57, 0, 128, 61, 0, 128, 64, 0, 144, 61, 90, 144, 64, 90, 144, 67, 90, 144, 70, 90)
            assertTrue("Exercise more names than the display limit", model.state.value.liveChordAlternatives.size > 3)
            waitFor { nodes().any { it.text?.contains("Edim7/C#") == true } }
            checkAlternatives(); capture("played-chord-many-names.png")
            bytes(128, 61, 0, 128, 64, 0, 128, 67, 0, 128, 70, 0,
                176, 64, 127, 144, 54, 90, 128, 54, 0, 144, 57, 90, 144, 61, 90, 144, 64, 90)
            main { width = 360; fontScale = 1f }
            assertEquals("F#m7", model.state.value.liveChord)
            waitFor { nodes().any { it.text?.toString() == "ChordViewer" } }
            SystemClock.sleep(500) // Let accessibility publish the new tree after switching from rail to header.
            waitFor {
                val tree = nodes()
                if (tree.any { it.text?.contains("A6/F#") == true }) true
                else {
                    // Resizing may preserve focus on the lower practice controls; return toward the chord panel.
                    tree.firstOrNull { it.isScrollable && bounds(it).height() > bounds(it).width() }
                        ?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
                    false
                }
            }
            checkAlternatives(); capture("played-chord-narrow.png")
            bytes(128, 57, 0, 128, 61, 0, 128, 64, 0)
            assertEquals("F#m7", model.state.value.liveChord)
            bytes(176, 64, 0)
            waitFor {
                val tree = nodes()
                if (tree.any { it.contentDescription?.toString() == "Sustain pedal off" }) true
                else {
                    // Clearing the chord can shift the narrow scroll position below the panel.
                    tree.firstOrNull { it.isScrollable && bounds(it).height() > bounds(it).width() }
                        ?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
                    false
                }
            }
            assertFalse(nodes().any { it.text?.toString() == "ALSO" })
            assertNull(model.state.value.liveChord)
            assertTrue(model.state.value.liveChordAlternatives.isEmpty())
        } catch (error: Throwable) {
            capture("played-chord-failure.png")
            throw error
        } finally { main { model.onMidiEvent(MidiInputEvent.Reset(false)); activity.finish() } }
    }

    private fun bounds(node: AccessibilityNodeInfo) = Rect().also { node.getBoundsInScreen(it) }
    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        fun visit(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
            add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(visit(child)) } }
        }
        return automation.rootInActiveWindow?.let(::visit).orEmpty()
    }
    private fun waitFor(ready: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + 15_000
        while (SystemClock.elapsedRealtime() < until) { if (ready()) return; SystemClock.sleep(100) }
        error("Played chord UI did not become ready")
    }
    private fun capture(name: String) {
        instrumentation.waitForIdleSync()
        File(instrumentation.targetContext.getExternalFilesDir(null), "$name.txt").writeText(nodes().joinToString("\n") {
            "${bounds(it)} scroll=${it.isScrollable} text=${it.text} description=${it.contentDescription}"
        })
        val image = requireNotNull(automation.takeScreenshot())
        File(instrumentation.targetContext.getExternalFilesDir(null), name).outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
        image.recycle()
    }
}
