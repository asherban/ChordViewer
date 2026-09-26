package com.chordviewer.library

import com.chordviewer.score.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class DraftRecoveryTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }
    private fun model(api: Gateway, store: MemoryStore) = LibraryViewModel(api, dispatcher).also { it.configureRecovery(store) }

    @Test fun restartRestoresWholeDraftWithoutSavingAndSaveClearsOnlyConsumedCopies() = runTest(dispatcher) {
        val api = Gateway(); val store = MemoryStore(); val first = model(api, store)
        first.authenticate("a", "long-password-value", null); advanceUntilIdle(); first.open(api.sheet.id); advanceUntilIdle()
        first.updateDraftTitle("Recovered melody"); first.updateDraftTutorial("https://youtu.be/M7lc1UVf-VE")
        first.setPosition(ScorePosition(1, 480)); advanceUntilIdle()
        val copy = store.list("account-a").copies.single()
        val second = model(api, store)
        second.authenticate("a", "long-password-value", null); advanceUntilIdle()
        second.restoreRecovery(second.state.value.recoveryCopies.single()); advanceUntilIdle()
        assertEquals(0, api.saves)
        assertEquals(copy.score, second.state.value.editor!!.score)
        assertEquals(copy.position, second.state.value.editor!!.position)
        assertEquals("Recovered melody", second.state.value.draftTitle)
        assertEquals(EntryMode.PAUSED, second.state.value.editor!!.mode)
        assertTrue(second.state.value.hasUnsavedChanges)
        // A still-open older workspace may write after its copy was selected elsewhere.
        first.updateDraftTitle("Other workspace continues"); advanceUntilIdle()
        second.save(); advanceUntilIdle()
        assertEquals(1, api.saves)
        assertFalse(second.state.value.hasUnsavedChanges)
        assertEquals("Other workspace continues", store.list("account-a").copies.single().title)
    }

    @Test fun outageAndConflictKeepDraftAndSaveAsNewPreservesTutorial() = runTest(dispatcher) {
        val api = Gateway(); val store = MemoryStore(); val first = model(api, store)
        first.authenticate("a", "long-password-value", null); advanceUntilIdle(); first.open(api.sheet.id); advanceUntilIdle()
        first.updateDraftTitle("My changes"); first.updateDraftTutorial("https://youtu.be/M7lc1UVf-VE"); advanceUntilIdle()
        api.failure = ApiFailure(0, "Offline")
        first.save(); advanceUntilIdle()
        assertTrue(first.state.value.hasUnsavedChanges)
        assertEquals(1, store.list("account-a").copies.size)
        api.failure = null; api.revision = 2
        val restarted = model(api, store)
        restarted.authenticate("a", "long-password-value", null); advanceUntilIdle()
        restarted.restoreRecovery(restarted.state.value.recoveryCopies.single()); advanceUntilIdle()
        assertTrue(restarted.state.value.conflict)
        restarted.saveAsNew(); advanceUntilIdle()
        assertEquals("new-sheet", restarted.state.value.selected!!.id)
        assertEquals("My changes", restarted.state.value.selected!!.score.title)
        assertEquals("https://youtu.be/M7lc1UVf-VE", restarted.state.value.selected!!.tutorialUrl)
        assertEquals(0, api.saves)
        assertTrue(store.list("account-a").copies.isEmpty())
    }

    @Test fun recoveryPreservesTheVirtualNextBarAndItsInitialGap() = runTest(dispatcher) {
        val api = Gateway(); val store = MemoryStore(); val first = model(api, store)
        first.authenticate("a", "long-password-value", null); advanceUntilIdle(); first.open(api.sheet.id); advanceUntilIdle()
        val original = api.sheet.score
        val nextBar = ScorePosition(original.measures.size, 480)
        first.updateDraftTitle("Continue in the next bar")
        first.setPosition(nextBar); advanceUntilIdle()

        val restarted = model(api, store)
        restarted.authenticate("a", "long-password-value", null); advanceUntilIdle()
        restarted.restoreRecovery(restarted.state.value.recoveryCopies.single()); advanceUntilIdle()
        assertEquals(nextBar, restarted.state.value.editor!!.position)
        restarted.setDuration(480); restarted.addChord("Dm")
        val score = restarted.state.value.editor!!.score
        assertEquals(original.measures, score.measures.take(original.measures.size))
        assertEquals(original.measures.size + 1, score.measures.size)
        assertEquals(480, score.measures.last().chords.single().offsetTicks)
    }

    @Test fun accountBoundaryAndStorageFailureRemainVisible() = runTest(dispatcher) {
        val api = Gateway(); val store = MemoryStore(); val first = model(api, store)
        first.authenticate("a", "long-password-value", null); advanceUntilIdle(); first.open(api.sheet.id); advanceUntilIdle()
        first.updateDraftTitle("Private draft"); advanceUntilIdle()
        val copy = store.list("account-a").copies.single()
        first.signOut(); advanceUntilIdle()
        assertTrue(first.state.value.recoveryCopies.isEmpty())
        first.authenticate("b", "long-password-value", null); advanceUntilIdle()
        assertTrue(first.state.value.recoveryCopies.isEmpty())
        first.restoreRecovery(copy)
        assertNull(first.state.value.selected)
        first.authenticate("a", "long-password-value", null); advanceUntilIdle(); first.restoreRecovery(copy); advanceUntilIdle()
        store.failWrites = true
        first.updateDraftTitle("Still in memory"); advanceUntilIdle()
        assertEquals("Still in memory", first.state.value.draftTitle)
        assertTrue(first.state.value.recoveryStatus!!.contains("unavailable"))
    }

    @Test fun accountQuotaFailureIsNotAMusicalConflictAndKeepsRecovery() = runTest(dispatcher) {
        val api = Gateway(); val store = MemoryStore(); val current = model(api, store)
        current.authenticate("a", "long-password-value", null); advanceUntilIdle(); current.open(api.sheet.id); advanceUntilIdle()
        current.updateDraftTitle("Keep this work"); advanceUntilIdle()
        api.failure = ApiFailure(409, "Account full", "sheet_limit")
        current.saveAsNew(); advanceUntilIdle()
        assertFalse(current.state.value.conflict)
        assertTrue(current.state.value.hasUnsavedChanges)
        assertEquals("Keep this work", store.list("account-a").copies.single().title)
    }

    @Test fun unreadableCopiesRemainVisibleWhileHealthyDraftsCanBeSavedAndRestored() = runTest(dispatcher) {
        val api = Gateway(); val store = MemoryStore().apply { unreadableCount = 2 }; val first = model(api, store)
        first.authenticate("a", "long-password-value", null); advanceUntilIdle()
        assertEquals(2, first.state.value.recoveryUnreadableCount)
        assertTrue(first.state.value.recoveryWarning!!.contains("2 local recovery copies"))
        first.open(api.sheet.id); advanceUntilIdle(); first.updateDraftTitle("Healthy copy"); advanceUntilIdle()
        assertEquals(1, first.state.value.recoveryCopies.size)
        assertEquals(2, first.state.value.recoveryUnreadableCount)
        assertTrue(first.state.value.recoveryStatus!!.contains("updated"))

        val restarted = model(api, store)
        restarted.authenticate("a", "long-password-value", null); advanceUntilIdle()
        restarted.restoreRecovery(restarted.state.value.recoveryCopies.single()); advanceUntilIdle()
        assertEquals("Healthy copy", restarted.state.value.draftTitle)
        assertEquals(2, restarted.state.value.recoveryUnreadableCount)
        restarted.signOut(); advanceUntilIdle()
        assertNull(restarted.state.value.recoveryWarning)
    }

    @Test fun codecRejectsForeignMalformedAndOversizedData() {
        val base = Gateway().sheet
        val copy = RecoveryDraft("d426dbf3-baf2-47df-9953-693eea428acc", "account-a", 1, base, base.score, "", "", ScorePosition(0))
        val json = RecoveryJson.write(copy)
        assertEquals(copy, RecoveryJson.read(json, "account-a"))
        assertThrows(IllegalArgumentException::class.java) { RecoveryJson.read(json, "account-b") }
        assertThrows(Exception::class.java) { RecoveryJson.read(json.take(25), "account-a") }
        assertThrows(IllegalArgumentException::class.java) { RecoveryJson.read(" ".repeat(RecoveryJson.MAX_BYTES + 1), "account-a") }
        assertFalse(json.contains("long-password-value"))
    }

    private class MemoryStore : RecoveryStore {
        val copies = mutableMapOf<String, RecoveryDraft>(); var failWrites = false; var unreadableCount = 0
        override fun list(accountId: String) = RecoveryListing(copies.values.filter { it.accountId == accountId }, unreadableCount)
        override fun put(draft: RecoveryDraft) { check(!failWrites); copies[draft.id] = draft }
        override fun remove(draft: RecoveryDraft) { if (copies[draft.id]?.updatedAt == draft.updatedAt) copies.remove(draft.id) }
    }
    private class Gateway : LibraryGateway {
        val sheet: SavedSheet = run {
            val score = JSONObject(javaClass.classLoader!!.getResource("lead-sheet-v1.json")!!.readText())
            LibraryJson.sheet(JSONObject().put("id", score.getString("id")).put("score", score).put("tutorialUrl", JSONObject.NULL)
                .put("revision", 1).put("createdAt", "2026-09-20T12:00:00Z").put("updatedAt", "2026-09-20T12:00:00Z")
                .put("favorite", false).put("draft", false).put("trashedAt", JSONObject.NULL).put("openedAt", JSONObject.NULL))
        }
        var saves = 0; var revision = 1; var failure: Exception? = null
        override fun signIn(email: String, password: String, name: String?) = AccountSession(Account("account-$email", "User", "$email@example.test"), "private-token")
        override fun signOut(token: String) {}
        override fun list(token: String) = listOf(SheetSummary(sheet.id, sheet.score.title, null, revision, sheet.createdAt, sheet.updatedAt))
        override fun get(token: String, id: String) = sheet.copy(revision = revision)
        override fun create(token: String, title: String, example: Boolean, key: String, time: ScoreTimeSignature) = sheet
        override fun importScore(token: String, score: LeadSheet, title: String) = importDraft(token, score, title, "")
        override fun importDraft(token: String, score: LeadSheet, title: String, tutorial: String): SavedSheet {
            failure?.let { throw it }
            val copy = score.copy(id = "new-sheet", title = title)
            return sheet.copy(id = copy.id, score = copy, scoreJson = LeadSheetWriter.write(copy), tutorialUrl = tutorial)
        }
        override fun save(token: String, sheet: SavedSheet, title: String, tutorialUrl: String?): SavedSheet {
            failure?.let { throw it }; saves++
            val score = sheet.score.copy(title = title)
            return sheet.copy(score = score, scoreJson = LeadSheetWriter.write(score), tutorialUrl = tutorialUrl, revision = sheet.revision + 1)
        }
    }
}
