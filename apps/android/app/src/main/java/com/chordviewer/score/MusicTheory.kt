package com.chordviewer.score

data class KeyDefinition(val fifths: Int, val mode: String)
val KEY_SIGNATURES: Map<String, KeyDefinition> = linkedMapOf(
    "C" to 0, "G" to 1, "D" to 2, "A" to 3, "E" to 4, "B" to 5, "F#" to 6, "C#" to 7,
    "F" to -1, "Bb" to -2, "Eb" to -3, "Ab" to -4, "Db" to -5, "Gb" to -6, "Cb" to -7,
).mapValues { KeyDefinition(it.value, "major") } + linkedMapOf(
    "Am" to 0, "Em" to 1, "Bm" to 2, "F#m" to 3, "C#m" to 4, "G#m" to 5, "D#m" to 6, "A#m" to 7,
    "Dm" to -1, "Gm" to -2, "Cm" to -3, "Fm" to -4, "Bbm" to -5, "Ebm" to -6, "Abm" to -7,
).mapValues { KeyDefinition(it.value, "minor") }
val SUPPORTED_KEYS = KEY_SIGNATURES.keys.toList()
fun keyAccidentals(key: String): Map<String, Int> {
    val fifths = requireNotNull(KEY_SIGNATURES[key]) { "Choose a supported major or minor key." }.fifths
    val alterations = "CDEFGAB".associate { it.toString() to 0 }.toMutableMap()
    (if (fifths < 0) "BEADGCF" else "FCGDAEB").take(kotlin.math.abs(fifths)).forEach {
        alterations[it.toString()] = if (fifths < 0) -1 else 1
    }
    return alterations
}
fun keyLabel(key: String): String {
    val definition = requireNotNull(KEY_SIGNATURES[key]) { "Choose a supported major or minor key." }
    return key.removeSuffix("m").replace("#", "♯").replace("b", "♭") + " " + definition.mode
}

/** Existing ties invalidated by a pitch, duration or meter change are removed, never reassigned. */
internal fun removeInvalidMelodyTies(score: LeadSheet): LeadSheet {
    val voice = score.measures.flatMapIndexed { index, bar -> bar.melody.map { index * score.measureTicks + it.offsetTicks to it } }
    val invalid = voice.mapIndexedNotNull { index, (start, event) ->
        val next = voice.getOrNull(index + 1)
        event.id.takeIf { event.tieToNext && (event.pitch == null || next == null || next.second.pitch != event.pitch || next.first != start + event.duration.ticks) }
    }.toSet()
    if (invalid.isEmpty()) return score
    return score.copy(measures = score.measures.map { bar -> bar.copy(melody = bar.melody.map { if (it.id in invalid) it.copy(tieToNext = false) else it }) })
}

fun changeScoreSettings(score: LeadSheet, keySignature: String, timeSignature: ScoreTimeSignature): LeadSheet {
    LeadSheetWriter.write(score)
    require(keySignature in KEY_SIGNATURES) { "Choose a supported major or minor key." }
    require(timeSignature.numerator in 1..12 && timeSignature.denominator in listOf(2, 4, 8)) { "Choose 1–12 beats and a denominator of 2, 4 or 8." }
    val changed = score.copy(schemaVersion = 2, keySignature = keySignature, timeSignature = timeSignature)
    require(changed.measures.none { bar -> bar.chords.any { it.offsetTicks + it.durationTicks > changed.measureTicks } ||
        bar.melody.any { it.offsetTicks + it.duration.ticks > changed.measureTicks } }) {
        "Existing notes or chords would cross the new barline. Shorten or move them before changing the time signature."
    }
    return removeInvalidMelodyTies(changed).also { LeadSheetWriter.write(it) }
}
