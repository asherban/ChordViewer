package com.chordviewer.score

import org.json.JSONArray
import org.json.JSONObject

/** Encodes the entire supported contract, preserving the independent melody lane. */
object LeadSheetWriter {
    fun write(score: LeadSheet): String {
        val measures = JSONArray()
        score.measures.forEach { measure ->
            val chords = JSONArray()
            measure.chords.forEach { chords.put(JSONObject().put("id", it.id).put("offsetTicks", it.offsetTicks)
                .put("durationTicks", it.durationTicks).put("symbol", it.symbol)) }
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
        val json = JSONObject().put("schemaVersion", 1).put("id", score.id).put("title", score.title).put("keySignature", "C")
            .put("timeSignature", JSONObject().put("numerator", 4).put("denominator", 4)).put("ticksPerQuarter", 480).put("measures", measures).toString()
        LeadSheetReader.read(json)
        return json
    }
}
