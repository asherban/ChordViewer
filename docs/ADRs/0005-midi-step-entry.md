# ADR 0005: Use automatic MIDI step entry in separate lanes

Decided: 2026-09-20–21. Recorded retrospectively: 2026-10-15.

**Decision:** Start authoring with separate chord and melody passes. The user selects musical duration; holding keys longer does not change it. Chord capture accumulates the physical gesture and inserts once all physical keys are released. Sustain does not delay insertion. Consume ordered MIDI events independently of UI rendering, and provide corrections, deletion and undo.

**Reason:** Step entry lets users build sheets at their own pace without performing to a recording clock. Processing events independently of display frames avoids losing fast gestures. Separate lanes allow correction without changing the other musical part.

**Related:** [0004: score timeline](0004-versioned-score-contract.md); [0012: sounding-note feedback](0012-android-practice-and-sounding-notes.md), which has different sustain semantics from capture.

**Source:** [ChordsViewer Implementation](codex://threads/01a0ba24-bd02-76c3-a842-47f1e5890c74), step-entry and automatic-insertion requests and M4 acceptance; [chord authoring](../architecture/chord-authoring.md).
