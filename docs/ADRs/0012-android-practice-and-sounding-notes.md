# ADR 0012: Advance Android Practice on gestures and show sounding chords

Decided: 2026-10-02–04. Recorded retrospectively: 2026-10-15.

**Decision:** Android Practice advances when a fresh physical-key gesture completes, after all physical keys are released, and the accumulated gesture notes together with notes still sounding at that moment match the target chord. Pedal release alone does not advance. The earlier manual-advance controls are removed; metronome-based advancement remains future work.

Live chord recognition and match feedback use currently sounding notes, including released keys still held by sustain. Prefer chord spelling from the active song key and expose alternate names. Practice and tutorial playback remain independent and do not modify the authored score.

**Reason:** Requiring a fresh gesture prevents a held chord from skipping repeated targets. Including notes still sounding makes sustain affect advancement checks and live feedback. Key-aware spelling makes feedback fit the sheet. Authoring uses the physical gesture alone for insertion, independently of sustain.

**Related:** [0005: capture semantics](0005-midi-step-entry.md); [0009: live MIDI input](0009-native-usb-midi.md). This records the later Android decision, not a change to web navigation.

**Source:** [Redesign Android landscape views](codex://threads/01a0fd36-679d-7920-ab94-80736c9ef6cd) and [Rework playing chord view](codex://threads/01a10843-3fc8-72d3-b0f8-0e36d17d31f3); [Android guide](../../apps/android/README.md).
