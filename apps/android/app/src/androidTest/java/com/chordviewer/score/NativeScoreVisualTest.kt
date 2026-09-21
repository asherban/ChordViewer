package com.chordviewer.score

import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.activity.compose.setContent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.MainActivity
import com.chordviewer.MidiInputState
import com.chordviewer.library.*
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.ui.ChordViewerTheme
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Explicit visual acceptance of the real native shell using synthetic, unsaved test data only. */
@RunWith(AndroidJUnit4::class)
class NativeScoreVisualTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation

    @Test fun captureChordAndMelodySystemsAndAnEmptyCreateSheet() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("scoreVisual") == "true")
        val context = instrumentation.targetContext
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)) as MainActivity
        val symbols = listOf("Dm7", "G7", "Cmaj7", "Am7")
        val pitches = listOf("C", "E", "G", "A", "G", "F", "E", "D")
        val study = LeadSheet("visual-study", "Evening changes", List(12) { bar ->
            ScoreMeasure("bar-$bar", listOf(ChordEvent("chord-$bar", 0, BAR_TICKS, symbols[bar % 4])),
                List(4) { beat -> MelodyEvent("note-$bar-$beat", beat * 480, ScoreDuration(4, 0),
                    ScorePitch(pitches[(bar * 2 + beat) % pitches.size], 0, 4)) })
        })
        fun render(sheet: LeadSheet, mode: LibraryMode) {
            val saved = SavedSheet(sheet.id, sheet, LeadSheetWriter.write(sheet), null, 1, "2026-09-21T00:00:00Z", "2026-09-21T00:00:00Z")
            val state = LibraryState(selected = saved, mode = mode, draftTitle = sheet.title,
                editor = if (mode == LibraryMode.CREATE) ScoreEditorState(sheet) else null)
            instrumentation.runOnMainSync { activity.setContent {
                ChordViewerTheme { LibraryScreen(state, LibraryViewModel(null), MidiInputState(MidiSnapshot(), "Disconnected", false, {}, {})) }
            } }
            waitFor { nodes().any { it.text?.toString() == sheet.title } }
        }
        try {
            render(study, LibraryMode.PRACTICE)
            capture("score-native-melody.png")
            toggleMelody()
            capture("score-native-chords.png")
            val blank = LeadSheet("visual-blank", "New sheet", listOf(ScoreMeasure("blank-bar", emptyList(), emptyList())))
            render(blank, LibraryMode.CREATE)
            capture("score-native-empty-melody.png")
            toggleMelody()
            capture("score-native-empty.png")
            val edge = context.assets.open("lead-sheet-v1.json").bufferedReader().use { LeadSheetReader.read(it.readText()) }
            render(edge, LibraryMode.PRACTICE)
            capture("score-native-notation.png")
            val sharps = LeadSheet("visual-sharps", "C sharp · twelve eighths", List(4) { bar ->
                ScoreMeasure("sharp-bar-$bar", listOf(ChordEvent("sharp-chord-$bar", 0, 2880, "C#maj7")),
                    listOf("F", "G", "A", "B").mapIndexed { note, step -> MelodyEvent("sharp-$bar-$note", note * 720, ScoreDuration(4, 1), ScorePitch(step, 1, 4)) })
            }, schemaVersion = 2, keySignature = "C#", timeSignature = ScoreTimeSignature(12, 8))
            render(sharps, LibraryMode.PRACTICE); capture("m5-native-sharps.png")
            val flats = LeadSheet("visual-flats", "C flat · three quarters", List(4) { bar ->
                ScoreMeasure("flat-bar-$bar", listOf(ChordEvent("flat-chord-$bar", 0, 1440, "Cbmaj7")),
                    listOf("C", "D", "E").mapIndexed { note, step -> MelodyEvent("flat-$bar-$note", note * 480, ScoreDuration(4, 0), ScorePitch(step, -1, 4)) })
            }, schemaVersion = 2, keySignature = "Cb", timeSignature = ScoreTimeSignature(3, 4))
            render(flats, LibraryMode.PRACTICE); capture("m5-native-flats.png")
        } finally { instrumentation.runOnMainSync { activity.finish() } }
    }

    private fun toggleMelody() {
        waitFor {
            var node = nodes().firstOrNull { it.contentDescription?.toString() == "Show melody notation" }
            while (node != null && !node.isClickable) node = node.parent
            node?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true
        }
        instrumentation.waitForIdleSync()
    }
    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        fun visit(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
            add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(visit(child)) } }
        }
        return automation.rootInActiveWindow?.let(::visit).orEmpty()
    }
    private fun waitFor(predicate: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + 15_000
        while (SystemClock.elapsedRealtime() < until) { if (predicate()) return; SystemClock.sleep(100) }
        error("Native visual fixture did not become visible")
    }
    private fun capture(name: String) {
        instrumentation.waitForIdleSync(); SystemClock.sleep(300)
        check(nodes().none { it.isPassword })
        val image = requireNotNull(automation.takeScreenshot())
        assertEquals(1280, image.width); assertEquals(800, image.height)
        val directory = File(instrumentation.targetContext.filesDir, "ui-evidence").apply { mkdirs() }
        File(directory, name).outputStream().use { check(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
        image.recycle()
    }
}

