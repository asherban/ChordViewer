package com.chordviewer

import com.chordviewer.library.LibraryApi
import org.junit.Assert.*
import org.junit.Test

class ReleaseApiBoundaryTest {
    @Test fun releaseIsFixedToChordViewer() {
        assertEquals("https://chordviewer.app", BuildConfig.APPROVED_API_ORIGIN)
        assertFalse(ApiConfiguration.allowLoopbackHttp)
        assertFalse(ApiConfiguration.allowsRegistration)
    }

    @Test fun developmentOptInCannotEnableHttpInRelease() {
        for (origin in listOf("http://127.0.0.1:3000", "http://192.168.1.50:3000")) {
            // The constructor must reject the destination before a credential can be sent.
            assertThrows(IllegalArgumentException::class.java) { LibraryApi(origin, true) }
        }
    }

    @Test fun releaseClientRequiresTheReviewedOriginEvenForHttps() {
        assertThrows(IllegalArgumentException::class.java) { LibraryApi("https://unapproved.example.test") }
        val approved = BuildConfig.APPROVED_API_ORIGIN
        if (approved.isBlank()) {
            assertThrows(IllegalArgumentException::class.java) { LibraryApi("https://api.example.com") }
        } else {
            LibraryApi(approved)
            assertThrows(IllegalArgumentException::class.java) { LibraryApi("$approved.evil.test") }
        }
    }
}
