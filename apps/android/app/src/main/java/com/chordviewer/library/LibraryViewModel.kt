package com.chordviewer.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chordviewer.ApiConfiguration
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class LibraryState(
    val configured: Boolean = true,
    val user: Account? = null,
    val sheets: List<SheetSummary> = emptyList(),
    val libraryLoaded: Boolean = false,
    val selected: SavedSheet? = null,
    val draftTitle: String = "",
    val draftTutorial: String = "",
    val busy: Boolean = false,
    val message: String? = null,
) {
    val hasUnsavedChanges: Boolean get() = selected?.let {
        draftTitle != it.score.title || draftTutorial != it.tutorialUrl.orEmpty()
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

    fun authenticate(email: String, password: String, name: String?) {
        if (mutableState.value.busy || api == null) return
        invalidate()
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
                if (request == generation) mutableState.value = mutableState.value.copy(sheets = sheets, libraryLoaded = true, busy = false)
            } catch (error: Exception) { fail(error, request) }
        }
    }

    fun refresh() = authenticated { client, token ->
        val sheets = withContext(io) { client.list(token) }
        mutableState.value.copy(sheets = sheets, libraryLoaded = true, selected = null, draftTitle = "", draftTutorial = "", busy = false, message = null)
    }

    fun open(id: String) = authenticated { client, token ->
        val sheet = withContext(io) { client.get(token, id) }
        mutableState.value.copy(selected = sheet, draftTitle = sheet.score.title, draftTutorial = sheet.tutorialUrl.orEmpty(), busy = false, message = null)
    }

    fun create(title: String, example: Boolean) {
        if (title.trim().let { it.codePointCount(0, it.length) !in 1..200 }) {
            mutableState.value = mutableState.value.copy(message = "Enter a title from 1 to 200 characters.")
            return
        }
        authenticated { client, token ->
            val sheet = withContext(io) { client.create(token, title, example) }
            mutableState.value.copy(sheets = listOf(sheet.summary()) + mutableState.value.sheets,
                selected = sheet, draftTitle = sheet.score.title, draftTutorial = sheet.tutorialUrl.orEmpty(), busy = false, message = "Sheet created.")
        }
    }

    fun updateDraft(title: String, tutorialUrl: String) {
        if (!mutableState.value.busy && mutableState.value.selected != null) {
            mutableState.value = mutableState.value.copy(draftTitle = title.take(400), draftTutorial = tutorialUrl.take(500))
        }
    }

    fun save() {
        val selected = mutableState.value.selected ?: return
        val title = mutableState.value.draftTitle
        val tutorialUrl = mutableState.value.draftTutorial
        authenticated { client, token ->
            val sheet = withContext(io) { client.save(token, selected, title, tutorialUrl) }
            mutableState.value.copy(sheets = mutableState.value.sheets.map { if (it.id == sheet.id) sheet.summary() else it },
                selected = sheet, draftTitle = sheet.score.title, draftTutorial = sheet.tutorialUrl.orEmpty(), busy = false, message = "Changes saved.")
        }
    }

    fun closeSheet() {
        if (!mutableState.value.busy) mutableState.value = mutableState.value.copy(selected = null, draftTitle = "", draftTutorial = "", message = null)
    }

    fun signOut() {
        val previous = session
        invalidate()
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

    private fun authenticated(action: suspend (LibraryGateway, String) -> LibraryState) {
        val current = session ?: return
        val client = api ?: return
        if (mutableState.value.busy) return
        val request = generation
        mutableState.value = mutableState.value.copy(busy = true, message = null)
        active = viewModelScope.launch {
            try {
                val next = action(client, current.token)
                if (request == generation) mutableState.value = next
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
            generation++
            mutableState.value = LibraryState(message = message)
        } else mutableState.value = mutableState.value.copy(busy = false, message = message)
    }

    private fun invalidate() { generation++; active?.cancel(); active = null }
    private fun SavedSheet.summary() = SheetSummary(id, score.title, tutorialUrl, revision, createdAt, updatedAt)
    override fun onCleared() { invalidate(); session = null; super.onCleared() }
}
