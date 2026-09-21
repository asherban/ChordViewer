package com.chordviewer.score

enum class EntryMode { PAUSED, INSERT, REPLACE }
enum class EntryLane { CHORDS, MELODY }
data class PendingChord(val notes: List<Int>, val position: ScorePosition, val duration: Int, val replaceId: String?)
data class PendingMelody(val pitch: ScorePitch?, val position: ScorePosition, val duration: ScoreDuration, val replaceId: String?)
data class ScoreEditorState(
    val score: LeadSheet,
    val position: ScorePosition = ScorePosition(),
    val chordPosition: ScorePosition = ScorePosition(),
    val melodyPosition: ScorePosition = ScorePosition(),
    val duration: Int = score.measureTicks,
    val lane: EntryLane = EntryLane.CHORDS,
    val melodyDuration: ScoreDuration = ScoreDuration(4, 0),
    val selectedId: String? = null,
    val selectedMelodyId: String? = null,
    val mode: EntryMode = EntryMode.PAUSED,
    val pending: PendingChord? = null,
    val pendingMelody: PendingMelody? = null,
    val alternatives: List<String> = emptyList(),
    val lastInsertedId: String? = null,
    val lastMelodyId: String? = null,
    val message: String? = null,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
)

/** One bounded history spans both score lanes; transport/UI own entry arming separately. */
class ScoreEditor(initial: LeadSheet) {
    var state = ScoreEditorState(initial); private set
    private data class Checkpoint(val score: LeadSheet, val position: ScorePosition, val chordPosition: ScorePosition, val melodyPosition: ScorePosition,
        val lane: EntryLane, val duration: Int, val melodyDuration: ScoreDuration)
    private val undo = ArrayDeque<Checkpoint>()
    private val redo = ArrayDeque<Checkpoint>()
    private fun synced(value: ScoreEditorState) = if (value.lane == EntryLane.CHORDS) value.copy(chordPosition = value.position) else value.copy(melodyPosition = value.position)
    fun update(transform: (ScoreEditorState) -> ScoreEditorState) { state = synced(transform(state)) }
    fun commit(mutation: ChordMutation, alternatives: List<String> = emptyList()) {
        commitScore(mutation.score, mutation.position, "Inserted ${ChordEdits.find(mutation.score, mutation.eventId)?.first?.symbol}.")
        state = state.copy(alternatives = alternatives, lastInsertedId = mutation.eventId)
    }
    fun commit(mutation: MelodyMutation) {
        commitScore(mutation.score, mutation.position, "Melody updated.")
        state = state.copy(lastMelodyId = mutation.eventId)
    }
    fun commitScore(score: LeadSheet, position: ScorePosition = state.position, message: String? = null) {
        remember()
        state = synced(state.copy(score = score, position = position, selectedId = null, selectedMelodyId = null,
            pending = null, pendingMelody = null, alternatives = emptyList(), message = message, canUndo = true, canRedo = false))
    }
    fun delete(id: String) {
        val target = requireNotNull(ChordEdits.find(state.score, id))
        commitScore(ChordEdits.delete(state.score, id), target.second, "Chord deleted. Melody and timing are preserved.")
        state = state.copy(mode = EntryMode.PAUSED, lastInsertedId = null)
    }
    fun undo() = travel(undo, redo)
    fun redo() = travel(redo, undo)
    private fun checkpoint() = Checkpoint(state.score, state.position, state.chordPosition, state.melodyPosition, state.lane, state.duration, state.melodyDuration)
    private fun remember() { undo.addLast(checkpoint()); if (undo.size > 100) undo.removeFirst(); redo.clear() }
    private fun travel(from: ArrayDeque<Checkpoint>, to: ArrayDeque<Checkpoint>) {
        if (from.isEmpty()) return
        to.addLast(checkpoint()); if (to.size > 100) to.removeFirst()
        val checkpoint = from.removeLast()
        state = state.copy(score = checkpoint.score.copy(title = state.score.title), position = checkpoint.position, lane = checkpoint.lane,
            chordPosition = checkpoint.chordPosition, melodyPosition = checkpoint.melodyPosition, duration = checkpoint.duration, melodyDuration = checkpoint.melodyDuration,
            selectedId = null, selectedMelodyId = null, mode = EntryMode.PAUSED, pending = null, pendingMelody = null,
            alternatives = emptyList(), lastInsertedId = null, lastMelodyId = null, message = null, canUndo = undo.isNotEmpty(), canRedo = redo.isNotEmpty())
    }
}
