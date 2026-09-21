# M5 melody and import verification

Work is on `codex/m5-melody-input`, stacked above `codex/dev-test-policy`. The user selected MusicXML plus ChordViewer JSON and expanded keys/time signatures. This milestone remains local; no push, public deployment or NAS change is included.

## Delivered behavior

Both clients support separate chord/melody MIDI passes, direct chord/note/rest entry, selectable notation, pitch/spelling/duration changes, ties, deletion to an equal rest, one-shot MIDI replacement and a common undo history. Score v2 supports 30 major/minor keys and 36 meters; v1 C/4/4 remains readable. Settings preserve written pitches and reject truncation. Imports preview locally, then save with a new server identity. JSON export retains exact current score data.

See the [melody and import contract](../architecture/melody-authoring.md) for decisions and supported notation, and the [README](../../README.md) for developer commands. The launcher now offers **P** for chord/smoke MIDI and **M** for melody, broadcasting through the existing real LoopBe driver to both clients.

## Verification

Verification date: 2026-09-22. Checks use the isolated test API/database on loopback port 3001, desktop browsers and the native tablet emulator. No piano or physical tablet is required. Real MIDI cases are opt-in; skipped cases are never counted as passes.

| Check | Result |
| --- | --- |
| Web/contracts/API unit checks | **300 tests across 17 files passed**, with ESLint and all production builds. Covers shared musical rules, all supported keys/meters, gesture/history behavior, import parsing and API input validation. After adding a MusicXML byte-order-mark regression case, the focused browser import suite passed **50/50** (48 shared fixtures plus two browser-specific checks). |
| Browser regression and M5 workflows | **19 distinct cases passed**: 16 existing/layout cases plus 3 new M5 cases. Includes shell/navigation/accounts/conflicts, dense v2 accidental rendering and disjoint note selection, manual melody with ties/rests/history/settings, MusicXML preview, JSON download/reimport with a fresh identity, and unsafe file rejection. |
| Real browser MIDI | Included in the 19 above: **4 opt-in cases passed** in installed Chrome through actual LoopBe input. The new melody case fills two G-major 3/4 bars with six separate releases, including repeated F-sharps under sustain, then edits and reopens the score without changing its chord lane. |
| Backend integration | **11 cases passed** against the rebuilt test container: fresh owned imports, v2 creation, foreign-ID isolation, malformed writes, origin checks, revisions, mixed create/import quota concurrency and authentication throttling. |
| Native build and unit checks | **73 JVM product tests passed**, including shared musical/import fixtures, document request lifetime and pending-entry retention. Debug, test and optimized release APKs build; lint reports **0 errors and 12 existing warnings**. These checks passed again after the final BOM fix. |
| Native full authoring acceptance | **Passed** in the tablet emulator using actual LoopBe MIDI: chord/melody insertion, polyphony rejection, manual notes/rests/ties, selection, history, one-event replacement, key/meter change, read-only Practice, reconnect, save/reopen, Android system JSON export, document-picker import preview and save-as-new with a fresh server identity. |
| Native backend and layout acceptance | **Passed**: authenticated backend persistence/ownership and the notation visual test. Captures include D major in 3/4, C-sharp major in 12/8 and C-flat major in 3/4. |
| Android platform XML parser | **2 tests passed** on the final APK: supported MusicXML/JSON roundtrip with BOM equivalence, and rejection of external declarations before parsing. This uses the actual Android parser rather than only the desktop JVM. |

The new browser test file first failed during test discovery because Playwright does not allow worker-level launch options inside a describe group. Moving those options to file scope fixed the harness; no product behavior was exercised in that failed attempt. The first native unit run found an incorrect expectation that a cross-bar tie should survive a meter change separating its notes; the expectation now follows the agreed rule. Failed attempts are not counted as passes. After the web export was made compact and bounded to the import size limit, its complete JSON roundtrip scenario passed again.

The initial full native authoring run reached the saved melody's reopen step but asserted before the asynchronous request completed. The test now waits for the reopened score before checking it, and the complete workflow passed on rerun. A separate parser check found valid MusicXML with a UTF-8 byte-order mark was rejected by the native character-stream parser; both clients now remove exactly one leading mark after enforcing the original byte limit, with a shared regression fixture and an actual Android parser assertion.

The final full npm check passed after the remaining web parity fixes. Native build and emulator work were serialized with browser work on this 16 GB workstation. The final native build used one 1,536 MiB JVM with in-process Kotlin; the optional command is in both developer READMEs. No unrelated user processes were stopped to free memory.

After verification, the owned test API/database containers and network were stopped and removed while retaining their database volume and private settings. The owned emulator, bridge, bridge token and temporary M5 credentials fixture were removed or stopped. The pre-existing native fixture, shared ADB server and unrelated user processes were preserved.

Browser screenshots were opened and visually reviewed: [saved melody in G major and 3/4](../architecture/evidence/m5-web-melody.png) and [MusicXML import preview in D major and 6/8](../architecture/evidence/m5-web-import.png). They show actual synthetic application data, with connected staves, ties, rests, accidentals and the selected cream/sage styling. Accepted mockups remain unchanged.

Native screenshots were also opened and visually reviewed: [saved melody in D major and 3/4](../architecture/evidence/m5-native-melody.png), [C-sharp major in 12/8](../architecture/evidence/m5-native-sharps.png), and [C-flat major in 3/4](../architecture/evidence/m5-native-flats.png). These exercise natural signs, ties, all seven sharps/flats and a two-digit meter without clipping.

Two additional native import screenshots landed during window transitions and were excluded from the checked-in visual evidence. The actual export, picker, preview and new-copy assertions passed; those frames are not presented as proof of the settled import layout.

## Code and security review

Independent review covered the shared TS/Kotlin musical rules, v2 validation, web/native draft state and notation selection, local import parsers, document lifetimes, account/session boundaries, backend ownership and atomic quotas. Parser fixtures cover malformed/duplicate JSON, excessive nesting, hostile XML/DTD/entities, unsupported notation and byte limits. Imported IDs cannot overwrite another sheet; creation and import share an owner transaction lock. No parser resolves file-supplied remote URLs. Text is rendered as text by React/VexFlow/native Canvas.

Review fixes include retaining pending captures until explicit resolution, remembering each entry lane's cursor, preserving lane/duration history, supporting the dotted-sixteenth position grid, disjoint dense-note hitboxes, key helper rejection of inherited object properties, strict duplicate JSON-name rejection in both runtimes, and rejecting stale Android document-read completions using a request nonce plus owned-job cancellation. Both clients pause after overlapping melody pitches and keep exported JSON within the import size limit. The container includes both schema package exports. Superseded document reads check cancellation between bounded chunks and close streams/cursors; a document provider blocked inside a read remains outside the application's scheduling control.

Removed chord-only editor names and the obsolete “melody comes later” UI text. The shared score editor now owns both lanes. Development-only tools receive runtime validation and documentation, without new dedicated test suites, in accordance with repository testing policy.

## Limits

MusicXML is a strict supported subset, not arbitrary score conversion. Compressed MXL, multi-part/voice/staff notation, pickups, repeats, tuplets, grace notes, microtones, transposition and changing key/meter within a score are rejected. Lyrics, layout, dynamics and performance metadata are omitted with a preview warning. JSON export excludes separately stored tutorial/account metadata. Undo is bounded to 100 musical edits; durable recovery after reload/process death remains later work.

This is a private alpha. Guided Practice and full Library organization remain M6. Physical USB/Bluetooth and Samsung/Roland compatibility, production accounts/payments, operational recovery, NAS and cloud hosting remain later milestones. Existing VexFlow bundle-size warnings are unchanged in scope.
