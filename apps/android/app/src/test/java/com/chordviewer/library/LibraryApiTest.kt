package com.chordviewer.library

import java.io.ByteArrayInputStream
import java.net.ServerSocket
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class LibraryApiTest {
    @Test fun originsRequireHttpsOrExplicitLoopbackPermission() {
        assertEquals("https://example.com", LibraryApi.validateOrigin("https://example.com/", false))
        assertEquals("http://127.0.0.1:3000", LibraryApi.validateOrigin("http://127.0.0.1:3000", true))
        listOf("http://example.com", "http://localhost:3000", "http://127.0.0.1.evil.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com?api=1").forEach {
            assertThrows(IllegalArgumentException::class.java) { LibraryApi.validateOrigin(it, true) }
        }
        assertThrows(IllegalArgumentException::class.java) { LibraryApi.validateOrigin("http://127.0.0.1:3000", false) }
    }

    @Test fun responseSizeAndHeaderTokensAreBounded() {
        assertEquals(3, LibraryApi.readBounded(ByteArrayInputStream(byteArrayOf(1, 2, 3))).size)
        assertThrows(IllegalArgumentException::class.java) { LibraryApi.readBounded(ByteArrayInputStream(ByteArray(LibraryApi.MAX_RESPONSE_BYTES + 1))) }
        assertTrue(LibraryApi.validToken("abc.signed%2Fvalue"))
        listOf("", "abc\r\nInjected: yes", "a b", "x".repeat(4097)).forEach { assertFalse(LibraryApi.validToken(it)) }
        assertFalse(AccountSession(Account("id", "Name", "example@example.test"), "secret").toString().contains("secret"))
    }

    @Test fun transportNeverFollowsRedirectOrSendsCredentialToTarget() {
        ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { target ->
            target.soTimeout = 500
            ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { server ->
                val received = CompletableFuture.supplyAsync {
                    server.accept().use { socket ->
                        val reader = socket.getInputStream().bufferedReader()
                        val headers = generateSequence { reader.readLine() }.takeWhile { it.isNotEmpty() }.toList()
                        socket.getOutputStream().write(("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:${target.localPort}/stolen\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").toByteArray())
                        headers
                    }
                }
                val failure = assertThrows(ApiFailure::class.java) {
                    LibraryApi("http://127.0.0.1:${server.localPort}", true).request("GET", "/api/v1/me", "private-token")
                }
                assertEquals(302, failure.status)
                assertTrue(received.get(5, TimeUnit.SECONDS).contains("Authorization: Bearer private-token"))
                assertThrows(java.net.SocketTimeoutException::class.java) { target.accept() }
            }
        }
    }

    @Test fun savedScoreRoundTripsNotationAndRejectsIdentityMismatch() {
        val score = JSONObject(javaClass.classLoader!!.getResource("lead-sheet-v1.json")!!.readText())
        val record = JSONObject().put("id", score.getString("id")).put("score", score).put("tutorialUrl", JSONObject.NULL)
            .put("revision", 1).put("createdAt", "2026-09-20T12:00:00.000Z").put("updatedAt", "2026-09-20T12:00:00.000Z")
            .put("favorite", false).put("draft", false).put("trashedAt", JSONObject.NULL).put("openedAt", JSONObject.NULL)
        val saved = LibraryJson.sheet(record)
        val changed = saved.renamedScore("New title")
        assertEquals(score.getJSONArray("measures").toString(), changed.getJSONArray("measures").toString())
        assertEquals("New title", changed.getString("title"))
        assertEquals("First Sketch", saved.score.title)
        assertThrows(IllegalArgumentException::class.java) { LibraryJson.sheet(record.put("id", "different")) }
    }

    @Test fun sheetQuotaFailureIsNotReportedAsARevisionConflict() {
        ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { server ->
            val replied = CompletableFuture.runAsync {
                server.accept().use { socket ->
                    val input = socket.getInputStream().bufferedReader()
                    generateSequence { input.readLine() }.takeWhile { it.isNotEmpty() }.toList()
                    socket.getOutputStream().write("HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                }
            }
            val error = assertThrows(ApiFailure::class.java) {
                LibraryApi("http://127.0.0.1:${server.localPort}", true).create("dummy-token", "Sheet", false)
            }
            assertEquals(409, error.status)
            assertTrue(error.userMessage.contains("100 sheets"))
            assertFalse(error.userMessage.contains("changed elsewhere"))
            replied.get(5, TimeUnit.SECONDS)
        }
    }

    @Test fun duplicateDistinguishesQuotaFromStaleRevisionWithoutShowingServerText() {
        for ((code, quota) in listOf("sheet_limit" to true, "revision_conflict" to false)) {
            ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { server ->
                val replied = CompletableFuture.runAsync {
                    server.accept().use { socket ->
                        val input = socket.getInputStream().bufferedReader()
                        generateSequence { input.readLine() }.takeWhile { it.isNotEmpty() }.toList()
                        val body = "{\"code\":\"$code\",\"message\":\"private server detail\"}"
                        socket.getOutputStream().write(("HTTP/1.1 409 Conflict\r\nContent-Type: application/json\r\nContent-Length: ${body.toByteArray().size}\r\nConnection: close\r\n\r\n" + body).toByteArray())
                    }
                }
                val error = assertThrows(ApiFailure::class.java) {
                    LibraryApi("http://127.0.0.1:${server.localPort}", true).duplicate("dummy-token", "sheet-id", 1)
                }
                assertEquals(409, error.status)
                assertEquals(quota, error.userMessage.contains("100 sheets, including Trash"))
                assertFalse(error.userMessage.contains("private server detail"))
                replied.get(5, TimeUnit.SECONDS)
            }
        }
    }

    @Test fun libraryRejectsDuplicatesFractionalRevisionAndInvalidDates() {
        val entry = JSONObject().put("id", "sheet-a").put("title", "Title").put("tutorialUrl", JSONObject.NULL)
            .put("revision", 1).put("createdAt", "2026-09-20T12:00:00Z").put("updatedAt", "2026-09-20T12:00:00Z")
            .put("favorite", false).put("draft", false).put("trashedAt", JSONObject.NULL).put("openedAt", JSONObject.NULL)
            .put("keySignature", "C").put("timeSignature", JSONObject().put("numerator", 4).put("denominator", 4))
            .put("hasChords", true).put("hasMelody", false).put("previewChords", JSONArray().put("C"))
        assertEquals(1, LibraryJson.summaries(JSONObject().put("sheets", JSONArray().put(entry))).size)
        assertThrows(IllegalArgumentException::class.java) { LibraryJson.summaries(JSONObject().put("sheets", JSONArray().put(entry).put(entry))) }
        assertThrows(IllegalArgumentException::class.java) { LibraryJson.summaries(JSONObject().put("sheets", JSONArray().put(entry.put("revision", 1.5)))) }
        assertThrows(java.time.format.DateTimeParseException::class.java) { LibraryJson.summaries(JSONObject().put("sheets", JSONArray().put(entry.put("revision", 1).put("updatedAt", "invalid")))) }
        entry.put("updatedAt", "2026-09-20T12:00:00Z")
        for (invalid in listOf(4.5, "4")) {
            entry.getJSONObject("timeSignature").put("denominator", invalid)
            assertThrows(IllegalArgumentException::class.java) { LibraryJson.summaries(JSONObject().put("sheets", JSONArray().put(entry))) }
        }
        entry.getJSONObject("timeSignature").put("denominator", 4)
        entry.put("favorite", "false")
        assertThrows(IllegalArgumentException::class.java) { LibraryJson.summaries(JSONObject().put("sheets", JSONArray().put(entry))) }
        entry.put("favorite", false).put("previewChords", JSONArray().put(3))
        assertThrows(IllegalArgumentException::class.java) { LibraryJson.summaries(JSONObject().put("sheets", JSONArray().put(entry))) }
    }
}
