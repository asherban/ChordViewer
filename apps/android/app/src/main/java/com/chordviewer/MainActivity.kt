package com.chordviewer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF087F6D))) {
                var snapshot by remember { mutableStateOf(MidiSnapshot()) }
                Scaffold { insets ->
                    Column(
                        modifier = Modifier.fillMaxSize().padding(insets)
                            .verticalScroll(rememberScrollState()).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        Text("ChordViewer", style = MaterialTheme.typography.headlineLarge)
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
                        Text("Local development diagnostic. Sheet creation and practice are upcoming milestones.")
                    }
                }
            }
        }
    }
}

private fun List<MidiNote>.display() = if (isEmpty()) "None" else joinToString { "${it.name} (ch ${it.channel + 1})" }
