package com.chordviewer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import com.chordviewer.library.LibraryScreen
import com.chordviewer.library.LibraryViewModel
import com.chordviewer.library.FileRecoveryStore
import java.io.File
import com.chordviewer.ui.ChordViewerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val library = ViewModelProvider(this)[LibraryViewModel::class.java]
        library.configureRecovery(FileRecoveryStore(File(noBackupFilesDir, "drafts")))
        assets.open("chord-vocabulary-v1.json").bufferedReader().use { library.configureChordVocabulary(it.readText()) }
        setContent {
            ChordViewerTheme {
                // The shell owns MIDI. Navigation, metadata and dialogs never own its lifetime.
                val midi = rememberMidiInput(intent, library::onMidiEvent)
                val state by library.state.collectAsStateWithLifecycle()
                LibraryScreen(state, library, midi)
            }
        }
    }
}
