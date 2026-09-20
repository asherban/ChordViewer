package com.chordviewer.midi

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class MidiStateTest {
    private val midi = MidiState()

    @Test fun fragmentedRunningStatusAndRealtimeDoNotLoseNotes() {
        midi.accept(intArrayOf(0x90, 60))
        assertTrue(midi.snapshot().held.isEmpty())
        midi.accept(intArrayOf(0xF8, 90, 64, 0xFA, 100, 67))
        assertEquals(listOf(60, 64), midi.snapshot().held.map { it.pitch })
        midi.accept(intArrayOf(100))
        assertEquals(listOf(60, 64, 67), midi.snapshot().held.map { it.pitch })
    }

    @Test fun noteOnWithZeroVelocityReleasesAndKeepsSustainSeparateFromHeldKeys() {
        midi.accept(intArrayOf(0x90, 60, 90, 0xB0, 64, 127, 0x90, 60, 0))
        assertTrue(midi.snapshot().held.isEmpty())
        assertEquals(listOf(MidiNote(0, 60)), midi.snapshot().sounding)
        assertEquals(listOf(0), midi.snapshot().sustainChannels)
        midi.accept(intArrayOf(0xB0, 64, 0))
        assertTrue(midi.snapshot().sounding.isEmpty())
    }

    @Test fun equalPitchesAndPedalsStayIndependentAcrossChannels() {
        midi.accept(intArrayOf(0x90, 60, 90, 0x91, 60, 90, 0xB0, 64, 127))
        midi.accept(intArrayOf(0x80, 60, 0, 0x81, 60, 0))
        assertEquals(listOf(MidiNote(0, 60)), midi.snapshot().sounding)
        midi.accept(intArrayOf(0xB1, 64, 0))
        assertEquals(listOf(MidiNote(0, 60)), midi.snapshot().sounding)
        midi.accept(intArrayOf(0xB0, 64, 63))
        assertTrue(midi.snapshot().sounding.isEmpty())
    }

    @Test fun pedalReleaseKeepsPhysicallyHeldKeys() {
        midi.accept(intArrayOf(0x90, 60, 90, 64, 90, 0xB0, 64, 127, 0x80, 60, 0))
        midi.accept(intArrayOf(0xB0, 64, 0))
        assertEquals(listOf(MidiNote(0, 64)), midi.snapshot().sounding)
    }

    @Test fun resetDropsPendingMessagesRunningStatusPedalsAndNotes() {
        midi.accept(intArrayOf(0x90, 60, 90, 0xB0, 64, 127, 0x90, 64))
        assertEquals(MidiSnapshot(), midi.reset())
        midi.accept(intArrayOf(90, 67, 90))
        assertEquals(MidiSnapshot(), midi.snapshot())
    }

    @Test fun systemCommonAndSysExDoNotLeakDataIntoNotes() {
        midi.accept(intArrayOf(0x90, 60, 90, 0xF2, 0, 0, 64, 90))
        midi.accept(intArrayOf(0xF0, 60, 0xF8, 90, 64, 90, 0xF7, 67, 90))
        assertEquals(listOf(MidiNote(0, 60)), midi.snapshot().held)
        midi.accept(intArrayOf(0x90, 67, 90))
        assertEquals(2, midi.snapshot().held.size)
    }

    @Test fun newStatusRecoversFromTruncatedMessageAndProgramChangeConsumesOneByte() {
        midi.accept(intArrayOf(0x90, 60, 0xC0, 10, 0x90, 64, 90))
        assertEquals(listOf(MidiNote(0, 64)), midi.snapshot().held)
    }

    @Test fun allNotesOffHonorsSustainButAllSoundOffStopsChannel() {
        midi.accept(intArrayOf(0x90, 60, 90, 0x91, 67, 90, 0xB0, 64, 127, 123, 0))
        assertEquals(listOf(MidiNote(1, 67)), midi.snapshot().held)
        assertEquals(2, midi.snapshot().sounding.size)
        midi.accept(intArrayOf(0xB0, 120, 0))
        assertEquals(listOf(MidiNote(1, 67)), midi.snapshot().sounding)
    }

    @Test fun resetControllersClearsPedalButRetainsHeldKeys() {
        midi.accept(intArrayOf(0x90, 60, 90, 64, 90, 0xB0, 64, 127, 0x80, 60, 0, 0xB0, 121, 0))
        assertEquals(listOf(MidiNote(0, 64)), midi.snapshot().sounding)
        assertTrue(midi.snapshot().sustainChannels.isEmpty())
    }

    @Test fun systemResetClearsAllState() {
        midi.accept(intArrayOf(0x90, 60, 90, 0xB0, 64, 127, 0xFF))
        assertEquals(MidiSnapshot(), midi.snapshot())
    }

    @Test fun invalidByteDoesNotPartiallyChangeState() {
        assertThrows(IllegalArgumentException::class.java) { midi.accept(intArrayOf(0x90, 60, 90, 256)) }
        assertEquals(MidiSnapshot(), midi.snapshot())
    }
}
