package com.chordviewer.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chordviewer.ApiConfiguration
import com.chordviewer.midi.ChordGestureCapture
import com.chordviewer.midi.MidiInputEvent
import com.chordviewer.score.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class LibraryMode(val label: String) { LIBRARY("Library"), CREATE("Create"), PRACTICE("Practice") }

data class LibraryState(
    val configured: Boolean = true,
    val user: Account? = null,
    val sheets: List<SheetSummary> = emptyList(),
    val libraryLoaded: Boolean = false,
    val selected: SavedSheet? = null,
    val mode: LibraryMode = LibraryMode.LIBRARY,
    val draftTitle: String = "",
    val draftTutorial: String = "",
    val editor: ScoreEditorState? = null,
    val midiConnected: Boolean = false,
    val liveChord: String? = null,
    val importPreview: ImportedScore? = null,
    val importTitle: String = "",
    val busy: Boolean = false,
    val message: String? = null,
) {
    val hasUnsavedChanges: Boolean get() = selected?.let {
        draftTitle != it.score.title || draftTutorial != it.tutorialUrl.orEmpty() || editor?.score?.let { score -> score != it.score } == true
    } ?: false
}

/** Tokens exist only in this activity's ViewModel; process death requires another sign-in. */
class LibraryViewModel(
    private val api: LibraryGateway? = ApiConfiguration.baseUrl?.let { LibraryApi(it, ApiConfiguration.allowLoopbackHttp) },
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val mutableState = MutableStateFlow(LibraryState(configured = api != null))
    val state = mutableState.asStateFlow()
    private var session: AccountSession? = null
    private var generation = 0L
    private var documentSequence = 0L
    private var documentGeneration = 0L
    private var importJob: Job? = null
    private var importParsing = false
    private var active: Job? = null
    private var editor: ScoreEditor? = null
    private var recognizer: ChordRecognizer? = null
    private var midiConnected = false
    private val capture = ChordGestureCapture(::captureGesture)

    fun configureChordVocabulary(json: String) { recognizer = ChordRecognizer(json) }

    /** Called synchronously for every ordered transport event, independently of Compose rendering. */
    fun onMidiEvent(event: MidiInputEvent) {
        when (event) {
            is MidiInputEvent.Reset -> {
                midiConnected = event.connected
                capture.reset()
                pauseEntry()
                editor?.update { it.copy(message = event.reason) }
            }
            is MidiInputEvent.Bytes -> {
                capture.accept(event.data)
                if (!capture.armed) editor?.update { it.copy(mode = EntryMode.PAUSED) }
            }
        }
        publishEditor()
    }

    fun pauseEntry() {
        capture.pause()
        editor?.update { it.copy(mode = EntryMode.PAUSED) }
        publishEditor()
    }

    fun armEntry(replace: Boolean = false) = edit {
        if (!midiConnected) throw IllegalArgumentException("Connect MIDI before arming chord entry.")
        if (recognizer == null && it.state.lane == EntryLane.CHORDS) throw IllegalArgumentException("Chord vocabulary is unavailable. Restart the app.")
        if (it.state.pending != null || it.state.pendingMelody != null) throw IllegalArgumentException("Apply or discard the pending entry first.")
        val selected = if (it.state.lane == EntryLane.CHORDS) it.state.selectedId else it.state.selectedMelodyId
        if (replace) requireNotNull(selected) { "Select an event before replacing it from MIDI." }
        else require(selected == null) { "Choose an empty insertion position, or explicitly replace the selected event." }
        capture.arm()
        it.update { value -> value.copy(mode = if (replace) EntryMode.REPLACE else EntryMode.INSERT,
            message = if (capture.waitingForRelease) "Release all held keys first, then play again." else if (replace) "Play and release once to replace the selection." else if (value.lane == EntryLane.MELODY) "Play one note and release it to insert. Overlapping pitches are rejected." else "Play a chord and release all keys to insert it.") }
    }

    fun setLane(lane: EntryLane) = edit {
        pauseEntry()
        require(it.state.pending == null && it.state.pendingMelody == null) { "Apply or discard the pending entry before changing lanes." }
        it.update { value -> value.copy(lane = lane, position = if (lane == EntryLane.CHORDS) value.chordPosition else value.melodyPosition,
            selectedId = null, selectedMelodyId = null, alternatives = emptyList(), message = null) }
    }

    fun setDuration(duration: Int) = edit {
        require(duration in CHORD_DURATIONS || duration == it.state.score.measureTicks) { "Choose a supported duration." }
        pauseEntry()
        it.update { value -> value.copy(duration = duration, pending = value.pending?.copy(duration = duration), message = null) }
    }

    fun setMelodyDuration(duration: ScoreDuration) = edit {
        require(duration in MELODY_DURATIONS) { "Choose a supported note duration." }
        pauseEntry()
        it.update { value -> value.copy(melodyDuration = duration, pendingMelody = value.pendingMelody?.copy(duration = duration), message = null) }
    }

    fun setPosition(position: ScorePosition) = edit {
        require(position.measureIndex in 0..it.state.score.measures.size && position.measureIndex <= 256 &&
            position.offsetTicks in 0 until it.state.score.measureTicks) { "Choose a position inside this sheet or its next bar." }
        pauseEntry()
        it.update { value -> value.copy(position = position, selectedId = null, selectedMelodyId = null,
            pending = value.pending?.copy(position = position, replaceId = null), pendingMelody = value.pendingMelody?.copy(position = position, replaceId = null),
            alternatives = if (value.pending == null) emptyList() else value.alternatives, message = null) }
    }

    fun selectChord(id: String) = edit {
        require(it.state.pending == null && it.state.pendingMelody == null) { "Apply or discard the pending entry before selecting another event." }
        val target = requireNotNull(ChordEdits.find(it.state.score, id)) { "Select an existing chord." }
        pauseEntry()
        it.update { value -> value.copy(lane = EntryLane.CHORDS, selectedId = id, selectedMelodyId = null, position = target.second, duration = target.first.durationTicks, pending = null, pendingMelody = null,
            alternatives = if (id == value.lastInsertedId) value.alternatives else emptyList(), message = "Entry paused while changing this chord.") }
    }

    fun addChord(symbol: String) = edit {
        pauseEntry()
        it.commit(ChordEdits.insert(it.state.score, it.state.position, it.state.duration, symbol.trim()))
    }

    fun selectMelody(id: String) = edit {
        require(it.state.pending == null && it.state.pendingMelody == null) { "Apply or discard the pending entry before selecting another event." }
        val target = requireNotNull(MelodyEdits.find(it.state.score, id)) { "Select an existing note or rest." }
        pauseEntry()
        it.update { value -> value.copy(lane = EntryLane.MELODY, selectedId = null, selectedMelodyId = id, position = target.second,
            melodyDuration = target.first.duration, pending = null, pendingMelody = null, alternatives = emptyList(), message = "Entry paused while changing melody.") }
    }

    fun applyMelody(pitch: ScorePitch?) = edit {
        pauseEntry()
        val value = it.state
        val pending = value.pendingMelody
        val selected = pending?.replaceId ?: value.selectedMelodyId
        val spec = MelodySpec(pending?.duration ?: value.melodyDuration, pitch)
        it.commit(if (selected != null) MelodyEdits.replace(value.score, selected, spec)
            else MelodyEdits.insert(value.score, pending?.position ?: value.position, spec))
    }

    fun deleteMelody() = edit {
        pauseEntry()
        val id = requireNotNull(it.state.selectedMelodyId) { "Select a note or rest." }
        val target = requireNotNull(MelodyEdits.find(it.state.score, id))
        it.commitScore(MelodyEdits.delete(it.state.score, id), target.second, "Replaced with a rest. Timing is preserved.")
        it.update { value -> value.copy(lastMelodyId = id) }
    }

    fun setMelodyTie(enabled: Boolean) = edit {
        pauseEntry()
        val id = requireNotNull(it.state.selectedMelodyId) { "Select a note to edit its tie." }
        val target = requireNotNull(MelodyEdits.find(it.state.score, id))
        it.commitScore(MelodyEdits.setTie(it.state.score, id, enabled), target.second, if (enabled) "Tied to the next adjacent note." else "Tie removed.")
        it.update { value -> value.copy(selectedMelodyId = id) }
    }

    fun changeChord(symbol: String, duration: Int) = edit {
        pauseEntry()
        val selected = requireNotNull(it.state.selectedId) { "Select a chord to change." }
        it.commit(ChordEdits.replace(it.state.score, selected, duration, symbol.trim()))
        it.update { value -> value.copy(mode = EntryMode.PAUSED, message = "Chord changed.") }
    }

    fun applyPending(symbol: String) = edit {
        pauseEntry()
        val pending = requireNotNull(it.state.pending) { "There is no pending chord." }
        val mutation = pending.replaceId?.let { id -> ChordEdits.replace(it.state.score, id, pending.duration, symbol.trim()) }
            ?: ChordEdits.insert(it.state.score, pending.position, pending.duration, symbol.trim())
        it.commit(mutation)
        it.update { value -> value.copy(mode = EntryMode.PAUSED) }
    }
    fun discardPending() = edit { pauseEntry(); it.update { value -> value.copy(pending = null, pendingMelody = null, message = "Pending entry discarded.") } }
    fun deleteChord() = edit { pauseEntry(); it.delete(requireNotNull(it.state.selectedId) { "Select a chord to delete." }) }
    fun undoChord() = edit { pauseEntry(); it.undo() }
    fun redoChord() = edit { pauseEntry(); it.redo() }

    private fun captureGesture(notes: List<Int>) {
        val current = editor ?: return
        val state = mutableState.value
        if (state.mode != LibraryMode.CREATE || state.busy || !midiConnected || current.state.mode == EntryMode.PAUSED) return
        val value = current.state
        if (value.lane == EntryLane.MELODY) {
            if (notes.distinct().size != 1) {
                pauseEntry(); current.update { it.copy(message = "Melody needs one pitch at a time. Release overlapping notes, then start entry again.") }; publishEditor(); return
            }
            val pitch = try { midiToPitch(notes.distinct().single(), value.score.keySignature) } catch (error: IllegalArgumentException) {
                pauseEntry(); current.update { it.copy(message = error.message) }; publishEditor(); return
            }
            val replacing = if (value.mode == EntryMode.REPLACE) value.selectedMelodyId else null
            val pending = PendingMelody(pitch, value.position, value.melodyDuration, replacing)
            try {
                val spec = MelodySpec(value.melodyDuration, pitch)
                current.commit(replacing?.let { MelodyEdits.replace(value.score, it, spec) } ?: MelodyEdits.insert(value.score, value.position, spec))
                if (replacing != null) { pauseEntry(); current.update { it.copy(message = "Note replaced. Entry paused.") } }
            } catch (error: IllegalArgumentException) {
                pauseEntry(); current.update { it.copy(pendingMelody = pending, message = error.message) }
            }
            publishEditor(); return
        }
        if (notes.map { it % 12 }.distinct().size < 2) return
        val candidates = recognizer?.recognize(notes)?.candidates?.map { it.symbol }.orEmpty()
        val replacing = if (value.mode == EntryMode.REPLACE) value.selectedId else null
        val pending = PendingChord(notes, value.position, value.duration, replacing)
        if (candidates.isEmpty()) {
            pauseEntry()
            current.update { it.copy(pending = pending, alternatives = emptyList(), message = "Chord not recognized. Enter its symbol to keep this gesture, or discard it.") }
        } else {
            try {
                val mutation = replacing?.let { ChordEdits.replace(value.score, it, value.duration, candidates.first()) }
                    ?: ChordEdits.insert(value.score, value.position, value.duration, candidates.first())
                current.commit(mutation, candidates)
                if (replacing != null) { pauseEntry(); current.update { it.copy(message = "Chord replaced. Entry paused.") } }
            } catch (error: IllegalArgumentException) {
                pauseEntry()
                current.update { it.copy(pending = pending, alternatives = candidates, message = error.message) }
            }
        }
        publishEditor()
    }

    private fun edit(action: (ScoreEditor) -> Unit) {
        val current = editor ?: return
        if (mutableState.value.mode != LibraryMode.CREATE || mutableState.value.busy) return
        try { action(current) } catch (error: IllegalArgumentException) {
            pauseEntry(); current.update { it.copy(message = error.message ?: "The score could not be changed.") }
        }
        publishEditor()
    }
    private fun publishEditor() {
        val message = mutableState.value.message.let { if (it == "Changes saved." && editor?.state?.score != mutableState.value.selected?.score) null else it }
        mutableState.value = mutableState.value.copy(editor = editor?.state, midiConnected = midiConnected,
            liveChord = recognizer?.recognize(capture.heldKeys.map { it % 128 })?.candidates?.firstOrNull()?.symbol, message = message)
    }
    private fun opened(sheet: SavedSheet) { capture.pause(); editor = ScoreEditor(sheet.score) }
    private fun clearEditor() { capture.pause(); editor = null }

    fun authenticate(email: String, password: String, name: String?) {
        if (mutableState.value.busy || api == null) return
        invalidate()
        clearEditor()
        session = null
        mutableState.value = LibraryState(busy = true)
        if (email.isBlank() || email.length > 254 || password.length !in 12..128 ||
            (name != null && name.trim().let { it.codePointCount(0, it.length) !in 1..100 })) {
            mutableState.value = LibraryState(message = "Enter an email, a password of 12–128 characters, and a name when creating an account.")
            return
        }
        val request = generation
        active = viewModelScope.launch {
            try {
                val accountSession = withContext(io) { api.signIn(email, password, name) }
                if (request != generation) return@launch
                session = accountSession
                mutableState.value = LibraryState(user = accountSession.user, busy = true)
                val sheets = withContext(io) { api.list(accountSession.token) }
                if (request == generation) { mutableState.value = mutableState.value.copy(sheets = sheets, libraryLoaded = true, busy = false); publishEditor() }
            } catch (error: Exception) { fail(error, request) }
        }
    }

    fun refresh() = authenticated { client, token, request ->
        val sheets = withContext(io) { client.list(token) }
        ensureCurrent(request)
        clearEditor()
        mutableState.value.copy(sheets = sheets, libraryLoaded = true, selected = null, editor = null, draftTitle = "", draftTutorial = "", busy = false, message = null)
    }

    fun changeMode(mode: LibraryMode) {
        if (!mutableState.value.busy) { pauseEntry(); mutableState.value = mutableState.value.copy(mode = mode) }
    }

    fun open(id: String, mode: LibraryMode = LibraryMode.CREATE) = authenticated { client, token, request ->
        val sheet = withContext(io) { client.get(token, id) }
        ensureCurrent(request)
        opened(sheet)
        mutableState.value.copy(selected = sheet, editor = editor?.state, mode = mode, draftTitle = sheet.score.title, draftTutorial = sheet.tutorialUrl.orEmpty(), busy = false, message = null)
    }

    fun create(title: String, example: Boolean, key: String = "C", time: ScoreTimeSignature = ScoreTimeSignature()) {
        if (title.trim().let { it.codePointCount(0, it.length) !in 1..200 }) {
            mutableState.value = mutableState.value.copy(message = "Enter a title from 1 to 200 characters.")
            return
        }
        authenticated { client, token, request ->
            val sheet = withContext(io) { client.create(token, title, example, key, time) }
            ensureCurrent(request)
            opened(sheet)
            mutableState.value.copy(sheets = listOf(sheet.summary()) + mutableState.value.sheets,
                selected = sheet, editor = editor?.state, mode = LibraryMode.CREATE, draftTitle = sheet.score.title, draftTutorial = sheet.tutorialUrl.orEmpty(), busy = false, message = "Sheet created.")
        }
    }

    fun updateDraft(title: String, tutorialUrl: String) {
        if (!mutableState.value.busy && mutableState.value.selected != null) {
            mutableState.value = mutableState.value.copy(draftTitle = title.take(400), draftTutorial = tutorialUrl.take(500))
        }
    }

    fun updateScoreSettings(key: String, time: ScoreTimeSignature) = edit { current ->
        pauseEntry()
        require(current.state.pending == null && current.state.pendingMelody == null) { "Apply or discard the pending entry before changing key or meter." }
        val previous = current.state
        val changed = changeScoreSettings(previous.score, key, time)
        if (changed != previous.score) {
            current.commitScore(changed, previous.position.copy(offsetTicks = previous.position.offsetTicks.coerceAtMost(changed.measureTicks - 1)), "Key and meter updated. Existing notes keep their pitches.")
            current.update { it.copy(duration = if (previous.duration == previous.score.measureTicks) changed.measureTicks else previous.duration,
                chordPosition = it.chordPosition.copy(offsetTicks = it.chordPosition.offsetTicks.coerceAtMost(changed.measureTicks - 1)),
                melodyPosition = it.melodyPosition.copy(offsetTicks = it.melodyPosition.offsetTicks.coerceAtMost(changed.measureTicks - 1))) }
        }
    }

    /** Document callbacks are scoped to the account that opened the picker. */
    fun documentRequest(): Long {
        pauseEntry(); importJob?.cancel(); importJob = null
        if (importParsing) mutableState.value = mutableState.value.copy(busy = false)
        importParsing = false; documentGeneration = generation; return ++documentSequence
    }
    fun acceptsDocument(request: Long): Boolean = request == documentSequence && documentGeneration == generation && session != null
    fun cancelDocument(request: Long) {
        if (request != documentSequence) return
        documentSequence++; importJob?.cancel(); importJob = null
        if (importParsing) mutableState.value = mutableState.value.copy(busy = false)
        importParsing = false
    }
    fun documentFailure(request: Long, message: String) {
        if (acceptsDocument(request)) mutableState.value = mutableState.value.copy(message = message)
    }
    fun previewImport(request: Long, text: String, filename: String) {
        if (!acceptsDocument(request) || mutableState.value.busy) return
        pauseEntry()
        importParsing = true
        mutableState.value = mutableState.value.copy(busy = true, message = null)
        importJob = viewModelScope.launch {
            try {
                val preview = withContext(io) { ScoreImport.read(text, filename) }
                if (!acceptsDocument(request)) return@launch
                importParsing = false
                mutableState.value = mutableState.value.copy(busy = false, importPreview = preview, importTitle = preview.score.title)
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                if (acceptsDocument(request)) {
                    importParsing = false
                    mutableState.value = mutableState.value.copy(busy = false, message = if (error is IllegalArgumentException) error.message ?: "This file could not be imported." else "This file could not be read.")
                }
            }
        }
    }
    fun updateImportTitle(title: String) { if (!mutableState.value.busy) mutableState.value = mutableState.value.copy(importTitle = title.take(400)) }
    fun dismissImport() { if (!mutableState.value.busy) { documentSequence++; mutableState.value = mutableState.value.copy(importPreview = null, importTitle = "") } }
    fun saveImport() {
        val preview = mutableState.value.importPreview ?: return
        val title = mutableState.value.importTitle.trim()
        if (title.codePointCount(0, title.length) !in 1..200) { mutableState.value = mutableState.value.copy(message = "Enter a title from 1 to 200 characters."); return }
        authenticated { client, token, request ->
            val sheet = withContext(io) { client.importScore(token, preview.score, title) }
            ensureCurrent(request)
            opened(sheet)
            mutableState.value.copy(sheets = listOf(sheet.summary()) + mutableState.value.sheets, selected = sheet, editor = editor?.state,
                mode = LibraryMode.CREATE, draftTitle = sheet.score.title, draftTutorial = sheet.tutorialUrl.orEmpty(), importPreview = null, importTitle = "", busy = false, message = "Imported as a new sheet.")
        }
    }
    fun exportScore(): String? {
        pauseEntry()
        val value = mutableState.value
        val score = editor?.state?.score ?: return null
        return try { LeadSheetWriter.write(score.copy(title = value.draftTitle.trim())).also {
            require(it.toByteArray(Charsets.UTF_8).size <= ScoreImport.MAX_BYTES) { "The exported score exceeds the 1 MiB limit." }
        } } catch (error: IllegalArgumentException) { mutableState.value = value.copy(message = error.message ?: "Correct the sheet title before exporting."); null }
    }

    fun save() {
        val selected = mutableState.value.selected ?: return
        pauseEntry()
        val draftScore = editor?.state?.score ?: selected.score
        val draft = selected.copy(score = draftScore, scoreJson = LeadSheetWriter.write(draftScore))
        val title = mutableState.value.draftTitle
        val tutorialUrl = mutableState.value.draftTutorial
        authenticated { client, token, request ->
            val sheet = withContext(io) { client.save(token, draft, title, tutorialUrl) }
            ensureCurrent(request)
            editor?.update { it.copy(score = sheet.score) }
            mutableState.value.copy(sheets = mutableState.value.sheets.map { if (it.id == sheet.id) sheet.summary() else it },
                selected = sheet, editor = editor?.state, draftTitle = sheet.score.title, draftTutorial = sheet.tutorialUrl.orEmpty(), busy = false, message = "Changes saved.")
        }
    }

    fun signOut() {
        val previous = session
        invalidate()
        clearEditor()
        session = null
        mutableState.value = LibraryState(configured = api != null, message = "Signed out on this device.")
        val request = generation
        if (previous != null && api != null) viewModelScope.launch {
            try { withContext(io) { api.signOut(previous.token) } }
            catch (error: Exception) {
                if (error is CancellationException) throw error
                if (request == generation) mutableState.value = mutableState.value.copy(
                    message = "Signed out on this device. The server could not confirm session revocation; the old session will expire automatically.",
                )
            }
        }
    }

    private fun ensureCurrent(request: Long) { if (request != generation) throw CancellationException("Account changed") }
    private fun authenticated(action: suspend (LibraryGateway, String, Long) -> LibraryState) {
        val current = session ?: return
        val client = api ?: return
        if (mutableState.value.busy) return
        pauseEntry()
        val request = generation
        mutableState.value = mutableState.value.copy(busy = true, message = null)
        active = viewModelScope.launch {
            try {
                val next = action(client, current.token, request)
                if (request == generation) { mutableState.value = next; publishEditor() }
            } catch (error: Exception) { fail(error, request) }
        }
    }

    private fun fail(error: Exception, request: Long) {
        if (error is CancellationException) throw error
        if (request != generation) return
        val message = (error as? ApiFailure)?.userMessage
            ?: if (error is IllegalArgumentException) "The title or server response was invalid. Check your input and try again."
            else "Could not reach the local service. Check that it is running and the Android API connection is set up."
        if (error is ApiFailure && error.status == 401) {
            session = null
            clearEditor()
            generation++
            mutableState.value = LibraryState(message = message)
        } else mutableState.value = mutableState.value.copy(busy = false, message = message)
    }

    private fun invalidate() { generation++; active?.cancel(); active = null; importJob?.cancel(); importJob = null; importParsing = false }
    private fun SavedSheet.summary() = SheetSummary(id, score.title, tutorialUrl, revision, createdAt, updatedAt)
    override fun onCleared() { invalidate(); session = null; super.onCleared() }
}

