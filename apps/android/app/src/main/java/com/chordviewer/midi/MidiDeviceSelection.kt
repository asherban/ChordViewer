package com.chordviewer.midi

import androidx.lifecycle.ViewModel

/** Attachment-local selection: keep the current device until it leaves or the user chooses another. */
internal class MidiDeviceSelection : ViewModel() {
    private var detected = emptyList<String>()
    var selectedId: String? = null
        private set

    fun update(available: List<String>): String? {
        detected = detected.filter { it in available } + available.distinct().filter { it !in detected }
        if (selectedId !in detected) selectedId = detected.firstOrNull()
        return selectedId
    }

    fun select(id: String): Boolean {
        if (id !in detected) return false
        selectedId = id
        return true
    }
}
