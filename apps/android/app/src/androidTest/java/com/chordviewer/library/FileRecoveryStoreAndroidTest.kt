package com.chordviewer.library

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chordviewer.score.*
import java.io.File
import java.util.UUID
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Exercises the real Android AtomicFile implementation in an isolated app-private directory. */
@RunWith(AndroidJUnit4::class)
class FileRecoveryStoreAndroidTest {
    private lateinit var directory: File
    private lateinit var store: FileRecoveryStore

    @Before fun setup() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        directory = File(context.noBackupFilesDir, "recovery-test-${UUID.randomUUID()}")
        check(directory.mkdirs())
        store = FileRecoveryStore(directory)
    }

    @After fun cleanup() {
        if (::directory.isInitialized) directory.deleteRecursively()
    }

    private fun draft(owner: String = "account-a"): RecoveryDraft {
        val score = LeadSheet("sheet", "Saved title", listOf(ScoreMeasure("bar", emptyList(), emptyList())))
        val saved = SavedSheet(score.id, score, LeadSheetWriter.write(score), null, 1,
            "2026-09-26T00:00:00Z", "2026-09-26T00:00:00Z")
        return RecoveryDraft(UUID.randomUUID().toString(), owner, 1, saved, score, "Unsaved title", "", ScorePosition(1))
    }

    private fun file(draft: RecoveryDraft): File = requireNotNull(directory.listFiles()).single { it.name.endsWith("-${draft.id}.json") }

    @Test fun corruptFilesDoNotHideHealthyDraftsOrExposeOtherAccounts() {
        val corrupt = draft(); val healthy = draft(); val foreign = draft("account-b")
        store.put(corrupt); store.put(healthy); store.put(foreign)
        val damaged = file(corrupt)
        damaged.writeText("{broken-json", Charsets.UTF_8)

        val listing = store.list("account-a")
        assertEquals(listOf(healthy), listing.copies)
        assertEquals(1, listing.unreadableCount)
        assertEquals("{broken-json", damaged.readText(Charsets.UTF_8))
        assertEquals(RecoveryListing(listOf(foreign)), store.list("account-b"))

        store.remove(healthy)
        assertEquals(RecoveryListing(emptyList(), 1), store.list("account-a"))
        assertTrue(damaged.exists())
    }

    @Test fun removingAnOlderSnapshotPreservesTheNewerCommittedVersion() {
        val older = draft(); val newer = older.copy(updatedAt = 2, title = "Newer edit")
        store.put(older); store.put(newer); store.remove(older)
        assertEquals(RecoveryListing(listOf(newer)), store.list(older.accountId))
        store.remove(newer)
        assertEquals(RecoveryListing(emptyList()), store.list(older.accountId))
    }

    @Test fun failedAtomicWriteKeepsThePreviouslyCommittedCopy() {
        val original = draft()
        store.put(original)
        // Prevent file creation without depending on AtomicFile's version-specific staging filename.
        val committed = file(original)
        check(committed.setWritable(false, false))
        check(directory.setWritable(false, false))
        try {
            assertTrue(runCatching { store.put(original.copy(updatedAt = 2, title = "Not committed")) }.isFailure)
        } finally {
            check(directory.setWritable(true, true))
            check(committed.setWritable(true, true))
        }
        assertEquals(RecoveryListing(listOf(original)), store.list(original.accountId))
    }
}
