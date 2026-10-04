package com.chordviewer.library

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.Bitmap
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
import com.chordviewer.MidiDeviceOption
import com.chordviewer.MidiInputState
import com.chordviewer.midi.MidiInputEvent
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.score.LeadSheetReader
import com.chordviewer.ui.ChordViewerTheme
import java.io.File
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Product UI acceptance; synthetic attachments exercise the real shell and picker without hardware. */
@RunWith(AndroidJUnit4::class)
class MidiDevicePickerUiTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val automation get() = instrumentation.uiAutomation
    private fun main(action: () -> Unit) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync() }

    @Test fun statusDeviceChoiceAndRemovalWorkInRailAndCompactHeader() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("midiPickerUi") == "true")
        val serviceInfo = automation.serviceInfo
        serviceInfo.flags = serviceInfo.flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
            AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        automation.serviceInfo = serviceInfo
        val context = instrumentation.targetContext
        val model = LibraryViewModel(null)
        val score = context.assets.open("lead-sheet-v1.json").bufferedReader().use { LeadSheetReader.read(it.readText()) }
        main { model.previewPractice(score) }
        val piano = MidiDeviceOption("piano", "Roland RP102")
        val computer = MidiDeviceOption("computer", "Computer via USB")
        var devices by mutableStateOf(emptyList<MidiDeviceOption>())
        var selectedId by mutableStateOf<String?>(null)
        var connected by mutableStateOf(false)
        var width by mutableStateOf(1280)
        var fontScale by mutableStateOf(1f)
        var choices = 0
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        main { activity.setContent {
            val state by model.state.collectAsState()
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, fontScale)) {
                Box(Modifier.width(width.dp).fillMaxHeight()) {
                    ChordViewerTheme { LibraryScreen(state, model,
                        MidiInputState(MidiSnapshot(), if (connected) "Connected" else "No MIDI device connected", connected,
                            {}, { id -> selectedId = id; choices++; model.onMidiEvent(MidiInputEvent.Reset(true)) }, devices, selectedId)) }
                }
            }
        } }
        fun stateIs(count: Int, ready: Boolean) = nodes().any {
            it.contentDescription?.startsWith(if (ready) "MIDI connected" else "MIDI disconnected") == true &&
                it.contentDescription?.contains("$count ${if (count == 1) "device" else "devices"}") == true
        }
        fun openPicker() {
            waitFor { nodes().firstOrNull { it.contentDescription?.startsWith("MIDI connected") == true }?.let(::click) == true }
            waitFor { has("MIDI device") && has("Roland RP102") && has("Computer via USB") }
        }
        try {
            waitFor { stateIs(0, false) }
            assertFalse(has("MIDI setup"))
            assertFalse(has("MIDI device"))
            assertTrue(nodes().filter { it.contentDescription?.startsWith("MIDI disconnected") == true }.all { !click(it) })
            capture("midi-disconnected.png")

            main { devices = listOf(piano); selectedId = piano.id; connected = true }
            waitFor { stateIs(1, true) }
            assertTrue(nodes().filter { it.contentDescription?.startsWith("MIDI connected") == true }.all { !click(it) })
            assertFalse(has("MIDI device"))
            capture("midi-one-device.png")

            main { devices = listOf(piano, computer) }
            waitFor { stateIs(2, true) }
            capture("midi-two-devices.png")
            openPicker()
            assertTrue(nodes().any { it.isCheckable && it.isChecked && textIn(it, piano.label) })
            assertTrue(has("In use"))
            assertFalse(has("Connect") || has("Disconnect") || has("Clear notes") || has("Done"))
            capture("midi-device-picker.png")
            waitFor { nodes().firstOrNull { it.text?.toString() == computer.label }?.let(::click) == true }
            waitFor { !has("MIDI device") }
            assertEquals(computer.id, selectedId)
            assertEquals(1, choices)
            assertEquals(score, model.state.value.practiceScore)

            openPicker()
            assertTrue(nodes().any { it.isCheckable && it.isChecked && textIn(it, computer.label) })
            waitFor { nodes().firstOrNull { it.contentDescription?.toString() == "Close MIDI device picker" }?.let(::click) == true }
            waitFor { !has("MIDI device") }
            assertEquals(1, choices)
            openPicker()
            main { devices = listOf(computer) }
            waitFor { !has("MIDI device") && stateIs(1, true) }

            main { width = 360; devices = listOf(piano, computer) }
            waitFor { has("ChordViewer") && stateIs(2, true) }
            capture("midi-compact-header.png")
            openPicker()
            capture("midi-compact-picker.png")
            main { devices = emptyList(); selectedId = null; connected = false }
            waitFor { !has("MIDI device") && stateIs(0, false) }

            main { width = 1280; fontScale = 1.7f; devices = listOf(piano, computer); selectedId = piano.id; connected = true }
            waitFor { stateIs(2, true) }
            openPicker()
            assertTrue(nodes().any { it.contentDescription?.toString() == "Close MIDI device picker" && it.isVisibleToUser })
            capture("midi-large-text-picker.png")
        } finally { main { activity.finish() } }
    }

    private fun nodes(): List<AccessibilityNodeInfo> {
        if (Build.VERSION.SDK_INT >= 34) automation.clearCache()
        return automation.rootInActiveWindow?.let(::descendants).orEmpty()
    }
    private fun descendants(node: AccessibilityNodeInfo): List<AccessibilityNodeInfo> = buildList {
        add(node); repeat(node.childCount) { node.getChild(it)?.let { addAll(descendants(it)) } }
    }
    private fun textIn(node: AccessibilityNodeInfo, text: String) = descendants(node).any { it.text?.toString() == text }
    private fun has(text: String) = nodes().any { it.text?.toString() == text && it.isVisibleToUser }
    private fun click(node: AccessibilityNodeInfo): Boolean {
        var target: AccessibilityNodeInfo? = node
        while (target != null) {
            if (target.isClickable) return target.isEnabled && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            target = target.parent
        }
        return false
    }
    private fun capture(name: String) {
        val directory = File(instrumentation.targetContext.filesDir, "midi-picker-evidence").apply { mkdirs() }
        val bitmap = requireNotNull(automation.takeScreenshot())
        File(directory, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
    private fun waitFor(predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + 10_000
        while (SystemClock.elapsedRealtime() < deadline) {
            if (predicate()) return
            SystemClock.sleep(50)
        }
        runCatching { capture("midi-failure.png") }
        fail("Timed out waiting for MIDI picker UI: " + nodes().map { "text=${it.text}; description=${it.contentDescription}" })
    }
}
