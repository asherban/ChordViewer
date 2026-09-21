package com.chordviewer.score

import org.json.JSONObject
import kotlin.math.floor

const val BAR_TICKS = 1920

data class ScorePitch(val step: String, val alter: Int, val octave: Int) {
    val staffStep: Int get() = octave * 7 + "CDEFGAB".indexOf(step) - 30 // E4 is the bottom line.
    val label: String get() = step + when (alter) { -1 -> " flat"; 1 -> " sharp"; else -> "" } + octave
}

data class ScoreDuration(val denominator: Int, val dots: Int) {
    val ticks: Int get() = BAR_TICKS / denominator * (if (dots == 1) 3 else 2) / 2
}

data class MelodyEvent(
    val id: String,
    val offsetTicks: Int,
    val duration: ScoreDuration,
    val pitch: ScorePitch?,
    val tieToNext: Boolean = false,
)

data class ChordEvent(val id: String, val offsetTicks: Int, val durationTicks: Int, val symbol: String)
data class ScoreMeasure(val id: String, val chords: List<ChordEvent>, val melody: List<MelodyEvent>)
data class ScoreTimeSignature(val numerator: Int = 4, val denominator: Int = 4)
data class LeadSheet(val id: String, val title: String, val measures: List<ScoreMeasure>,
    val schemaVersion: Int = 1, val keySignature: String = "C", val timeSignature: ScoreTimeSignature = ScoreTimeSignature()) {
    val measureTicks: Int get() = timeSignature.numerator * BAR_TICKS / timeSignature.denominator
}

/** Decodes v1 C/4-4 and v2 keyed/metered scores before layout or rendering. */
object LeadSheetReader {
    fun read(json: String): LeadSheet {
        require(json.length <= 8 * 1024 * 1024) { "Score document is too large" }
        val root = JSONObject(json)
        root.fields("schemaVersion", "id", "title", "keySignature", "timeSignature", "ticksPerQuarter", "measures")
        val version = root.integer("schemaVersion", 1..2)
        val key = root.string("keySignature", 4)
        require(key in KEY_SIGNATURES && (version == 2 || key == "C")) { "Unsupported key signature" }
        require(root.integer("ticksPerQuarter", 480..480) == 480)
        val time = root.getJSONObject("timeSignature").let {
            with(it) {
            fields("numerator", "denominator")
            ScoreTimeSignature(integer("numerator", 1..12), integer("denominator", 2..8))
            }
        }
        require(time.denominator in listOf(2, 4, 8) && (version == 2 || time == ScoreTimeSignature())) { "Unsupported time signature" }
        val barTicks = time.numerator * BAR_TICKS / time.denominator
        val ids = mutableSetOf<String>()
        fun JSONObject.id(): String = string("id", 64).also {
            require(it.matches(Regex("[A-Za-z0-9_-]+")) && ids.add(it)) { "Invalid or duplicate score id" }
        }
        val id = root.id()
        val title = root.string("title", 200)
        val measuresJson = root.getJSONArray("measures")
        require(measuresJson.length() in 1..256) { "Invalid measure count" }
        val measures = List(measuresJson.length()) { index ->
            val bar = measuresJson.getJSONObject(index)
            bar.fields("id", "chords", "melody")
            val barId = bar.id()
            val chordsJson = bar.getJSONArray("chords")
            val melodyJson = bar.getJSONArray("melody")
            require(chordsJson.length() <= 64 && melodyJson.length() <= 64) { "Too many measure events" }
            val chords = List(chordsJson.length()) { chordIndex ->
                val chord = chordsJson.getJSONObject(chordIndex)
                chord.fields("id", "offsetTicks", "durationTicks", "symbol")
                ChordEvent(chord.id(), chord.integer("offsetTicks", 0 until barTicks),
                    chord.integer("durationTicks", 1..barTicks), chord.string("symbol", 32))
            }
            val melody = List(melodyJson.length()) { noteIndex ->
                val event = melodyJson.getJSONObject(noteIndex)
                val kind = event.string("kind", 4)
                require(kind == "note" || kind == "rest") { "Invalid melody event kind" }
                if (kind == "rest") event.fields("id", "kind", "offsetTicks", "duration")
                else event.fields("id", "kind", "offsetTicks", "duration", "pitch", optional = setOf("tieToNext"))
                val durationJson = event.getJSONObject("duration")
                durationJson.fields("denominator", "dots")
                val denominator = durationJson.integer("denominator", 1..16)
                require(denominator in setOf(1, 2, 4, 8, 16)) { "Invalid rhythmic duration" }
                val duration = ScoreDuration(denominator, durationJson.integer("dots", 0..1))
                val pitch = if (kind == "rest") null else event.getJSONObject("pitch").let {
                    it.fields("step", "alter", "octave")
                    val step = it.string("step", 1)
                    require(step in listOf("C", "D", "E", "F", "G", "A", "B")) { "Invalid pitch spelling" }
                    ScorePitch(step, it.integer("alter", -1..1), it.integer("octave", 3..6))
                }
                val tie = if (event.has("tieToNext")) event.get("tieToNext").also {
                    require(it is Boolean) { "Invalid tie flag" }
                } as Boolean else false
                MelodyEvent(event.id(), event.integer("offsetTicks", 0 until barTicks), duration, pitch, tie)
            }
            validateLane(chords.map { it.offsetTicks to it.durationTicks }, barTicks)
            validateLane(melody.map { it.offsetTicks to it.duration.ticks }, barTicks)
            ScoreMeasure(barId, chords, melody)
        }
        val timedMelody = measures.flatMapIndexed { index, bar -> bar.melody.map { (index * barTicks + it.offsetTicks) to it } }
        timedMelody.forEachIndexed { index, (time, event) ->
            if (event.tieToNext) {
                val next = timedMelody.getOrNull(index + 1)
                require(event.pitch != null && next != null && next.second.pitch == event.pitch &&
                    next.first == time + event.duration.ticks) { "Tie must continue to an adjacent note of the same spelled pitch" }
            }
        }
        return LeadSheet(id, title, measures, version, key, time)
    }

    private fun validateLane(events: List<Pair<Int, Int>>, barTicks: Int) {
        var previousEnd = 0
        events.forEach { (offset, duration) ->
            require(offset >= previousEnd && offset + duration <= barTicks) { "Events overlap, are unsorted, or cross a barline" }
            previousEnd = offset + duration
        }
    }

    private fun JSONObject.fields(vararg required: String, optional: Set<String> = emptySet()) {
        val actual = keys().asSequence().toSet()
        require(actual.containsAll(required.toSet()) && actual.all { it in required || it in optional }) { "Unexpected or missing score fields" }
    }

    private fun JSONObject.string(name: String, maximum: Int): String {
        val value = get(name)
        require(value is String && value.codePointCount(0, value.length) in 1..maximum) { "Invalid score text" }
        return value
    }

    private fun JSONObject.integer(name: String, range: IntRange): Int {
        val value = get(name)
        require(value is Number) { "Invalid score number" }
        val number = value.toDouble()
        require(number.isFinite() && number == floor(number) && number >= range.first && number <= range.last) { "Invalid score integer" }
        return number.toInt()
    }
}
