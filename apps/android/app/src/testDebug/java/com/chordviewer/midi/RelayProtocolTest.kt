package com.chordviewer.midi

import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class RelayProtocolTest {
    @Test fun initialResetThenFragmentedMidiAndAnotherReset() {
        val relay = RelayProtocol()
        assertEquals(MidiSnapshot(), relay.accept(frame("reset", 0)))
        relay.accept(frame("midi", 1, "[144,60]"))
        assertEquals(listOf(MidiNote(0, 60)), relay.accept(frame("midi", 2, "[96]")).held)
        assertEquals(MidiSnapshot(), relay.accept(frame("reset", 3)))
    }

    @Test fun framesRequireResetFirstAndContiguousSequence() {
        assertThrows(IllegalArgumentException::class.java) { RelayProtocol().accept(frame("midi", 0, "[144,60,90]")) }
        val relay = RelayProtocol()
        relay.accept(frame("reset", 0))
        assertThrows(IllegalArgumentException::class.java) { relay.accept(frame("midi", 2, "[144,60,90]")) }
        assertThrows(IllegalArgumentException::class.java) { relay.accept(frame("reset", 0)) }
    }

    @Test fun bytesAndMetadataMustBeIntegralAndBounded() {
        listOf("[-1]", "[256]", "[1.5]", "[\"144\"]", "[]", "[true]").forEach { data ->
            val relay = RelayProtocol()
            relay.accept(frame("reset", 0))
            assertThrows(IllegalArgumentException::class.java) { relay.accept(frame("midi", 1, data)) }
        }
        assertThrows(IllegalArgumentException::class.java) {
            RelayProtocol().accept("{\"type\":\"reset\",\"sequence\":0.0,\"timestampMs\":0}")
        }
    }

    @Test fun timestampCannotMoveBackwards() {
        val relay = RelayProtocol()
        relay.accept("{\"type\":\"reset\",\"sequence\":0,\"timestampMs\":100}")
        assertThrows(IllegalArgumentException::class.java) { relay.accept(frame("reset", 1)) }
    }

    @Test fun framingHandlesMultipleLinesAndCleanEof() {
        val input = ByteArrayInputStream("one\r\ntwo\n".toByteArray())
        assertEquals("one", input.readRelayLine())
        assertEquals("two", input.readRelayLine())
        assertNull(input.readRelayLine())
    }

    @Test fun framingRejectsOversizedUnterminatedAndNonAsciiInput() {
        listOf("x".repeat(4097) + "\n", "truncated", "secret\u0000\n").forEach { text ->
            assertThrows(IllegalArgumentException::class.java) {
                ByteArrayInputStream(text.toByteArray()).readRelayLine()
            }
        }
    }

    private fun frame(type: String, sequence: Int, data: String = "[]") =
        "{\"type\":\"$type\",\"sequence\":$sequence,\"timestampMs\":$sequence,\"data\":$data}"
}
