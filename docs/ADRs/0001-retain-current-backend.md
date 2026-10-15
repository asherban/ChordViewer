# ADR 0001: Retain the current backend for the current milestones

Decided: 2026-10-15. Recorded: 2026-10-15.

**Decision:** Keep Fastify, PostgreSQL and Better Auth behind the existing REST API. Keep explicit server Save with local draft recovery and the existing local-development/private-NAS deployment roadmap. Do not proceed with the proposed Firebase refactor for the current milestones.

**Reason:** Firebase introduces more architecture and operational complexity than these milestones need. Continuing with the working design avoids a backend and synchronization rewrite. A future hosting or saving change needs a separate decision; no cloud provider is selected by this record.

**Related:** Reaffirms [0002: application boundaries](0002-native-clients-and-rest-backend.md), [0003: deployment](0003-local-first-development-and-portable-deployment.md) and [0007: recovery and Save](0007-local-recovery-and-explicit-save.md).

**Source:** User decision in [Inspect uncommitted files](codex://threads/01a1408c-5198-74a2-b326-784866cb4b97), following the [Firebase evaluation](codex://threads/01a135df-cdd5-7491-9509-7d009364e114). See the retained [backend contract](../architecture/backend-contract.md).
