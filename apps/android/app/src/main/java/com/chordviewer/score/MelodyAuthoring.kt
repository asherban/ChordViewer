package com.chordviewer.score

import java.util.UUID

val MELODY_DURATIONS = listOf(ScoreDuration(1, 0), ScoreDuration(1, 1), ScoreDuration(2, 0), ScoreDuration(2, 1),
    ScoreDuration(4, 0), ScoreDuration(4, 1), ScoreDuration(8, 0), ScoreDuration(8, 1), ScoreDuration(16, 0), ScoreDuration(16, 1))
data class MelodySpec(val duration: ScoreDuration, val pitch: ScorePitch? = null)
data class MelodyMutation(val score: LeadSheet, val position: ScorePosition, val eventId: String)
class MelodyEntryException(val code: String, message: String) : IllegalArgumentException(message)

fun midiToPitch(midi: Int, key: String = "C"): ScorePitch {
    if (midi !in 48..95) throw MelodyEntryException("pitch", "Melody entry supports C3 through B6. Play a note in that range or change its octave.")
    val definition = KEY_SIGNATURES[key] ?: throw MelodyEntryException("pitch", "Choose a supported major or minor key.")
    val naturals = linkedMapOf("C" to 0, "D" to 2, "E" to 4, "F" to 5, "G" to 7, "A" to 9, "B" to 11)
    val alterations = keyAccidentals(key)
    naturals.forEach { (step, natural) ->
        val alter = alterations.getValue(step)
        val value = midi - natural - alter
        val octave = value / 12 - 1
        if (value % 12 == 0 && octave in 3..6) return ScorePitch(step, alter, octave)
    }
    val step = (if (definition.fifths < 0) "CDDEEFGGAABB" else "CCDDEFFGGAAB")[midi % 12].toString()
    return ScorePitch(step, midi % 12 - naturals.getValue(step), midi / 12 - 1)
}

object MelodyEdits {
    fun find(score: LeadSheet, id: String): Pair<MelodyEvent, ScorePosition>? = score.measures.withIndex().firstNotNullOfOrNull { (index, bar) ->
        bar.melody.firstOrNull { it.id == id }?.let { it to ScorePosition(index, it.offsetTicks) }
    }
    private fun target(score: LeadSheet, id: String) = find(score, id)
        ?: throw MelodyEntryException("missing", "This melody note or rest no longer exists. Select another position.")
    private fun validate(spec: MelodySpec) {
        if (spec.duration.denominator !in listOf(1, 2, 4, 8, 16) || spec.duration.dots !in 0..1)
            throw MelodyEntryException("duration", "Choose a whole, half, quarter, eighth or sixteenth note, with at most one dot.")
        spec.pitch?.let {
            if (it.step !in listOf("C", "D", "E", "F", "G", "A", "B") || it.alter !in -1..1 || it.octave !in 3..6)
                throw MelodyEntryException("pitch", "Choose a pitch from C3 through B6, with a natural, sharp or flat.")
        }
    }
    private fun checkSpace(score: LeadSheet, position: ScorePosition, ticks: Int, replacedId: String? = null) {
        if (position.measureIndex !in 0..score.measures.size || position.offsetTicks !in 0 until score.measureTicks)
            throw MelodyEntryException("position", "Select a position in the sheet or its next bar.")
        if (position.offsetTicks + ticks > score.measureTicks)
            throw MelodyEntryException("barline", "This duration crosses the barline. Choose a shorter duration or another position.")
        if (score.measures.getOrNull(position.measureIndex)?.melody?.any {
            it.id != replacedId && it.offsetTicks < position.offsetTicks + ticks && it.offsetTicks + it.duration.ticks > position.offsetTicks
        } == true) throw MelodyEntryException("occupied", "A melody note or rest occupies this time. Select it to replace it, or choose an empty position.")
    }

    fun insert(score: LeadSheet, position: ScorePosition, spec: MelodySpec, idFactory: () -> String = { "event_${UUID.randomUUID()}" }): MelodyMutation {
        LeadSheetWriter.write(score); validate(spec)
        checkSpace(score, position, spec.duration.ticks)
        if (position.measureIndex == score.measures.size && score.measures.size >= 256)
            throw MelodyEntryException("limit", "This sheet has reached the 256-bar limit.")
        if ((score.measures.getOrNull(position.measureIndex)?.melody?.size ?: 0) >= 64)
            throw MelodyEntryException("limit", "This bar has reached its 64 melody-event limit.")
        val used = (listOf(score.id) + score.measures.flatMap { listOf(it.id) + it.chords.map { chord -> chord.id } + it.melody.map { event -> event.id } }).toMutableSet()
        fun newId(): String {
            val id = idFactory()
            if (!id.matches(Regex("[A-Za-z0-9_-]{1,64}")) || !used.add(id))
                throw MelodyEntryException("id", "A new melody event or bar must have a unique valid ID.")
            return id
        }
        val id = newId()
        val event = MelodyEvent(id, position.offsetTicks, spec.duration, spec.pitch)
        val measures = score.measures.toMutableList()
        if (position.measureIndex == measures.size) measures.add(ScoreMeasure(newId(), emptyList(), listOf(event)))
        else measures[position.measureIndex] = measures[position.measureIndex].let { it.copy(melody = (it.melody + event).sortedBy { note -> note.offsetTicks }) }
        val result = score.copy(measures = measures).also { LeadSheetWriter.write(it) }
        return MelodyMutation(result, position.advance(spec.duration.ticks, score.measureTicks), id)
    }

    fun replace(score: LeadSheet, id: String, spec: MelodySpec): MelodyMutation {
        LeadSheetWriter.write(score); validate(spec)
        val (original, position) = target(score, id)
        checkSpace(score, position, spec.duration.ticks, id)
        val event = MelodyEvent(id, position.offsetTicks, spec.duration, spec.pitch, spec.pitch != null && original.tieToNext)
        val changed = score.copy(measures = score.measures.mapIndexed { index, bar ->
            if (index != position.measureIndex) bar else bar.copy(melody = bar.melody.map { if (it.id == id) event else it })
        })
        val result = removeInvalidMelodyTies(changed).also { LeadSheetWriter.write(it) }
        return MelodyMutation(result, position.advance(spec.duration.ticks, score.measureTicks), id)
    }

    /** A deletion leaves an equivalent rest, keeping all later timing and event IDs intact. */
    fun delete(score: LeadSheet, id: String): LeadSheet {
        LeadSheetWriter.write(score)
        return replace(score, id, MelodySpec(target(score, id).first.duration)).score
    }

    fun setTie(score: LeadSheet, id: String, enabled: Boolean): LeadSheet {
        LeadSheetWriter.write(score)
        val (event, position) = target(score, id)
        if (enabled) {
            val voice = score.measures.flatMapIndexed { index, bar -> bar.melody.map { index * score.measureTicks + it.offsetTicks to it } }
            val index = voice.indexOfFirst { it.second.id == id }
            val next = voice.getOrNull(index + 1)
            if (event.pitch == null || next == null || next.second.pitch != event.pitch || next.first != voice[index].first + event.duration.ticks)
                throw MelodyEntryException("tie", "A tie needs an immediately following note with the same pitch spelling. Add or correct that note first.")
        }
        return score.copy(measures = score.measures.mapIndexed { index, bar -> if (index != position.measureIndex) bar else
            bar.copy(melody = bar.melody.map { if (it.id == id && it.pitch != null) it.copy(tieToNext = enabled) else it })
        }).also { LeadSheetWriter.write(it) }
    }
}
