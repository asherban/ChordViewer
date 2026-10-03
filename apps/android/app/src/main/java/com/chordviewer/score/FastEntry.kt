package com.chordviewer.score

import java.util.UUID

/** Atomic timeline edits shared in behavior with contracts/src/fast-entry.ts. */
object FastEntry {
    /** Interior silence stays. Extra space is reserved only for an active entry or Add bar. */
    fun trimTrailingSilentBars(score: LeadSheet, minimumBars: Int = 1): LeadSheet {
        val lastMusic = score.measures.indexOfLast { it.chords.isNotEmpty() || it.melody.any { event -> event.pitch != null } }
        val count = maxOf(1, minimumBars, lastMusic + 1)
        return if (count >= score.measures.size) score else score.copy(measures = score.measures.take(count))
    }

    data class MelodyGroup(val event: MelodyEvent, val ids: Set<String>, val start: Int, val ticks: Int, val position: ScorePosition)
    fun melodyGroup(score: LeadSheet, eventId: String): MelodyGroup? {
        val events = score.measures.flatMapIndexed { index, bar -> bar.melody.map { it to index * score.measureTicks + it.offsetTicks } }
        var first = events.indexOfFirst { it.first.id == eventId }
        if (first < 0) return null
        fun linked(index: Int): Boolean {
            val a = events.getOrNull(index) ?: return false
            val b = events.getOrNull(index + 1) ?: return false
            return a.first.pitch != null && a.first.tieToNext && a.first.pitch == b.first.pitch && a.second + a.first.duration.ticks == b.second
        }
        while (first > 0 && linked(first - 1)) first--
        var last = first
        while (linked(last)) last++
        val members = events.subList(first, last + 1)
        val start = members.first().second
        return MelodyGroup(members.first().first, members.map { it.first.id }.toSet(), start, members.sumOf { it.first.duration.ticks },
            ScorePosition(start / score.measureTicks, start % score.measureTicks))
    }
    fun nextMelodyPosition(score: LeadSheet): ScorePosition {
        val end = score.measures.flatMapIndexed { index, measure -> measure.melody.map { index * score.measureTicks + it.offsetTicks + it.duration.ticks } }.maxOrNull() ?: 0
        return ScorePosition(end / score.measureTicks, end % score.measureTicks)
    }

    /** Resize the whole tied note; a pitch-only edit preserves its combined duration. */
    fun changeMelodyAndShift(score: LeadSheet, eventId: String, spec: MelodySpec,
        factory: () -> String = { "event_${UUID.randomUUID()}" }, ticks: Int = spec.duration.ticks): MelodyMutation =
        rewriteMelody(score, eventId, spec, ticks, factory)

    fun deleteMelodyAndShift(score: LeadSheet, eventId: String,
        factory: () -> String = { "event_${UUID.randomUUID()}" }): LeadSheet = rewriteMelody(score, eventId, null, 0, factory).score

    private fun rewriteMelody(score: LeadSheet, eventId: String, spec: MelodySpec?, ticks: Int, factory: () -> String): MelodyMutation {
        LeadSheetWriter.write(score)
        require(spec == null || spec.duration in MELODY_DURATIONS) { "Choose a supported note duration." }
        require(ticks >= 0) { "Choose a supported note duration." }
        val id = allocator(score, factory)
        val bar = score.measureTicks
        val selected = requireNotNull(melodyGroup(score, eventId)) { "This note or rest no longer exists." }
        val delta = ticks - selected.ticks
        val shifted = score.measures.flatMapIndexed { index, measure -> measure.melody.map { event ->
            val start = index * bar + event.offsetTicks
            Triple(event, if (start > selected.start) start + delta else start, event.duration.ticks)
        } }.filter { it.first.id !in selected.ids }.toMutableList()
        if (spec != null) shifted += Triple(selected.event.copy(duration = spec.duration, pitch = spec.pitch, tieToNext = false), selected.start, ticks)
        shifted.sortBy { it.second }
        val end = shifted.maxOfOrNull { it.second + it.third } ?: 0
        require((end + bar - 1) / bar <= 256) { "This sheet has reached the 256-bar limit." }
        val measures = MutableList(maxOf(score.measures.size, (end + bar - 1) / bar)) { index ->
            (score.measures.getOrNull(index) ?: ScoreMeasure(id(), emptyList(), emptyList())).copy(melody = emptyList())
        }
        shifted.forEach { (event, start, length) ->
            val until = start + length
            var at = start
            while (at < until) {
                val index = at / bar
                val stop = minOf(until, (index + 1) * bar)
                measures[index] = measures[index].copy(melody = measures[index].melody + parts(event, at % bar, stop - index * bar,
                    if (at == start) event.id else id(), id, stop < until || event.tieToNext))
                at = stop
            }
        }
        return MelodyMutation(removeInvalidMelodyTies(score.copy(measures = measures)).also { LeadSheetWriter.write(it) }, selected.position, selected.event.id)
    }

    fun splitDuration(ticks: Int): List<ScoreDuration> {
        require(ticks in 0..11520 && ticks % 60 == 0) { "This edit leaves a rhythm the score cannot represent. Choose another beat or duration." }
        val parts = arrayOfNulls<List<ScoreDuration>>(ticks / 60 + 1)
        parts[0] = emptyList()
        for (i in 1 until parts.size) for (duration in MELODY_DURATIONS.sortedByDescending { it.ticks }) {
            val before = parts.getOrNull(i - duration.ticks / 60) ?: continue
            if (parts[i] == null || before.size + 1 < parts[i]!!.size) parts[i] = listOf(duration) + before
        }
        return requireNotNull(parts[ticks / 60]) { "This edit leaves a rhythm the score cannot represent. Choose another beat or duration." }
    }
    private fun allocator(score: LeadSheet, factory: () -> String): () -> String {
        val used = (listOf(score.id) + score.measures.flatMap { listOf(it.id) + it.chords.map { e -> e.id } + it.melody.map { e -> e.id } }).toMutableSet()
        return { factory().also { require(it.matches(Regex("[A-Za-z0-9_-]{1,64}")) && used.add(it)) { "A new event or bar must have a unique valid ID." } } }
    }
    private data class Range(val bar: Int, val start: Int, val end: Int) {
        val position get() = ScorePosition(end / bar, end % bar)
        val count get() = (end + bar - 1) / bar
    }
    private fun range(score: LeadSheet, position: ScorePosition, ticks: Int): Range {
        LeadSheetWriter.write(score)
        require(position.measureIndex in 0..score.measures.size && position.offsetTicks in 0 until score.measureTicks && ticks in 1..11520) { "Choose a valid position and duration." }
        val start = position.measureIndex * score.measureTicks + position.offsetTicks
        return Range(score.measureTicks, start, start + ticks).also { require(it.count <= 256) { "This sheet has reached the 256-bar limit." } }
    }
    fun chord(score: LeadSheet, position: ScorePosition, symbol: String, ticks: Int, replaceId: String? = null,
        factory: () -> String = { "event_${UUID.randomUUID()}" }): ChordMutation {
        val r = range(score, position, ticks)
        val id = allocator(score, factory)
        require(symbol.isNotEmpty() && symbol.trim() == symbol && symbol.codePointCount(0, symbol.length) <= 32 &&
            symbol.codePoints().noneMatch { Character.getType(it) in listOf(Character.CONTROL.toInt(), Character.FORMAT.toInt(), Character.SURROGATE.toInt(), Character.LINE_SEPARATOR.toInt(), Character.PARAGRAPH_SEPARATOR.toInt()) }) { "Enter a printable chord symbol of 1 to 32 characters." }
        require(replaceId == null || ChordEdits.find(score, replaceId) != null) { "This chord no longer exists." }
        val eventId = replaceId ?: id()
        val measures = List(maxOf(score.measures.size, r.count)) { index ->
            val old = score.measures.getOrNull(index) ?: ScoreMeasure(id(), emptyList(), emptyList())
            val start = maxOf(0, r.start - index * r.bar)
            val end = minOf(r.bar, r.end - index * r.bar)
            var chords = old.chords.filter { it.id != replaceId }
            if (start < end) {
                chords = chords.flatMap { e ->
                    val right = e.offsetTicks + e.durationTicks
                    if (right <= start || e.offsetTicks >= end) listOf(e) else {
                        val left = if (e.offsetTicks < start) listOf(e.copy(durationTicks = start - e.offsetTicks)) else emptyList()
                        left + if (right > end) listOf(e.copy(id = if (left.isEmpty()) e.id else id(), offsetTicks = end, durationTicks = right - end)) else emptyList()
                    }
                } + ChordEvent(if (index == position.measureIndex) eventId else id(), start, end - start, symbol)
            }
            old.copy(chords = chords.sortedBy { it.offsetTicks })
        }
        return ChordMutation(score.copy(measures = measures).also { LeadSheetWriter.write(it) }, r.position, eventId)
    }
    private fun parts(event: MelodyEvent, start: Int, end: Int, firstId: String, id: () -> String, tieAfter: Boolean): List<MelodyEvent> {
        val durations = splitDuration(end - start)
        var offset = start
        return durations.mapIndexed { index, duration ->
            MelodyEvent(if (index == 0) firstId else id(), offset, duration, event.pitch,
                event.pitch != null && (index < durations.lastIndex || tieAfter)).also { offset += duration.ticks }
        }
    }
    fun melody(score: LeadSheet, position: ScorePosition, spec: MelodySpec, replaceId: String? = null,
        factory: () -> String = { "event_${UUID.randomUUID()}" }): MelodyMutation {
        require(spec.duration in MELODY_DURATIONS) { "Choose a supported note duration." }
        val r = range(score, position, spec.duration.ticks)
        val id = allocator(score, factory)
        val original = replaceId?.let { MelodyEdits.find(score, it)?.first }
        require(replaceId == null || original != null) { "This note or rest no longer exists." }
        val eventId = replaceId ?: id()
        val event = MelodyEvent(eventId, 0, spec.duration, spec.pitch)
        val measures = List(maxOf(score.measures.size, r.count)) { index ->
            val old = score.measures.getOrNull(index) ?: ScoreMeasure(id(), emptyList(), emptyList())
            val start = maxOf(0, r.start - index * r.bar)
            val end = minOf(r.bar, r.end - index * r.bar)
            var melody = old.melody.filter { it.id != replaceId }
            if (start < end) {
                melody = melody.flatMap { e ->
                    val right = e.offsetTicks + e.duration.ticks
                    if (right <= start || e.offsetTicks >= end) listOf(e) else {
                        val left = if (e.offsetTicks < start) parts(e, e.offsetTicks, start, e.id, id, false) else emptyList()
                        left + if (right > end) parts(e, end, right, if (left.isEmpty()) e.id else id(), id, e.tieToNext) else emptyList()
                    }
                } + parts(event, start, end, if (index == position.measureIndex) eventId else id(), id,
                    (index + 1) * r.bar < r.end || original?.tieToNext == true)
            }
            old.copy(melody = melody.sortedBy { it.offsetTicks })
        }
        return MelodyMutation(removeInvalidMelodyTies(score.copy(measures = measures)).also { LeadSheetWriter.write(it) }, r.position, eventId)
    }
    fun insertBar(score: LeadSheet, index: Int, factory: () -> String = { "bar_${UUID.randomUUID()}" }): LeadSheet {
        LeadSheetWriter.write(score)
        require(index in 0..score.measures.size) { "Choose an existing bar or the end of the sheet." }
        require(score.measures.size < 256) { "This sheet has reached the 256-bar limit." }
        val measures = score.measures.toMutableList()
        measures.add(index, ScoreMeasure(allocator(score, factory)(), emptyList(), emptyList()))
        return removeInvalidMelodyTies(score.copy(measures = measures)).also { LeadSheetWriter.write(it) }
    }
}
