package com.chordviewer.score

import org.json.JSONArray
import org.json.JSONObject

data class RecognizedChord(val symbol: String, val rootPitchClass: Int, val quality: String, val bassPitchClass: Int)
data class ChordRecognition(val pitchClasses: List<Int>, val bassMidi: Int?, val candidates: List<RecognizedChord>)

/** Uses the same language-neutral vocabulary and ranking as the web client. */
class ChordRecognizer(json: String) {
    private data class Quality(val name: String, val suffix: String, val intervals: Set<Int>, val optional: Set<Int>)
    private val root = JSONObject(json)
    private val flat = root.getJSONArray("flatNames").strings()
    private val sharp = root.getJSONArray("sharpNames").strings()
    private val qualities = root.getJSONArray("entries").let { values -> List(values.length()) { index -> values.getJSONObject(index).let {
        Quality(it.getString("quality"), it.getString("suffix"), it.getJSONArray("intervals").ints().toSet(), it.optJSONArray("optionalIntervals")?.ints()?.toSet() ?: emptySet())
    } } }
    init { require(flat.size == 12 && sharp.size == 12 && qualities.size in 1..100) }

    fun recognize(notes: List<Int>): ChordRecognition {
        require(notes.all { it in 0..127 })
        val classes = notes.map { it % 12 }.distinct().sorted()
        val bass = notes.minOrNull()
        if (classes.size < 2 || bass == null) return ChordRecognition(classes, bass, emptyList())
        val bassClass = bass % 12
        val matches = buildList {
            for (pitch in 0..11) qualities.forEachIndexed { index, quality ->
                val intervals = classes.map { (it - pitch + 12) % 12 }.toSet()
                if (quality.intervals.containsAll(intervals) && intervals.containsAll(quality.intervals - quality.optional)) add(Triple(pitch, index, quality))
            }
        }.sortedWith(compareBy<Triple<Int, Int, Quality>> { if (it.first == bassClass) 0 else 1 }.thenBy { it.second }.thenBy { it.first })
        val candidates = matches.flatMap { (pitch, _, quality) ->
            listOf(flat, sharp).map { names -> names[pitch] + quality.suffix + if (pitch == bassClass) "" else "/${names[bassClass]}" }.distinct()
                .map { RecognizedChord(it, pitch, quality.name, bassClass) }
        }
        return ChordRecognition(classes, bass, candidates)
    }
    private fun JSONArray.strings() = List(length()) { getString(it) }
    private fun JSONArray.ints() = List(length()) { getInt(it) }
}
