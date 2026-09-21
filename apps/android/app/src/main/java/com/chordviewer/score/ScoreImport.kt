package com.chordviewer.score

import org.w3c.dom.Element
import org.w3c.dom.Node
import org.xml.sax.InputSource
import org.xml.sax.SAXException
import org.xml.sax.helpers.DefaultHandler
import java.io.StringReader
import javax.xml.parsers.DocumentBuilderFactory

data class ImportedScore(val score: LeadSheet, val warnings: List<String>, val format: String)

/** Reads a bounded local document. Never resolves an external identifier or fetches a URL. */
object ScoreImport {
    const val MAX_BYTES = 1_048_576
    private val kinds = mapOf(
        "major" to "", "minor" to "m", "augmented" to "aug", "diminished" to "dim", "dominant" to "7", "major-seventh" to "maj7",
        "minor-seventh" to "m7", "diminished-seventh" to "dim7", "augmented-seventh" to "aug7", "half-diminished" to "m7b5",
        "major-minor" to "mMaj7", "major-sixth" to "6", "minor-sixth" to "m6", "dominant-ninth" to "9", "major-ninth" to "maj9",
        "minor-ninth" to "m9", "dominant-11th" to "11", "major-11th" to "maj11", "minor-11th" to "m11",
        "dominant-13th" to "13", "major-13th" to "maj13", "minor-13th" to "m13", "suspended-second" to "sus2", "suspended-fourth" to "sus4", "power" to "5",
    )
    private val majorKeys = listOf("Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#")
    private val minorKeys = listOf("Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m")
    private fun fail(message: String): Nothing = throw IllegalArgumentException(message)
    private fun Element.children(): List<Element> = (0 until childNodes.length).mapNotNull { childNodes.item(it) as? Element }
    private val Element.tag: String get() = localName ?: tagName
    private fun Element.allowed(vararg names: String) {
        if (children().any { it.tag !in names }) fail("Unsupported MusicXML content in $tag.")
    }
    private fun Element.one(name: String, required: Boolean = false): Element? {
        val found = children().filter { it.tag == name }
        if (found.size > 1 || (required && found.size != 1)) fail("MusicXML requires one $name in $tag.")
        return found.firstOrNull()
    }
    private fun Element.text(name: String, fallback: String? = null): String {
        val child = one(name, fallback == null)
        if (child != null && child.children().isNotEmpty()) fail("Invalid MusicXML $name.")
        return child?.textContent?.trim() ?: fallback ?: ""
    }
    private fun integer(value: String, minimum: Int, maximum: Int): Int {
        if (!value.matches(Regex("[+-]?\\d+"))) fail("MusicXML contains a non-integer musical value.")
        return value.toIntOrNull()?.takeIf { it in minimum..maximum } ?: fail("MusicXML contains an unsupported musical value.")
    }
    private fun Element.attribute(name: String, fallback: String = ""): String = if (hasAttribute(name)) getAttribute(name) else fallback

    private fun checkXmlBounds(xml: String) {
        if (Regex("<!DOCTYPE|<!ENTITY", RegexOption.IGNORE_CASE).containsMatchIn(xml)) fail("DTD and entity declarations are not allowed. Export MusicXML without a DTD.")
        var position = 0; var depth = 0; var nodes = 0
        while (true) {
            position = xml.indexOf('<', position)
            if (position < 0) break
            val ending = when {
                xml.startsWith("<!--", position) -> "-->"
                xml.startsWith("<![CDATA[", position) -> "]]>"
                xml.startsWith("<?", position) -> {
                    if (!Regex("<\\?xml\\s").containsMatchIn(xml.substring(position, minOf(xml.length, position + 7)))) fail("XML processing instructions are not supported.")
                    "?>"
                }
                else -> null
            }
            if (++nodes > 20_000) fail("MusicXML has too many XML nodes.")
            if (ending != null) {
                val end = xml.indexOf(ending, position + 2)
                if (end < 0) fail("MusicXML is not well-formed XML.")
                position = end + ending.length; continue
            }
            var end = position + 1; var quote: Char? = null
            while (end < xml.length) {
                val char = xml[end]
                if (quote != null) { if (char == quote) quote = null }
                else if (char == '"' || char == '\'') quote = char
                else if (char == '>') break
                end++
            }
            if (end == xml.length) fail("MusicXML is not well-formed XML.")
            if (xml.getOrNull(position + 1) == '/') depth--
            else {
                depth++
                if (depth > 32) fail("MusicXML is nested too deeply.")
                if (xml.substring(position, end).trimEnd().endsWith('/')) depth--
            }
            if (depth < 0) fail("MusicXML is not well-formed XML.")
            position = end + 1
        }
    }

    fun read(source: String, fileName: String): ImportedScore {
        if (source.length > MAX_BYTES || source.toByteArray(Charsets.UTF_8).size > MAX_BYTES) fail("Choose a file no larger than 1 MiB.")
        val extension = fileName.substringAfterLast('.', "").lowercase(java.util.Locale.ROOT)
        if (extension !in listOf("json", "xml", "musicxml")) fail("Choose a ChordViewer .json or uncompressed .musicxml/.xml file. Compressed .mxl is not supported.")
        if (extension == "json") return try {
            val json = source.removePrefix("\uFEFF")
            StrictJson(json).validate()
            ImportedScore(LeadSheetReader.read(json), emptyList(), "json")
        } catch (_: Exception) { fail("This is not a supported ChordViewer score JSON document.") }
        return ImportedScore(readMusicXml(source.removePrefix("\uFEFF")), listOf("Lyrics, visual layout, dynamics and performance metadata are not imported. Missing key or meter uses C major or 4/4."), "musicxml")
    }

    private fun readMusicXml(xml: String): LeadSheet {
        checkXmlBounds(xml)
        val document = try {
            val factory = DocumentBuilderFactory.newInstance().apply {
                isNamespaceAware = true
                isValidating = false
                isExpandEntityReferences = false
            }
            factory.newDocumentBuilder().apply {
                setEntityResolver { _, _ -> throw SAXException("External XML resources are not allowed.") }
                setErrorHandler(object : DefaultHandler() {
                    override fun error(error: org.xml.sax.SAXParseException) { throw error }
                    override fun fatalError(error: org.xml.sax.SAXParseException) { throw error }
                })
            }.parse(InputSource(StringReader(xml)))
        } catch (_: Exception) { fail("MusicXML is not well-formed XML.") }
        if (document.doctype != null) fail("DTD and entity declarations are not allowed.")
        val root = document.documentElement ?: fail("MusicXML is not well-formed XML.")
        if (root.tag != "score-partwise") fail("Only score-partwise MusicXML is supported.")
        val stack = java.util.ArrayDeque<Pair<Element, Int>>().apply { add(root to 1) }
        var nodeCount = 0
        while (stack.isNotEmpty()) {
            val (node, depth) = stack.removeLast()
            if (++nodeCount > 20_000 || depth > 32) fail("MusicXML exceeds the XML complexity limit.")
            if (!node.namespaceURI.isNullOrEmpty() && node.namespaceURI != "http://www.musicxml.org/ns/musicxml") fail("External XML namespaces are not supported.")
            if ((0 until node.childNodes.length).any { node.childNodes.item(it).nodeType == Node.ENTITY_REFERENCE_NODE }) fail("XML entity references are not supported.")
            node.children().forEach { stack.add(it to depth + 1) }
        }
        root.allowed("work", "movement-number", "movement-title", "identification", "defaults", "credit", "part-list", "part")
        val part = root.one("part", true)!!
        val parts = root.one("part-list", true)!!
        parts.allowed("score-part")
        val definition = parts.one("score-part", true)!!
        if (part.attribute("id").isEmpty() || part.attribute("id") != definition.attribute("id")) fail("MusicXML must contain exactly one matching part.")
        part.allowed("measure")
        val bars = part.children()
        if (bars.size !in 1..256) fail("Import between 1 and 256 measures.")
        val title = root.text("movement-title", root.one("work")?.text("work-title", "Imported lead sheet") ?: "Imported lead sheet")
        if (title.codePointCount(0, title.length) !in 1..200 || title.any { it.code < 32 || it.code == 127 }) fail("The imported title must contain 1–200 characters.")
        var key = "C"; var time = ScoreTimeSignature(); var divisions = 0
        var voice: String? = null; var carriedChord: String? = null
        var pendingTie: Pair<ScorePitch, Int>? = null
        val measures = mutableListOf<ScoreMeasure>()
        fun staffAndVoice(node: Element) {
            if (node.text("staff", "1") != "1") fail("Only one treble staff is supported.")
            val currentVoice = node.text("voice", "1")
            if (currentVoice.isEmpty() || (voice != null && voice != currentVoice)) fail("Only one melody voice is supported.")
            voice = currentVoice
        }
        bars.forEachIndexed { barIndex, bar ->
            if (bar.attribute("implicit") == "yes") fail("Pickup measures are not supported yet.")
            bar.allowed("attributes", "note", "harmony", "forward", "print", "barline", "direction", "sound")
            var cursor = 0
            val melody = mutableListOf<MelodyEvent>()
            val changes = mutableListOf<Pair<Int, String?>>()
            bar.children().forEach { element ->
                when (element.tag) {
                    "attributes" -> {
                        if (cursor != 0 || melody.isNotEmpty() || changes.isNotEmpty()) fail("Musical attributes must occur at the start of a measure.")
                        element.allowed("divisions", "key", "time", "staves", "clef")
                        if (element.one("divisions") != null) divisions = integer(element.text("divisions"), 1, 1_000_000)
                        if (element.text("staves", "1") != "1") fail("Only one treble staff is supported.")
                        element.one("key")?.let { keyNode ->
                            if (keyNode.attribute("number", "1") != "1") fail("Only one treble staff is supported.")
                            keyNode.allowed("fifths", "mode", "cancel")
                            val fifths = integer(keyNode.text("fifths"), -7, 7)
                            val next = when (keyNode.text("mode", "major")) {
                                "major" -> majorKeys[fifths + 7]
                                "minor" -> minorKeys[fifths + 7]
                                else -> fail("Only standard major and minor keys are supported.")
                            }
                            if (barIndex > 0 && key != next) fail("Key changes within a sheet are not supported.")
                            key = next
                        }
                        element.one("time")?.let { timeNode ->
                            if (timeNode.attribute("number", "1") != "1") fail("Only one treble staff is supported.")
                            timeNode.allowed("beats", "beat-type")
                            val numerator = integer(timeNode.text("beats"), 1, 12)
                            val denominator = integer(timeNode.text("beat-type"), 2, 8)
                            if (denominator !in listOf(2, 4, 8)) fail("Supported meter denominators are 2, 4 and 8.")
                            val next = ScoreTimeSignature(numerator, denominator)
                            if (barIndex > 0 && time != next) fail("Meter changes within a sheet are not supported.")
                            time = next
                        }
                        element.one("clef")?.let { clef ->
                            clef.allowed("sign", "line", "clef-octave-change")
                            if (clef.text("sign") != "G" || clef.text("line") != "2" || clef.text("clef-octave-change", "0") != "0" || clef.attribute("number", "1") != "1") fail("Only an untransposed treble clef is supported.")
                        }
                    }
                    "note", "forward" -> {
                        if (divisions == 0) fail("MusicXML must define divisions before its notes.")
                        staffAndVoice(element)
                        val rawDuration = integer(element.text("duration"), 1, 1_000_000).toLong() * 480
                        if (rawDuration % divisions != 0L) fail("MusicXML rhythm cannot be represented at 480 ticks per quarter.")
                        val ticks = (rawDuration / divisions).toInt()
                        if (ticks > time.numerator * 1920 / time.denominator - cursor) fail("MusicXML events extend past a measure boundary.")
                        if (element.tag == "forward") { element.allowed("duration", "voice", "staff"); cursor += ticks }
                        else {
                            element.allowed("pitch", "rest", "duration", "tie", "voice", "type", "dot", "accidental", "stem", "staff", "beam", "notations", "lyric")
                            if (listOf("attack", "release", "time-only").any { element.hasAttribute(it) }) fail("Performance timing changes are not supported.")
                            val type = element.text("type", "")
                            val denominator = mapOf("whole" to 1, "half" to 2, "quarter" to 4, "eighth" to 8, "16th" to 16)[type]
                            val dots = element.children().count { it.tag == "dot" }
                            val measureRest = element.one("rest")?.attribute("measure") == "yes"
                            if (measureRest && (cursor != 0 || ticks != time.numerator * 1920 / time.denominator)) fail("A full-measure rest must fill its measure.")
                            val duration = if (measureRest || (type.isEmpty() && dots == 0)) listOf(1, 2, 4, 8, 16).flatMap { denominator -> listOf(0, 1).map { ScoreDuration(denominator, it) } }.find { it.ticks == ticks }
                                else if (denominator != null && dots <= 1) ScoreDuration(denominator, dots)
                                else null
                            if (duration == null || duration.ticks != ticks) fail("Only whole through sixteenth notes with at most one dot are supported; tuplets are not supported.")
                            val pitchNode = element.one("pitch"); val rest = element.one("rest")
                            if ((pitchNode != null) == (rest != null)) fail("Each note must contain one pitch or rest.")
                            val pitch = pitchNode?.let {
                                it.allowed("step", "alter", "octave")
                                val step = it.text("step")
                                if (!step.matches(Regex("[A-G]"))) fail("Invalid MusicXML pitch.")
                                ScorePitch(step, integer(it.text("alter", "0"), -1, 1), integer(it.text("octave"), 3, 6))
                            }
                            rest?.allowed("display-step", "display-octave")
                            if (element.text("accidental", "") !in listOf("", "sharp", "flat", "natural")) fail("Only sharp, flat and natural accidentals are supported.")
                            val ties = element.children().filter { it.tag == "tie" }.map { it.attribute("type") }.toMutableList()
                            element.children().filter { it.tag == "notations" }.forEach { notation ->
                                notation.allowed("tied")
                                ties.addAll(notation.children().map { it.attribute("type") })
                            }
                            if (ties.any { it !in listOf("start", "stop") } || (ties.isNotEmpty() && pitch == null)) fail("Unsupported MusicXML tie.")
                            val start = barIndex * (time.numerator * 1920 / time.denominator) + cursor
                            pendingTie?.let { pending -> if ("stop" !in ties || pitch != pending.first || start != pending.second) fail("Ties must join adjacent notes with the same pitch.") }
                            if ("stop" in ties && pendingTie == null) fail("A tie stop has no matching start.")
                            pendingTie = if ("start" in ties) pitch!! to (start + ticks) else null
                            melody.add(MelodyEvent("note-${barIndex + 1}-${melody.size + 1}", cursor, duration, pitch, "start" in ties))
                            cursor += ticks
                        }
                    }
                    "harmony" -> {
                        if (element.text("staff", "1") != "1") fail("Only one treble staff is supported.")
                        val rawOffset = integer(element.text("offset", "0"), -1_000_000, 1_000_000).toLong() * 480
                        if (rawOffset != 0L && divisions == 0) fail("MusicXML must define divisions before chord offsets.")
                        if (rawOffset != 0L && rawOffset % divisions != 0L) fail("Chord symbols must have distinct, ordered positions within a measure.")
                        val offset = cursor + if (rawOffset != 0L) (rawOffset / divisions).toInt() else 0
                        if (offset < 0 || (changes.isNotEmpty() && offset <= changes.last().first)) fail("Chord symbols must have distinct, ordered positions within a measure.")
                        changes.add(offset to harmony(element))
                    }
                    "barline" -> element.allowed("bar-style", "footnote", "level")
                    "direction" -> {
                        element.allowed("direction-type", "offset", "voice", "staff", "sound")
                        element.children().filter { it.tag == "direction-type" }.forEach { it.allowed("words", "rehearsal", "metronome", "dynamics", "wedge") }
                        element.one("sound")?.let(::validateSound)
                    }
                    "sound" -> validateSound(element)
                }
            }
            val barTicks = time.numerator * 1920 / time.denominator
            if (cursor > barTicks || changes.any { it.first >= barTicks }) fail("MusicXML events extend past a measure boundary.")
            if (carriedChord != null && (changes.isEmpty() || changes.first().first > 0)) changes.add(0, 0 to carriedChord)
            val chords = changes.mapIndexedNotNull { index, (offset, symbol) ->
                carriedChord = symbol
                symbol?.let { ChordEvent("chord-${barIndex + 1}-${index + 1}", offset, (changes.getOrNull(index + 1)?.first ?: barTicks) - offset, it) }
            }
            measures.add(ScoreMeasure("measure-${barIndex + 1}", chords, melody))
        }
        if (pendingTie != null) fail("The final tie has no matching following note.")
        return try {
            val score = LeadSheet("import-score", title, measures, schemaVersion = 2, keySignature = key, timeSignature = time)
            LeadSheetReader.read(LeadSheetWriter.write(score))
        } catch (_: Exception) { fail("MusicXML contains invalid or unsupported score notation.") }
    }
    private fun chordPitch(node: Element, prefix: String): String {
        node.allowed("$prefix-step", "$prefix-alter")
        val step = node.text("$prefix-step")
        if (!step.matches(Regex("[A-G]"))) fail("Unsupported chord root or bass.")
        return step + when (integer(node.text("$prefix-alter", "0"), -1, 1)) { -1 -> "b"; 1 -> "#"; else -> "" }
    }
    private fun harmony(node: Element): String? {
        node.allowed("root", "kind", "bass", "inversion", "offset", "staff", "frame", "footnote", "level")
        val kind = node.text("kind")
        if (kind == "none") return null
        val suffix = kinds[kind] ?: fail("This MusicXML chord kind is not supported.")
        val root = chordPitch(node.one("root", true)!!, "root")
        val bass = node.one("bass")
        if (integer(node.text("inversion", "0"), 0, 10) != 0 && bass == null) fail("Chord inversions require an explicit bass pitch.")
        return root + suffix + (bass?.let { "/" + chordPitch(it, "bass") } ?: "")
    }
    private fun validateSound(node: Element) {
        if (node.children().isNotEmpty() || (0 until node.attributes.length).any { node.attributes.item(it).nodeName !in listOf("tempo", "dynamics") }) fail("MusicXML playback navigation and instrument changes are not supported.")
    }

    // Android's JSONTokener accepts comments, unquoted strings and trailing commas. Check
    // standard JSON syntax and a bounded depth first so both clients import the same format.
    private class StrictJson(private val source: String) {
        private var position = 0
        private fun invalid(): Nothing = fail("This is not a supported ChordViewer score JSON document.")
        private fun whitespace() { while (position < source.length && source[position] in " \t\r\n") position++ }
        private fun take(character: Char): Boolean {
            whitespace()
            if (source.getOrNull(position) != character) return false
            position++; return true
        }
        fun validate() { value(0); whitespace(); if (position != source.length) invalid() }
        private fun value(depth: Int) {
            whitespace()
            when (source.getOrNull(position)) {
                '{' -> {
                    if (depth >= 32) invalid()
                    position++
                    if (take('}')) return
                    val keys = mutableSetOf<String>()
                    do {
                        whitespace()
                        if (!keys.add(string())) invalid()
                        if (!take(':')) invalid()
                        value(depth + 1)
                        if (take('}')) return
                    } while (take(','))
                    invalid()
                }
                '[' -> {
                    if (depth >= 32) invalid()
                    position++
                    if (take(']')) return
                    do { value(depth + 1); if (take(']')) return } while (take(','))
                    invalid()
                }
                '"' -> string()
                't' -> literal("true")
                'f' -> literal("false")
                'n' -> literal("null")
                '-', in '0'..'9' -> number()
                else -> invalid()
            }
        }
        private fun literal(value: String) {
            if (!source.startsWith(value, position)) invalid()
            position += value.length
        }
        private fun string(): String {
            if (source.getOrNull(position++) != '"') invalid()
            val result = StringBuilder()
            while (position < source.length) {
                when (val character = source[position++]) {
                    '"' -> return result.toString()
                    '\\' -> when (val escaped = source.getOrNull(position++)) {
                        '"', '\\', '/' -> result.append(escaped)
                        'b' -> result.append('\b')
                        'f' -> result.append('\u000c')
                        'n' -> result.append('\n')
                        'r' -> result.append('\r')
                        't' -> result.append('\t')
                        'u' -> {
                            val start = position
                            repeat(4) {
                                val hex = source.getOrNull(position++) ?: invalid()
                                if (hex !in "0123456789abcdefABCDEF") invalid()
                            }
                            result.append(source.substring(start, position).toInt(16).toChar())
                        }
                        else -> invalid()
                    }
                    else -> { if (character.code < 32) invalid(); result.append(character) }
                }
            }
            invalid()
        }
        private fun number() {
            if (source.getOrNull(position) == '-') position++
            if (source.getOrNull(position) == '0') position++
            else {
                if (source.getOrNull(position) !in '1'..'9') invalid()
                while (source.getOrNull(position) in '0'..'9') position++
            }
            if (source.getOrNull(position) == '.') {
                position++
                if (source.getOrNull(position) !in '0'..'9') invalid()
                while (source.getOrNull(position) in '0'..'9') position++
            }
            if (source.getOrNull(position) in listOf('e', 'E')) {
                position++
                if (source.getOrNull(position) in listOf('+', '-')) position++
                if (source.getOrNull(position) !in '0'..'9') invalid()
                while (source.getOrNull(position) in '0'..'9') position++
            }
        }
    }
}
