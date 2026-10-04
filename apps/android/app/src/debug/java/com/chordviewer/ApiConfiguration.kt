package com.chordviewer

import android.content.Context

internal object ApiConfiguration {
    var baseUrl: String? = null
        private set
    const val allowLoopbackHttp: Boolean = true

    fun initialize(context: Context) {
        baseUrl = EndpointPolicy.origin(context.assets.open("api-origin.txt").bufferedReader().use { it.readText().trim() })
    }

    fun permitsHttp(origin: String): Boolean = origin == baseUrl || java.net.URI(origin).host == "127.0.0.1"
    fun requireAllowedOrigin(origin: String) = Unit
}
