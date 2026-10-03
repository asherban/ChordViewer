package com.chordviewer.library

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
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

/** Opt-in product acceptance against the isolated backend; never attaches the user's session store. */
@RunWith(AndroidJUnit4::class)
class FastEntryUiTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation

    @Test fun directStaveGesturesSliderAndPersistence() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("fastEntryUi") == "true")
        val context = instrumentation.targetContext
        val model = LibraryViewModel(LibraryApi("http://127.0.0.1:3001", true))
        val nonce = UUID.randomUUID().toString()
        main { model.authenticate("entry-$nonce@example.test", "Entry-$nonce", "Tablet entry acceptance") }
        await("test account") { model.state.value.user != null && !model.state.value.busy }
        main { model.create("Fast entry tablet study", false) }
        await("test sheet") { model.state.value.editor != null && !model.state.value.busy }
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        main {
            model.addChord("C"); model.addChord("G")
            model.setPosition(ScorePosition(0, 960)); model.addChord("Am")
            model.setLane(EntryLane.MELODY)
            activity.setContent {
                val state by model.state.collectAsState()
                var melody by remember { mutableStateOf(true) }
                ChordViewerTheme {
                    state.editor?.let { ScoreWorkspace(state, it.score, false,
                        MidiInputState(MidiSnapshot(), "Disconnected", false, {}, {}), melody, { melody = it }, {}, {}, {}, model) }
                }
            }
        }
        try {
            await("editable score") { nodes().any { it.contentDescription?.toString()?.contains("Tap the entry line") == true } }
            assertFalse(nodes().any { it.text?.toString() in listOf("Hide tutorial", "Change last", "Add note / rest") })
            assertFalse(nodes().any { it.contentDescription?.toString() == "Choose insertion position" })
            fun location(position: ScorePosition, staffStep: Int): Pair<Float, Float> {
                val bounds = Rect().also { stave().getBoundsInScreen(it) }
                val scale = context.resources.displayMetrics.density
                val score = ScoreLayout.withRests(model.state.value.editor!!.score)
                val paint = android.graphics.Paint().apply { typeface = android.graphics.Typeface.create("serif", android.graphics.Typeface.BOLD); textSize = 26f }
                val timelines = score.measures.map { ScoreLayout.timeline(it, true, paint::measureText, score.measureTicks, score.keySignature) }
                val system = ScoreLayout.systems(score, timelines, bounds.width() / scale, true).first()
                val left = position.measureIndex * system.measureWidth
                val startX = left + 16 + if (position.measureIndex == 0) system.prefix else 0f
                val available = (left + system.measureWidth - 16 - startX).coerceAtLeast(timelines[position.measureIndex].width)
                return bounds.left + (startX + timelines[position.measureIndex].x(position.offsetTicks, available)) * scale to
                    bounds.top + (system.geometry.top + 40 - staffStep * 5) * scale
            }
            val firstLocation = location(ScorePosition(0), 0)
            gesture(firstLocation.first, firstLocation.second, firstLocation.first, firstLocation.second)
            await("one placed note") { model.state.value.editor!!.score.measures[0].melody.size == 1 }
            val original = model.state.value.editor!!.score.measures[0].melody.single()
            assertEquals(0, original.offsetTicks)
            assertEquals(ScorePitch("E", 0, 4), original.pitch)
            val secondLocation = location(ScorePosition(0, 480), 2)
            gesture(secondLocation.first, secondLocation.second, secondLocation.first, secondLocation.second)
            await("second sequential note") { model.state.value.editor!!.score.measures[0].melody.size == 2 }
            click(nodes().first { it.text?.toString() == "+ Rest" })
            await("inline rest") { model.state.value.editor!!.score.measures[0].melody.size == 3 }
            val scale = context.resources.displayMetrics.density
            var noteLocation = location(ScorePosition(0), 0)
            gesture(noteLocation.first + 6 * scale, noteLocation.second, noteLocation.first + 6 * scale, noteLocation.second - 20 * scale)
            await("pitch drag") { model.state.value.editor!!.score.measures[0].melody.first().pitch != original.pitch }
            val moved = model.state.value.editor!!.score.measures[0].melody.first()
            assertEquals(original.id, moved.id); assertEquals(original.offsetTicks, moved.offsetTicks)
            val slider = nodes().first { it.contentDescription?.toString() == "Selected note duration" }
            assertTrue(slider.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id, Bundle().apply {
                putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE, MELODY_DURATIONS.sortedBy { it.ticks }.indexOf(ScoreDuration(2, 0)).toFloat())
            }))
            await("duration shifts later notes") { model.state.value.editor!!.score.measures[0].melody.first().duration == ScoreDuration(2, 0) }
            assertEquals(listOf(0, 960, 1440), model.state.value.editor!!.score.measures[0].melody.map { it.offsetTicks })
            assertEquals(ScoreDuration(4, 0), model.state.value.editor!!.melodyDuration)
            click(nodes().first { it.text?.toString() == "Rest" })
            assertNull(model.state.value.editor!!.score.measures[0].melody.first().pitch)
            main { model.undoChord() }
            val beforeCancel = model.state.value.editor!!.score
            noteLocation = location(ScorePosition(0), moved.pitch!!.staffStep)
            gesture(noteLocation.first + 6 * scale, noteLocation.second, noteLocation.first + 6 * scale, noteLocation.second - 20 * scale, cancel = true)
            assertEquals(beforeCancel, model.state.value.editor!!.score)
            gesture(noteLocation.first + 6 * scale, noteLocation.second, noteLocation.first + 6 * scale, noteLocation.second)
            await("selected note controls") { nodes().any { it.contentDescription?.toString() == "Delete selected note" } }
            click(nodes().first { it.contentDescription?.toString() == "Delete selected note" })
            assertNull(MelodyEdits.find(model.state.value.editor!!.score, original.id))
            assertEquals(listOf(0, 480), model.state.value.editor!!.score.measures[0].melody.map { it.offsetTicks })
            main { model.undoChord() }
            assertEquals(beforeCancel, model.state.value.editor!!.score)
            // Entry extends into a third bar; making that final note a rest removes it.
            main {
                model.resumeMelodyEntry(); model.setMelodyDuration(ScoreDuration(1, 0))
                model.applyMelody(ScorePitch("C", 0, 4)); model.applyMelody(ScorePitch("D", 0, 4))
                model.selectMelody(model.state.value.editor!!.score.measures.last().melody.last().id)
            }
            assertEquals(3, model.state.value.editor!!.score.measures.size)
            click(nodes().first { it.text?.toString() == "Rest" })
            assertEquals(2, model.state.value.editor!!.score.measures.size)
            assertNull(model.state.value.editor!!.selectedMelodyId)
            main { model.undoChord() }
            assertEquals(3, model.state.value.editor!!.score.measures.size)
            main { model.redoChord() }
            assertEquals(2, model.state.value.editor!!.score.measures.size)
            val scoreBounds = Rect().also { stave().getBoundsInScreen(it) }
            main { model.save() }
            await("save") { !model.state.value.busy && !model.state.value.hasUnsavedChanges }
            assertEquals(scoreBounds.top, Rect().also { stave().getBoundsInScreen(it) }.top)
            val saved = model.state.value.selected!!
            assertEquals(listOf("C", "Am"), saved.score.measures[0].chords.map { it.symbol })
            main { model.open(saved.id) }
            await("reopen") { !model.state.value.busy && model.state.value.editor?.score == saved.score }
            main { model.setLane(EntryLane.MELODY) }
            await("reopened score") { nodes().any { it.contentDescription?.toString()?.contains("Tap the entry line") == true } }
            instrumentation.waitForIdleSync(); SystemClock.sleep(200)
            val screenshot = requireNotNull(automation.takeScreenshot())
            File(context.getExternalFilesDir(null), "fast-entry-native.png").outputStream().use { screenshot.compress(Bitmap.CompressFormat.PNG, 100, it) }
            screenshot.recycle()
        } finally { main { model.signOut(); activity.finish() } }
    }

    private fun main(action: () -> Unit) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync() }
    private fun stave() = nodes().first { it.contentDescription?.toString()?.contains("Tap the entry line") == true }
    private fun gesture(x: Float, y: Float, toX: Float, toY: Float, cancel: Boolean = false) {
        val start = SystemClock.uptimeMillis()
        fun send(action: Int, px: Float, py: Float) {
            val event = MotionEvent.obtain(start, SystemClock.uptimeMillis(), action, px, py, 0).apply { source = InputDevice.SOURCE_TOUCHSCREEN }
            try { check(automation.injectInputEvent(event, true)) } finally { event.recycle() }
        }
        send(MotionEvent.ACTION_DOWN, x, y)
        for (step in 1..5) { SystemClock.sleep(20); send(MotionEvent.ACTION_MOVE, x + (toX - x) * step / 5, y + (toY - y) * step / 5) }
        send(if (cancel) MotionEvent.ACTION_CANCEL else MotionEvent.ACTION_UP, toX, toY)
        instrumentation.waitForIdleSync()
    }
    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        fun descendants(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
            add(node); repeat(node.childCount) { node.getChild(it)?.let { child -> addAll(descendants(child)) } }
        }
        return automation.rootInActiveWindow?.let(::descendants).orEmpty()
    }
    private fun click(target: AccessibilityNodeInfo) {
        var node: AccessibilityNodeInfo? = target
        while (node != null && !node.isClickable) node = node.parent
        check(node?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true)
        instrumentation.waitForIdleSync()
    }
    private fun await(description: String, condition: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + 15_000
        while (SystemClock.elapsedRealtime() < until) { if (condition()) return; SystemClock.sleep(100) }
        throw AssertionError("Timed out waiting for $description")
    }
}
