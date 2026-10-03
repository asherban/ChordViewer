package com.chordviewer.score

import org.json.JSONArray
import org.json.JSONObject

data class ChordSpelling(val step: String = "C", val alter: Int = 0) {
    val pitchClass: Int get() = chordMod(mapOf("C" to 0, "D" to 2, "E" to 4, "F" to 5, "G" to 7, "A" to 9, "B" to 11).getValue(step) + alter)
    val label: String get() = step + if (alter < 0) "b".repeat(-alter) else "#".repeat(alter)
}
data class ChordDegree(val degree: Int, val alter: Int = 0) {
    val label: String get() = (if (alter < 0) "b".repeat(-alter) else "#".repeat(alter)) + degree
}
data class ChordDefinition(
    val kind: String = "tonal", val root: ChordSpelling? = ChordSpelling(), val family: String? = "major",
    val seventh: String? = null, val extension: String? = null,
    val additions: List<ChordDegree> = emptyList(), val alterations: List<ChordDegree> = emptyList(), val omissions: List<Int> = emptyList(),
    val tones: List<Int> = emptyList(), val components: List<ChordDefinition> = emptyList(), val bass: ChordSpelling? = null,
) {
    fun validate(depth: Int = 0) {
        fun spell(n: ChordSpelling) { require(n.step in listOf("C","D","E","F","G","A","B") && n.alter in -2..2) { "Invalid chord spelling." } }
        require(depth <= 3) { "Stacked chords are too deeply nested." }; bass?.let(::spell)
        when (kind) {
            "none" -> require(root == null && family == null && bass == null && seventh == null && extension == null && additions.isEmpty() && alterations.isEmpty() && omissions.isEmpty() && tones.isEmpty() && components.isEmpty()) { "N.C. has no tones or bass." }
            "polychord" -> {
                require(root == null && family == null && seventh == null && extension == null && additions.isEmpty() && alterations.isEmpty() && omissions.isEmpty() && tones.isEmpty() && components.size in 2..4) { "Choose two to four stacked chords." }
                components.forEach { require(it.kind != "none" && it.kind != "polychord"); it.validate(depth + 1) }
            }
            "custom" -> {
                spell(requireNotNull(root)); require(family == null && seventh == null && extension == null && additions.isEmpty() && alterations.isEmpty() && omissions.isEmpty() && components.isEmpty() && tones.size in 1..12 && tones.distinct().size == tones.size && tones.all { it in 0..11 }) { "Choose distinct custom intervals." }
            }
            "tonal" -> {
                spell(requireNotNull(root)); require(family in listOf("major","minor","diminished","augmented","power","sus2","sus4") && tones.isEmpty() && components.isEmpty()) { "Invalid chord family." }
                require(seventh == null || seventh in listOf("dominant","major","diminished"))
                require(seventh != "diminished" || family == "diminished") { "Use an altered seventh degree for this family." }
                require(extension == null || extension in listOf("6","6/9","9","11","13"))
                require(extension !in listOf("9","11","13") || seventh != null) { "Extended chords need a seventh; use Add tone for added extensions." }
                require(extension !in listOf("6","6/9") || seventh == null) { "Use Add tone to combine sixth and seventh." }
                listOf(additions, alterations).forEach { ds -> require(ds.size <= 13 && ds.distinct().size == ds.size && ds.all { it.degree in 1..13 && it.alter in -2..2 }) { "Invalid chord degrees." } }
                require(omissions.distinct().size == omissions.size && omissions.all { it in 1..13 })
                require(pitchClasses(false).isNotEmpty()) { "A sounding chord needs a tone." }
            }
            else -> throw IllegalArgumentException("Invalid chord kind.")
        }
    }
    val symbol: String get() {
        if (kind == "none") return "N.C."
        val value = when (kind) {
            "polychord" -> "[" + components.joinToString(" | ") { it.symbol } + "]"
            "custom" -> root!!.label + "{" + tones.sorted().joinToString(",") + "}"
            else -> {
                var suffix = mapOf("major" to "", "minor" to "m", "diminished" to "dim", "augmented" to "aug", "power" to "5", "sus2" to "", "sus4" to "").getValue(family!!)
                if (family == "power") { /* Added degrees are explicit below. */ }
                else if (seventh == "major") suffix += if (family == "minor") "(maj${extension ?: "7"})" else "maj${extension ?: "7"}"
                else if (seventh == "diminished") suffix += extension ?: "7"
                else if (seventh != null) { if (family == "diminished") suffix = "m"; suffix += extension ?: "7"; if (family == "diminished") suffix += "b5" }
                else if (extension != null) suffix += extension
                if (family in listOf("sus2","sus4")) suffix += family
                val ds = compareBy<ChordDegree> { it.degree }.thenBy { it.alter }
                val power = if (family != "power") emptyList() else listOfNotNull(seventh?.let { if(it=="major") "add7" else "addb7" },if(extension in listOf("6","6/9")) "add6" else null,if(extension != null && extension != "6") "add9" else null,if(extension in listOf("11","13")) "add11" else null,if(extension=="13") "add13" else null)
                val modifiers = power + alterations.sortedWith(ds).map { it.label } + additions.sortedWith(ds).map { "add" + it.label } + omissions.sorted().map { "no$it" }
                root!!.label + suffix + if (family != "power" && modifiers.size == 1 && modifiers[0].startsWith("add")) modifiers[0] else if (modifiers.isNotEmpty()) "(" + modifiers.joinToString(",") + ")" else ""
            }
        }
        return value + (bass?.let { "/${it.label}" } ?: "")
    }
    fun pitchClasses(includeBass: Boolean = true): List<Int> {
        val result = when (kind) {
            "none" -> emptyList()
            "polychord" -> components.flatMap { it.pitchClasses() }
            "custom" -> tones.map { chordMod(root!!.pitchClass + it) }
            else -> {
                val values = linkedMapOf(1 to mutableListOf(0))
                if (family != "power") values[if (family == "sus2") 2 else if (family == "sus4") 4 else 3] = mutableListOf(when (family) { "minor","diminished" -> 3; "sus2" -> 2; "sus4" -> 5; else -> 4 })
                values[5] = mutableListOf(if (family == "diminished") 6 else if (family == "augmented") 8 else 7)
                seventh?.let { values[7] = mutableListOf(if (it == "major") 11 else if (it == "diminished") 9 else 10) }
                if (extension in listOf("6","6/9")) values[6] = mutableListOf(9)
                if (extension != null && extension != "6") values[9] = mutableListOf(2)
                if (extension in listOf("11","13")) values[11] = mutableListOf(5)
                if (extension == "13") values[13] = mutableListOf(9)
                val scale = listOf(0,2,4,5,7,9,11); val altered = mutableSetOf<Int>()
                alterations.sortedWith(compareBy<ChordDegree> { it.degree }.thenBy { it.alter }).forEach { d ->
                    if (altered.add(d.degree)) values[d.degree] = mutableListOf()
                    values.getValue(d.degree).add(chordMod(scale[(d.degree - 1) % 7] + d.alter))
                }
                additions.forEach { d -> values.getOrPut(d.degree) { mutableListOf() }.add(chordMod(scale[(d.degree - 1) % 7] + d.alter)) }
                omissions.forEach { values.remove(it) }
                values.values.flatten().map { chordMod(root!!.pitchClass + it) }
            }
        }.toMutableList()
        if (includeBass) bass?.let { result.add(it.pitchClass) }
        return result.distinct().sorted()
    }
    fun transpose(shift: Int, flats: Boolean): ChordDefinition {
        fun note(n: ChordSpelling): ChordSpelling {
            val names = if (flats) listOf("C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B") else listOf("C","C#","D","D#","E","F","F#","G","G#","A","A#","B")
            val s = names[chordMod(n.pitchClass + shift)]
            return ChordSpelling(s.take(1), if (s.endsWith("b")) -1 else if (s.endsWith("#")) 1 else 0)
        }
        return copy(root = root?.let(::note), bass = bass?.let(::note), components = components.map { it.transpose(shift, flats) })
    }
    fun semanticKey(): String = copy(additions = additions.sortedWith(compareBy<ChordDegree> { it.degree }.thenBy { it.alter }), alterations = alterations.sortedWith(compareBy<ChordDegree> { it.degree }.thenBy { it.alter }), omissions = omissions.sorted(), tones = tones.sorted(), components = components.map { it.canonical() }).toString()
    private fun canonical(): ChordDefinition = copy(additions = additions.sortedWith(compareBy<ChordDegree> { it.degree }.thenBy { it.alter }), alterations = alterations.sortedWith(compareBy<ChordDegree> { it.degree }.thenBy { it.alter }), omissions = omissions.sorted(), tones = tones.sorted(), components = components.map { it.canonical() })
    fun json(): JSONObject {
        val out = JSONObject().put("kind", kind)
        fun note(n: ChordSpelling) = JSONObject().put("step", n.step).put("alter", n.alter)
        root?.let { out.put("root", note(it)) }; family?.let { out.put("family", it) }; seventh?.let { out.put("seventh", it) }; extension?.let { out.put("extension", it) }; bass?.let { out.put("bass", note(it)) }
        fun degrees(ds: List<ChordDegree>) = JSONArray(ds.map { JSONObject().put("degree", it.degree).put("alter", it.alter) })
        if (additions.isNotEmpty()) out.put("additions", degrees(additions))
        if (alterations.isNotEmpty()) out.put("alterations", degrees(alterations))
        if (omissions.isNotEmpty()) out.put("omissions", JSONArray(omissions))
        if (tones.isNotEmpty()) out.put("tones", JSONArray(tones))
        if (components.isNotEmpty()) out.put("components", JSONArray(components.map { it.json() }))
        return out
    }
    companion object {
        fun read(j: JSONObject, depth: Int = 0): ChordDefinition {
            require(depth <= 3)
            val allowed = setOf("kind","root","family","seventh","extension","additions","alterations","omissions","tones","components","bass")
            require(j.keys().asSequence().all { it in allowed }) { "Unexpected chord definition fields." }
            val kind = j.get("kind").also { require(it is String) } as String
            val fields = j.keys().asSequence().toSet()
            val kindFields = when (kind) {
                "none" -> setOf("kind")
                "custom" -> setOf("kind","root","tones","bass")
                "polychord" -> setOf("kind","components","bass")
                "tonal" -> allowed - setOf("tones","components")
                else -> emptySet()
            }
            require(fields.all { it in kindFields }) { "Fields do not belong to this chord kind." }
            for (key in listOf("additions","alterations","omissions","tones","components")) if (j.has(key)) require(j.get(key) is JSONArray) { "Chord lists must be arrays." }
            fun integer(o: JSONObject, key: String): Int { val n = o.get(key); require(n is Number && n.toDouble().isFinite() && n.toDouble() == n.toInt().toDouble()); return n.toInt() }
            fun note(key: String) = if (!j.has(key)) null else j.getJSONObject(key).let { require(it.keys().asSequence().toSet() == setOf("step","alter")); ChordSpelling(it.get("step").also { v -> require(v is String) } as String, integer(it,"alter")) }
            fun ds(key: String): List<ChordDegree> = j.optJSONArray(key)?.let { a -> List(a.length()) { i -> a.getJSONObject(i).let { require(it.keys().asSequence().toSet() == setOf("degree","alter")); ChordDegree(integer(it,"degree"), integer(it,"alter")) } } } ?: emptyList()
            fun ints(key: String) = j.optJSONArray(key)?.let { a -> List(a.length()) { i -> val n = a.get(i); require(n is Number && n.toDouble() == n.toInt().toDouble()); n.toInt() } } ?: emptyList()
            fun text(key: String): String? = if (j.has(key)) j.get(key).also { require(it is String) { "Chord text must be a string." } } as String else null
            val value = ChordDefinition(j.getString("kind"), note("root"), text("family"), text("seventh"), text("extension"), ds("additions"), ds("alterations"), ints("omissions"), ints("tones"), j.optJSONArray("components")?.let { a -> List(a.length()) { read(a.getJSONObject(it), depth + 1) } } ?: emptyList(), note("bass"))
            value.validate(depth); return value
        }
        fun parse(symbol: String): ChordDefinition? {
            if (symbol == "N.C.") return ChordDefinition(kind = "none", root = null, family = null)
            val m = Regex("^([A-G])(bb|##|b|#)?(.*)$").matchEntire(symbol.replace('♭','b').replace('♯','#')) ?: return null
            fun note(step: String, a: String) = ChordSpelling(step, if (a.startsWith("b")) -a.length else a.length)
            var d = ChordDefinition(root = note(m.groupValues[1], m.groupValues[2])); var s = m.groupValues[3]
            Regex("/([A-G])(bb|##|b|#)?$").find(s)?.let { d = d.copy(bass = note(it.groupValues[1], it.groupValues[2])); s = s.dropLast(it.value.length) }
            return when (s) {
                "" -> d; "m" -> d.copy(family = "minor"); "5" -> d.copy(family = "power"); "dim" -> d.copy(family = "diminished"); "aug","+" -> d.copy(family = "augmented")
                "sus2","sus4" -> d.copy(family = s); "7" -> d.copy(seventh = "dominant"); "maj7","Δ7" -> d.copy(seventh = "major"); "m7" -> d.copy(family = "minor", seventh = "dominant")
                "dim7" -> d.copy(family = "diminished", seventh = "diminished"); "m7b5" -> d.copy(family = "diminished", seventh = "dominant"); "m(maj7)","mMaj7" -> d.copy(family = "minor", seventh = "major")
                "aug7" -> d.copy(family = "augmented", seventh = "dominant")
                "7sus2","7sus4" -> d.copy(family = s.drop(1), seventh = "dominant"); "6","6/9" -> d.copy(extension = s); "m6" -> d.copy(family = "minor", extension = "6")
                "add9" -> d.copy(additions = listOf(ChordDegree(9))); "m(add9)","madd9" -> d.copy(family = "minor", additions = listOf(ChordDegree(9)))
                "9","11","13" -> d.copy(seventh = "dominant", extension = s)
                "maj9","maj11","maj13" -> d.copy(seventh = "major", extension = s.drop(3)); "m9","m11","m13" -> d.copy(family = "minor", seventh = "dominant", extension = s.drop(1))
                "7b5","7(b5)" -> d.copy(seventh = "dominant", alterations = listOf(ChordDegree(5,-1)))
                "7#5","7(#5)" -> d.copy(seventh = "dominant", alterations = listOf(ChordDegree(5,1)))
                "7(b9)" -> d.copy(seventh = "dominant", alterations = listOf(ChordDegree(9,-1)))
                "7(#9)" -> d.copy(seventh = "dominant", alterations = listOf(ChordDegree(9,1)))
                else -> null
            }
        }
    }
}
fun chordMod(value: Int) = (value % 12 + 12) % 12
