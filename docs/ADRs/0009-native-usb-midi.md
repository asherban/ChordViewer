# ADR 0009: Use native USB MIDI with automatic input selection

Decided: 2026-10-03–04. Recorded retrospectively: 2026-10-15.

**Decision:** Receive tablet MIDI through Android's native MIDI support. For computer input, route Windows LoopBe events to the tablet's standard USB MIDI peripheral port; the computer remains USB host. Remove the token-based emulator relay. Emulator product tests inject MIDI through the test APK. Android automatically selects the first detected input and offers a picker when several devices are present; it never merges their streams.

**Reason:** Standard MIDI removes the manual connection code and shares the application's native input path with physical instruments. Backend networking remains independent. Losing an input must clear live notes and pause entry while preserving the score.

**Related:** [0005: MIDI authoring](0005-midi-step-entry.md); [0011: separate backend networking](0011-development-and-release-endpoints.md).

**Source:** [Plan USB MIDI loopback setup](codex://threads/01a10220-5a42-77d1-8805-f6bf4fbbdd59) and [Update practice MIDI controls](codex://threads/01a10852-bfb6-7442-b08e-6add4ba4c73a); [USB MIDI design](../architecture/usb-midi-connection.md).
