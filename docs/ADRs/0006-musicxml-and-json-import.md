# ADR 0006: Import MusicXML and exchange canonical score JSON

Decided: 2026-09-21. Recorded retrospectively: 2026-10-15.

**Decision:** Support the documented MusicXML subset and ChordViewer JSON as initial import formats. Parse and preview imports locally, then send validated canonical score JSON to the API to create a new owned sheet. Export canonical score JSON for exact exchange. Import does not overwrite a sheet by trusting an imported identity.

**Reason:** MusicXML brings music from notation tools; JSON preserves the application's exact score representation. Local parsing and an explicit preview keep format handling separate from server persistence and let users inspect the result before saving.

**Related:** [0004: score contract](0004-versioned-score-contract.md); [0002: backend boundary](0002-native-clients-and-rest-backend.md).

**Source:** User's M5 format choice in [ChordsViewer Implementation](codex://threads/01a0ba24-bd02-76c3-a842-47f1e5890c74); [melody and import rules](../architecture/melody-authoring.md).
