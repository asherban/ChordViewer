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
        model.updateDraftTitle("My chord study")
        model.updateDraftTutorial("https://youtu.be/dQw4w9WgXcQ")
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
        model.updateDraftTitle("Renamed")
        model.updateDraftTutorial("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
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
        model.updateDraftTitle("Unsaved title")
        model.updateDraftTutorial("https://youtu.be/dQw4w9WgXcQ")
        gateway.saveFailure = ApiFailure(409, "Changed elsewhere")
        model.save()
        advanceUntilIdle()
        assertEquals(1, model.state.value.selected!!.revision)
        assertEquals("Unsaved title", model.state.value.draftTitle)
        assertTrue(model.state.value.hasUnsavedChanges)
    }

    @Test fun consecutiveDetailsFieldsDoNotRevertOneAnotherBeforeComposeRecomposes() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle()
        model.open(gateway.sheet.id); advanceUntilIdle()
        model.updateDraftTitle("New title")
        model.updateDraftTutorial("https://youtu.be/dQw4w9WgXcQ")
        assertEquals("New title", model.state.value.draftTitle)
        assertEquals("https://youtu.be/dQw4w9WgXcQ", model.state.value.draftTutorial)
        model.changeMode(LibraryMode.LIBRARY)
        model.changeMode(LibraryMode.CREATE)
        assertEquals("New title", model.state.value.draftTitle)
        assertEquals("https://youtu.be/dQw4w9WgXcQ", model.state.value.draftTutorial)
    }

    @Test fun refreshedRemoteRevisionCannotLiftAnOlderSelectedDraftThroughMetadata() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle()
        model.open(gateway.sheet.id); advanceUntilIdle()
        model.updateDraftTitle("Unsaved local title")
        model.updateDraftTutorial("")
        gateway.remoteRevision = 2
        model.refresh(); advanceUntilIdle()
        assertEquals(2, model.state.value.sheets.single().revision)
        assertEquals(1, model.state.value.selected!!.revision)
        model.updateMetadata(gateway.sheet.id, favorite = true); advanceUntilIdle()
        assertEquals(1, gateway.metadataRevision)
        assertEquals(1, model.state.value.selected!!.revision)
        assertEquals("Unsaved local title", model.state.value.draftTitle)
        assertTrue(model.state.value.hasUnsavedChanges)
        assertTrue(model.state.value.message!!.contains("Reload saved version"))
    }

    @Test fun switchingProductModesKeepsSelectedSheetAndUnsavedDetails() = runTest(dispatcher) {
        val gateway = FakeGateway()
        val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null)
        advanceUntilIdle()
        model.open(gateway.sheet.id, LibraryMode.PRACTICE)
        advanceUntilIdle()
        assertEquals(LibraryMode.PRACTICE, model.state.value.mode)
        model.updateDraftTitle("Kept draft")
        model.updateDraftTutorial("https://youtu.be/dQw4w9WgXcQ")
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

    @Test fun melodyReleaseIgnoresSustainPreservesChordsAndRejectsOverlappingPitches() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val original = model.state.value.editor!!.score
        model.setLane(EntryLane.MELODY); model.setPosition(ScorePosition(original.measures.size)); model.armEntry()
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(176, 64, 127)))
        play(model, 60); play(model, 62)
        assertEquals(listOf(ScorePitch("C", 0, 4), ScorePitch("D", 0, 4)), model.state.value.editor!!.score.measures.last().melody.map { it.pitch })
        val beforeRejected = model.state.value.editor!!.score
        play(model, 64, 67)
        assertEquals(beforeRejected, model.state.value.editor!!.score)
        assertEquals(EntryMode.PAUSED, model.state.value.editor!!.mode)
        assertTrue(model.state.value.editor!!.message!!.contains("one pitch"))
        model.armEntry(); play(model, 40)
        assertEquals(beforeRejected, model.state.value.editor!!.score)
        assertEquals(original.measures.map { it.chords }, beforeRejected.measures.take(original.measures.size).map { it.chords })
    }

    @Test fun failedMelodyCaptureCanBeShortenedRetargetedAndAppliedWithoutReplay() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val count = gateway.sheet.score.measures.size
        model.setLane(EntryLane.MELODY); model.setPosition(ScorePosition(count, 1800)); model.armEntry(); play(model, 66)
        assertNotNull(model.state.value.editor!!.pendingMelody)
        assertEquals(ScorePitch("F", 1, 4), model.state.value.editor!!.pendingMelody!!.pitch)
        model.setLane(EntryLane.CHORDS); assertEquals(EntryLane.MELODY, model.state.value.editor!!.lane)
        model.selectChord(gateway.sheet.score.measures.first().chords.first().id)
        model.selectMelody(gateway.sheet.score.measures.first().melody.first().id)
        model.updateScoreSettings("D", ScoreTimeSignature(4, 4))
        assertNotNull(model.state.value.editor!!.pendingMelody)
        assertEquals("C", model.state.value.editor!!.score.keySignature)
        assertNull(model.state.value.editor!!.selectedId); assertNull(model.state.value.editor!!.selectedMelodyId)
        model.setMelodyDuration(ScoreDuration(16, 0)); model.setPosition(ScorePosition(count, 1200))
        model.applyMelody(model.state.value.editor!!.pendingMelody!!.pitch)
        val note = model.state.value.editor!!.score.measures.last().melody.single()
        assertEquals(1200, note.offsetTicks); assertEquals(120, note.duration.ticks); assertNull(model.state.value.editor!!.pendingMelody)
        model.setPosition(ScorePosition(count, 1200)); model.armEntry(); play(model, 67)
        assertNotNull(model.state.value.editor!!.pendingMelody)
        model.setPosition(ScorePosition(count, 1320)); model.applyMelody(ScorePitch("G", 0, 4))
        assertEquals(2, model.state.value.editor!!.score.measures.last().melody.size)
    }

    @Test fun manualLanesShareUndoAndMelodyTieDeletionSaveRoundTrip() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val position = ScorePosition(gateway.sheet.score.measures.size)
        model.setPosition(position); model.addChord("Dm7")
        model.setLane(EntryLane.MELODY); model.setPosition(position); model.applyMelody(ScorePitch("F", 0, 4)); val first = model.state.value.editor!!.lastMelodyId!!
        model.applyMelody(ScorePitch("F", 0, 4)); model.selectMelody(first); model.setMelodyTie(true)
        assertTrue(MelodyEdits.find(model.state.value.editor!!.score, first)!!.first.tieToNext)
        model.selectMelody(first); model.applyMelody(ScorePitch("G", 0, 4))
        assertFalse(MelodyEdits.find(model.state.value.editor!!.score, first)!!.first.tieToNext)
        model.undoChord(); assertTrue(MelodyEdits.find(model.state.value.editor!!.score, first)!!.first.tieToNext)
        model.selectMelody(first); model.deleteMelody()
        assertNull(MelodyEdits.find(model.state.value.editor!!.score, first)!!.first.pitch)
        assertEquals(480, MelodyEdits.find(model.state.value.editor!!.score, first)!!.first.duration.ticks)
        model.undoChord(); model.redoChord()
        assertEquals("Dm7", model.state.value.editor!!.score.measures.last().chords.single().symbol)
        model.updateDraftTitle("Melody saved"); model.updateDraftTutorial("https://youtu.be/dQw4w9WgXcQ"); model.save(); advanceUntilIdle()
        val saved = model.state.value.editor!!.score
        model.refresh(); advanceUntilIdle(); model.open(gateway.saved!!.id); advanceUntilIdle()
        assertEquals(saved, model.state.value.editor!!.score); assertFalse(model.state.value.hasUnsavedChanges)
    }

    @Test fun melodyHeldCaptureIsCancelledAcrossPausePracticeAndDisconnect() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val original = model.state.value.editor!!.score
        model.setLane(EntryLane.MELODY); model.setPosition(ScorePosition(original.measures.size)); model.armEntry()
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 60, 90)))
        model.pauseEntry(); model.armEntry(); model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(128, 60, 0)))
        assertEquals(original, model.state.value.editor!!.score)
        model.changeMode(LibraryMode.PRACTICE); play(model, 60); model.applyMelody(ScorePitch("C", 0, 4))
        model.changeMode(LibraryMode.CREATE); model.armEntry(); model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 60, 90)))
        model.onMidiEvent(MidiInputEvent.Reset(false)); model.onMidiEvent(MidiInputEvent.Reset(true)); play(model, 60)
        assertEquals(original, model.state.value.editor!!.score)
        model.armEntry(); play(model, 60); assertEquals(original.measures.size + 1, model.state.value.editor!!.score.measures.size)
    }

    @Test fun practiceRawMidiWaitsForFreshReleaseAcrossDialogAndApiBusy() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher); configure(model)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle()
        model.open(gateway.sheet.id, LibraryMode.PRACTICE); advanceUntilIdle()
        model.practiceAdvance(true)
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(176, 64, 127))) // sustain cannot delay the gesture boundary
        play(model, 60, 64, 67)
        assertEquals(1, model.state.value.practice.eventIndex)
        play(model, 60, 64, 67)
        assertEquals(1, model.state.value.practice.eventIndex)
        model.practiceBar(0)
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 60, 90)))
        model.setPracticeBlocked(true)
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(128, 60, 0)))
        model.setPracticeBlocked(false)
        assertEquals(0, model.state.value.practice.eventIndex)
        play(model, 60, 64, 67)
        assertEquals(1, model.state.value.practice.eventIndex)
        model.practiceBar(0)
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(144, 60, 90)))
        model.refresh() // busy is set synchronously before a Compose frame
        model.onMidiEvent(MidiInputEvent.Bytes(intArrayOf(128, 60, 0)))
        advanceUntilIdle()
        assertEquals(0, model.state.value.practice.eventIndex)
        play(model, 60, 64, 67)
        assertEquals(1, model.state.value.practice.eventIndex)
    }

    @Test fun importPreviewIsPrivateUntilSavedAsNewAndOldAccountResultsAreIgnored() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val request = model.documentRequest()
        model.previewImport(request, gateway.sheet.scoreJson, "example.json"); advanceUntilIdle()
        assertNotNull(model.state.value.importPreview); assertNull(gateway.saved)
        assertEquals(gateway.sheet.id, model.state.value.selected!!.id)
        model.updateImportTitle("Imported copy"); model.saveImport(); advanceUntilIdle()
        assertEquals("new_imported_sheet", model.state.value.selected!!.id)
        assertEquals("Imported copy", model.state.value.draftTitle); assertNull(model.state.value.importPreview)
        assertEquals(model.state.value.editor!!.score, LeadSheetReader.read(model.exportScore()!!))
        model.signOut(); model.previewImport(request, gateway.sheet.scoreJson, "example.json"); advanceUntilIdle()
        assertNull(model.state.value.importPreview); assertNull(model.state.value.selected)
    }

    @Test fun keyAndMeterEditsRejectTruncationAndUndoPreservesOriginalScore() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val original = model.state.value.editor!!.score
        model.updateScoreSettings("D", ScoreTimeSignature(3, 4))
        assertEquals(original, model.state.value.editor!!.score)
        model.updateScoreSettings("D", ScoreTimeSignature(6, 4))
        assertEquals("D", model.state.value.editor!!.score.keySignature)
        assertEquals(2880, model.state.value.editor!!.score.measureTicks)
        assertEquals(original.measures.map { it.chords }, model.state.value.editor!!.score.measures.map { it.chords })
        assertEquals(original.measures.flatMap { it.melody }.map { Triple(it.offsetTicks, it.duration, it.pitch) },
            model.state.value.editor!!.score.measures.flatMap { it.melody }.map { Triple(it.offsetTicks, it.duration, it.pitch) })
        assertFalse(model.state.value.editor!!.score.measures.flatMap { it.melody }.any { it.tieToNext })
        model.undoChord(); assertEquals(original, model.state.value.editor!!.score)
    }

    @Test fun eachLaneRemembersItsCursorAndHistoryRestoresDurationAndLane() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle(); model.open(gateway.sheet.id); advanceUntilIdle()
        val next = ScorePosition(gateway.sheet.score.measures.size)
        model.setPosition(next); model.setDuration(480); model.addChord("C")
        model.setLane(EntryLane.MELODY); assertEquals(ScorePosition(), model.state.value.editor!!.position)
        model.setPosition(next); model.setMelodyDuration(ScoreDuration(8, 1)); model.applyMelody(ScorePitch("C", 0, 4))
        model.setLane(EntryLane.CHORDS); assertEquals(next.copy(offsetTicks = 480), model.state.value.editor!!.position)
        model.setLane(EntryLane.MELODY); assertEquals(next.copy(offsetTicks = 360), model.state.value.editor!!.position)
        model.setMelodyDuration(ScoreDuration(16, 0)); model.undoChord()
        assertEquals(EntryLane.MELODY, model.state.value.editor!!.lane)
        assertEquals(ScoreDuration(8, 1), model.state.value.editor!!.melodyDuration)
        assertEquals(next, model.state.value.editor!!.position)
        model.undoChord(); assertEquals(EntryLane.CHORDS, model.state.value.editor!!.lane)
        assertEquals(480, model.state.value.editor!!.duration)
    }

    @Test fun aLateDocumentReadCannotReplaceNewerPreviewOrReopenACancelledImport() = runTest(dispatcher) {
        val gateway = FakeGateway(); val model = LibraryViewModel(gateway, dispatcher)
        model.authenticate("one@example.test", "a-long-password", null); advanceUntilIdle()
        val firstRequest = model.documentRequest()
        val secondRequest = model.documentRequest()
        model.previewImport(secondRequest, LeadSheetWriter.write(gateway.sheet.score.copy(title = "Newer file")), "newer.json"); advanceUntilIdle()
        model.updateImportTitle("My corrected title")
        model.previewImport(firstRequest, gateway.sheet.scoreJson, "late.json"); advanceUntilIdle()
        assertEquals("My corrected title", model.state.value.importTitle)
        assertEquals("Newer file", model.state.value.importPreview!!.score.title)
        model.dismissImport()
        model.previewImport(secondRequest, gateway.sheet.scoreJson, "cancelled.json"); advanceUntilIdle()
        assertNull(model.state.value.importPreview)
        val parsing = model.documentRequest(); model.previewImport(parsing, gateway.sheet.scoreJson, "parsing.json")
        val newer = model.documentRequest(); model.cancelDocument(newer); advanceUntilIdle()
        assertFalse(model.state.value.busy); assertNull(model.state.value.importPreview)
    }

    private class FakeGateway : LibraryGateway {
        val sheet = run {
            val score = JSONObject(javaClass.classLoader!!.getResource("lead-sheet-v1.json")!!.readText())
            LibraryJson.sheet(JSONObject().put("id", score.getString("id")).put("score", score)
                .put("tutorialUrl", JSONObject.NULL).put("revision", 1)
                .put("createdAt", "2026-09-20T12:00:00Z").put("updatedAt", "2026-09-20T12:00:00Z")
                .put("favorite", false).put("draft", false).put("trashedAt", JSONObject.NULL).put("openedAt", JSONObject.NULL))
        }
        var onGet: () -> Unit = {}
        var signInFailure: Exception? = null
        var listFailure: Exception? = null
        var revokeFailure: Exception? = null
        var saveFailure: Exception? = null
        var remoteRevision = 1
        var metadataRevision: Int? = null
        var revocations = 0
        var saved: SavedSheet? = null
        override fun signIn(email: String, password: String, name: String?): AccountSession {
            signInFailure?.let { throw it }
            return AccountSession(Account("account-a", "Name", email), "session-token")
        }
        override fun signOut(token: String) { revocations++; revokeFailure?.let { throw it } }
        override fun list(token: String): List<SheetSummary> {
            listFailure?.let { throw it }
            return listOf(SheetSummary(sheet.id, sheet.score.title, null, remoteRevision, sheet.createdAt, sheet.updatedAt))
        }
        override fun get(token: String, id: String): SavedSheet { onGet(); return saved ?: sheet }
        override fun metadata(token: String, id: String, revision: Int, title: String?, favorite: Boolean?, draft: Boolean?): SavedSheet {
            metadataRevision = revision
            if (revision != remoteRevision) throw ApiFailure(409, "This sheet changed elsewhere. In Library, choose Reload saved version.")
            return sheet.copy(revision = revision + 1)
        }
        override fun create(token: String, title: String, example: Boolean, key: String, time: ScoreTimeSignature) = sheet
        override fun importScore(token: String, score: LeadSheet, title: String): SavedSheet {
            val imported = score.copy(id = "new_imported_sheet", title = title)
            return sheet.copy(id = imported.id, score = imported, scoreJson = LeadSheetWriter.write(imported)).also { saved = it }
        }
        override fun save(token: String, sheet: SavedSheet, title: String, tutorialUrl: String?): SavedSheet {
            saveFailure?.let { throw it }
            val raw = sheet.renamedScore(title).toString()
            return sheet.copy(score = com.chordviewer.score.LeadSheetReader.read(raw), scoreJson = raw,
                tutorialUrl = tutorialUrl, revision = sheet.revision + 1).also { saved = it }
        }
    }
}
