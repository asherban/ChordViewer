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
    val editor: ChordEditorState? = null,
    val midiConnected: Boolean = false,
    val liveChord: String? = null,
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
    private var active: Job? = null
    private var editor: ChordEditor? = null
    private var recognizer: ChordRecognizer? = null
    private var midiConnected = false
    private val capture = ChordGestureCapture(::captureChord)

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
        if (recognizer == null) throw IllegalArgumentException("Chord vocabulary is unavailable. Restart the app.")
        if (it.state.pending != null) throw IllegalArgumentException("Apply or discard the pending chord first.")
        if (replace) requireNotNull(it.state.selectedId) { "Select a chord before replacing it from MIDI." }
        else require(it.state.selectedId == null) { "Choose an empty insertion position, or explicitly replace the selected chord." }
        capture.arm()
        it.update { value -> value.copy(mode = if (replace) EntryMode.REPLACE else EntryMode.INSERT,
            message = if (capture.waitingForRelease) "Release all held keys first, then play a fresh chord." else if (replace) "Play and release one chord to replace the selection." else "Play a chord and release all keys to insert it.") }
    }

    fun setDuration(duration: Int) = edit {
        require(duration in CHORD_DURATIONS) { "Choose a supported duration." }
        pauseEntry()
        it.update { value -> value.copy(duration = duration, pending = value.pending?.copy(duration = duration), message = null) }
    }

    fun setPosition(position: ScorePosition) = edit {
        require(position.measureIndex in 0..it.state.score.measures.size && position.measureIndex <= 256 &&
            position.offsetTicks in 0 until BAR_TICKS && position.offsetTicks % 240 == 0) { "Choose a position inside this sheet or its next bar." }
        pauseEntry()
        it.update { value -> value.copy(position = position, selectedId = null,
            pending = value.pending?.copy(position = position, replaceId = null), alternatives = if (value.pending == null) emptyList() else value.alternatives, message = null) }
    }

    fun selectChord(id: String) = edit {
        val target = requireNotNull(ChordEdits.find(it.state.score, id)) { "Select an existing chord." }
        pauseEntry()
        it.update { value -> value.copy(selectedId = id, position = target.second, duration = target.first.durationTicks, pending = null,
            alternatives = if (id == value.lastInsertedId) value.alternatives else emptyList(), message = "Entry paused while changing this chord.") }
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
    fun discardPending() = edit { pauseEntry(); it.update { value -> value.copy(pending = null, message = "Pending chord discarded.") } }
    fun deleteChord() = edit { pauseEntry(); it.delete(requireNotNull(it.state.selectedId) { "Select a chord to delete." }) }
    fun undoChord() = edit { pauseEntry(); it.undo() }
    fun redoChord() = edit { pauseEntry(); it.redo() }

    private fun captureChord(notes: List<Int>) {
        if (notes.map { it % 12 }.distinct().size < 2) return
        val current = editor ?: return
        val state = mutableState.value
        if (state.mode != LibraryMode.CREATE || state.busy || !midiConnected || current.state.mode == EntryMode.PAUSED) return
        val value = current.state
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

    private fun edit(action: (ChordEditor) -> Unit) {
        val current = editor ?: return
        if (mutableState.value.mode != LibraryMode.CREATE || mutableState.value.busy) return
        try { action(current) } catch (error: IllegalArgumentException) {
            pauseEntry(); current.update { it.copy(message = error.message ?: "The chord could not be changed.") }
        }
        publishEditor()
    }
    private fun publishEditor() {
        val message = mutableState.value.message.let { if (it == "Changes saved." && editor?.state?.score != mutableState.value.selected?.score) null else it }
        mutableState.value = mutableState.value.copy(editor = editor?.state, midiConnected = midiConnected,
            liveChord = recognizer?.recognize(capture.heldKeys.map { it % 128 })?.candidates?.firstOrNull()?.symbol, message = message)
    }
    private fun opened(sheet: SavedSheet) { capture.pause(); editor = ChordEditor(sheet.score) }
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

    fun create(title: String, example: Boolean) {
        if (title.trim().let { it.codePointCount(0, it.length) !in 1..200 }) {
            mutableState.value = mutableState.value.copy(message = "Enter a title from 1 to 200 characters.")
            return
        }
        authenticated { client, token, request ->
            val sheet = withContext(io) { client.create(token, title, example) }
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

    private fun invalidate() { generation++; active?.cancel(); active = null }
    private fun SavedSheet.summary() = SheetSummary(id, score.title, tutorialUrl, revision, createdAt, updatedAt)
    override fun onCleared() { invalidate(); session = null; super.onCleared() }
}
