package com.chordviewer.score

import org.json.JSONArray
import org.json.JSONObject

data class RecognizedChord(val symbol: String, val rootPitchClass: Int, val quality: String, val bassPitchClass: Int)
data class ChordRecognition(val pitchClasses: List<Int>, val bassMidi: Int?, val candidates: List<RecognizedChord>)

/** Display ordering only; chord entry keeps the shared recognizer's original ranking. */
fun ChordRecognition.displayNames(keySignature: String?): List<String> {
    val key = KEY_SIGNATURES[keySignature]
    val spellings = if (key != null) keyAccidentals(keySignature!!).map { (step, alter) -> ChordSpelling(step, alter) }
        .associate { it.pitchClass to it.label } else emptyMap()
    fun spellingPenalty(symbol: String): Int {
        val root = Regex("^[A-G][#b]?").find(symbol)!!.value
        val bass = Regex("/([A-G][#b]?)$").find(symbol)?.groupValues?.get(1)
        return listOfNotNull(root, bass).sumOf { name ->
            val pitch = ChordSpelling(name.take(1), when (name.getOrNull(1)) { '#' -> 1; 'b' -> -1; else -> 0 }).pitchClass
            when {
                spellings[pitch] == name -> 0
                spellings.containsKey(pitch) -> 2
                key != null && (key.fifths > 0 && 'b' in name || key.fifths < 0 && '#' in name) -> 1
                else -> 0
            }
        }
    }
    // Keep bass-first harmonic identities, preferring their key-appropriate root and bass spellings.
    val groups = candidates.groupBy { Triple(it.rootPitchClass, it.quality, it.bassPitchClass) }.values
        .map { group -> group.sortedBy { spellingPenalty(it.symbol) } }
    return (groups.map { it.first() } + groups.flatMap { it.drop(1) }).map { it.symbol }.distinct()
}

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
