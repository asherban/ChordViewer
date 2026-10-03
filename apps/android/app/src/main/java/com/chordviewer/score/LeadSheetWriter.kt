package com.chordviewer.score

import org.json.JSONArray
import org.json.JSONObject

/** Encodes the entire supported contract, preserving the independent melody lane. */
object LeadSheetWriter {
    fun write(score: LeadSheet): String {
        require(score.measures.none { bar -> bar.melody.any { it.pitch == null && it.tieToNext } }) { "A rest cannot have a tie" }
        val measures = JSONArray()
        score.measures.forEach { measure ->
            val chords = JSONArray()
            measure.chords.forEach { event ->
                val chord = JSONObject().put("id", event.id).put("offsetTicks", event.offsetTicks).put("durationTicks", event.durationTicks).put("symbol", event.symbol)
                event.logicalId?.let { chord.put("logicalId", it) }; event.definition?.let { chord.put("definition", it.json()) }; chords.put(chord)
            }
            val melody = JSONArray()
            measure.melody.forEach { event ->
                val note = JSONObject().put("id", event.id).put("kind", if (event.pitch == null) "rest" else "note")
                    .put("offsetTicks", event.offsetTicks).put("duration", JSONObject().put("denominator", event.duration.denominator).put("dots", event.duration.dots))
                event.pitch?.let { pitch ->
                    note.put("pitch", JSONObject().put("step", pitch.step).put("alter", pitch.alter).put("octave", pitch.octave))
                    if (event.tieToNext) note.put("tieToNext", true)
                }
                melody.put(note)
            }
            measures.put(JSONObject().put("id", measure.id).put("chords", chords).put("melody", melody))
        }
        val json = JSONObject().put("schemaVersion", score.schemaVersion).put("id", score.id).put("title", score.title).put("keySignature", score.keySignature)
            .put("timeSignature", JSONObject().put("numerator", score.timeSignature.numerator).put("denominator", score.timeSignature.denominator))
            .put("ticksPerQuarter", 480).put("measures", measures).toString()
        require(json.toByteArray(Charsets.UTF_8).size <= 1_040_000) { "The score exceeds the 1,040,000-byte document limit. Shorten or simplify the sheet before applying this edit." }
        LeadSheetReader.read(json)
        return json
    }
}
