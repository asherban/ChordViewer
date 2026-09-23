package com.chordviewer.score

import org.json.JSONObject

data class PracticeEvent(val id: String, val symbol: String, val bar: Int, val offsetTicks: Int)
data class PracticePosition(val bar: Int = 0, val eventIndex: Int = -1, val advanceOnMatch: Boolean = false,
    val complete: Boolean = false, val feedback: String? = null)

/** Music rules shared in behavior and vocabulary with contracts/src/practice.ts. */
class PracticeRules(vocabularyJson: String) {
    private data class Quality(val suffix: String, val intervals: Set<Int>, val optional: Set<Int>)
    private data class Symbol(val root: Int, val suffix: String, val bass: Int?, val quality: Quality)
    private val qualities = JSONObject(vocabularyJson).getJSONArray("entries").let { entries ->
        List(entries.length()) { index -> entries.getJSONObject(index).let { entry ->
            Quality(entry.getString("suffix"), entry.getJSONArray("intervals").let { values -> (0 until values.length()).map { values.getInt(it) }.toSet() },
                entry.optJSONArray("optionalIntervals")?.let { values -> (0 until values.length()).map { values.getInt(it) }.toSet() } ?: emptySet())
        } }
    }
    private val flat = listOf("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")
    private val sharp = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
    private val natural = mapOf("C" to 0, "D" to 2, "E" to 4, "F" to 5, "G" to 7, "A" to 9, "B" to 11)
    private fun mod(value: Int) = ((value % 12) + 12) % 12
    private fun pitchClass(text: String): Int? {
        val match = Regex("^([A-G])([#b]?)$").matchEntire(text) ?: return null
        return mod(natural.getValue(match.groupValues[1]) + when (match.groupValues[2]) { "#" -> 1; "b" -> -1; else -> 0 })
    }
    private fun parse(text: String): Symbol? {
        val match = Regex("^([A-G][#b]?)(.*)$").matchEntire(text) ?: return null
        val root = pitchClass(match.groupValues[1]) ?: return null
        var suffix = match.groupValues[2]
        var bass: Int? = null
        if (suffix != "6/9") Regex("/([A-G][#b]?)$").find(suffix)?.let {
            bass = pitchClass(it.groupValues[1]) ?: return null
            suffix = suffix.dropLast(it.value.length)
        }
        return qualities.find { it.suffix == suffix }?.let { Symbol(root, suffix, bass, it) }
    }
    fun supported(symbol: String) = parse(symbol) != null
    fun matches(symbol: String, notes: List<Int>): Boolean {
        val target = parse(symbol) ?: return false
        if (notes.isEmpty() || notes.any { it !in 0..127 }) return false
        if (target.bass != null && notes.min() % 12 != target.bass) return false
        val pitches = notes.map { it % 12 }.toSet()
        return pitches.all { it == target.bass || mod(it - target.root) in target.quality.intervals } &&
            target.quality.intervals.all { it in target.quality.optional || mod(target.root + it) in pitches }
    }
    fun events(score: LeadSheet) = score.measures.flatMapIndexed { bar, measure -> measure.chords.map { PracticeEvent(it.id, it.symbol, bar, it.offsetTicks) } }
    fun firstInBar(score: LeadSheet, bar: Int) = events(score).indexOfFirst { it.bar == bar }
    fun transpose(score: LeadSheet, shift: Int): LeadSheet {
        require(shift in -12..12) { "Choose a transposition from −12 to +12 semitones." }
        if (shift == 0) return score
        val mode = score.keySignature.endsWith("m")
        val root = pitchClass(score.keySignature.removeSuffix("m")) ?: error("Unsupported key")
        val key = SUPPORTED_KEYS.find { it.endsWith("m") == mode && pitchClass(it.removeSuffix("m")) == mod(root + shift) }
            ?: throw IllegalArgumentException("The transposed key is outside supported notation.")
        fun spell(pc: Int) = (if (key.contains("b") || key in listOf("F", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm")) flat else sharp)[mod(pc)]
        val measures = score.measures.map { measure -> measure.copy(
            chords = measure.chords.map { chord ->
                val symbol = parse(chord.symbol) ?: throw IllegalArgumentException("Cannot transpose unsupported chord “${chord.symbol}”.")
                chord.copy(symbol = spell(symbol.root + shift) + symbol.suffix + (symbol.bass?.let { "/" + spell(it + shift) } ?: ""))
            },
            melody = measure.melody.map { event -> event.copy(pitch = event.pitch?.let { pitch ->
                val midi = (pitch.octave + 1) * 12 + natural.getValue(pitch.step) + pitch.alter + shift
                require(midi in 48..95) { "A melody note would leave the supported C3–B6 range." }
                midiToPitch(midi, key)
            }) },
        ) }
        return score.copy(schemaVersion = 2, keySignature = key, measures = measures).also { LeadSheetWriter.write(it) }
    }
}

class PracticeSession(private val rules: PracticeRules, score: LeadSheet) {
    var score: LeadSheet = score; private set
    var position = PracticePosition(eventIndex = rules.firstInBar(score, 0)); private set
    fun setScore(next: LeadSheet) {
        val id = rules.events(score).getOrNull(position.eventIndex)?.id
        score = next
        val events = rules.events(next)
        val retained = events.indexOfFirst { it.id == id }.takeIf { it >= 0 }
        val bar = position.bar.coerceIn(0, next.measures.lastIndex)
        position = position.copy(bar = retained?.let { events[it].bar } ?: bar,
            eventIndex = retained ?: rules.firstInBar(next, bar), complete = false, feedback = null)
    }
    fun advance(onMatch: Boolean) { position = position.copy(advanceOnMatch = onMatch, complete = false, feedback = null) }
    fun selectBar(value: Int) {
        val bar = value.coerceIn(0, score.measures.lastIndex)
        position = position.copy(bar = bar, eventIndex = rules.firstInBar(score, bar), complete = false, feedback = null)
    }
    fun selectEvent(index: Int) {
        val event = rules.events(score).getOrNull(index) ?: return
        position = position.copy(bar = event.bar, eventIndex = index, complete = false, feedback = null)
    }
    fun resetGesture() { position = position.copy(feedback = null) }
    fun receive(notes: List<Int>) {
        if (!position.advanceOnMatch || position.complete) return
        val events = rules.events(score)
        val target = events.getOrNull(position.eventIndex) ?: return
        if (!rules.supported(target.symbol)) { position = position.copy(feedback = "This symbol needs manual advance."); return }
        if (!rules.matches(target.symbol, notes)) { position = position.copy(feedback = "Last gesture did not match."); return }
        val next = events.getOrNull(position.eventIndex + 1)
        position = if (next == null) position.copy(complete = true, feedback = "Complete. Choose Restart or another bar.")
            else position.copy(bar = next.bar, eventIndex = position.eventIndex + 1, feedback = "Last gesture matched. Next target is shown.")
    }
}
