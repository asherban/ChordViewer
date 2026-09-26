# Local draft recovery and explicit Save

Accepted for M7 on 2026-09-26. Both clients automatically keep a device-local recovery copy after an authored score, title, tutorial or editing position changes. **Save remains explicit.** Recovery never writes to the backend automatically and does not merge simultaneous edits.

## Workflow

- Edit an already-created or imported sheet in Create. A status reports a pending local write, its successful completion, or storage failure. Practice does not alter the score; transposition and held MIDI notes are excluded.
- Leave the draft open during a connection failure. A failed server Save retains it. Retry Save after reconnecting.
- After browser reload or Android process restart, authenticate as the same account and choose **Recover unsaved work → Restore draft** in Library. Android requires sign-in after every process restart. Cold-start authentication needs the backend.
- Restore includes the entire authored score, even if its temporary title is blank, the title/tutorial fields, original saved revision and editing position. MIDI entry starts paused with no pending gesture, selection or undo/redo history.
- If the original changed or entered Trash, normal Save is blocked. **Save as new sheet** creates a new identity with the recovered music, title and tutorial; the original is untouched. **Reload latest version** asks before replacing the current draft and removes its consumed recovery copies only after a successful reload. An unavailable original can still be recovered as new.
- Explicit successful Save removes the current writer's copy and the consumed recovery source. Compare-and-delete preserves a source updated by another still-open writer. Switching sheets, leaving Create or signing out keeps confirmed copies. Sign-out hides them until the owning account authenticates.
- **Delete recovery copy** asks before removing only that copy. It does not delete the backend sheet or an open in-memory draft; continuing to edit can create another copy.

Library's **Draft** designation is independent of unsaved work. It is saved metadata, not an autosave control.

## Storage and concurrency

Web uses IndexedDB, not cookies or credential storage. Every mounted workspace and deliberate restore gets an independent writer identity, so two tabs cannot overwrite each other's copies. The same browser origin/profile shares the bounded store; another origin, port or profile has different storage. The chooser refreshes on focus and local writes. A transaction is acknowledged only after completion; blocked upgrades close late-opened connections.

Android uses serialized IO with an explicitly locked AtomicFile store inside `noBackupFilesDir/drafts`. SHA-256 account prefixes separate records. Reads and writes share the lock, files are size-bounded, and the committed timestamp is read back before acknowledging a write. Automatic Android/cloud backups exclude this directory.

Both stores validate their input against the score and saved-sheet contracts and match the authenticated owner. Each store permits **20 recovery copies total across accounts**, with **2,200,000 UTF-8 bytes per record**, including both the baseline and draft scores. Existing copies are never silently evicted to make space. Storage failure is visible and leaves the editor usable; Save and JSON export remain available. Corrupt records are counted in a visible warning while healthy copies remain available to restore. Unreadable records remain stored and still count toward the quota; they are never silently erased.

Saved baseline revisions remain unchanged by recovery. The server's owner checks and expected-revision condition are still authoritative, including when the cached Library summary is stale. There is no background server save, automatic conflict overwrite, three-way merge or cross-device draft synchronization.

## Boundaries

These copies contain private music and titles but no passwords, cookies or bearer credentials. They are protected by the browser profile or Android app sandbox, not by application-level encryption. A person with access to that OS profile/device can inspect them. Account isolation prevents accidental exposure through the application UI; it cannot defend against a compromised same-origin script or a rooted device.

Only a **confirmed** local write is recoverable. Closing a process during a pending write may retain the previous version. Clearing browser/app storage, uninstalling, storage eviction or device loss can remove recovery copies. Power-loss durability is not guaranteed. New-sheet/import dialogs, unfinished MIDI gestures, unapplied capture proposals and undo history are not recovery snapshots. A backend/database backup contains saved sheets, not these device-local drafts.

Implementation references: [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction), [browser storage and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction), [Android AtomicFile](https://developer.android.com/reference/android/util/AtomicFile), [Android no-backup files](https://developer.android.com/reference/android/content/ContextWrapper#getNoBackupFilesDir()). See [M7 execution](m7-execution-plan.md) and [verification](../development/m7-verification.md).
