package com.chordviewer.library

import android.annotation.SuppressLint
import android.content.Intent
import android.content.ActivityNotFoundException
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.chordviewer.ui.*

private val canonicalVideo = Regex("^https://www\\.youtube\\.com/watch\\?v=([A-Za-z0-9_-]{11})$")
private fun videoId(url: String?): String? = url?.let { canonicalVideo.matchEntire(it)?.groupValues?.get(1) }

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TutorialPanel(url: String?, editable: Boolean, details: () -> Unit, sheetId: String? = null, accountId: String? = null) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val id = videoId(url)
    var playing by remember(url, sheetId, accountId) { mutableStateOf(false) }
    var error by remember(url, sheetId, accountId) { mutableStateOf<String?>(null) }
    var webView by remember(url, sheetId, accountId) { mutableStateOf<WebView?>(null) }
    DisposableEffect(lifecycle, url, sheetId, accountId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) { playing = false; webView?.onPause(); webView?.loadUrl("about:blank") }
        }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    Surface(color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Tutorial", style = MaterialTheme.typography.titleMedium)
            if (playing && id != null) {
                AndroidView(modifier = Modifier.fillMaxWidth().heightIn(min = 220.dp).height(220.dp),
                    factory = {
                        WebView(it).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.allowFileAccess = false
                            settings.allowContentAccess = false
                            settings.setAllowFileAccessFromFileURLs(false)
                            settings.setAllowUniversalAccessFromFileURLs(false)
                            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            settings.javaScriptCanOpenWindowsAutomatically = false
                            settings.setSupportMultipleWindows(false)
                            settings.mediaPlaybackRequiresUserGesture = true
                            settings.safeBrowsingEnabled = true
                            webChromeClient = WebChromeClient()
                            webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                                    request.isForMainFrame && (request.url.scheme != "https" || request.url.host != context.packageName)
                                override fun onReceivedError(view: WebView, request: WebResourceRequest, problem: WebResourceError) {
                                    if (request.isForMainFrame) { error = "The tutorial player could not load. Open it on YouTube."; playing = false }
                                }
                            }
                            val player = "https://www.youtube.com/embed/$id?playsinline=1"
                            val html = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                                <body style="margin:0;background:#000"><iframe width="100%" height="220"
                                src="$player" title="YouTube tutorial" frameborder="0"
                                allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>"""
                            loadDataWithBaseURL("https://${context.packageName}/", html, "text/html", "UTF-8", null)
                            webView = this
                        }
                    }, onRelease = { released ->
                        released.stopLoading()
                        released.loadUrl("about:blank")
                        released.onPause()
                        released.destroy()
                        if (webView === released) webView = null
                    })
            } else Surface(color = SageColor, modifier = Modifier.fillMaxWidth().height(120.dp), shape = MaterialTheme.shapes.small) {
                Box { Text("▶  YouTube tutorial", Modifier.padding(20.dp), color = InkColor) }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (url == null) Text("No tutorial linked", color = MutedColor)
            else if (id == null) Text("This tutorial link is unavailable. Edit it to use a valid YouTube video.", color = MutedColor)
            else {
                Button(onClick = { playing = !playing; error = null }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(if (playing) "Stop video" else "Play tutorial")
                }
                OutlinedButton(onClick = {
                    val target = Uri.parse("https://www.youtube.com/watch?v=$id")
                    try { context.startActivity(Intent(Intent.ACTION_VIEW, target)) }
                    catch (_: ActivityNotFoundException) { error = "No app is available to open YouTube on this device." }
                }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Open on YouTube") }
                Text("Use the YouTube player controls for playback and speed. The score moves independently.",
                    style = MaterialTheme.typography.bodySmall, color = MutedColor)
            }
            if (editable) OutlinedButton(onClick = details, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text(if (url == null) "Add tutorial link" else "Edit tutorial link")
            }
        }
    }
}
