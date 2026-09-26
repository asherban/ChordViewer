package com.chordviewer.library

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import org.json.JSONObject
import com.chordviewer.score.*

class ApiFailure(val status: Int, val userMessage: String, val code: String? = null) : Exception(userMessage)

data class ApiResponse(val body: JSONObject, val sessionToken: String?) {
    override fun toString() = "ApiResponse(redacted)"
}

interface LibraryGateway {
    fun signIn(email: String, password: String, name: String? = null): AccountSession
    fun signOut(token: String)
    fun list(token: String): List<SheetSummary>
    fun get(token: String, id: String): SavedSheet
    fun create(token: String, title: String, example: Boolean, key: String = "C", time: ScoreTimeSignature = ScoreTimeSignature()): SavedSheet
    fun importScore(token: String, score: LeadSheet, title: String): SavedSheet
    fun importDraft(token: String, score: LeadSheet, title: String, tutorial: String): SavedSheet =
        throw UnsupportedOperationException("Draft copy is unavailable")
    fun save(token: String, sheet: SavedSheet, title: String, tutorialUrl: String?): SavedSheet
    fun markOpened(token: String, id: String): SavedSheet = get(token, id)
    fun metadata(token: String, id: String, revision: Int, title: String? = null, favorite: Boolean? = null, draft: Boolean? = null): SavedSheet =
        throw UnsupportedOperationException("Library metadata unavailable")
    fun duplicate(token: String, id: String, revision: Int): SavedSheet = throw UnsupportedOperationException("Duplication unavailable")
    fun transition(token: String, id: String, revision: Int, restore: Boolean): SavedSheet = throw UnsupportedOperationException("Trash unavailable")
}

/** Synchronous transport; callers must execute it off the main thread. */
class LibraryApi(baseUrl: String, allowLoopbackHttp: Boolean = false) : LibraryGateway {
    private val origin = validateOrigin(baseUrl, allowLoopbackHttp)

    override fun signIn(email: String, password: String, name: String?): AccountSession {
        val body = JSONObject().put("email", email.trim()).put("password", password)
        if (name != null) body.put("name", name.trim())
        val response = request("POST", if (name == null) "/api/auth/sign-in/email" else "/api/auth/sign-up/email", body = body)
        val token = response.sessionToken ?: throw ApiFailure(0, "The server did not establish a session. Please try signing in.")
        return AccountSession(LibraryJson.account(response.body.getJSONObject("user")), token)
    }

    fun me(token: String): Account = LibraryJson.account(request("GET", "/api/v1/me", token).body.getJSONObject("user"))
    override fun signOut(token: String) { request("POST", "/api/auth/sign-out", token, JSONObject()) }
    override fun list(token: String): List<SheetSummary> = LibraryJson.summaries(request("GET", "/api/v1/sheets", token).body)
    override fun get(token: String, id: String): SavedSheet = LibraryJson.sheet(request("GET", sheetPath(id), token).body)
    override fun markOpened(token: String, id: String): SavedSheet = LibraryJson.sheet(request("POST", sheetPath(id) + "/open", token, JSONObject()).body)
    override fun metadata(token: String, id: String, revision: Int, title: String?, favorite: Boolean?, draft: Boolean?): SavedSheet {
        val body = JSONObject().put("expectedRevision", revision)
        if (title != null) body.put("title", title)
        if (favorite != null) body.put("favorite", favorite)
        if (draft != null) body.put("draft", draft)
        return LibraryJson.sheet(request("PATCH", sheetPath(id) + "/metadata", token, body).body)
    }
    override fun duplicate(token: String, id: String, revision: Int): SavedSheet = LibraryJson.sheet(
        request("POST", sheetPath(id) + "/duplicate", token, JSONObject().put("expectedRevision", revision)).body)
    override fun transition(token: String, id: String, revision: Int, restore: Boolean): SavedSheet = LibraryJson.sheet(
        request("POST", sheetPath(id) + if (restore) "/restore" else "/trash", token, JSONObject().put("expectedRevision", revision)).body)
    override fun create(token: String, title: String, example: Boolean, key: String, time: ScoreTimeSignature): SavedSheet = LibraryJson.sheet(request(
        "POST", "/api/v1/sheets", token, JSONObject().put("title", title.trim()).put("template", if (example) "example" else "blank").apply {
            if (!example) put("keySignature", key).put("timeSignature", JSONObject().put("numerator", time.numerator).put("denominator", time.denominator))
        },
    ).body)
    override fun importScore(token: String, score: LeadSheet, title: String): SavedSheet = LibraryJson.sheet(request(
        "POST", "/api/v1/sheets/import", token, JSONObject().put("score", JSONObject(LeadSheetWriter.write(score))).put("title", title.trim()),
    ).body)
    override fun save(token: String, sheet: SavedSheet, title: String, tutorialUrl: String?): SavedSheet = LibraryJson.sheet(request(
        "PUT", sheetPath(sheet.id), token, JSONObject().put("score", sheet.renamedScore(title))
            .put("tutorialUrl", tutorialUrl?.trim()?.ifEmpty { null } ?: JSONObject.NULL).put("expectedRevision", sheet.revision),
    ).body)
    override fun importDraft(token: String, score: LeadSheet, title: String, tutorial: String): SavedSheet = LibraryJson.sheet(request(
        "POST", "/api/v1/sheets/import", token, JSONObject().put("score", JSONObject(LeadSheetWriter.write(score)))
            .put("title", title.trim()).put("tutorialUrl", tutorial.trim().ifEmpty { null } ?: JSONObject.NULL),
    ).body)

    private fun sheetPath(id: String): String {
        require(id.matches(Regex("[A-Za-z0-9_-]{1,64}")))
        return "/api/v1/sheets/$id"
    }

    internal fun request(method: String, path: String, token: String? = null, body: JSONObject? = null): ApiResponse {
        require(path.startsWith("/api/") && !path.contains('?') && !path.contains('#'))
        require(token == null || validToken(token))
        val connection = URI(origin + path).toURL().openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.useCaches = false
        connection.requestMethod = method
        connection.setRequestProperty("Accept", "application/json")
        if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
        try {
            if (body != null) {
                val bytes = body.toString().toByteArray(Charsets.UTF_8)
                require(bytes.size <= 1024 * 1024)
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                val errorCode = if (status == 409) runCatching {
                    connection.errorStream?.use(::readBounded)?.toString(Charsets.UTF_8)?.let { text ->
                        JSONObject(text).opt("code") as? String
                    }
                }.getOrNull() else null
                throw ApiFailure(status, messageForStatus(status, method, path, errorCode), errorCode)
            }
            val text = connection.inputStream.use(::readBounded).toString(Charsets.UTF_8)
            val sessionToken = connection.getHeaderField("set-auth-token")?.takeIf(::validToken)
            return ApiResponse(JSONObject(text), sessionToken)
        } finally { connection.disconnect() }
    }

    companion object {
        internal const val MAX_RESPONSE_BYTES = 2 * 1024 * 1024
        internal fun validateOrigin(value: String, allowLoopbackHttp: Boolean): String {
            val uri = URI(value)
            require(uri.userInfo == null && uri.query == null && uri.fragment == null && uri.path.orEmpty() in listOf("", "/"))
            require(uri.host != null && uri.port in -1..65535 && uri.port != 0)
            require(uri.scheme == "https" || (allowLoopbackHttp && uri.scheme == "http" && uri.host == "127.0.0.1"))
            return value.removeSuffix("/")
        }
        internal fun validToken(value: String): Boolean = value.length in 1..4096 && value.all { it.code in 0x21..0x7e }
        internal fun readBounded(input: InputStream): ByteArray {
            val result = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                require(result.size() + count <= MAX_RESPONSE_BYTES) { "Server response is too large" }
                result.write(buffer, 0, count)
            }
            return result.toByteArray()
        }
        private fun messageForStatus(status: Int, method: String, path: String, code: String? = null) = when (status) {
            400, 422 -> "Check the title, account details and YouTube tutorial link, then try again."
            401 -> "Your session ended or the sign-in details were incorrect. Please sign in again."
            403 -> "This action is not allowed. Please sign in again."
            404 -> "This sheet is no longer available. Refresh your library."
            409 -> if (code == "sheet_limit" || method == "POST" && path in listOf("/api/v1/sheets", "/api/v1/sheets/import"))
                "Your library has reached the current limit of 100 sheets, including Trash. No new sheet was created."
                else "This sheet changed elsewhere. In Library, choose Reload saved version to discard local changes and open the latest score."
            429 -> "Too many requests. Wait a moment before trying again."
            else -> "The local service could not complete this request. Please try again."
        }
    }
}
