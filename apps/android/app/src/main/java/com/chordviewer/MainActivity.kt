package com.chordviewer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.chordviewer.midi.MidiNote
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.score.LeadSheetPreview
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chordviewer.library.LibraryScreen
import com.chordviewer.library.LibraryViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val library = ViewModelProvider(this)[LibraryViewModel::class.java]
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF087F6D))) {
                var snapshot by remember { mutableStateOf(MidiSnapshot()) }
                var showTools by remember { mutableStateOf(intent.hasExtra("chordviewer.midi.token")) }
                var showScore by remember { mutableStateOf(false) }
                val libraryState by library.state.collectAsStateWithLifecycle()
                Scaffold { insets ->
                    Column(
                        modifier = Modifier.fillMaxSize().padding(insets)
                            .verticalScroll(rememberScrollState()).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        Text("ChordViewer", style = MaterialTheme.typography.headlineLarge)
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedButton(onClick = { showTools = false }) { Text("Library") }
                            OutlinedButton(onClick = { showTools = true }) { Text("MIDI monitor") }
                        }
                        if (!showTools) LibraryScreen(libraryState, library)
                        else {
                        OutlinedButton(onClick = { showScore = !showScore }) {
                            Text(if (showScore) "Hide score sample" else "Show score sample")
                        }
                        if (showScore) LeadSheetPreview()
                        Text("MIDI input monitor", style = MaterialTheme.typography.titleLarge)
                        MidiInputControls(intent) { snapshot = it }
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("Held notes", style = MaterialTheme.typography.labelLarge)
                                Text(snapshot.held.display(), style = MaterialTheme.typography.headlineMedium)
                                Text("Sounding notes", style = MaterialTheme.typography.labelLarge)
                                Text(snapshot.sounding.display(), style = MaterialTheme.typography.titleLarge)
                                val channels = snapshot.sustainChannels.joinToString { "${it + 1}" }
                                Text("Sustain: ${if (channels.isEmpty()) "Off" else "On · channel $channels"}")
                                Text("MIDI messages: ${snapshot.messagesReceived}")
                            }
                        }
                        Text("Local MIDI diagnostic. Automatic note and chord entry is planned for the next milestone.")
                        }
                    }
                }
            }
        }
    }
}

private fun List<MidiNote>.display() = if (isEmpty()) "None" else joinToString { "${it.name} (ch ${it.channel + 1})" }
