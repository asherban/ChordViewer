# M4 MIDI chord authoring verification

M4 adds the first private authoring workflow to the web and native Android clients. Work is on `codex/m4-midi-authoring`, stacked above the local testing launcher. No public deployment or push is included.

## Delivered behavior

Open a personal sheet, choose a position/duration and start MIDI entry. Releasing all physical keys inserts one recognized chord and advances the cursor. Sustain does not delay entry, and rapid gestures are consumed in order before display updates. Both clients use the same chord vocabulary and musical fixtures.

Select a chord to change its name/duration, choose alternatives, replace it once from MIDI or delete it. Undo/redo retains up to 100 music/cursor changes. Unknown or blocked captures remain available for correction. No insertion silently overwrites another chord or truncates at a barline. Existing melody, ties, spelling and IDs survive chord edits and serialization.

Explicit saves send the full validated score with the current revision. Failed saves retain the draft; conflicts do not overwrite the server. Practice and Library never insert played notes. Mode changes, dialogs, saves, input changes and backgrounding pause entry; fresh arming prevents the tail of an interrupted chord from being inserted.

See the [shared authoring contract](../architecture/chord-authoring.md) for exact recognition/gesture rules and the [README](../../README.md) for launch, playback and acceptance commands.

## Checks

Verification date: 2026-09-21. Tests use the separate local API/database on port 3001, installed Chrome, LoopBe1 and the native tablet emulator. No piano or physical tablet is used.

| Check | Result |
| --- | --- |
| Web/contracts/API | Lint passed; **201 unit/contract tests across 12 files** passed; contracts, API and web production builds passed. This includes shared musical conformance, rapid/sustained gestures, draft history, failed insertion and pending replacement correction. |
| Browser regression | **9 tests passed** after the authoring layout changes: desktop/tablet/narrow shell, full-screen behavior, navigation, account isolation, persistence, failed requests and conflicts. |
| Actual browser MIDI | **3 opt-in tests passed** in installed Chrome through the real LoopBe driver: creation and selected duration, correction/delete/undo/redo, one-shot replacement, full-score save/reopen, interrupted gestures, mode/dialog/disconnect gates, failed saves and real revision conflicts. |
| Native build and unit checks | **53 JVM tests passed**; final debug, test and optimized release APK builds passed. Final lint: **0 errors, 12 existing warnings**. Release compilation and lint ran after emulator shutdown to fit this workstation's memory. |
| Actual native MIDI | **1 end-to-end instrumentation scenario passed** through the real LoopBe/debug relay: rapid chords and sustain, undo/redo, correction/delete, one-shot replacement, rejected replacement recovery without replay, read-only Practice, reconnect, and full-score save/reopen with a tutorial link. API reads verify revisions, symbols, durations and metadata; reopening selects the exact saved sheet. |

Real MIDI tests are deliberately skipped by ordinary CI unless their local prerequisites are explicitly enabled. Skips are not counted as passes. Browser permission is granted to the isolated local test context; no production MIDI events are synthesized or editor internals patched. Native instrumentation drives actual controls and observes the activity's live draft and independent API responses; Canvas rendering is checked visually. Independent API reads verify the saved music, rather than trusting a save message alone.

The first browser MIDI run failed in its exact label selector before sending any notes; using the combobox's accessible name fixed the harness. The web build caught an overly narrow inferred UUID factory type, corrected to the intended injectable string-ID factory. The first native authoring run inserted C and Dm correctly, but its score was below the viewport under too many controls; visual review prompted compact controls on both clients. These failed attempts are not counted as passes. VexFlow's existing bundle-size warning remains. Backend schema, authentication and deployment settings are unchanged.

Native automation also encountered stale Compose virtual nodes after editing. Its test helper now clears the accessibility cache before traversing controls on API 34+, using the public [UiAutomation API](https://developer.android.com/reference/android/app/UiAutomation#clearCache()). Score assertions observe the real activity model, while API reads and screenshots independently verify persistence and rendering.

## Review and cleanup

Code and security review covered ordered input, capture gates, bounded queues, correction/history state, full-score serialization, request/session generations, owner/revision checks and text rendering. Fixed findings included discarded pending captures when changing duration/position, native rejection of valid stored offsets outside the entry grid, controller cancellation parity, and a pending replacement form that could use the old symbol. A focused UI regression verifies the replacement fix. Native reopen acceptance also caught a refresh/navigation race: navigation and discard checks now read the current model rather than the last rendered state. No remaining actionable findings were reported in the reviewed implementation.

Manual symbols remain bounded printable text. React/VexFlow and native text rendering do not interpret them as HTML. The Android relay stays loopback-only, token-protected and debug-only, with a bounded ordered queue and reset on overflow. Test credentials remain private and are passed to native instrumentation through stdin; failure output is redacted and owned port mappings are cleaned up.

Removed the obsolete web-only chord recognizer and jazz-formatting helpers/tests, plus the unused Tonal dependencies. Shared executable vocabulary/recognition tests now define both clients' behavior. Previous M2 cleanup entries shown by GitButler remain outside this milestone's commits.

Verification shutdown removed the owned emulator, MIDI bridge/token and test backend containers/network, and stopped Gradle daemons and browser/web test processes. Database volumes, private backend credentials and the shared ADB server were preserved.

## Actual application screenshots

The selected mockups remain unchanged. These captures show synthetic test sheets in the running applications:

- [Web MIDI entry at 1280 × 800](../architecture/evidence/m4-web-entry.png)
- [Web narrow layout, scrolled to the chord grid](../architecture/evidence/m4-web-narrow.png)
- [Native automatic chord entry](../architecture/evidence/m4-native-entry.png)
- [Native read-only Practice with live MIDI](../architecture/evidence/m4-native-practice.png)
- [Native saved sheet reopened with its tutorial](../architecture/evidence/m4-native-reopened.png)

All five captures were opened and visually reviewed. The web tablet capture additionally asserts that an entered chord is inside the viewport. Native captures show the inserted C/Dm, the corrected Cmaj7/G unchanged during live Practice input, and Cmaj7/G/G with the saved tutorial after reopening. Controls and the score use the shared cream/sage styling; the score and sidebar scroll independently.

## Remaining scope

This is a local private alpha. The v1 score still uses a C key signature and 4/4, though chord recognition covers every pitch class. M5 adds melody input/editing and agreed import support; M6 completes Library and guided Practice. YouTube remains a stored link with web external opening, not embedded playback. Drafts survive mode changes and failed saves but not browser reload or Android process death. Physical USB/Bluetooth, Samsung/Roland compatibility, production accounts, payments, backup recovery and NAS/cloud deployment remain later work.
