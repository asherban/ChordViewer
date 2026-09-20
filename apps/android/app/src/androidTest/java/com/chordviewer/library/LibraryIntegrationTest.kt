package com.chordviewer.library

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.UUID
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
        val blank = api.create(signedIn.token, "Native blank", false)
        assertTrue(blank.score.measures.all { it.chords.isEmpty() && it.melody.isEmpty() })
        val other = api.signIn("other-$suffix@example.test", password, "Other account")
        try {
            assertTrue(api.list(other.token).isEmpty())
            assertEquals(404, assertThrows(ApiFailure::class.java) { api.get(other.token, first.id) }.status)
            assertEquals(404, assertThrows(ApiFailure::class.java) { api.save(other.token, updated, "Not mine", null) }.status)
        } finally {
            api.signOut(other.token)
            api.signOut(signedIn.token)
        }
    }
}
