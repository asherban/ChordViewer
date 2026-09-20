package com.chordviewer.library

import com.chordviewer.score.LeadSheet
import com.chordviewer.score.LeadSheetReader
import java.time.Instant
import org.json.JSONObject

data class Account(val id: String, val name: String, val email: String)

/** Deliberately not a data class: diagnostic toString must never expose the credential. */
class AccountSession(val user: Account, internal val token: String) {
    override fun toString() = "AccountSession(redacted)"
}

data class SheetSummary(
    val id: String, val title: String, val tutorialUrl: String?, val revision: Int,
    val createdAt: String, val updatedAt: String,
)

data class SavedSheet(
    val id: String, val score: LeadSheet, val scoreJson: String, val tutorialUrl: String?,
    val revision: Int, val createdAt: String, val updatedAt: String,
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
            SheetSummary(it.id(), it.text("title", 200), it.tutorial(), it.revision(), it.date("createdAt"), it.date("updatedAt"))
        } }
        require(entries.map { it.id }.distinct().size == entries.size) { "Duplicate sheet ids" }
        return entries
    }

    fun sheet(json: JSONObject): SavedSheet {
        val id = json.id()
        val rawScore = json.getJSONObject("score").toString()
        val score = LeadSheetReader.read(rawScore)
        require(id == score.id) { "Sheet identity mismatch" }
        return SavedSheet(id, score, rawScore, json.tutorial(), json.revision(), json.date("createdAt"), json.date("updatedAt"))
    }

    private fun JSONObject.id() = text("id", 64).also { require(it.matches(Regex("[A-Za-z0-9_-]+"))) }
    private fun JSONObject.revision(): Int {
        val value = get("revision")
        require(value is Number && value.toDouble().isFinite() && value.toDouble() == value.toInt().toDouble() && value.toInt() >= 1)
        return value.toInt()
    }
    private fun JSONObject.date(key: String) = text(key, 40).also { Instant.parse(it) }
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
