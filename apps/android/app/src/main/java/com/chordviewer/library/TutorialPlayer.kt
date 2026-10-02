package com.chordviewer.library

import android.annotation.SuppressLint
import android.content.Intent
import android.content.ActivityNotFoundException
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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
    var foreground by remember(lifecycle) { mutableStateOf(lifecycle.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    var error by remember(url, sheetId, accountId) { mutableStateOf<String?>(null) }
    var webView by remember(url, sheetId, accountId) { mutableStateOf<WebView?>(null) }
    var fullscreenView by remember { mutableStateOf<View?>(null) }
    var fullscreenCallback by remember { mutableStateOf<WebChromeClient.CustomViewCallback?>(null) }
    var menu by remember { mutableStateOf(false) }
    fun closeFullscreen(notifyPlayer: Boolean = true) {
        val callback = fullscreenCallback
        fullscreenCallback = null
        fullscreenView?.let { (it.parent as? ViewGroup)?.removeView(it) }
        fullscreenView = null
        if (notifyPlayer) callback?.onCustomViewHidden()
    }
    DisposableEffect(lifecycle, url, sheetId, accountId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) foreground = true
            if (event == Lifecycle.Event.ON_STOP) { closeFullscreen(); foreground = false; webView?.onPause(); webView?.loadUrl("about:blank") }
        }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { closeFullscreen(); lifecycle.lifecycle.removeObserver(observer) }
    }
    Surface(color = PaperColor, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, BorderColor)) {
        Column(Modifier.padding(horizontal = 8.dp).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Tutorial", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Tutorial actions") }
                    DropdownMenu(menu, { menu = false }) {
                        if (id != null) DropdownMenuItem(text = { Text("Open on YouTube") }, onClick = {
                            menu = false
                            try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$id"))) }
                            catch (_: ActivityNotFoundException) { error = "No app is available to open YouTube on this device." }
                        })
                        if (editable) DropdownMenuItem(text = { Text(if (url == null) "Add tutorial link" else "Edit tutorial link") },
                            onClick = { menu = false; details() })
                        if (id == null && !editable) DropdownMenuItem(text = { Text("No tutorial linked") }, enabled = false, onClick = {})
                    }
                }
            }
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                // YouTube requires a viewport of at least 200 × 200 CSS pixels.
                val playerModifier = Modifier.fillMaxWidth().height(maxOf(200.dp, maxWidth * 9f / 16f))
                    .semantics { contentDescription = "Tutorial video" }
                if (foreground && id != null) key(url, sheetId, accountId) {
                    AndroidView(modifier = playerModifier,
                        factory = {
                            WebView(it).apply {
                                // A wrap-content WebView gives percentage-height embeds a zero-height viewport.
                                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
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
                                webChromeClient = object : WebChromeClient() {
                                    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                                        if (fullscreenView != null) { callback.onCustomViewHidden(); return }
                                        fullscreenCallback = callback
                                        fullscreenView = view
                                    }
                                    override fun onHideCustomView() { closeFullscreen(notifyPlayer = false) }
                                }
                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                                        request.isForMainFrame && (request.url.scheme != "https" || request.url.host != context.packageName)
                                    override fun onReceivedError(view: WebView, request: WebResourceRequest, problem: WebResourceError) {
                                        if (request.isForMainFrame) error = "The tutorial player could not load. Open it on YouTube."
                                    }
                                }
                                val player = "https://www.youtube.com/embed/$id?playsinline=1&controls=1&fs=1&autoplay=0"
                                val html = """<!doctype html><html style="height:100%"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                                    <body style="margin:0;height:100%;overflow:hidden;background:#000"><iframe style="display:block;width:100%;height:100%"
                                    src="$player" title="YouTube tutorial" frameborder="0"
                                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>"""
                                loadDataWithBaseURL("https://${context.packageName}/", html, "text/html", "UTF-8", null)
                                webView = this
                            }
                        }, onRelease = { released ->
                            closeFullscreen()
                            released.stopLoading()
                            released.loadUrl("about:blank")
                            released.onPause()
                            released.destroy()
                            if (webView === released) webView = null
                        })
                } else Surface(color = SageColor, modifier = playerModifier, shape = MaterialTheme.shapes.small) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(if (url == null) "No tutorial linked" else if (id == null) "Tutorial unavailable" else "", Modifier.padding(8.dp), color = InkColor)
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
    fullscreenView?.let { video ->
        Dialog(onDismissRequest = { closeFullscreen() }, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
            val window = (LocalView.current.parent as DialogWindowProvider).window
            DisposableEffect(window) {
                val bars = WindowCompat.getInsetsController(window, window.decorView)
                bars.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                bars.hide(WindowInsetsCompat.Type.systemBars())
                onDispose { bars.show(WindowInsetsCompat.Type.systemBars()) }
            }
            AndroidView(factory = { video }, modifier = Modifier.fillMaxSize().background(Color.Black))
        }
    }
}
