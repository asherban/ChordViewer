package com.chordviewer.library

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.chordviewer.MidiInputState
import com.chordviewer.R
import com.chordviewer.ui.*

internal fun Modifier.midiConnectionSemantics(midi: MidiInputState) = semantics {
    val device = midi.devices.firstOrNull { it.id == midi.selectedId }
    contentDescription = buildString {
        append(if (midi.connected) "MIDI connected" else "MIDI disconnected")
        if (midi.connected && device != null) append(" · ${device.label}")
        append(" · ${midi.devices.size} ${if (midi.devices.size == 1) "device" else "devices"}")
        if (!midi.connected && midi.devices.isNotEmpty()) append(" · ${midi.status}")
    }
}

@Composable
internal fun MidiConnectionIcon(midi: MidiInputState) {
    val color = if (midi.connected) AccentColor else MutedColor
    // NavigationRailItem clears its icon semantics when a label is present; describe the control instead.
    BadgedBox(modifier = Modifier.clearAndSetSemantics {}, badge = {
        if (midi.devices.size > 1) Badge(containerColor = AccentColor, contentColor = PaperColor) {
            Text(midi.devices.size.toString())
        }
    }) {
        Box(Modifier.size(28.dp)) {
            Icon(painterResource(R.drawable.ic_piano), contentDescription = null,
                modifier = Modifier.size(24.dp).align(Alignment.CenterStart), tint = color)
            Canvas(Modifier.size(10.dp).align(Alignment.BottomEnd)) {
                drawCircle(PaperColor)
                drawCircle(color, radius = size.minDimension * 0.38f)
                if (!midi.connected) drawLine(PaperColor,
                    Offset(size.width * 0.27f, size.height / 2), Offset(size.width * 0.73f, size.height / 2),
                    strokeWidth = 1.dp.toPx())
            }
        }
    }
}

@Composable
internal fun MidiDevicePicker(midi: MidiInputState, dismiss: () -> Unit) {
    Dialog(onDismissRequest = dismiss) {
        Surface(Modifier.widthIn(max = 480.dp).fillMaxWidth(), color = PaperColor,
            shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
            Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("MIDI device", Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall)
                    IconButton(onClick = dismiss) { Icon(Icons.Default.Close, contentDescription = "Close MIDI device picker") }
                }
                Text("Choose the device to use.", color = MutedColor)
                Surface(shape = MaterialTheme.shapes.medium, border = BorderStroke(1.dp, BorderColor), color = PaperColor) {
                    Column(Modifier.selectableGroup()) {
                        midi.devices.forEachIndexed { index, device ->
                            if (index > 0) HorizontalDivider(color = BorderColor)
                            val selected = device.id == midi.selectedId
                            Row(Modifier.fillMaxWidth().selectable(selected = selected, role = Role.RadioButton,
                                onClick = { midi.select(device.id); dismiss() }).padding(16.dp).heightIn(min = 56.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                Icon(painterResource(R.drawable.ic_piano), contentDescription = null, tint = AccentColor,
                                    modifier = Modifier.size(28.dp))
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(device.label, style = MaterialTheme.typography.titleMedium)
                                    Text(if (selected) { if (midi.connected) "In use" else midi.status } else "Available",
                                        style = MaterialTheme.typography.bodySmall, color = MutedColor)
                                }
                                RadioButton(selected = selected, onClick = null)
                            }
                        }
                    }
                }
                Text("The first detected device connects automatically.", style = MaterialTheme.typography.bodySmall, color = MutedColor)
            }
        }
    }
}
