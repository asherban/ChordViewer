package com.chordviewer.library

import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.midi.MidiInputEvent

/** Test APK only: exercises musical product events, without claiming transport or live-card coverage. */
internal class MidiProductFixture(private val model: LibraryViewModel) {
    fun connect() = event(MidiInputEvent.Reset(true, "Product test input connected. Entry paused."))
    fun disconnect() = event(MidiInputEvent.Reset(false, "Product test input disconnected. Entry paused."))
    fun bytes(vararg data: Int) = event(MidiInputEvent.Bytes(data))
    fun hold(vararg notes: Int) { notes.forEach { bytes(0x90, it, 96) } }
    fun release(vararg notes: Int) { notes.forEach { bytes(0x80, it, 0) } }
    fun chord(vararg notes: Int) { hold(*notes); release(*notes) }

    private fun event(value: MidiInputEvent) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync { model.onMidiEvent(value) }
    }
}
