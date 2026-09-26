package com.chordviewer.library

import android.util.AtomicFile
import com.chordviewer.score.*
import java.io.File
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import org.json.JSONObject

data class RecoveryDraft(val id: String, val accountId: String, val updatedAt: Long, val base: SavedSheet,
    val score: LeadSheet, val title: String, val tutorial: String, val position: ScorePosition)

data class RecoveryListing(val copies: List<RecoveryDraft>, val unreadableCount: Int = 0)

interface RecoveryStore {
    fun list(accountId: String): RecoveryListing
    fun put(draft: RecoveryDraft)
    fun remove(draft: RecoveryDraft)
}

object RecoveryJson {
    const val MAX_BYTES = 2_200_000
    const val MAX_COPIES = 20
    fun write(value: RecoveryDraft): String {
        val base = value.base
        val saved = JSONObject().put("id", base.id).put("score", JSONObject(LeadSheetWriter.write(base.score)))
            .put("tutorialUrl", base.tutorialUrl ?: JSONObject.NULL).put("revision", base.revision)
            .put("createdAt", base.createdAt).put("updatedAt", base.updatedAt)
            .put("favorite", base.favorite).put("draft", base.draft)
            .put("trashedAt", base.trashedAt ?: JSONObject.NULL).put("openedAt", base.openedAt ?: JSONObject.NULL)
        return JSONObject().put("version", 1).put("id", value.id).put("accountId", value.accountId)
            .put("updatedAt", value.updatedAt).put("base", saved).put("score", JSONObject(LeadSheetWriter.write(value.score)))
            .put("title", value.title).put("tutorial", value.tutorial)
            .put("position", JSONObject().put("measureIndex", value.position.measureIndex).put("offsetTicks", value.position.offsetTicks))
            .toString().also { require(it.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "Recovery copy exceeds the local size limit." } }
    }
    fun read(text: String, accountId: String): RecoveryDraft {
        require(text.toByteArray(Charsets.UTF_8).size <= MAX_BYTES)
        val json = JSONObject(text)
        require(json.get("version") == 1 && json.get("accountId") == accountId)
        val id = json.getString("id").also { require(it.matches(Regex("[a-f0-9-]{36}"))) }
        val timestamp = json.get("updatedAt").also { require(it is Number && it.toDouble() == it.toLong().toDouble() && it.toLong() >= 0) } as Number
        val base = LibraryJson.sheet(json.getJSONObject("base"))
        val score = LeadSheetReader.read(json.getJSONObject("score").toString())
        require(score.id == base.id)
        val title = json.get("title").also { require(it is String && it.length <= 400) } as String
        val tutorial = json.get("tutorial").also { require(it is String && it.length <= 500) } as String
        val point = json.getJSONObject("position")
        fun number(key: String, maximum: Int): Int = point.get(key).let {
            require(it is Number && it.toDouble() == it.toInt().toDouble() && it.toInt() in 0..maximum); it.toInt()
        }
        return RecoveryDraft(id, accountId, timestamp.toLong(), base, score, title, tutorial,
            ScorePosition(number("measureIndex", 256), number("offsetTicks", 11520)))
    }
}

/** Files are in noBackupFilesDir. AtomicFile needs an explicit lock; all calls run on an IO dispatcher. */
class FileRecoveryStore(private val directory: File) : RecoveryStore {
    private companion object { val lock = Any() }
    private fun prefix(accountId: String) = MessageDigest.getInstance("SHA-256").digest(accountId.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) } + "-"
    private fun file(value: RecoveryDraft): File {
        require(value.id.matches(Regex("[a-f0-9-]{36}")))
        return File(directory, prefix(value.accountId) + value.id + ".json")
    }
    private fun read(file: File, owner: String): RecoveryDraft = AtomicFile(file).openRead().use {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = it.read(buffer)
            if (count < 0) break
            require(output.size() + count <= RecoveryJson.MAX_BYTES)
            output.write(buffer, 0, count)
        }
        RecoveryJson.read(output.toString("UTF-8"), owner)
    }
    override fun list(accountId: String): RecoveryListing = synchronized(lock) {
        val all = if (!directory.exists()) emptyArray() else checkNotNull(directory.listFiles()) { "Cannot read local recovery storage." }
        val files = all.filter { it.name.startsWith(prefix(accountId)) && it.name.endsWith(".json") }
        require(files.size <= RecoveryJson.MAX_COPIES)
        var unreadable = 0
        val copies = files.mapNotNull { file ->
            try { read(file, accountId) }
            catch (_: Exception) { unreadable++; null }
        }
        // Preserve unreadable records for recovery outside the app, without hiding healthy drafts.
        RecoveryListing(copies.sortedByDescending { it.updatedAt }, unreadable)
    }
    override fun put(draft: RecoveryDraft) = synchronized(lock) {
        val text = RecoveryJson.write(draft)
        RecoveryJson.read(text, draft.accountId)
        check(directory.isDirectory || directory.mkdirs())
        val target = file(draft)
        require(target.exists() || checkNotNull(directory.listFiles()).count { it.name.endsWith(".json") } < RecoveryJson.MAX_COPIES) {
            "Local recovery is full. Save or remove an older recovery copy."
        }
        val atomic = AtomicFile(target)
        val stream = atomic.startWrite()
        try {
            stream.write(text.toByteArray(Charsets.UTF_8)); atomic.finishWrite(stream)
            // AtomicFile can log a failed rename instead of throwing. Confirm the committed record before acknowledging it.
            check(read(target, draft.accountId).updatedAt == draft.updatedAt) { "Recovery write was not committed." }
        }
        catch (error: Exception) { atomic.failWrite(stream); throw error }
    }
    override fun remove(draft: RecoveryDraft) = synchronized(lock) {
        val target = file(draft)
        if (target.exists() && read(target, draft.accountId).updatedAt == draft.updatedAt) AtomicFile(target).delete()
    }
}
