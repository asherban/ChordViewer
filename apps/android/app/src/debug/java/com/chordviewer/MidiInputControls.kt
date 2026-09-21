package com.chordviewer

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.chordviewer.midi.DebugMidiRelay
import com.chordviewer.midi.MidiSnapshot
import com.chordviewer.midi.MidiInputEvent

private const val TOKEN_EXTRA = "chordviewer.midi.token"

@Composable
fun rememberMidiInput(initialIntent: Intent, onEvent: (MidiInputEvent) -> Unit = {}): MidiInputState {
    val initialToken = remember {
        initialIntent.getStringExtra(TOKEN_EXTRA).orEmpty().also { initialIntent.removeExtra(TOKEN_EXTRA) }
    }
    var token by remember { mutableStateOf(initialToken) }
    var status by remember { mutableStateOf("Disconnected") }
    var connected by remember { mutableStateOf(false) }
    var snapshot by remember { mutableStateOf(MidiSnapshot()) }
    val relay = remember {
        DebugMidiRelay(onInput = onEvent) { update ->
            status = update.status
            connected = update.connected
            snapshot = update.snapshot
        }
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(relay, lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) relay.disconnect()
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            relay.disconnect()
        }
    }
    LaunchedEffect(relay) {
        if (initialToken.matches(Regex("[a-fA-F0-9]{64}"))) relay.connect(initialToken)
    }
    return MidiInputState(snapshot, status, connected, relay::disconnect) { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Debug input · LoopBe1 bridge")
        Text(status)
        OutlinedTextField(
            value = token,
            onValueChange = { token = it.filterNot(Char::isWhitespace).take(64) },
            label = { Text("Bridge session token") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            supportingText = { Text("Session-only token from the local bridge. It is never saved.") },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = { relay.connect(token) },
                enabled = token.matches(Regex("[a-fA-F0-9]{64}")) && !connected,
            ) { Text("Connect") }
            OutlinedButton(onClick = { relay.disconnect() }) { Text("Disconnect / clear") }
        }
    } }
}
