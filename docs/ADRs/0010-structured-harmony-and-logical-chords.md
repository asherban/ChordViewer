# ADR 0010: Store structured harmony and logical cross-bar chords

Decided: 2026-10-03. Recorded retrospectively: 2026-10-15.

**Decision:** Use structured chord construction for the complete tablet dialog, including spelled roots and basses, extensions, alterations, custom tones and polychords. Score v3 carries definitions and logical chord identities. Barline fragments represent one editable chord; duration changes and deletion shift later chords while preserving the melody. Validate chord meaning at authoring, import and save boundaries, while retaining valid older scores.

**Reason:** A fixed preset list or arbitrary label cannot represent the requested harmony reliably. Separating logical chords from their rendered fragments preserves meaning when editing across bars and lets web, Android and the API agree on legal data.

**Related:** Extends [0004: versioned score contract](0004-versioned-score-contract.md); [0005: separate authoring lanes](0005-midi-step-entry.md).

**Source:** Complete-dialog and legal-chord decisions in [Plan tablet chord entry redesign](codex://threads/01a102df-9731-7cb0-b8a3-53f695b5b77b); [score contract](../architecture/score-contract.md) and [chord authoring](../architecture/chord-authoring.md).
