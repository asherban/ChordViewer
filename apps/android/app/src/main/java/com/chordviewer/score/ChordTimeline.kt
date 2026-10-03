package com.chordviewer.score

import java.util.UUID

data class LogicalChord(val event: ChordEvent, val fragments: List<ChordEvent>, val start: Int, val ticks: Int, val position: ScorePosition) {
    val ids get() = fragments.map { it.id }
}
/** Harmony edits preserve melody and existing gaps and validate before returning any new score. */
object ChordTimeline {
    fun groups(score: LeadSheet): List<LogicalChord> {
        val values = linkedMapOf<String, LogicalChord>()
        score.measures.forEachIndexed { bar, m -> m.chords.forEach { e ->
            val key = e.logicalId ?: e.id; val old = values[key]
            values[key] = if (old != null) old.copy(fragments = old.fragments + e, ticks = old.ticks + e.durationTicks)
                else LogicalChord(e, listOf(e), bar * score.measureTicks + e.offsetTicks, e.durationTicks, ScorePosition(bar, e.offsetTicks))
        } }
        return values.values.sortedBy { it.start }
    }
    fun find(score: LeadSheet, id: String) = groups(score).firstOrNull { id in it.ids }
    fun next(score: LeadSheet): ScorePosition {
        val end = groups(score).maxOfOrNull { it.start + it.ticks } ?: 0
        return ScorePosition(end / score.measureTicks, end % score.measureTicks)
    }
    fun durations(score: LeadSheet, current: Int? = null) = ((1..score.timeSignature.numerator).map { it * BAR_TICKS / score.timeSignature.denominator } + listOfNotNull(current)).distinct().sorted()
    fun durationLabel(score: LeadSheet, ticks: Int): String {
        if (ticks == score.measureTicks) return "Whole bar"
        val unit = BAR_TICKS / score.timeSignature.denominator; val count = ticks.toDouble() / unit
        val number = if (count == count.toInt().toDouble()) count.toInt().toString() else count.toString()
        val name = when (score.timeSignature.denominator) { 4 -> "beat"; 8 -> "eighth note"; else -> "half note" }
        return "$number $name${if (count == 1.0) "" else "s"}"
    }
    private fun text(symbol: String, definition: ChordDefinition?) {
        require(symbol.isNotEmpty() && symbol.trim() == symbol && symbol.codePointCount(0, symbol.length) <= 512 && !Regex("[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Zl}\\p{Zp}]").containsMatchIn(symbol)) { "Choose a printable chord of at most 512 characters." }
        definition?.let { it.validate(); require(it.symbol == symbol) { "Chord preview does not match its definition." } }
        require(definition != null || ChordDefinition.parse(symbol) != null) { "Choose a supported chord symbol or construct the chord with the tone controls." }
    }
    fun append(score: LeadSheet, symbol: String, ticks: Int, definition: ChordDefinition? = ChordDefinition.parse(symbol)?.takeIf { it.symbol == symbol }, factory: () -> String = { UUID.randomUUID().toString() }): ChordMutation {
        LeadSheetWriter.write(score); text(symbol, definition)
        val p = next(score); val id = factory()
        require(id.matches(Regex("[A-Za-z0-9_-]{1,64}")) && id !in allIds(score)) { "A new chord needs a unique valid ID." }
        val event = ChordEvent(id, p.offsetTicks, ticks, symbol, id, definition)
        val value = LogicalChord(event, listOf(event), p.measureIndex * score.measureTicks + p.offsetTicks, ticks, p)
        val result = rebuild(score, groups(score) + value, factory)
        return ChordMutation(result, next(result), id)
    }
    fun change(score: LeadSheet, id: String, symbol: String, ticks: Int, definition: ChordDefinition? = if (find(score,id)?.event?.symbol == symbol) find(score,id)?.event?.definition else ChordDefinition.parse(symbol)?.takeIf { it.symbol == symbol }, factory: () -> String = { UUID.randomUUID().toString() }): ChordMutation {
        LeadSheetWriter.write(score)
        val selected = requireNotNull(find(score,id)) { "This chord no longer exists." }
        if (symbol != selected.event.symbol || definition != selected.event.definition) text(symbol, definition)
        val delta = ticks - selected.ticks
        val items = groups(score).map { if (it.event.id == selected.event.id) it.copy(ticks = ticks, event = it.event.copy(symbol = symbol, definition = definition)) else it.copy(start = if (it.start > selected.start) it.start + delta else it.start) }
        return ChordMutation(rebuild(score, items, factory), selected.position, selected.event.id)
    }
    fun delete(score: LeadSheet, id: String, factory: () -> String = { UUID.randomUUID().toString() }): LeadSheet {
        LeadSheetWriter.write(score); val selected = requireNotNull(find(score,id)) { "This chord no longer exists." }
        return rebuild(score, groups(score).filter { it.event.id != selected.event.id }.map { it.copy(start = if (it.start > selected.start) it.start - selected.ticks else it.start) }, factory)
    }
    private fun allIds(score: LeadSheet) = listOf(score.id) + score.measures.flatMap { m -> listOf(m.id) + m.chords.map { it.id } + m.melody.map { it.id } }
    private fun rebuild(score: LeadSheet, items: List<LogicalChord>, factory: () -> String): LeadSheet {
        val bar = score.measureTicks; val end = items.maxOfOrNull { it.start.toLong() + it.ticks } ?: 0L
        require(end <= bar.toLong() * 256) { "This sheet has reached its 256-bar limit." }
        require(items.all { it.ticks > 0 && it.start >= 0 }) { "Choose a positive exact duration." }
        val used = allIds(score).toMutableSet()
        fun id(): String { val value = factory(); require(value.matches(Regex("[A-Za-z0-9_-]{1,64}")) && used.add(value)) { "A new event or bar needs a unique valid ID." }; return value }
        val measures = MutableList(maxOf(score.measures.size, ((end + bar - 1) / bar).toInt(), 1)) { i -> (score.measures.getOrNull(i) ?: ScoreMeasure(id(), emptyList(), emptyList())).copy(chords = emptyList()) }
        items.sortedBy { it.start }.forEach { c ->
            var at = c.start; var fragment = 0
            while (at < c.start + c.ticks) {
                val index = at / bar; val until = minOf(c.start + c.ticks, (index + 1) * bar)
                val event = c.event.copy(id = if (fragment == 0) c.event.id else c.fragments.getOrNull(fragment)?.id ?: id(), logicalId = c.event.id, offsetTicks = at % bar, durationTicks = until - at)
                measures[index] = measures[index].copy(chords = measures[index].chords + event)
                at = until; fragment++
            }
        }
        while (measures.size > 1 && measures.last().chords.isEmpty() && measures.last().melody.isEmpty()) measures.removeAt(measures.lastIndex)
        return score.copy(schemaVersion = 3, measures = measures).also { LeadSheetWriter.write(it) }
    }
}
