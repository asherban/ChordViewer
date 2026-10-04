package com.chordviewer

import org.junit.Assert.*
import org.junit.Test

class EndpointPolicyTest {
    private val approved = "https://api.example.com"

    @Test fun releaseAllowsOnlyTheApprovedHttpsOrigin() {
        assertEquals(approved, EndpointPolicy.requireProductionOrigin("https://API.example.com:443/", approved))
        listOf("http://api.example.com", "http://192.168.1.50:3000", "https://api.example.com.evil.test",
            "https://api.example.com:8443", "https://evil.test", "https://user:password@api.example.com",
            "https://api.example.com/path", "https://api.example.com?host=evil.test").forEach {
            assertThrows(IllegalArgumentException::class.java) { EndpointPolicy.requireProductionOrigin(it, approved) }
        }
        assertThrows(IllegalArgumentException::class.java) { EndpointPolicy.requireProductionOrigin(approved, "") }
        assertThrows(IllegalArgumentException::class.java) { EndpointPolicy.requireProductionOrigin("http://localhost", "http://localhost") }
    }

    @Test fun recoveryCopiesStayWithTheirServer() {
        assertEquals("drafts", EndpointPolicy.recoveryDirectory("http://127.0.0.1:3000"))
        assertNotEquals(EndpointPolicy.recoveryDirectory("http://192.168.1.50:3000"), EndpointPolicy.recoveryDirectory("http://192.168.1.50:3001"))
        assertEquals(EndpointPolicy.recoveryDirectory(approved), EndpointPolicy.recoveryDirectory(approved))
    }
}
