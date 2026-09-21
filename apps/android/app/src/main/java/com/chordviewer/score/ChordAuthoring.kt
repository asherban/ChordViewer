package com.chordviewer.score

import java.util.UUID

val CHORD_DURATIONS = listOf(240, 480, 720, 960, 1440, 1920)
fun chordDurationLabel(ticks: Int, measureTicks: Int = BAR_TICKS) = if (ticks == measureTicks) "Whole bar" else when (ticks) {
    240 -> "⅛"; 480 -> "¼"; 720 -> "Dotted ¼"; 960 -> "½"; 1440 -> "Dotted ½"; 1920 -> "Whole note"; else -> "${ticks / 480.0} quarter notes"
}
data class ScorePosition(val measureIndex: Int = 0, val offsetTicks: Int = 0) {
    val label get() = "Bar ${measureIndex + 1} · beat ${1 + offsetTicks / 480}${if (offsetTicks % 480 == 240) ".5" else ""}"
    fun advance(duration: Int, measureTicks: Int = BAR_TICKS): ScorePosition = if (offsetTicks + duration == measureTicks) ScorePosition(measureIndex + 1) else copy(offsetTicks = offsetTicks + duration)
}
data class ChordMutation(val score: LeadSheet, val position: ScorePosition, val eventId: String)
object ChordEdits {
    fun find(score: LeadSheet, id: String): Pair<ChordEvent, ScorePosition>? = score.measures.withIndex().firstNotNullOfOrNull { (index, measure) ->
        measure.chords.firstOrNull { it.id == id }?.let { it to ScorePosition(index, it.offsetTicks) }
    }
    fun insert(score: LeadSheet, position: ScorePosition, duration: Int, symbol: String): ChordMutation = write(score, position, duration, symbol, null)
    fun replace(score: LeadSheet, id: String, duration: Int, symbol: String): ChordMutation {
        val target = requireNotNull(find(score, id)) { "Select an existing chord to replace." }
        return write(score, target.second, duration, symbol, id)
    }
    fun delete(score: LeadSheet, id: String): LeadSheet {
        LeadSheetWriter.write(score)
        requireNotNull(find(score, id)) { "Select an existing chord to delete." }
        return score.copy(measures = score.measures.map { it.copy(chords = it.chords.filterNot { chord -> chord.id == id }) })
    }
    private fun write(score: LeadSheet, position: ScorePosition, duration: Int, symbol: String, replaceId: String?): ChordMutation {
        LeadSheetWriter.write(score)
        val text = symbol.trim()
        require(text == symbol && text.codePointCount(0, text.length) in 1..32 && !Regex("[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Zl}\\p{Zp}]").containsMatchIn(text)) { "Enter a chord symbol of 1–32 printable characters." }
        require(duration in CHORD_DURATIONS || duration == score.measureTicks) { "Choose a supported chord duration or the whole bar." }
        require(position.measureIndex in 0..score.measures.size && position.measureIndex < 256) { "This sheet has reached its 256-bar limit." }
        require(position.offsetTicks in 0 until score.measureTicks) { "Choose a position inside a bar." }
        require(position.offsetTicks + duration <= score.measureTicks) { "The duration crosses the barline. Choose a shorter duration or the next bar." }
        val measure = score.measures.getOrNull(position.measureIndex) ?: ScoreMeasure("bar_${UUID.randomUUID()}", emptyList(), emptyList())
        require(measure.chords.none { it.id != replaceId && it.offsetTicks < position.offsetTicks + duration && it.offsetTicks + it.durationTicks > position.offsetTicks }) {
            "A chord already occupies this time. Select it to change or delete it, or choose an empty position."
        }
        require(replaceId != null || measure.chords.size < 64) { "This bar has reached its chord limit." }
        val id = replaceId ?: "chord_${UUID.randomUUID()}"
        val changed = measure.copy(chords = (measure.chords.filterNot { it.id == replaceId } + ChordEvent(id, position.offsetTicks, duration, text)).sortedBy { it.offsetTicks })
        val measures = score.measures.toMutableList()
        if (position.measureIndex == measures.size) measures.add(changed) else measures[position.measureIndex] = changed
        val result = score.copy(measures = measures).also { LeadSheetWriter.write(it) }
        return ChordMutation(result, position.advance(duration, score.measureTicks), id)
    }
}


