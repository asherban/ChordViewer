package com.chordviewer.library

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LibraryViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }

    @Test fun signOutImmediatelyClearsPrivateDataAndLateOpenCannotRestoreIt() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        assertNotNull(model.state.value.user)
        assertEquals(1, model.state.value.sheets.size)
        gateway.onGet = { model.signOut() }
        model.open(gateway.sheet.id)
        advanceUntilIdle()
        assertNull(model.state.value.user)
        assertNull(model.state.value.selected)
        assertTrue(model.state.value.sheets.isEmpty())
        assertEquals(1, gateway.revocations)
    }

    @Test fun expiredSessionClearsPreviouslyLoadedSheet() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        model.open(gateway.sheet.id)
        advanceUntilIdle()
        assertNotNull(model.state.value.selected)
        gateway.listFailure = ApiFailure(401, "Session expired")
        model.refresh()
        advanceUntilIdle()
        assertNull(model.state.value.user)
        assertNull(model.state.value.selected)
        assertTrue(model.state.value.sheets.isEmpty())
        assertEquals("Session expired", model.state.value.message)
    }

    @Test fun failedAccountSwitchDoesNotKeepPreviousAccountLibrary() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        gateway.signInFailure = ApiFailure(401, "Invalid details")
        model.authenticate("two@example.test", "wrong-password-long", null)
        assertNull(model.state.value.user)
        assertTrue(model.state.value.sheets.isEmpty())
        advanceUntilIdle()
        assertNull(model.state.value.user)
        assertFalse(model.state.value.busy)
        assertEquals("Invalid details", model.state.value.message)
    }

    @Test fun unsuccessfulServerRevocationIsReportedWithoutRestoringPrivateData() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        gateway.revokeFailure = ApiFailure(503, "Unavailable")
        model.signOut()
        assertNull(model.state.value.user)
        advanceUntilIdle()
        assertTrue(model.state.value.message!!.contains("could not confirm session revocation"))
        assertTrue(model.state.value.sheets.isEmpty())
    }

    @Test fun initialLibraryFailureRemainsUnknownInsteadOfClaimingEmpty() = runTest(dispatcher) {
        val gateway = FakeGateway().apply { listFailure = ApiFailure(503, "Unavailable") }
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        assertNotNull(model.state.value.user)
        assertFalse(model.state.value.libraryLoaded)
        gateway.listFailure = null
        model.refresh()
        advanceUntilIdle()
        assertTrue(model.state.value.libraryLoaded)
    }

    @Test fun successfulWritesPublishSavedRecordWithoutDependingOnListRefresh() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        gateway.listFailure = ApiFailure(503, "Unavailable")
        model.create("Created", true)
        advanceUntilIdle()
        assertNotNull(model.state.value.selected)
        assertEquals("Sheet created.", model.state.value.message)
        model.updateDraft("Renamed", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        assertTrue(model.state.value.hasUnsavedChanges)
        model.save()
        advanceUntilIdle()
        assertEquals(2, model.state.value.selected!!.revision)
        assertEquals("Renamed", model.state.value.draftTitle)
        assertFalse(model.state.value.hasUnsavedChanges)
        assertEquals("Changes saved.", model.state.value.message)
    }

    @Test fun failedSaveKeepsDraftAndPriorSavedRevision() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        model.open(gateway.sheet.id)
        advanceUntilIdle()
        model.updateDraft("Unsaved title", "https://youtu.be/dQw4w9WgXcQ")
        gateway.saveFailure = ApiFailure(409, "Changed elsewhere")
        model.save()
        advanceUntilIdle()
        assertEquals(1, model.state.value.selected!!.revision)
        assertEquals("Unsaved title", model.state.value.draftTitle)
        assertTrue(model.state.value.hasUnsavedChanges)
    }

    @Test fun switchingProductModesKeepsSelectedSheetAndUnsavedDetails() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        model.open(gateway.sheet.id, LibraryMode.PRACTICE)
        advanceUntilIdle()
        assertEquals(LibraryMode.PRACTICE, model.state.value.mode)
        model.updateDraft("Kept draft", "https://youtu.be/dQw4w9WgXcQ")
        listOf(LibraryMode.LIBRARY, LibraryMode.CREATE, LibraryMode.PRACTICE).forEach { mode ->
            model.changeMode(mode)
            assertEquals(mode, model.state.value.mode)
            assertEquals(gateway.sheet.id, model.state.value.selected!!.id)
            assertEquals("Kept draft", model.state.value.draftTitle)
            assertTrue(model.state.value.hasUnsavedChanges)
        }
        model.signOut()
        advanceUntilIdle()
        assertEquals(LibraryMode.LIBRARY, model.state.value.mode)
        assertNull(model.state.value.selected)
        assertEquals("", model.state.value.draftTitle)
    }

    private class FakeGateway : LibraryGateway {
        val sheet = run {
            val score = JSONObject(javaClass.classLoader!!.getResource("lead-sheet-v1.json")!!.readText())
            LibraryJson.sheet(JSONObject().put("id", score.getString("id")).put("score", score)
                .put("tutorialUrl", JSONObject.NULL).put("revision", 1)
                .put("createdAt", "2026-09-20T12:00:00Z").put("updatedAt", "2026-09-20T12:00:00Z"))
        }
        var onGet: () -> Unit = {}
        var signInFailure: Exception? = null
        var listFailure: Exception? = null
        var revokeFailure: Exception? = null
        var saveFailure: Exception? = null
        var revocations = 0
        override fun signIn(email: String, password: String, name: String?): AccountSession {
            signInFailure?.let { throw it }
            return AccountSession(Account("account-a", "Name", email), "session-token")
        }
        override fun signOut(token: String) { revocations++; revokeFailure?.let { throw it } }
        override fun list(token: String): List<SheetSummary> {
            listFailure?.let { throw it }
            return listOf(SheetSummary(sheet.id, sheet.score.title, null, 1, sheet.createdAt, sheet.updatedAt))
        }
        override fun get(token: String, id: String): SavedSheet { onGet(); return sheet }
        override fun create(token: String, title: String, example: Boolean) = sheet
        override fun save(token: String, sheet: SavedSheet, title: String, tutorialUrl: String?): SavedSheet {
            saveFailure?.let { throw it }
            val raw = sheet.renamedScore(title).toString()
            return sheet.copy(score = com.chordviewer.score.LeadSheetReader.read(raw), scoreJson = raw,
                tutorialUrl = tutorialUrl, revision = sheet.revision + 1)
        }
    }
}
