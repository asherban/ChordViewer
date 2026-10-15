# ADR 0002: Separate native clients from the REST backend

Decided: 2026-09-19–20. Recorded retrospectively: 2026-10-15.

**Decision:** Maintain three application parts: a React web client, a native Kotlin/Compose Android client, and a TypeScript/Fastify REST backend using PostgreSQL and Better Auth. Both clients access saved account data through the API. MIDI processing, authoring and rendering run on the client. Web uses VexFlow; Android draws notation natively rather than embedding the web editor.

**Reason:** Web and tablet users need the same musical workflow with platform-native input and presentation. Playing music must not require a server round trip. One backend centralizes ownership, validation and persistence.

**Related:** [0004: shared score contract](0004-versioned-score-contract.md); [0001: retain this backend](0001-retain-current-backend.md).

**Source:** [ChordsViewer Implementation](codex://threads/01a0ba24-bd02-76c3-a842-47f1e5890c74), initial three-part request and M2/M3 implementation; [product plan](../architecture/product-plan.md) and [backend contract](../architecture/backend-contract.md).
