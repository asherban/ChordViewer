package com.chordviewer.library

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
import com.chordviewer.score.ScoreTimeSignature
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in test against a real, isolated host API/database reached through adb reverse. */
@RunWith(AndroidJUnit4::class)
class LibraryIntegrationTest {
    @Test fun accountLibraryPersistsAcrossSessionsAndEnforcesOwnership() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("An isolated local API is required", args.getString("libraryApi") == "true")
        val port = args.getString("apiPort", "3001").toInt()
        require(port in 1024..65535)
        val api = LibraryApi("http://127.0.0.1:$port", true)
        val suffix = UUID.randomUUID().toString()
        val email = "native-$suffix@example.test"
        val password = UUID.randomUUID().toString() + "A7!"
        val account = api.signIn(email, password, "Native integration")
        assertEquals(email, api.me(account.token).email)
        assertTrue(api.list(account.token).isEmpty())
        val first = api.create(account.token, "Native example", true)
        assertEquals(1, first.revision)
        assertTrue(first.score.measures.any { it.melody.isNotEmpty() })
        val updated = api.save(account.token, first, "Native saved title", "https://youtu.be/dQw4w9WgXcQ")
        assertEquals(2, updated.revision)
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", updated.tutorialUrl)
        assertEquals(409, assertThrows(ApiFailure::class.java) { api.save(account.token, first, "Stale", null) }.status)
        api.signOut(account.token)
        assertEquals(401, assertThrows(ApiFailure::class.java) { api.me(account.token) }.status)
        val signedIn = api.signIn(email, password)
        assertEquals(first.id, api.list(signedIn.token).single().id)
        assertEquals("Native saved title", api.get(signedIn.token, first.id).score.title)
        val blank = api.create(signedIn.token, "Native blank", false, "Bb", ScoreTimeSignature(6, 8))
        assertTrue(blank.score.measures.all { it.chords.isEmpty() && it.melody.isEmpty() })
        assertEquals("Bb", blank.score.keySignature)
        assertEquals(ScoreTimeSignature(6, 8), blank.score.timeSignature)
        val imported = api.importScore(signedIn.token, updated.score, "Native imported copy")
        assertNotEquals(first.id, imported.id)
        assertEquals(updated.score.measures, imported.score.measures)
        assertEquals("Native saved title", api.get(signedIn.token, first.id).score.title)
        val opened = api.markOpened(signedIn.token, first.id)
        assertNotNull(opened.openedAt)
        val marked = api.metadata(signedIn.token, imported.id, imported.revision, favorite = true, draft = true)
        assertTrue(marked.favorite)
        assertTrue(marked.draft)
        assertEquals(imported.score, marked.score)
        assertEquals(409, assertThrows(ApiFailure::class.java) { api.metadata(signedIn.token, imported.id, imported.revision, favorite = false) }.status)
        val copy = api.duplicate(signedIn.token, imported.id, marked.revision)
        assertNotEquals(imported.id, copy.id)
        assertEquals(imported.score.measures, copy.score.measures)
        val trashed = api.transition(signedIn.token, copy.id, copy.revision, false)
        assertNotNull(trashed.trashedAt)
        assertEquals(404, assertThrows(ApiFailure::class.java) { api.get(signedIn.token, copy.id) }.status)
        val restored = api.transition(signedIn.token, copy.id, trashed.revision, true)
        assertNull(restored.trashedAt)
        assertEquals(copy.score, api.get(signedIn.token, copy.id).score)
        val other = api.signIn("other-$suffix@example.test", password, "Other account")
        try {
            assertTrue(api.list(other.token).isEmpty())
            assertEquals(404, assertThrows(ApiFailure::class.java) { api.get(other.token, first.id) }.status)
            assertEquals(404, assertThrows(ApiFailure::class.java) { api.save(other.token, updated, "Not mine", null) }.status)
            assertEquals(404, assertThrows(ApiFailure::class.java) { api.duplicate(other.token, imported.id, marked.revision) }.status)
        } finally {
            api.signOut(other.token)
            api.signOut(signedIn.token)
        }
    }
}
