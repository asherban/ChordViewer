package com.chordviewer

import android.content.Context

internal object ApiConfiguration {
    var baseUrl: String? = null
        private set
    const val allowLoopbackHttp: Boolean = true
    const val productionOrigin = "https://chordviewer.app"
    private const val preferencesName = "debug-backend"
    private const val productionKey = "use-production"
    lateinit var localOrigin: String
        private set
    val allowsRegistration: Boolean get() = baseUrl != productionOrigin

    fun initialize(context: Context) {
        localOrigin = EndpointPolicy.origin(context.assets.open("api-origin.txt").bufferedReader().use { it.readText().trim() })
        baseUrl = if (context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).getBoolean(productionKey, false))
            productionOrigin else localOrigin
    }

    // Persist only the choice, never an arbitrary URL. The new Activity reads it on startup.
    fun selectProduction(context: Context, production: Boolean): Boolean {
        val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        val previous = preferences.getBoolean(productionKey, false)
        val saved = runCatching { preferences.edit().putBoolean(productionKey, production).commit() }.getOrDefault(false)
        // A failed commit can still change SharedPreferences in memory. Keep rotation on the old backend.
        if (!saved) preferences.edit().putBoolean(productionKey, previous).apply()
        return saved
    }

    fun permitsHttp(origin: String): Boolean = origin == baseUrl || java.net.URI(origin).host == "127.0.0.1"
    fun requireAllowedOrigin(origin: String) = Unit
}
