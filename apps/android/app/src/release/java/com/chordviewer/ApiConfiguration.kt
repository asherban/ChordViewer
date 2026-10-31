package com.chordviewer

import android.content.Context

internal object ApiConfiguration {
    var baseUrl: String? = null
        private set
    const val allowLoopbackHttp: Boolean = false
    const val allowsRegistration: Boolean = false

    fun initialize(context: Context) {
        baseUrl = EndpointPolicy.requireProductionOrigin(
            context.assets.open("api-origin.txt").bufferedReader().use { it.readText().trim() },
            BuildConfig.APPROVED_API_ORIGIN,
        )
    }

    fun permitsHttp(origin: String): Boolean = false
    fun requireAllowedOrigin(origin: String) {
        EndpointPolicy.requireProductionOrigin(origin, BuildConfig.APPROVED_API_ORIGIN)
    }
}
