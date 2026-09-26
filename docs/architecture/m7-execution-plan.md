# M7: recovery and complete local validation

Accepted policy (2026-09-26): automatically retain local recovery copies; server Save stays explicit. After restarting, sign into the owning account and choose a recovery copy. Keep its original server revision. If another client has saved, preserve both versions by saving the recovered work as a new sheet, or explicitly reload the server version. No automatic merge or background server writes.

Work is on `codex/m7-local-validation`, above M6. Deliver on web and native Android before marking the milestone complete.

## Execution and acceptance

1. Add bounded, validated, account-scoped local recovery storage and visible write/failure status. Persist authored notation, title/tutorial, original saved revision and edit position; never credentials, MIDI held state or Practice transposition. Separate concurrent browser workspaces. Recovery starts with MIDI paused and fresh undo history. Do not silently evict older drafts.
2. Add a Library recovery chooser, explicit restore/delete, and Save as new for conflicts or unavailable originals. Keep in-memory work through connection failures and retain recovery after session expiry. Local drafts remain on this device until saved/discarded explicitly; signing out hides them and requires the owning account to authenticate again.
3. Exercise creation, melody/chords, save, Library and Practice, reload/process restart, temporary connection loss, account boundaries and conflicting edits on both clients. Add meaningful product tests and inspect actual browser/emulator UI. Retain real LoopBe acceptance; no tests dedicated to development scripts or adapters.
4. Provide a private database backup and a safe restore into a fresh isolated local target. Verify saved music, account login, Library metadata and revisions after restore. Rebuild/recreate the local release containers without changing the existing volume; measure bounded idle and active resource use. Preserve original development and test data.
5. Review code, security and UX; fix findings and rerun affected checks. Run appropriate web/contracts/API/browser/native checks and release builds sequentially on this workstation. Update README commands, recovery/backup contracts, evidence and a verification record with exact passes and limitations. Commit coherent code/tests and docs separately, without pushing or deploying.

## Boundaries

Browser storage and app-private storage can be removed by the user or OS. A confirmed local write protects ordinary reload/process restart, not power-loss guarantees or deletion of app/browser data. Report storage errors; do not claim a recovery copy exists before its write completes. Authentication requires a reachable backend after a cold start; already-open work remains editable during an outage. Recovery snapshots exclude in-flight MIDI gestures, un-applied captures and undo history.

Backup archives contain private account and score data. Restrict local access, omit credentials from output, verify source/target identities, and never overwrite an existing database in the restore rehearsal. NAS/public deployment remains M8/M9. Hardware USB/Bluetooth and real tablet compatibility remain explicitly outside the emulator acceptance.
