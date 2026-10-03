package com.chordviewer.midi

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MidiInputSessionTest {
    private val completed = mutableListOf<List<Int>>()
    private val capture = ChordGestureCapture { completed.add(it) }
    private fun deliver(events: List<MidiInputEvent>) = events.forEach {
        when (it) {
            is MidiInputEvent.Reset -> capture.reset()
            is MidiInputEvent.Bytes -> capture.accept(it.data)
        }
    }

    @Test fun computerWaitsForHeartbeatAndReadinessDoesNotArmEntry() {
        val input = MidiInputSession(true)
        deliver(input.opened())
        assertTrue(input.accept(intArrayOf(0x90, 60, 90), 0).isEmpty())
        assertFalse(input.ready)
        deliver(input.accept(intArrayOf(0xFE), 10))
        assertTrue(input.ready)
        assertFalse(capture.armed)
        assertTrue(input.snapshot.held.isEmpty())
    }

    @Test fun heartbeatPreservesRunningStatusAndAnArmedGesture() {
        val input = MidiInputSession(true)
        deliver(input.accept(intArrayOf(0xFE), 0))
        capture.arm()
        deliver(input.accept(intArrayOf(0x90, 60, 0xFE, 90, 64, 90), 20))
        assertEquals(listOf(60, 64), input.snapshot.held.map { it.pitch })
        assertTrue(input.accept(intArrayOf(0xFE), 100).isEmpty())
        assertTrue(capture.armed)
        deliver(input.accept(intArrayOf(0x80, 60, 0, 64, 0), 150))
        assertEquals(listOf(listOf(60, 64)), completed)
    }

    @Test fun silentHoldSurvivesHeartbeatsWithoutProductEvents() {
        val input = MidiInputSession(true)
        deliver(input.accept(intArrayOf(0xFE), 0)); capture.arm()
        deliver(input.accept(intArrayOf(0x90, 60, 90, 0xB0, 64, 127), 10))
        for (time in 100L..1000L step 100) {
            assertTrue(input.accept(intArrayOf(0xFE), time).isEmpty())
            assertTrue(input.expire(time + 90).isEmpty())
        }
        assertTrue(capture.armed)
        assertEquals(listOf(MidiNote(0, 60)), input.snapshot.held)
        deliver(input.accept(intArrayOf(0x80, 60, 0), 1020))
        assertEquals(listOf(listOf(60)), completed)
        assertEquals(listOf(MidiNote(0, 60)), input.snapshot.sounding)
    }

    @Test fun rapidRestartDiscardsQueuedCompletionAndPausesBeforeLaterNotes() {
        val input = MidiInputSession(true)
        deliver(input.accept(intArrayOf(0xFE), 0)); capture.arm()
        deliver(input.accept(intArrayOf(0x90, 60, 90), 10))
        // A single native callback includes old completion, startup cleanup and fresh events.
        deliver(input.accept(intArrayOf(0x80, 60, 0, 0xB0, 120, 0, 0xFE, 0x90, 64, 90, 0x80, 64, 0), 40))
        assertTrue(input.ready)
        assertFalse(capture.armed)
        assertTrue(completed.isEmpty())
        assertTrue(input.snapshot.held.isEmpty())
    }

    @Test fun fragmentedCleanupOnAnotherChannelResetsAllState() {
        val input = MidiInputSession(true)
        deliver(input.accept(intArrayOf(0xFE), 0)); capture.arm()
        deliver(input.accept(intArrayOf(0x90, 60, 90, 0xB0, 64, 127, 0xB1, 123), 10))
        deliver(input.accept(intArrayOf(0xFE, 0), 30))
        assertFalse(input.ready)
        assertFalse(capture.armed)
        assertEquals(MidiSnapshot(), input.snapshot)
        assertTrue(input.accept(intArrayOf(0x90, 67, 90), 40).isEmpty())
    }

    @Test fun expiredArrivalCannotCompleteAnOldGestureBeforeRecovery() {
        val input = MidiInputSession(true)
        deliver(input.accept(intArrayOf(0xFE), 0)); capture.arm()
        deliver(input.accept(intArrayOf(0x90, 60, 90), 10))
        deliver(input.accept(intArrayOf(0x80, 60, 0, 0xFE), 310))
        assertTrue(input.ready)
        assertFalse(capture.armed)
        assertTrue(completed.isEmpty())
        assertEquals(MidiSnapshot(), input.snapshot)
    }

    @Test fun ordinaryInputDoesNotRequireHeartbeatAndKeepsChannelCleanupSemantics() {
        val input = MidiInputSession(false)
        deliver(input.opened()); capture.arm()
        deliver(input.accept(intArrayOf(0x90, 60, 90, 0x91, 67, 90, 0xB0, 123, 0), 1000))
        assertEquals(listOf(MidiNote(1, 67)), input.snapshot.held)
        assertTrue(input.expire(10000).isEmpty())
        assertTrue(capture.armed)
        assertTrue(input.ready)
    }

    @Test fun ordinaryActiveSensingTimesOutOnceAndThenReturnsToNormalInput() {
        val input = MidiInputSession(false)
        deliver(input.opened()); capture.arm()
        deliver(input.accept(intArrayOf(0xFE, 0x90, 60, 90), 0))
        deliver(input.expire(300))
        assertFalse(capture.armed)
        assertTrue(input.ready)
        assertTrue(input.expire(1000).isEmpty())
        deliver(input.accept(intArrayOf(0x90, 64, 90), 1100))
        assertEquals(listOf(MidiNote(0, 64)), input.snapshot.held)
    }

    @Test fun clearCancelsGestureWithoutDisconnectingOrChangingSustainStateLater() {
        val input = MidiInputSession(false)
        deliver(input.opened()); capture.arm()
        deliver(input.accept(intArrayOf(0x90, 60, 90, 0xB0, 64, 127), 0))
        deliver(input.clear())
        assertTrue(input.ready)
        assertFalse(capture.armed)
        assertEquals(MidiSnapshot(), input.snapshot)
        deliver(input.accept(intArrayOf(0x80, 60, 0), 10))
        assertTrue(completed.isEmpty())
    }
}
