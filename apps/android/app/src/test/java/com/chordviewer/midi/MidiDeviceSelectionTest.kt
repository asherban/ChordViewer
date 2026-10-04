package com.chordviewer.midi

import org.junit.Assert.*
import org.junit.Test

class MidiDeviceSelectionTest {
    @Test fun firstAttachmentConnectsWithoutAnySavedChoice() {
        val selection = MidiDeviceSelection()
        assertNull(selection.update(emptyList()))
        assertEquals("piano", selection.update(listOf("piano")))
        assertEquals("piano", selection.update(listOf("computer", "piano")))
    }

    @Test fun severalDevicesAtStartupUseTheFirstAndAllowChoosingAnother() {
        val selection = MidiDeviceSelection()
        assertEquals("piano", selection.update(listOf("piano", "computer")))
        assertTrue(selection.select("computer"))
        assertEquals("computer", selection.update(listOf("piano", "computer", "keyboard")))
    }

    @Test fun enumerationOrderAndUnrelatedRemovalNeverOverrideTheUser() {
        val selection = MidiDeviceSelection()
        selection.update(listOf("piano", "computer", "keyboard"))
        selection.select("computer")
        assertEquals("computer", selection.update(listOf("keyboard", "computer", "piano")))
        assertEquals("computer", selection.update(listOf("computer", "piano")))
        // Foreground rediscovery also preserves the active attachment.
        assertEquals("computer", selection.update(listOf("piano", "computer")))
    }

    @Test fun removingTheActiveDeviceUsesTheEarliestRemainingAttachment() {
        val selection = MidiDeviceSelection()
        selection.update(listOf("piano"))
        selection.update(listOf("computer", "piano"))
        selection.update(listOf("new-keyboard", "piano", "computer"))
        assertEquals("computer", selection.update(listOf("new-keyboard", "computer")))
        assertEquals("new-keyboard", selection.update(listOf("new-keyboard")))
        assertNull(selection.update(emptyList()))
    }

    @Test fun reattachedDeviceDoesNotStealInputFromTheFallback() {
        val selection = MidiDeviceSelection()
        selection.update(listOf("piano-attachment-1", "computer"))
        assertEquals("computer", selection.update(listOf("computer")))
        assertEquals("computer", selection.update(listOf("piano-attachment-2", "computer")))
        assertTrue(selection.select("piano-attachment-2"))
        assertEquals("piano-attachment-2", selection.selectedId)
    }

    @Test fun stalePickerChoiceCannotSelectARemovedDevice() {
        val selection = MidiDeviceSelection()
        selection.update(listOf("piano", "computer"))
        selection.update(listOf("computer"))
        assertFalse(selection.select("piano"))
        assertEquals("computer", selection.selectedId)
    }
}
