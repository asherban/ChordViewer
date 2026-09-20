package com.chordviewer.midi

import android.os.Bundle
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Runs only with an explicitly supplied bridge session and the real host smoke fixture. */
@RunWith(AndroidJUnit4::class)
class LoopbackRelayTest {
    @Test fun hostLoopbackFixtureReachesNativeMidiState() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val token = InstrumentationRegistry.getArguments().getString("midiToken").orEmpty()
        assumeTrue("A local MIDI bridge session is required", token.matches(Regex("[a-f0-9]{64}")))
        val updates = ArrayBlockingQueue<RelayUpdate>(256)
        val relay = DebugMidiRelay { updates.offer(it) }
        try {
            instrumentation.runOnMainSync { relay.connect(token) }
            val initial = await(updates, 10_000) { it.connected }
            assertEquals(MidiSnapshot(), initial.snapshot)
            instrumentation.sendStatus(0, Bundle().apply { putString("stream", "MIDI_RELAY_READY\n") })

            var sawMajor = false
            var sawSustainedRelease = false
            var sawZeroVelocityRelease = false
            var sawIndependentChannels = false
            var sawChannelOneRelease = false
            var sawFinalClear = false
            val deadline = SystemClock.elapsedRealtime() + 30_000
            while (SystemClock.elapsedRealtime() < deadline && !sawFinalClear) {
                val update = updates.poll(500, TimeUnit.MILLISECONDS) ?: continue
                assertTrue("Bridge must stay connected during the fixture", update.connected)
                val state = update.snapshot
                val major = listOf(MidiNote(0, 60), MidiNote(0, 64), MidiNote(0, 67))
                sawMajor = sawMajor || state.held == major
                sawSustainedRelease = sawSustainedRelease ||
                    (state.held.isEmpty() && state.sounding == major && state.sustainChannels == listOf(0))
                sawZeroVelocityRelease = sawZeroVelocityRelease ||
                    (state.messagesReceived == 16L && state.held.isEmpty() && state.sounding.isEmpty())
                sawIndependentChannels = sawIndependentChannels ||
                    state.held == listOf(MidiNote(0, 60), MidiNote(1, 60))
                sawChannelOneRelease = sawChannelOneRelease ||
                    (state.messagesReceived == 21L && state.held == listOf(MidiNote(1, 60)))
                // 22 fixture messages plus pedal/all-notes-off cleanup on all 16 channels.
                sawFinalClear = state.messagesReceived >= 54 && state.held.isEmpty() &&
                    state.sounding.isEmpty() && state.sustainChannels.isEmpty()
            }
            assertTrue("Did not receive complete held C major", sawMajor)
            assertTrue("Did not receive released keys held by sustain", sawSustainedRelease)
            assertTrue("Did not observe zero-velocity note-off", sawZeroVelocityRelease)
            assertTrue("Did not observe equal pitches on two channels", sawIndependentChannels)
            assertTrue("Releasing one channel must preserve the other", sawChannelOneRelease)
            assertTrue("Fixture must finish with no sounding notes", sawFinalClear)

            updates.clear()
            instrumentation.runOnMainSync { relay.disconnect() }
            assertEquals(MidiSnapshot(), await(updates, 3_000) { !it.connected }.snapshot)
            instrumentation.runOnMainSync { relay.connect(token) }
            assertEquals(MidiSnapshot(), await(updates, 10_000) { it.connected }.snapshot)
        } finally {
            instrumentation.runOnMainSync { relay.disconnect() }
        }
    }

    private fun await(
        updates: ArrayBlockingQueue<RelayUpdate>,
        timeoutMs: Long,
        predicate: (RelayUpdate) -> Boolean,
    ): RelayUpdate {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline) {
            val update = updates.poll(100, TimeUnit.MILLISECONDS) ?: continue
            if (predicate(update)) return update
        }
        throw AssertionError("Timed out waiting for local MIDI relay state")
    }
}
