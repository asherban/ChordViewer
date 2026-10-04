package com.chordviewer

import java.net.URI
import java.security.MessageDigest

/** API destinations are origins, never paths, credentials, queries or redirect targets. */
internal object EndpointPolicy {
    fun origin(value: String): String {
        val uri = URI(value)
        require(uri.scheme in listOf("http", "https") && uri.host != null)
        require(uri.userInfo == null && uri.query == null && uri.fragment == null)
        require(uri.path.orEmpty() in listOf("", "/") && uri.port in -1..65535 && uri.port != 0)
        val port = if (uri.port == -1 || uri.scheme == "https" && uri.port == 443 || uri.scheme == "http" && uri.port == 80) "" else ":${uri.port}"
        return "${uri.scheme}://${uri.host.lowercase()}$port"
    }

    fun requireProductionOrigin(value: String, approved: String): String {
        require(approved.isNotBlank()) { "Production API origin has not been approved." }
        val expected = origin(approved)
        require(URI(expected).scheme == "https" && approved == expected)
        val actual = origin(value)
        require(actual == expected) { "This API origin is not approved for production." }
        return actual
    }

    fun recoveryDirectory(origin: String): String =
        // Preserve the existing loopback recovery copies when upgrading an installed debug app.
        if (origin == "http://127.0.0.1:3000") "drafts" else "drafts-" +
            MessageDigest.getInstance("SHA-256").digest(origin.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
