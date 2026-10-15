# ADR 0004: Share a versioned editable score contract

Decided: 2026-09-20–21, through M2–M5. Recorded retrospectively: 2026-10-15.

**Decision:** Represent music as versioned score JSON with independent chord and melody lanes on an integer-tick timeline. Begin with one treble melody voice and support a chord-only view. The contracts package owns schemas, TypeScript validation and API definitions; Kotlin implements equivalent rules using shared conformance fixtures. Preserve older valid score versions when expanding keys, meters or harmony.

**Reason:** Both clients and the backend must agree on musical meaning without sharing a UI implementation. Explicit pitch spelling, duration and identity support editing and exchange more reliably than pictures or arrays of chord labels.

**Related:** [0002: client boundaries](0002-native-clients-and-rest-backend.md); extended by [0010: structured harmony](0010-structured-harmony-and-logical-chords.md).

**Source:** [ChordsViewer Implementation](codex://threads/01a0ba24-bd02-76c3-a842-47f1e5890c74), accepted single-treble-staff scope and expanded M5 keys/meters; [score contract](../architecture/score-contract.md).
