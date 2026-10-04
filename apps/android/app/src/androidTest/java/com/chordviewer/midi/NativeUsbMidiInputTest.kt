package com.chordviewer.midi

import android.content.Intent
import android.os.Looper
import android.os.SystemClock
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import com.chordviewer.MainActivity
import com.chordviewer.library.LibraryViewModel
import com.chordviewer.score.LeadSheetReader
import java.io.File
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in native product acceptance. Uses an unsaved sample and automatic device selection. */
@RunWith(AndroidJUnit4::class)
class NativeUsbMidiInputTest {
    @Test fun usbInputHealthGesturesAndActivityReuse() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("usbMidiHardware") == "true")
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val phase = File(context.filesDir, "usb-midi-acceptance.phase")
        val evidence = File(context.filesDir, "usb-midi-acceptance.txt")
        var input: NativeMidiInput? = null
        val update = AtomicReference(NativeMidiUpdate())
        val completed = mutableListOf<List<Int>>()
        val capture = ChordGestureCapture { completed.add(it) }
        var sawTriad = false
        var sawSustainedRelease = false
        var sawSecondChannel = false
        val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        try {
            lateinit var library: LibraryViewModel
            instrumentation.runOnMainSync { library = ViewModelProvider(activity)[LibraryViewModel::class.java] }
            await("initial session restoration") { !library.state.value.busy }
            instrumentation.runOnMainSync {
                val sample = context.assets.open("lead-sheet-v1.json").bufferedReader().use { LeadSheetReader.read(it.readText()) }
                library.previewPractice(sample)
                context.startActivity(Intent(context, MainActivity::class.java).addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP))
            }
            instrumentation.waitForIdleSync()
            instrumentation.runOnMainSync {
                assertSame(activity, ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).single { it is MainActivity })
                assertSame(library, ViewModelProvider(activity)[LibraryViewModel::class.java])
                assertNotNull(library.state.value.practiceScore)
                input = NativeMidiInput(context, { event ->
                    assertEquals(Looper.getMainLooper(), Looper.myLooper())
                    when (event) {
                        is MidiInputEvent.Reset -> capture.reset()
                        is MidiInputEvent.Bytes -> capture.accept(event.data)
                    }
                }) { next ->
                    update.set(next)
                    if (next.snapshot.held.map { it.pitch }.toSet().containsAll(listOf(60, 64, 67))) sawTriad = true
                    if (next.snapshot.held.isEmpty() && next.snapshot.sounding.size >= 3 && next.snapshot.sustainChannels.isNotEmpty()) sawSustainedRelease = true
                    if (next.snapshot.held.any { it.channel == 1 }) sawSecondChannel = true
                }
                input!!.foreground(true)
            }
            await("USB source") { update.get().sources.any { it.computer } }
            // A single attached device requires no selection or Connect action.
            instrumentation.runOnMainSync {
                assertEquals(1, update.get().sources.size)
                assertEquals(update.get().sources.single().id, update.get().selectedId)
            }
            await("router heartbeat") { update.get().connected }
            instrumentation.runOnMainSync { capture.arm() }
            phase.writeText("ready")
            await("fixture notes", 30_000) { sawTriad && sawSustainedRelease && sawSecondChannel }
            await("fixture release") { update.get().connected && update.get().snapshot.held.isEmpty() && update.get().snapshot.sounding.isEmpty() }
            instrumentation.runOnMainSync { assertTrue(completed.contains(listOf(60, 64, 67))) }
            phase.writeText("fixture-pass")
            await("held note and sustain") { update.get().snapshot.held.isNotEmpty() && update.get().snapshot.sustainChannels.isNotEmpty() }
            phase.writeText("held")
            await("router timeout") { !update.get().connected && update.get().snapshot == MidiSnapshot() }
            instrumentation.runOnMainSync { assertFalse(capture.armed) }
            phase.writeText("timeout-pass")
            await("router recovery") { update.get().connected }
            instrumentation.runOnMainSync { assertFalse(capture.armed); assertTrue(update.get().snapshot.held.isEmpty()) }
            instrumentation.runOnMainSync { input!!.foreground(false) }
            assertFalse(update.get().connected)
            assertEquals(MidiSnapshot(), update.get().snapshot)
            instrumentation.runOnMainSync { input!!.foreground(true) }
            await("automatic foreground reconnect") { update.get().connected }
            instrumentation.runOnMainSync { assertFalse(capture.armed) }
            evidence.writeText("PASS: automatic native USB connection, triad, sustain release, channel separation, ordered main-thread gestures, router timeout/recovery, explicit entry pause, automatic foreground reconnect, same Activity and LibraryViewModel after reuse.\n")
            phase.writeText("done")
        } finally {
            instrumentation.runOnMainSync {
                input?.close()
                activity.finish()
            }
        }
    }

    private fun await(label: String, timeout: Long = 15_000, predicate: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeout
        while (SystemClock.elapsedRealtime() < deadline) {
            var satisfied = false
            InstrumentationRegistry.getInstrumentation().runOnMainSync { satisfied = predicate() }
            if (satisfied) return
            SystemClock.sleep(30)
        }
        fail("Timed out waiting for $label")
    }
}
