package com.chordviewer.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

val CanvasColor = Color(0xFFF6F7F3)
val PaperColor = Color(0xFFFFFEFB)
val InkColor = Color(0xFF18332F)
val MutedColor = Color(0xFF697A73)
val AccentColor = Color(0xFF176F5B)
val SageColor = Color(0xFFE6EEE7)
val BorderColor = Color(0xFFDCE3D8)

@Composable
fun ChordViewerTheme(content: @Composable () -> Unit) {
    val base = Typography()
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = AccentColor, onPrimary = PaperColor, primaryContainer = SageColor,
            onPrimaryContainer = InkColor, secondary = MutedColor, secondaryContainer = SageColor,
            onSecondaryContainer = InkColor, background = CanvasColor, onBackground = InkColor,
            surface = PaperColor, onSurface = InkColor, surfaceVariant = SageColor,
            surfaceContainer = PaperColor, surfaceContainerLow = PaperColor,
            surfaceContainerHigh = PaperColor, surfaceContainerHighest = SageColor,
            onSurfaceVariant = MutedColor, outline = BorderColor, outlineVariant = BorderColor,
        ),
        typography = base.copy(
            headlineLarge = base.headlineLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
            headlineMedium = base.headlineMedium.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
            headlineSmall = base.headlineSmall.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
            titleLarge = base.titleLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
        ),
        shapes = Shapes(small = RoundedCornerShape(8.dp), medium = RoundedCornerShape(12.dp), large = RoundedCornerShape(16.dp)),
        content = content,
    )
}
