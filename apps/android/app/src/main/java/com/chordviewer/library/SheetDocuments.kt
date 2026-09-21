package com.chordviewer.library

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import com.chordviewer.score.ScoreImport
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

data class SheetDocumentActions(val importSheet: () -> Unit, val exportSheet: () -> Unit)

/** Only the specific documents chosen in the system picker are accessed; grants aren't persisted. */
@Composable
fun rememberSheetDocuments(model: LibraryViewModel, userId: String?): SheetDocumentActions {
    val resolver = LocalContext.current.contentResolver
    val scope = rememberCoroutineScope()
    var importRequest by remember { mutableStateOf<Long?>(null) }
    var exportRequest by remember { mutableStateOf<Pair<Long, String>?>(null) }
    var importReadJob by remember { mutableStateOf<Job?>(null) }
    LaunchedEffect(userId) { importReadJob?.cancel(); importReadJob = null; importRequest = null; exportRequest = null }
    DisposableEffect(Unit) { onDispose { importReadJob?.cancel() } }
    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val request = importRequest
        importRequest = null
        if (uri == null && request != null) model.cancelDocument(request)
        if (uri != null && request != null && model.acceptsDocument(request)) {
            importReadJob?.cancel()
            importReadJob = scope.launch {
            try {
                val (name, text) = withContext(Dispatchers.IO) {
                    val readContext = currentCoroutineContext()
                    readContext.ensureActive()
                    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) cursor.getString(0) else null
                    } ?: throw IllegalArgumentException("The selected document has no filename. Choose a .json, .xml or .musicxml file.")
                    val bytes = requireNotNull(resolver.openInputStream(uri)) { "This document could not be opened." }.use { input ->
                        val result = ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            readContext.ensureActive()
                            val count = input.read(buffer)
                            readContext.ensureActive()
                            if (count < 0) break
                            require(result.size() + count <= ScoreImport.MAX_BYTES) { "Choose a file no larger than 1 MiB." }
                            result.write(buffer, 0, count)
                        }
                        result.toByteArray()
                    }
                    val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
                    name to text
                }
                model.previewImport(request, text, name)
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                currentCoroutineContext().ensureActive()
                model.documentFailure(request, if (error is IllegalArgumentException) error.message ?: "This document could not be imported." else "Could not read this document. Choose a UTF-8 JSON or MusicXML file.")
            }
            }
        }
    }
    val exportPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val request = exportRequest
        exportRequest = null
        if (uri == null && request != null) model.cancelDocument(request.first)
        if (uri != null && request != null && model.acceptsDocument(request.first)) scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    requireNotNull(resolver.openOutputStream(uri, "wt")) { "This document could not be opened for writing." }.use { it.write(request.second.toByteArray(Charsets.UTF_8)) }
                }
                model.documentFailure(request.first, "JSON exported. Your library save is separate.")
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                model.documentFailure(request.first, "The export could not be written. Choose another location and try again.")
            }
        }
    }
    return SheetDocumentActions(
        importSheet = { importReadJob?.cancel(); importReadJob = null; importRequest = model.documentRequest(); importPicker.launch(arrayOf("*/*")) },
        exportSheet = {
            importReadJob?.cancel(); importReadJob = null
            val payload = model.exportScore()
            if (payload != null) {
                val filename = model.state.value.draftTitle.trim().replace(Regex("[^A-Za-z0-9 _-]"), "_").take(80).ifBlank { "lead-sheet" }
                exportRequest = model.documentRequest() to payload; exportPicker.launch("$filename.json")
            }
        },
    )
}
