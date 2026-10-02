package com.chordviewer.library

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Run write and restore in separate processes, reinstalling the APK between them, on an isolated emulator. */
@RunWith(AndroidJUnit4::class)
class NativeSessionPersistenceTest {
    @Test fun encryptedSessionSurvivesProcessAndPackageReplacement() {
        val phase = InstrumentationRegistry.getArguments().getString("sessionPersistence")
        assumeTrue("Explicit persistence acceptance required", phase in listOf("write", "restore"))
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val origin = "http://127.0.0.1:3000"
        val store = KeystoreSessionStore(context, origin)
        val session = AccountSession(Account("session-test", "Session test", "session@example.test"), "synthetic-session-credential")
        val file = File(context.noBackupFilesDir, "account-session.bin")
        if (phase == "write") {
            store.clear()
            store.save(session)
            val first = file.readBytes()
            store.save(session)
            val second = file.readBytes()
            assertFalse("Encryption must use a fresh IV", first.contentEquals(second))
            assertFalse("Token must not be stored in plaintext", second.toString(Charsets.UTF_8).contains(session.token))
            assertFalse("Account must not be stored in plaintext", second.toString(Charsets.UTF_8).contains(session.user.email))
            val key = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey("chordviewer.account-session.v1", null)
            assertNull("Encryption key must not be exportable", key.encoded)
            assertEquals(session.token, store.load()!!.token)
            return
        }
        try {
            val restored = KeystoreSessionStore(context, origin).load()
            assertNotNull("Session must survive the host force-stop and APK replacement", restored)
            assertEquals(session.user, restored!!.user)
            assertEquals(session.token, restored.token)
            assertTrue("A session must be bound to its API origin",
                runCatching { KeystoreSessionStore(context, "https://another.example.test").load() }.isFailure)
            val bytes = file.readBytes()
            bytes[bytes.lastIndex] = (bytes.last().toInt() xor 1).toByte()
            file.writeBytes(bytes)
            assertTrue("Modified ciphertext must be rejected", runCatching { store.load() }.isFailure)
            store.clear()
            assertNull(store.load())
            store.save(session)
            assertEquals(session.token, store.load()!!.token)
        } finally { store.clear() }
        assertFalse(file.exists())
    }
}
