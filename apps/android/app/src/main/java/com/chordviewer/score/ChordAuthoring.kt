package com.chordviewer.score

import java.util.UUID

val CHORD_DURATIONS = listOf(240, 480, 720, 960, 1440, 1920)
fun chordDurationLabel(ticks: Int) = when (ticks) {
    240 -> "⅛"; 480 -> "¼"; 720 -> "Dotted ¼"; 960 -> "½"; 1440 -> "Dotted ½"; else -> "Whole bar"
}
data class ScorePosition(val measureIndex: Int = 0, val offsetTicks: Int = 0) {
    val label get() = "Bar ${measureIndex + 1} · beat ${1 + offsetTicks / 480}${if (offsetTicks % 480 == 240) ".5" else ""}"
    fun advance(duration: Int): ScorePosition = if (offsetTicks + duration == BAR_TICKS) ScorePosition(measureIndex + 1) else copy(offsetTicks = offsetTicks + duration)
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
        requireNotNull(find(score, id)) { "Select an existing chord to delete." }
        return score.copy(measures = score.measures.map { it.copy(chords = it.chords.filterNot { chord -> chord.id == id }) })
    }
    private fun write(score: LeadSheet, position: ScorePosition, duration: Int, symbol: String, replaceId: String?): ChordMutation {
        val text = symbol.trim()
        require(text == symbol && text.codePointCount(0, text.length) in 1..32 && !Regex("[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Zl}\\p{Zp}]").containsMatchIn(text)) { "Enter a chord symbol of 1–32 printable characters." }
        require(duration in CHORD_DURATIONS) { "Choose a supported chord duration." }
        require(position.measureIndex in 0..score.measures.size && position.measureIndex < 256) { "This sheet has reached its 256-bar limit." }
        require(position.offsetTicks in 0 until BAR_TICKS) { "Choose a position inside a bar." }
        require(position.offsetTicks + duration <= BAR_TICKS) { "The duration crosses the barline. Choose a shorter duration or the next bar." }
        val measure = score.measures.getOrNull(position.measureIndex) ?: ScoreMeasure("bar_${UUID.randomUUID()}", emptyList(), emptyList())
        require(measure.chords.none { it.id != replaceId && it.offsetTicks < position.offsetTicks + duration && it.offsetTicks + it.durationTicks > position.offsetTicks }) {
            "A chord already occupies this time. Select it to change or delete it, or choose an empty position."
        }
        require(replaceId != null || measure.chords.size < 64) { "This bar has reached its chord limit." }
        val id = replaceId ?: "chord_${UUID.randomUUID()}"
        val changed = measure.copy(chords = (measure.chords.filterNot { it.id == replaceId } + ChordEvent(id, position.offsetTicks, duration, text)).sortedBy { it.offsetTicks })
        val measures = score.measures.toMutableList()
        if (position.measureIndex == measures.size) measures.add(changed) else measures[position.measureIndex] = changed
        return ChordMutation(score.copy(measures = measures), position.advance(duration), id)
    }
}

enum class EntryMode { PAUSED, INSERT, REPLACE }
data class PendingChord(val notes: List<Int>, val position: ScorePosition, val duration: Int, val replaceId: String?)
data class ChordEditorState(
    val score: LeadSheet,
    val position: ScorePosition = ScorePosition(),
    val duration: Int = BAR_TICKS,
    val selectedId: String? = null,
    val mode: EntryMode = EntryMode.PAUSED,
    val pending: PendingChord? = null,
    val alternatives: List<String> = emptyList(),
    val lastInsertedId: String? = null,
    val message: String? = null,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
)

/** Keeps score and cursor together in bounded history; transport/UI own entry arming separately. */
class ChordEditor(initial: LeadSheet) {
    var state = ChordEditorState(initial); private set
    private data class Checkpoint(val score: LeadSheet, val position: ScorePosition)
    private val undo = ArrayDeque<Checkpoint>()
    private val redo = ArrayDeque<Checkpoint>()
    fun update(transform: (ChordEditorState) -> ChordEditorState) { state = transform(state) }
    fun commit(mutation: ChordMutation, alternatives: List<String> = emptyList()) {
        remember()
        state = state.copy(score = mutation.score, position = mutation.position, selectedId = null, pending = null,
            alternatives = alternatives, lastInsertedId = mutation.eventId, message = "Inserted ${ChordEdits.find(mutation.score, mutation.eventId)?.first?.symbol}.",
            canUndo = true, canRedo = false)
    }
    fun delete(id: String) {
        val target = requireNotNull(ChordEdits.find(state.score, id))
        val result = ChordEdits.delete(state.score, id)
        remember()
        state = state.copy(score = result, position = target.second, selectedId = null, pending = null, mode = EntryMode.PAUSED,
            alternatives = emptyList(), lastInsertedId = null, message = "Chord deleted. Melody and timing are preserved.", canUndo = true, canRedo = false)
    }
    fun undo() = travel(undo, redo)
    fun redo() = travel(redo, undo)
    private fun remember() { undo.addLast(Checkpoint(state.score, state.position)); if (undo.size > 100) undo.removeFirst(); redo.clear() }
    private fun travel(from: ArrayDeque<Checkpoint>, to: ArrayDeque<Checkpoint>) {
        if (from.isEmpty()) return
        to.addLast(Checkpoint(state.score, state.position)); if (to.size > 100) to.removeFirst()
        val checkpoint = from.removeLast()
        state = state.copy(score = checkpoint.score.copy(title = state.score.title), position = checkpoint.position, selectedId = null, mode = EntryMode.PAUSED,
            pending = null, alternatives = emptyList(), lastInsertedId = null, message = null, canUndo = undo.isNotEmpty(), canRedo = redo.isNotEmpty())
    }
}
