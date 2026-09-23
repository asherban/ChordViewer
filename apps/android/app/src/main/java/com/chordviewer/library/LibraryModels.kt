package com.chordviewer.library

import com.chordviewer.score.LeadSheet
import com.chordviewer.score.LeadSheetReader
import java.time.Instant
import org.json.JSONObject
import com.chordviewer.score.KEY_SIGNATURES

data class Account(val id: String, val name: String, val email: String)

/** Deliberately not a data class: diagnostic toString must never expose the credential. */
class AccountSession(val user: Account, internal val token: String) {
    override fun toString() = "AccountSession(redacted)"
}

data class SheetSummary(
    val id: String, val title: String, val tutorialUrl: String?, val revision: Int,
    val createdAt: String, val updatedAt: String,
    val favorite: Boolean = false, val draft: Boolean = false, val trashedAt: String? = null, val openedAt: String? = null,
    val keySignature: String = "C", val meter: String = "4/4", val hasChords: Boolean = false, val hasMelody: Boolean = false,
    val previewChords: List<String> = emptyList(),
)

data class SavedSheet(
    val id: String, val score: LeadSheet, val scoreJson: String, val tutorialUrl: String?,
    val revision: Int, val createdAt: String, val updatedAt: String,
    val favorite: Boolean = false, val draft: Boolean = false, val trashedAt: String? = null, val openedAt: String? = null,
) {
    fun renamedScore(title: String): JSONObject {
        val text = title.trim()
        require(text.codePointCount(0, text.length) in 1..200) { "Enter a title from 1 to 200 characters." }
        return JSONObject(scoreJson).put("title", text).also { LeadSheetReader.read(it.toString()) }
    }
}

object LibraryJson {
    fun account(json: JSONObject): Account = Account(json.text("id", 128), json.text("name", 100), json.text("email", 254))

    fun summaries(json: JSONObject): List<SheetSummary> {
        val values = json.getJSONArray("sheets")
        require(values.length() <= 100) { "Invalid library size" }
        val entries = List(values.length()) { i -> values.getJSONObject(i).let {
            val key = it.text("keySignature", 4).also { value -> require(value in KEY_SIGNATURES) }
            val time = it.getJSONObject("timeSignature")
            fun exactInt(key: String): Int = time.get(key).let { value ->
                require(value is Number && value.toDouble().isFinite() && value.toDouble() == value.toInt().toDouble())
                (value as Number).toInt()
            }
            val numerator = exactInt("numerator").also { value -> require(value in 1..12) }
            val denominator = exactInt("denominator").also { value -> require(value in listOf(2, 4, 8)) }
            val preview = it.getJSONArray("previewChords").also { value -> require(value.length() <= 4) }
            SheetSummary(it.id(), it.text("title", 200), it.tutorial(), it.revision(), it.date("createdAt"), it.date("updatedAt"),
                it.flag("favorite"), it.flag("draft"), it.nullableDate("trashedAt"), it.nullableDate("openedAt"),
                key, "$numerator/$denominator", it.flag("hasChords"), it.flag("hasMelody"),
                List(preview.length()) { index -> (preview.get(index) as? String)?.also { text -> require(text.codePointCount(0, text.length) <= 64) }
                    ?: throw IllegalArgumentException("Invalid chord preview") })
        } }
        require(entries.map { it.id }.distinct().size == entries.size) { "Duplicate sheet ids" }
        return entries
    }

    fun sheet(json: JSONObject): SavedSheet {
        val id = json.id()
        val rawScore = json.getJSONObject("score").toString()
        val score = LeadSheetReader.read(rawScore)
        require(id == score.id) { "Sheet identity mismatch" }
        return SavedSheet(id, score, rawScore, json.tutorial(), json.revision(), json.date("createdAt"), json.date("updatedAt"),
            json.flag("favorite"), json.flag("draft"), json.nullableDate("trashedAt"), json.nullableDate("openedAt"))
    }

    private fun JSONObject.id() = text("id", 64).also { require(it.matches(Regex("[A-Za-z0-9_-]+"))) }
    private fun JSONObject.revision(): Int {
        val value = get("revision")
        require(value is Number && value.toDouble().isFinite() && value.toDouble() == value.toInt().toDouble() && value.toInt() >= 1)
        return value.toInt()
    }
    private fun JSONObject.date(key: String) = text(key, 40).also { Instant.parse(it) }
    private fun JSONObject.nullableDate(key: String): String? {
        require(has(key))
        return if (isNull(key)) null else date(key)
    }
    private fun JSONObject.flag(key: String): Boolean = get(key).let { require(it is Boolean); it as Boolean }
    private fun JSONObject.tutorial(): String? {
        require(has("tutorialUrl"))
        return if (isNull("tutorialUrl")) null else text("tutorialUrl", 500)
    }
    private fun JSONObject.text(key: String, maximum: Int): String {
        val value = get(key)
        require(value is String && value.codePointCount(0, value.length) in 1..maximum)
        return value
    }
}
