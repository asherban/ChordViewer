# ADR 0007: Separate local recovery from explicit server Save

Decided: 2026-09-26; reaffirmed 2026-10-15. Recorded retrospectively: 2026-10-15.

**Decision:** Automatically retain bounded, account-scoped recovery copies on the device while server Save remains explicit. Preserve each draft's original server revision. A stale save must retain the draft and offer Save as new or deliberate reload. Recovery neither writes to the server automatically nor merges simultaneous musical edits. Use IndexedDB on web and an atomic private file store on Android.

**Reason:** Connection loss or process restart should not silently discard confirmed local work. Keeping recovery separate from synchronization limits complexity and makes conflicts explicit. Local copies complement database backups; they do not replace them.

**Related:** [0001: retain this behavior](0001-retain-current-backend.md); [0004: validated score data](0004-versioned-score-contract.md).

**Source:** Explicit M7 choice in [ChordsViewer Implementation](codex://threads/01a0ba24-bd02-76c3-a842-47f1e5890c74); [draft recovery contract](../architecture/draft-recovery.md).
