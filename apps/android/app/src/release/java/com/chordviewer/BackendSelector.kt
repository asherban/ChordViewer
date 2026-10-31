package com.chordviewer

import androidx.compose.runtime.Composable
import com.chordviewer.library.LibraryState
import com.chordviewer.library.LibraryViewModel

/** Release has no backend controls, settings reader or switching implementation. */
@Composable
internal fun BackendSelector(state: LibraryState, model: LibraryViewModel, midi: MidiInputState,
    accountDialog: @Composable (@Composable () -> Unit) -> Unit) {
    accountDialog {}
}
