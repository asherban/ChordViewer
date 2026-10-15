# ADR 0012: Drive Android Practice from matching sounding chords

Decided: 2026-10-02–04. Recorded retrospectively: 2026-10-15.

**Decision:** Android Practice advances by matching chords; its earlier manual-advance controls are removed. Metronome-based advancement remains future work. Live chord recognition and matching use all sounding notes, including released keys still held by sustain. Prefer chord spelling from the active song key and expose alternate names. Practice and tutorial playback remain independent and do not modify the authored score.

**Reason:** Practice should follow what the player hears. Sustain can combine notes across physical releases, while key-aware spelling makes feedback fit the sheet. This is distinct from authoring's physical release-to-insert gesture.

**Related:** [0005: capture semantics](0005-midi-step-entry.md); [0009: live MIDI input](0009-native-usb-midi.md). This records the later Android decision, not a change to web navigation.

**Source:** [Redesign Android landscape views](codex://threads/01a0fd36-679d-7920-ab94-80736c9ef6cd) and [Rework playing chord view](codex://threads/01a10843-3fc8-72d3-b0f8-0e36d17d31f3); [Android guide](../../apps/android/README.md).
