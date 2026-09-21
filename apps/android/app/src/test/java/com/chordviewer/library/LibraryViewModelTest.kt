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
import com.chordviewer.midi.MidiInputEvent
import com.chordviewer.score.*

@OptIn(ExperimentalCoroutinesApi::class)
class LibraryViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }

    private fun configure(model: LibraryViewModel) {
        model.configureChordVocabulary(javaClass.classLoader!!.getResource("chord-vocabulary-v1.json")!!.readText())
        model.onMidiEvent(MidiInputEvent.Reset(true))
    }
    private fun play(model: LibraryViewModel, vararg notes: Int) {
        notes.forEach { model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, it, 90))) }
        notes.forEach { model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(128, it, 0))) }
    }

    @Test fun automaticChordEntrySustainUndoSaveAndReopenPreserveAllScoreLanes() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle()
        model.open(gateway.sheet.id); advanceUntilIdle()
        assertTrue(model.state.value.midiConnected)
        val original = gateway.sheet.score
        model.setPosition(ScorePosition(original.measures.size)); model.setDuration(480); model.armEntry()
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(176, 64, 127)))
        play(model, 60, 64, 67); play(model, 62, 65, 69)
        val drafted = model.state.value.editor!!.score
        assertEquals(listOf("C", "Dm"), drafted.measures.last().chords.map { it.symbol })
        assertEquals(listOf(480, 480), drafted.measures.last().chords.map { it.durationTicks })
        assertEquals(ScorePosition(original.measures.size, 960), model.state.value.editor!!.position)
        assertTrue(model.state.value.hasUnsavedChanges)
        model.undoChord(); assertEquals(ScorePosition(original.measures.size, 480), model.state.value.editor!!.position)
        model.redoChord(); assertEquals(drafted, model.state.value.editor!!.score)
        model.updateDraft("My chord study", "https://youtu.be/dQw4w9WgXcQ")
        model.save(); advanceUntilIdle()
        assertFalse(model.state.value.hasUnsavedChanges)
        assertEquals(EntryMode.PAUSED, model.state.value.editor!!.mode)
        val saved = gateway.saved!!
        assertEquals(drafted.copy(title = "My chord study"), saved.score)
        assertEquals(original.measures.map { it.melody }, saved.score.measures.take(original.measures.size).map { it.melody })
        assertEquals("https://youtu.be/dQw4w9WgXcQ", saved.tutorialUrl)
        model.refresh(); advanceUntilIdle(); model.open(saved.id); advanceUntilIdle()
        assertEquals(saved.score, model.state.value.editor!!.score)
        assertFalse(model.state.value.hasUnsavedChanges)
    }

    @Test fun readOnlyModesPauseHeldGestureAndReconnectNeedsExplicitRearm() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val original = model.state.value.editor!!.score
        model.setPosition(ScorePosition(original.measures.size)); model.armEntry()
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 60, 90, 144, 64, 90, 144, 67, 90)))
        model.changeMode(LibraryMode.PRACTICE)
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(128, 60, 0, 128, 64, 0, 128, 67, 0)))
        play(model, 62, 65, 69)
        model.changeMode(LibraryMode.LIBRARY); model.armEntry(); play(model, 60, 64, 67)
        assertEquals(original, model.state.value.editor!!.score)
        model.changeMode(LibraryMode.CREATE); model.armEntry()
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 60, 90)))
        model.onMidiEvent(MidiInputEvent.Reset(false)); model.onMidiEvent(MidiInputEvent.Reset(true))
        play(model, 60, 64, 67)
        assertEquals(original, model.state.value.editor!!.score)
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 60, 90)))
        model.armEntry()
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 64, 90, 128, 60, 0, 128, 64, 0)))
        assertEquals(original, model.state.value.editor!!.score)
        play(model, 60, 64, 67)
        assertEquals(original.measures.size + 1, model.state.value.editor!!.score.measures.size)
    }

    @Test fun unknownAndRejectedGesturesStayCorrectableWithoutReplaying() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val initial = model.state.value.editor!!.score
        model.setPosition(ScorePosition(initial.measures.size)); model.armEntry()
        play(model, 60); assertNull(model.state.value.editor!!.pending)
        play(model, 60, 61, 62)
        assertNotNull(model.state.value.editor!!.pending)
        assertEquals(initial, model.state.value.editor!!.score)
        model.applyPending("Cluster")
        assertEquals("Cluster", model.state.value.editor!!.score.measures.last().chords.single().symbol)
        model.setPosition(ScorePosition(initial.measures.size, 1440)); model.armEntry(); play(model, 60, 64, 67)
        assertNotNull(model.state.value.editor!!.pending)
        model.setDuration(480); model.setPosition(ScorePosition(initial.measures.size + 1, 1440)); model.applyPending(" C ")
        assertEquals(480, model.state.value.editor!!.score.measures.last().chords.single().durationTicks)
        assertEquals(1440, model.state.value.editor!!.score.measures.last().chords.single().offsetTicks)
        assertNull(model.state.value.editor!!.pending)
    }

    @Test fun replacementIsExplicitOneShotAndDeletingKeepsTimeline() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val initial = model.state.value.editor!!.score
        model.setPosition(ScorePosition(initial.measures.size)); model.armEntry(); play(model, 60, 64, 67)
        val chordId = model.state.value.editor!!.lastInsertedId!!
        model.selectChord(chordId); model.armEntry(); play(model, 62, 65, 69)
        assertEquals("C", model.state.value.editor!!.score.measures.last().chords.single().symbol)
        model.setDuration(480); model.armEntry(true); play(model, 62, 65, 69); play(model, 64, 68, 71)
        val replaced = model.state.value.editor!!.score.measures.last().chords.single()
        assertEquals(ChordEvent(chordId, 0, 480, "Dm"), replaced)
        assertEquals(EntryMode.PAUSED, model.state.value.editor!!.mode)
        model.undoChord(); assertEquals("C", model.state.value.editor!!.score.measures.last().chords.single().symbol)
        model.redoChord(); model.selectChord(chordId); model.deleteChord()
        assertTrue(model.state.value.editor!!.score.measures.last().chords.isEmpty())
        assertEquals(initial.measures.size + 1, model.state.value.editor!!.score.measures.size)
        assertEquals(initial.measures.map { it.melody }, model.state.value.editor!!.score.measures.take(initial.measures.size).map { it.melody })
    }

    @Test fun saveConflictKeepsChordDraftAndExpectedRevision() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        model.setPosition(ScorePosition(gateway.sheet.score.measures.size)); model.armEntry(); play(model, 60, 64, 67)
        val draft = model.state.value.editor!!.score
        gateway.saveFailure = ApiFailure(409, "Changed elsewhere")
        model.save(); play(model, 62, 65, 69); advanceUntilIdle()
        assertEquals(draft, model.state.value.editor!!.score)
        assertEquals(1, model.state.value.selected!!.revision)
        assertTrue(model.state.value.hasUnsavedChanges)
        assertEquals(EntryMode.PAUSED, model.state.value.editor!!.mode)
    }

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
        var saved: SavedSheet? = null
        override fun signIn(email: String, password: String, name: String?): AccountSession {
            signInFailure?.let { throw it }
            return AccountSession(Account("account-a", "Name", email), "session-token")
        }
        override fun signOut(token: String) { revocations++; revokeFailure?.let { throw it } }
        override fun list(token: String): List<SheetSummary> {
            listFailure?.let { throw it }
            return listOf(SheetSummary(sheet.id, sheet.score.title, null, 1, sheet.createdAt, sheet.updatedAt))
        }
        override fun get(token: String, id: String): SavedSheet { onGet(); return saved ?: sheet }
        override fun create(token: String, title: String, example: Boolean) = sheet
        override fun save(token: String, sheet: SavedSheet, title: String, tutorialUrl: String?): SavedSheet {
            saveFailure?.let { throw it }
            val raw = sheet.renamedScore(title).toString()
            return sheet.copy(score = com.chordviewer.score.LeadSheetReader.read(raw), scoreJson = raw,
                tutorialUrl = tutorialUrl, revision = sheet.revision + 1).also { saved = it }
        }
    }
}
