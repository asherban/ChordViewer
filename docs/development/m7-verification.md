# M7 local validation

Verification date: 2026-09-26. Work is on `codex/m7-local-validation`, stacked above M6. The [execution plan](../architecture/m7-execution-plan.md), [recovery contract](../architecture/draft-recovery.md) and [backup guide](local-backup-restore.md) define the scope. No NAS or public deployment, push or pull request is included.

## Delivered behavior

Web and Android retain bounded local recovery copies while keeping server Save explicit. Library provides restore/delete actions. Restore retains the original saved revision, complete authored score, title/tutorial and editing position, with MIDI paused and fresh history. Conflicts offer Save as new or a confirmed server reload. Different accounts cannot see each other's copies in the app. Separate web writers retain their own drafts, including when another recovery of the same sheet is chosen. Storage/quota errors remain visible and do not block explicit Save.

Private backup commands archive the database and exact running API image. Restore checks the archive and creates a fresh isolated project/volume. It does not overwrite the development/test database. README documents developer commands and the recovery/privacy boundaries.

## Checks

| Area | Result |
| --- | --- |
| Web/contracts | 321 tests across 21 files passed, including malformed/foreign recovery, restored meter duration and React StrictMode write acknowledgement. ESLint and type/build checks run with the pinned workspace toolchain. |
| Backend | 15/15 API/migration checks passed: owner isolation, strict payloads, revisions, metadata/Trash/quota concurrency, cookies/bearer auth and throttling. No backend schema or API route change was needed for recovery. |
| Container lifecycle | 5/5 persistence checks passed: saved score, browser renewal, restart, rebuild/recreation in the same named volume, password login, expiration and revocation. |
| Browser UI | The broad suite passed 21 cases with 5 opt-in MIDI cases skipped. The expanded M7 recovery suite covers 5 cases: offline save/reload/full-score restore, two-tab conflict/copy, account isolation, same-sheet recovery switching and bounded-storage failure without eviction. |
| Browser real MIDI | 7/7 in the focused Chrome run, including all 5 physical LoopBe cases and 2 manual/import cases. Chord and melody entry, corrections, interrupted capture, save conflicts and fresh-chord Practice advancement passed. |
| Native build/unit/lint | 85/85 JVM product tests passed, zero failures/errors/skips. Debug and test APKs and optimized unsigned release APK built successfully. Lint: 0 errors, 13 pre-existing warnings. Final combined Android build took 7m45s on this workstation. |
| Native recovery | Both instrumentation phases passed again on the final product build: real UI chord/note creation, actual loss of the app's backend route, failed save retention, retry, committed app-private files, process restart/sign-in, conflict restore and Save as new. |
| Native authoring | The complete real-LoopBe UI scenario passed: chord/melody entry, corrections, undo/redo, rejected proposals, disconnect/reconnect, rests/ties, key/meter changes, explicit save/reopen and Android document export/import. |
| Native Practice | The real-LoopBe UI scenario passed: held C4 across navigation/metadata Save, manual movement, one fresh G7 advancement, unchanged server score/revision, melody preference and sign-out disconnect. The tutorial document/iframe mounted; Stop, replay, Hide, leaving Practice and app background released it correctly. |
| Native Library | The UI organization scenario passed: favorite, Draft designation, duplicate, Move to Trash and restore, with saved state verified against the backend. |
| Dependency audit | `npm audit --audit-level=high` reported 0 vulnerabilities. |

Commands are in [README](../../README.md). Native product acceptance uses private account fixtures sent over stdin; credentials are excluded from command arguments and screenshots. The host runner only disconnects its own port-3000 reverse mapping while retaining a separate API verification route. There are no dedicated automated tests for development scripts, process helpers or MIDI adapters.

## Backup and resources

The running isolated test backend was backed up to a private local directory. Its database dump was **176,850 bytes**, API image archive **112,007,168 bytes**. Both checksums matched before restore. Windows ACL inspection confirmed access for the current user and SYSTEM only.

Restore project `chordviewer-restore-d851f9559231` started healthy on loopback port 3002 with a fresh volume and the archived API image. A fresh password login returned the same account identity. All **15 Library records and 15 full scores** for the existing synthetic acceptance account matched the source exactly, including tutorial URLs, revisions, timestamps, **3 favorites and 2 Draft designations**. That account had no trashed sheets at backup time; Trash restore behavior is covered by the API/UI suites, not claimed as part of this account comparison. The restored project was stopped afterward; its volume and private settings were retained.

A bounded workload performed **500 authenticated full-score reads**, five concurrent requests, with 100 ms between batches: **0 errors**, **29.58 ms median**, **78.63 ms p95**, **176.22 ms maximum**. A backend snapshot around this workload reported API **64.43 MiB** and database **38.58 MiB**, with API CPU **51.02%** and database CPU **0.07%**. The preceding post-restore snapshot was API **57.6 MiB**, database **44.75 MiB**. These are brief local observations, not peak measurements or a public-load capacity promise.

During native release optimization the Java process used about **1,877 MiB** and Docker's WSL VM **1,450 MiB**. Unrelated Supabase, Fire Engine and n8n containers remained running. Finish heavy builds before emulator tests on this 16 GB workstation. The initial emulator runs used 2,048 MiB; a later cold boot stalled Android System UI and blocked the sign-in field. It was stopped without clearing data and retried with the documented 2,560 MiB configuration. This was a host/emulator startup failure, not counted as a passed product test.

## Review and evidence

Code and security review covered original revision retention, account boundaries, asynchronous writes and cleanup, independent writer IDs, quota/corrupt data, MIDI reset/history, atomic file locking/readback, IndexedDB transaction completion, secret exclusion, archive/path validation and fresh-target restore safety.

Review fixes include preserving the current draft when choosing another recovery of the same sheet, resetting entry duration to the recovered meter, separating account quota errors from edit conflicts, closing late blocked IndexedDB opens, and acknowledging a queued write after React's development effect replay. A settled-screen assertion exposed the latter: data was saved locally, but the old effect's completion left the status at “Writing…”. Both unit and browser regression checks now exercise acknowledgement after restoration. Recovery/conflict messages were compacted to preserve score space.

The older native authoring acceptance was updated for the current Library's **Edit** action and its deliberate **Reload saved version** action: Refresh retains the selected editor. Each run uses a unique sheet title and searches before selecting a card. The MIDI monitor may be below the sidebar viewport, so this authoring scenario checks live input in the activity model; the separate Practice scenario checks its visible held-note feedback. An interrupted rerun lost MIDI when its bounded host bridge expired; the subsequent complete run used a bridge lifetime covering the whole scenario.

The first native tutorial run found a blank WebView after the old fixed eight-second delay. Replacing that delay with a bounded 30-second document-readiness check passed, including subsequent replay and lifecycle checks. This verifies the native host document and iframe lifecycle; it does not guarantee YouTube network availability or claim uninterrupted video playback.

Browser evidence: [recovery chooser](../architecture/evidence/m7-web-recovery.png), [conflict](../architecture/evidence/m7-web-conflict.png). Native evidence: [before process restart](../architecture/evidence/m7-native-before-restart.png), [recovery chooser](../architecture/evidence/m7-native-recovery.png), [conflict](../architecture/evidence/m7-native-conflict.png), [recovered Practice](../architecture/evidence/m7-native-recovered-practice.png). Captures show actual app UI after authentication. Historical M4–M6 screenshots remain unchanged.

## Session cleanup

The owned test backend, restored rehearsal, web server, emulator and MIDI bridge were stopped. Their ports (3001, 3002, 5173, 39173, 5554/5555) had no remaining listeners. The bridge's private session token and one-off workload/comparison scripts were removed. Test and restored database volumes, private fixture/settings files and the backup archive were preserved. Existing Supabase, Fire Engine and n8n services remained running.

## Remaining limits

Physical USB/Bluetooth discovery, RP102 input latency, cable/power behavior and Samsung Tab hardware are unverified by LoopBe/emulator testing. Recovery depends on a completed local write and retained browser/app storage; device loss, uninstall, eviction and power interruption are outside the guarantee. Cold-start authentication needs the backend. Backups remain on this machine until the developer copies them to protected storage elsewhere; the restore rehearsal is not a disaster-recovery service.

The Android release APK is unsigned and its deployed HTTPS API is still unconfigured. YouTube availability remains provider-controlled. The existing web bundle-size advisory and Android lint warnings remain. M8 is the separate private NAS deployment stage; public hosting, paid access and production operations remain M9.
