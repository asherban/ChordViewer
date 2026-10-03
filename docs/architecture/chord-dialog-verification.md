# Complete chord dialog verification

Original implementation and verification: 3 October 2026; legal-demo-data follow-up: 4 October 2026. Sol owns the implementation, test execution and real application captures. The parent reviews against the [accepted handoff](chord-dialog-implementation-plan.md) and [selected complete design](mockups/create-entry/complete-chord-dialog.png).

**Implementation and both follow-ups approved by parent review.** All original required physical interaction and layout phases passed on the 3 October APK. The parent approved that code, all twelve screenshot categories, command/result record and preservation comparison. The legal-alias path and Add-reset/direct-bass path passed separately on their finalized APKs; their results and three new captures are recorded below.

## Implemented behavior and contract

The Android Create view opens one complete Add/Edit chord popup beside a chord or the harmony append marker. The ordinary landscape layout shows root/accidental/type/bass, duration, extensions, alterations and Add/Omit/Alter/Custom/Polychord actions together. Rare types, double spellings, degree choices, custom sets and components expand internally. Small layouts and large text have bounded scrolling with a visible scroll hint and persistent actions. Every effective choice target is at least 48 dp. The native keyboard, symbol text field, obsolete manual forms and chord bar-entry buttons are removed.

Ordinary Add opening and successful Add start a fresh C-major construction with natural spelling, Root bass, whole-bar duration, closed advanced controls and reset scrolling. Each successful Add advances the append anchor. Apply and failed additions retain the current construction; pending MIDI assignment retains its captured tones and duration. A bass letter immediately selects its natural note and closes the dropdown; reopening offers optional accidental variants, including component and stack bass.

The v3 definition is shared by Kotlin/TypeScript: tonal families with seventh/extension and degree modifiers, arbitrary nonempty 12-tone sets, N.C., and flat two-to-four-component polychords. Components support independent slash bass and the stack supports an additional bass. Nested stacks are consistently excluded from the nonrecursive schema and runtime. Generated power-family extensions use explicit added degrees. Modifier sets and JSON property order do not affect semantic equality; component order and note spelling do.

A cross-bar chord shares the first fragment's real ID through `logicalId`. Any fragment selects the complete group. Append follows harmony independently of melody; duration/deletion shifts later harmony by the exact delta while preserving gaps, unrelated IDs and every authored melody event. Explicit rests protect trailing bars at edit/open/save/recovery. V1/v2 remain readable. Recognized legal aliases remain exact through timing edits. All score versions now require a supported textual construction or a matching v3 definition; malformed/unsupported text cannot enter through import, entry or persistence. Every legal chord opens the complete builder directly. Adjacent equal chords remain separate.

Fully serialized compact scores are limited to **1,040,000 UTF-8 bytes**, leaving space inside the unchanged 1,048,576-byte API request and the 2,200,000-byte saved-base-plus-draft recovery record. The 256-bar and 64-events-per-lane-per-bar bounds remain. Validation occurs before mutation; failed captured corrections retain their notes and builder.

## Original 3 October environment and preservation

Physical device: Samsung **SM-X610**, Android **16**, serial **R52X50CFTMW**, physical panel 1600×2560; the normal landscape capture is 2560×1600. Debug application: `com.chordviewer.debug`, `0.1.0-debug` / versionCode 1, compiled with SDK 35 and JDK 21.0.12.1+1. Original 3 October main APK SHA-256: `E3C2513D715C4F4155D3C21244E8F441D997B8E9E3260F7AB2974711FC35E654`. The constrained UI test supplies 1.7 times the 340 dpi normal density (578 dpi effective) and fontScale 1.35 to both the chart and popup, yielding a 708.7 dp landscape viewport and the narrow app layout; no persistent tablet display setting is changed. Browser acceptance uses installed Chrome and real Windows LoopBe MIDI. The repository-pinned Node runtime is **24.21.0** with npm 11.

All acceptance uses disposable accounts on the separately labelled `chordviewer-test` backend at **3001**. Native tests attach an isolated LibraryViewModel, not the normal session store. Recovery instrumentation uses its own private fixture and `no_backup/chord-dialog-acceptance-drafts`, never the normal drafts directory. The existing tcp:3000 reverse belongs to the user's environment; acceptance owns only the added tcp:3001 reverse. The normal unsaved sheet named `test` is never edited, saved, signed out or cleared. A private ignored backup and preservation comparison live under `.local/chord-dialog-user-preservation/`; they are not evidence artifacts or committed data. Final comparison found all 15 non-runtime original files byte-for-byte unchanged, including the account session, five normal draft files and MIDI preferences. Five acceptance-owned internal fixture/capture files and the acceptance draft directory were removed. Normal tcp:3000 remains; owned tcp:3001 was removed. Three platform-runtime artifacts changed during installation/startup: the profile-installer marker and WebView preferences changed, and a WebView spare metrics file was consumed. These are reported separately; no user score/session data was restored or rewritten to hide those runtime changes.

**Current rollout:** the normal demo API at 3000 and isolated API at 3001 have now been rebuilt with v3 and the legal-chord boundary. The normal API is healthy and its deployed validator accepts v3 and rejects malformed text. No SQL schema migration was needed. The current web production build supports the same boundary; no local web listener was active at 5173 during this follow-up. Other environments must deploy compatible API/web before distributing the APK. The original 3 October acceptance updated only the isolated API; its results below remain dated history.

## Original 3 October commands and results

Commands run from `C:\Users\andre\Projects\ChordViewer` in PowerShell. GitButler is the sole VCS interface. Local implementation remains on `codex/complete-chord-dialog`, stacked above the handoff; no push or PR.

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use
npm.cmd run check
.\scripts\development\Start-LocalBackend.ps1 -Environment test
npm.cmd run test:api
$env:CHORDVIEWER_BROWSER_CHANNEL='chrome'
$env:CHORDVIEWER_REAL_MIDI='1'
npx.cmd playwright test
npx.cmd playwright test tests/web/fast-entry.spec.ts tests/web/melody-authoring.spec.ts tests/web/recovery.spec.ts tests/web/score-layout.spec.ts
npx.cmd playwright test tests/web/score-layout.spec.ts -g 'tied fragments'
npm.cmd run test:persistence
```

| Check | Latest result |
| --- | --- |
| Shared/web/API unit behavior, lint, production builds | 459 tests / 28 files passed, zero failed/skipped; lint and contracts/API/web production builds passed. |
| Isolated API storage and additive migration | 17 passed, zero failed/skipped; includes native v3 cross-bar save/reopen, browser cookie import and a >500 KB complex document with 1,024 logical chords. |
| Browser product acceptance with real LoopBe MIDI | All 32 product cases passed across runs with real LoopBe MIDI. Initial full run: 26 passed, 6 failed (four obsolete expectations, two account rate limits); focused rerun: 16/17 passed, then the remaining tied-fragment case passed 1/1 after fixing its Rest label expectation. |
| Native unit behavior / APKs / lint | 130 passed, zero failed/errors/skipped; both debug APKs and lint passed with the final preview, cancellation and practice rendering. |
| Physical complete-dialog UI | 1/1 passed, zero failed/skipped; `OK (1 test)`, 63.402 seconds. All builder, gesture, history, storage, practice, large-text/anchor, pending correction and focused Escape phases passed. |
| Native MIDI authoring, direct melody and recovery instrumentation | Four checks passed: native MIDI authoring 1/1, direct fast entry 1/1, isolated recovery writer 1/1 and restart/conflict reader 1/1 in separate instrumentation processes. |
| Backend restart/recreate persistence | 5/5 passed, zero failed/skipped, including v3 cross-bar harmony and sessions through actual container restart/recreation with the existing volume. |

In the 32-case full browser run, all three `authoring.spec.ts` real-MIDI tests passed (9.1, 17.1 and 3.1 seconds); the later 17-case command targets fast entry, melody, recovery and score layout. The final one-case command closes the tied-fragment Rest-label assertion. This distinguishes case coverage across runs from claiming a single all-green full run.

The first native full run identified obsolete expectations for the prior trim/overwrite policy; those tests were corrected to assert the accepted new behavior. A default 2 GiB JVM and a later concurrent browser/native build hit workstation native-memory allocation failure. Builds were rerun sequentially with one worker, in-process Kotlin compilation and a bounded JVM; no repository JVM settings were changed. One API invocation accidentally used the shell's default Node 22, which cannot import the migration TypeScript; the pinned Node 24 rerun passed all 17 tests. The real browser account rate-limit failures were preserved as failures until rerun, without weakening authentication.

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
.\apps\android\gradlew.bat -p apps/android --no-daemon --max-workers=1 `
  '-Dorg.gradle.jvmargs=-Xmx512m -Dfile.encoding=UTF-8' `
  '-Pkotlin.compiler.execution.strategy=in-process' `
  testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug
$adb='C:\Users\andre\DeveloperTools\Android\Sdk\platform-tools\adb.exe'
& $adb devices -l
& $adb -s R52X50CFTMW install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
& $adb -s R52X50CFTMW install -r apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& $adb -s R52X50CFTMW shell am instrument -w -r -e chordDialogUi true `
  -e class com.chordviewer.library.ChordDialogUiTest `
  com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
& $adb -s R52X50CFTMW shell am instrument -w -r -e authoringUi true `
  -e class com.chordviewer.library.NativeChordAuthoringTest `
  com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
& $adb -s R52X50CFTMW shell am instrument -w -r -e fastEntryUi true `
  -e class com.chordviewer.library.FastEntryUiTest `
  com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
& $adb -s R52X50CFTMW shell am instrument -w -r -e recoveryUi true `
  -e class 'com.chordviewer.library.NativeRecoveryFlowTest#writeRecoveryAcrossConnectionLoss' `
  com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
& $adb -s R52X50CFTMW shell am instrument -w -r -e recoveryUi true `
  -e class 'com.chordviewer.library.NativeRecoveryFlowTest#restoreAfterProcessRestartAndSaveConflictAsNew' `
  com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
```

The UI acceptance uses real accessibility clicks, dropdowns, slider gestures (release and ACTION_CANCEL), keyboard Escape, capture and practice input. A screenshot alone is not an interaction pass. Instrumentation output is inspected for `OK`/`FAILURES` because ADB can return exit code zero for a failed test. These are product tests; no development-only tooling test suite is added or run.

Current Compose API questions were looked up outside the sandbox with Context7 `library` then `docs`: popup placement/insets/Slider and separate Slider cancellation/MotionEvent observation questions. Official Android interaction documentation was returned. The installed CLI does not support the documented `--research` option; that fallback attempt failed explicitly rather than silently relying on it. A third question resolved Android accessibility selection: Context7 library plus two docs queries returned general semantics but not the bridge mapping. The [official AndroidX bridge source](https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/compose/ui/ui/src/androidMain/kotlin/androidx/compose/ui/platform/AndroidComposeViewAccessibilityDelegateCompat.android.kt) maps Selected on Button roles to checked state, and tabs to selected state. The genuine UI test uses that mapping consistently and distinguishes adjacent identical chords by their score positions.

## Requirement-to-evidence checklist

| Requirement | Tests / evidence |
| --- | --- |
| Complete common controls and visible advanced actions; no typing | ChordDialogUiTest actual roots/types, bass, extensions, alterations, Add/Omit/Alter, custom/polychord; screenshot 01. |
| Conventional families, spellings, slash bass and power extensions | 43 shared construction fixtures in both languages, every 144 root/bass pitch-class pair and all 4,095 nonempty custom sets; transpose, semantic/JSON round trips and practice checks. |
| Arbitrary altered degree, addition/omission and component/stack bass | Actual UI chooses b3, add#2 and no5, independent component E and stack F# bass; screenshots 02/07. |
| Exact duration and group identity; all 4/4 beat partitions and meters | Kotlin/TS timeline tests cover all eight beat compositions, 6/8 labels, imported off-grid/long duration, gaps, middle shifts, split fragments, same-symbol adjacency and bar insertion. Screenshots 03/05/06/09. |
| Melody unchanged and authored rests protected | Shared/native/web tests assert original melody IDs/pitches/ties/absolute timing and explicit-rest tails through open/save/recovery. Actual UI keeps the same melody through chord corrections. |
| Undo/redo, Apply/Add/Delete/Close and gesture cancellation | Native actual UI assertions, release-then-Close then one Undo, canceled gesture leaves score unchanged, Escape followed by a valid duration edit. Screenshots 03/04/06. |
| Save/reopen/import/export/recovery/API compatibility | Shared/native models, v3 isolated API/storage, real UI save/reopen/export; base+draft long-score recovery round trip. |
| Continuation editing/highlighting and one practice target per group | Native actual continuation click and next target/highlight; web renderer tests for all fragments in both stave/grid and editor/practice, including null legacy selection. Screenshot 10. |
| Unknown MIDI assignment and atomic failure retention | Actual MIDI capture opens custom builder, Assign captured chord reopens same notes, successful Add and 65th-event failure retain correction. Screenshots 11/12. |
| Placement, large text, bottom/right/middle anchors and system bars | UI placement checks real selected-chord highlight pixels outside the popup rectangle and footer bounds against the visible window; Android modal accessibility omits the background nodes; constrained density/font test and multi-system continuation-shortening; screenshots 08/09. |
| User data/session preserved and rollout ordered | Private before/after recovery/session comparison and untouched normal 3000 mapping; v3 API/web-before-APK requirement above. Final comparison: encrypted normal account session and all five normal draft files match byte-for-byte; all 15 non-runtime original files unchanged. Acceptance fixtures removed; normal 3000 reverse remains, owned 3001 reverse removed. |

## Original 3 October application screenshots

All images under `evidence/chord-dialog/` are genuine tablet application screenshots taken by Android UI automation; the generated design reference is never used as completion evidence. The twelve final captures below came from the passing 63.402-second flow on the APK identified above. All are 2560×1600 PNGs. The parent visually reviewed standard, advanced, constrained, timeline, practice and retained-correction layouts.

| Capture | Caption |
| --- | --- |
| [01 Complete dialog](evidence/chord-dialog/01-full-dialog.png) | Selected C beside the complete roots/types/bass/extensions/alterations and advanced actions; cleaned entry panel. |
| [02 Altered slash chord](evidence/chord-dialog/02-slash-altered-draft.png) | Fixed preview C7(b9,#11)/G while rare controls are expanded; Apply keeps timing. |
| [03 Duration shift](evidence/chord-dialog/03-duration-shift.png) | Three-beat selected duration shifts later harmony across the bar while melody stays fixed. |
| [04 Delete result](evidence/chord-dialog/04-delete-result.png) | Removing G closes its span and retains C7(b9,#11)/G and Am. |
| [05 Append creates a bar](evidence/chord-dialog/05-append-new-bar.png) | Whole-bar Em begins after existing harmony, crosses the barline and advances Add. |
| [06 Shortened continuation](evidence/chord-dialog/06-continuation-shortened.png) | Editing a continuation shortens its whole logical chord; the disappeared fragment falls back to the visible start. |
| [07 Polychord](evidence/chord-dialog/07-polychord.png) | Custom first component, D/E second component and independent whole-stack F# bass remain distinguishable in the fixed preview. |
| [08 Narrow and large text](evidence/chord-dialog/08-constrained-large-text.png) | 708.7 dp viewport / fontScale 1.35; enlarged popup reflows, selected Em remains beside it, fixed actions clear the taskbar. |
| [09 Middle anchor with many bars](evidence/chord-dialog/09-middle-anchor-many-bars.png) | A continuation duration edit stays beside its selected Em in a multi-system score. |
| [10 Logical practice target](evidence/chord-dialog/10-practice-logical-target.png) | Matching the first cross-bar Em advances once to the independently entered Em and highlights its fragments. |
| [11 Assigned unknown capture](evidence/chord-dialog/11-unknown-capture-assigned.png) | Captured C/C#/D is assigned through custom tones as C{0,1,2}, with no typing or replay. |
| [12 Retained failed correction](evidence/chord-dialog/12-pending-limit-correction.png) | A 65th-event Add fails atomically; captured tones, error and Discard/Add actions stay available. |


## 4 October legal-demo-data follow-up

The user explicitly authorized correcting malformed demo chords. The normal 3000 database audit found **0 repairs needed: 7/7 legal chord events across 3 sheets** (one v1 and two v2), with one user/account and ten sessions. Its distinct symbols are `B`, `C`, `Cmaj7/G`, `Dm`, `Em/G`, `Gbdim7` and `Gbm13`. No database row, revision, melody, event ID or account/session record was changed.

A read-only audit of the five normal tablet recovery files found ten base/draft score copies: 42 resolved events and three `Gbm13!` occurrences. All three were in one recovery record. After preserving the original private backup and stopping the normal app, the exact mapping `Gbm13!` → `Gbm13` was applied through staged, verified bytes and an atomic rename. JSON comparison established exactly three changed symbol fields; all metadata, IDs, timing and melody are identical. All other original files and the encrypted account session remained byte-for-byte identical. The strict validator accepts all ten repaired score copies (45/45 chord events legal). No copy was discarded or saved over its server sheet. Backups and raw account data remain ACL-protected under ignored `.local/demo-chord-repair/`.

Normal database ordered-row SHA-256 before and after the final API deployment: `314e95c8ff2f80f8dfc34af708bf2e9fb1e07ce1dac7d1d69b42c6ca64ed4e9a` for both exact 5,944-byte snapshots. Aggregate user/account/session comparisons also matched: 1/1/10 records, with MD5 hashes `6c9678c8a3799d034125077af84ab246`, `8c6c8d729222054012b25296e650e1fd`, and `b0eaf4f35edbd9870a9cf43a22905ae3`, respectively. These hashes summarize private ordered rows without publishing account content. This read-back proves the deployment left valid demo rows and revisions untouched.

The raw-symbol/replacement gate is removed. Supported textual aliases cover every existing MIDI vocabulary suffix, all 25 MusicXML harmony kinds and their canonical forms, plus ordinary Unicode accidental/Δ7 spellings. Timing-only edits preserve recognized aliases; applying the builder writes its canonical definition. Newline/carriage-return/Unicode line-separator suffixes and malformed text are rejected consistently in Kotlin/TypeScript. Unknown MIDI still opens custom tones; failed web correction retains captured notes and the typed correction. Library previews are capped at 64 codepoints including a visible ellipsis; full score/popup labels retain all semantics.

Follow-up checks run from the same workspace with pinned Node 24.21.0 and the bounded sequential Gradle settings above:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use
npm.cmd run check
.\scripts\development\Start-LocalBackend.ps1 -Environment development
.\scripts\development\Start-LocalBackend.ps1 -Environment test
npm.cmd run test:api
. .\scripts\development\Initialize-AndroidEnvironment.ps1
.\apps\android\gradlew.bat -p apps/android --no-daemon --max-workers=1 `
  '-Dorg.gradle.jvmargs=-Xmx512m -Dfile.encoding=UTF-8' `
  '-Pkotlin.compiler.execution.strategy=in-process' `
  testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug
# Final instrumentation-only selection-helper rebuild (main APK unchanged):
.\apps\android\gradlew.bat -p apps/android --no-daemon --max-workers=1 `
  '-Dorg.gradle.jvmargs=-Xmx512m -Dfile.encoding=UTF-8' `
  '-Pkotlin.compiler.execution.strategy=in-process' assembleDebugAndroidTest lintDebug
$adb='C:\Users\andre\DeveloperTools\Android\Sdk\platform-tools\adb.exe'
& $adb -s R52X50CFTMW install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
& $adb -s R52X50CFTMW install -r apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& $adb -s R52X50CFTMW reverse tcp:3001 tcp:3001
& $adb -s R52X50CFTMW shell am instrument -w -r -e chordDialogUi true `
  -e class 'com.chordviewer.library.ChordDialogUiTest#legalImportedAliasOpensCompleteBuilderImmediately' `
  com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
& $adb -s R52X50CFTMW pull `
  /sdcard/Android/data/com.chordviewer.debug/files/chord-dialog-13-legal-imported-chord.png `
  docs/architecture/evidence/chord-dialog/13-legal-imported-chord.png
& $adb -s R52X50CFTMW reverse --remove tcp:3001
```

| Follow-up check | Result |
| --- | --- |
| Shared/web/API unit behavior, lint, builds | 475 tests / 28 files passed, zero failed/skipped; lint and all production builds passed. Includes actual web correction retention and bounded summary decoding. |
| Isolated API storage/migration | 17/17 passed, zero failed/skipped. Includes legal Unicode spelling, long v3 list/load, 64-codepoint ellipsis preview and intact full score symbol. |
| Normal demo API runtime/data | Healthy at 3000; deployed validator supports v3 and rejects malformed chord text. Three sheets and seven legal events, zero database repairs; ordered rows and account/session hashes unchanged after deployment. |
| Persisted normal recovery | Exact three symbol fields repaired in one of five files; all ten score copies validate with 45/45 legal chord events. All five repaired-normal draft files and 14 non-runtime original files match their repaired baseline byte-for-byte after the physical test; encrypted session matches the original. Runtime exclusions are detailed below. |
| Native unit/APK/lint | 134/134 tests in 13 suites passed, zero failures/errors/skips; both APKs and lint passed (`BUILD SUCCESSFUL in 3m 19s`). Final instrumentation-only rebuild and lint passed in 1m 6s. |
| Physical legal-alias dialog | 1/1 passed, zero failed/skipped; `OK (1 test)`, 6.851 seconds. Actual tap immediately shows the complete Cmadd9 builder, C/Minor selected, Add9 retained and Apply enabled. Duration preserves Cm(add9); replacement writes Dmadd9, retains identity/melody/timing, and Undo restores the alias. Selected-anchor/footer placement passed. Capture 13 approved by parent visual review. |

Earlier runs exposed five stale opaque-text expectations, two native equivalents and one API emoji-label expectation; these now assert legal notation and retained correction rather than arbitrary labels. One new web test needed a declared v3 score type before the production TypeScript check; the corrected complete check passed. The long-summary integration assertion exposed the 64/512 label mismatch, now fixed only in display previews.

The focused physical test initially failed its selected-state assertion. Exact Android node diagnostics showed the label was a child and the owning clickable Surface had `checkable=true`, `checked=true`, and `stateDescription=Selected`. The test selection helper now resolves that owning control, consistently with its click helper, and retains the exact root/type assertions. No product semantics change was required. Context7 `library` and `docs` returned official Compose role/semantics guidance; a final AndroidX source-index query found no matching documentation. The actual device node diagnostics resolved the ownership issue. Temporary diagnostics were removed.

The follow-up ran on the same physical SM-X610 / Android 16, serial R52X50CFTMW, landscape 2560×1600, density 340 dpi, with ordinary system font settings. The installed debug main APK is version 0.1.0-debug / code 1, 10,880,788 bytes, built 4 October 2026 at 00:24:06 local time; SHA-256 is `9B6FD79513B436F45C77D71F867708E9B218F56BE15671623873A21427DEF08D`. The final test-only rebuild leaves that main APK unchanged. This is a different APK from the dated 3 October capture set.

After the physical test, the normal app was stopped for a private snapshot. Original-to-final JSON comparison still shows exactly three `Gbm13!` → `Gbm13` symbol fields and no other score changes. All five normal recovery files are byte-identical to the approved repaired baseline, and the encrypted account session is byte-identical to the original. Fourteen non-runtime original files match the repaired baseline. The only changed runtime files are `files/profileInstalled` and `shared_prefs/android.app.ActivityThread.IDS.xml`; the latter contains only Android's `IDSCount` increment from 2 to 4. These framework files were not restored. The unchanged WebView preference is also excluded from user-data comparison. Private original backups remain intact. Only this follow-up's external test screenshots were removed after copying the evidence; the normal 3000 reverse remains and the owned 3001 reverse is removed. Normal database rows, revisions and account/session aggregates match the audit above.

The original 12 captures, 32 browser cases across runs, four native regression flows and persistence counts above were not rerun wholesale for this change. The single new physical capture below verifies the changed legal-alias path on the finalized APK and was approved by the parent.

| Follow-up capture | Caption |
| --- | --- |
| [13 Legal imported chord](evidence/chord-dialog/13-legal-imported-chord.png) | Tapping Cm(add9) opens the complete builder immediately, with C/Minor selected, canonical Cmadd9 preview, retained add9, duration and Apply; selected anchor and fixed actions remain clear. |


## 4 October Add-reset and direct-bass follow-up

The prior implementation and legal-data cleanup were committed as checkpoints `3056a47` (implementation) and `4bee984` (documentation/evidence) before this work. They remain unchanged; these fixes are a separate change.

The popup now resets its complete construction, duration, expanded controls and scrolling for fresh ordinary Add and after each successful Add. A transient session counter also resets consecutive default C additions without introducing score/history fields. Apply retains its edited construction and expansion. Failed Add retains local correction, duration, captured notes and open chooser. MIDI assignment opening retains captured tones and duration; successful captured Add starts the next default session. Bass letters commit natural notes immediately and close their dropdown; accidental variants are optional on reopen. The main root row remains immediate and preserves its accidental behavior.

Verification is limited to affected native product behavior, APKs/lint and one focused actual-device method. No shared/API/web suite is rerun for this native-only change, and no development-tool test is added or run.

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
.\apps\android\gradlew.bat -p apps/android --no-daemon --max-workers=1 `
  '-Dorg.gradle.jvmargs=-Xmx512m -Dfile.encoding=UTF-8' `
  '-Pkotlin.compiler.execution.strategy=in-process' `
  testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug
# Final test-navigation-only rebuild (main APK unchanged):
.\apps\android\gradlew.bat -p apps/android --no-daemon --max-workers=1 `
  '-Dorg.gradle.jvmargs=-Xmx512m -Dfile.encoding=UTF-8' `
  '-Pkotlin.compiler.execution.strategy=in-process' assembleDebugAndroidTest lintDebug
$adb='C:\Users\andre\DeveloperTools\Android\Sdk\platform-tools\adb.exe'
& $adb -s R52X50CFTMW install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
& $adb -s R52X50CFTMW install -r apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& $adb -s R52X50CFTMW reverse tcp:3001 tcp:3001
& $adb -s R52X50CFTMW shell am instrument -w -r -e chordDialogUi true `
  -e class 'com.chordviewer.library.ChordDialogUiTest#addResetsBuilderAndBassLetterCommitsImmediately' `
  com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner |
  Tee-Object -FilePath .local/demo-chord-repair/reset-ui-result-final.txt
& $adb -s R52X50CFTMW pull `
  /sdcard/Android/data/com.chordviewer.debug/files/chord-dialog-14-bass-letter-selects-natural.png `
  docs/architecture/evidence/chord-dialog/14-bass-letter-selects-natural.png
& $adb -s R52X50CFTMW pull `
  /sdcard/Android/data/com.chordviewer.debug/files/chord-dialog-15-reset-after-complex-add.png `
  docs/architecture/evidence/chord-dialog/15-reset-after-complex-add.png
& $adb -s R52X50CFTMW shell am force-stop com.chordviewer.debug
# Private post-test snapshot, captured as binary bytes with Python subprocess.check_output:
# [adb, '-s', 'R52X50CFTMW', 'exec-out', 'run-as', 'com.chordviewer.debug',
#  'tar', '-cf', '-', 'files', 'shared_prefs', 'no_backup']
& $adb -s R52X50CFTMW shell rm `
  /sdcard/Android/data/com.chordviewer.debug/files/chord-dialog-14-bass-letter-selects-natural.png `
  /sdcard/Android/data/com.chordviewer.debug/files/chord-dialog-15-reset-after-complex-add.png `
  /sdcard/Android/data/com.chordviewer.debug/files/chord-dialog-reset-failure.png
& $adb -s R52X50CFTMW reverse --remove tcp:3001
& $adb -s R52X50CFTMW reverse --list
```

| Reset follow-up check | Result |
| --- | --- |
| Native product units/APKs/lint | 136/136 tests in 13 suites passed, zero failures/errors/skips; both APKs and lint passed (`BUILD SUCCESSFUL in 2m 19s`). Final test-only APK/lint rebuild passed in 1m 6s. The new dense fixture needed empty melody to avoid a truncated tie and a valid recovery UUID; those fixture errors were corrected before the passing run. |
| Physical reset/direct-bass behavior | 1/1 passed, zero failed/skipped; `OK (1 test)`, 43.506 seconds. Natural G commits and closes the menu; optional Gb works on reopen. Complex/slash and custom/polychord Add reset all construction, duration, menus and scrolling. Consecutive default C additions reset independently, and Undo restores the prior score. Apply retains its edited definition/expansion, captured assignment survives reopen then resets after success, and rejected Add retains notes/duration/custom draft/open chooser. Final-run captures 14/15 approved by parent. |
| Normal data preservation | All 5 normal draft files and all 14 protected original files byte-identical; encrypted account session unchanged. Zero protected or new user files changed. Only two framework runtime files differ, as detailed below; original private snapshot retained. |

The first physical run stopped at an immediate optional-Gb accessibility read; its genuine failure capture showed the correct Gb preview. The next run passed all reset and repeated-Add phases, then its test reveal helper searched forward for a root above the viewport after expanding rare controls. Exact preview/reset waits and choosing the root before that expansion corrected these test-navigation issues without changing product code or dropping assertions. Both feature captures were visually approved while the remaining regression checks ran.

The final passing run used the physical SM-X610 / Android 16, serial R52X50CFTMW, landscape 2560×1600, density 340 dpi and ordinary system font. Main APK version 0.1.0-debug / code 1 is 10,881,164 bytes, built 4 October 2026 at 00:55:50 local time; SHA-256 `ED538A894BD4D6CCEDF4F10B1A01935011CEF132E25ABC1EBA484F5B1B594A03`. Final instrumentation-only edits did not change it. This native-only follow-up does not rerun the dated shared/API/web checks or the original 12-layout UI flow.

After the final test, the stopped normal app's private snapshot contains the same 17 files as the fresh pre-test snapshot. All five draft JSON files, the encrypted account session and all fourteen non-runtime files match byte-for-byte. No chord fields, melody, IDs, metadata or normal backend records were edited for this follow-up. Runtime exclusions are `files/profileInstalled`, Android's `shared_prefs/android.app.ActivityThread.IDS.xml` (`IDSCount` 6 → 3), and the unchanged WebView preference file. Only the first two differ; framework state was not restored. Original and pre-test private backups remain intact. Only this task's external screenshot files and owned 3001 reverse were removed; `UsbFfs tcp:3000 tcp:3000` remains.

| Reset follow-up capture | Caption |
| --- | --- |
| [14 One-tap natural bass](evidence/chord-dialog/14-bass-letter-selects-natural.png) | One G letter tap commits natural G and closes its dropdown. The complete F#13(b9,#11)/G draft and fixed actions remain visible. SHA-256 `B3854B656DEED0F63ABD8EEA7D38C3E8A5DE5EA4FB80114E86B7587B7B6F3A66`. |
| [15 Reset after complex Add](evidence/chord-dialog/15-reset-after-complex-add.png) | After adding a custom polychord with component and stack bass, the next anchored Add is C/natural/Major/Root/Whole bar, with cleared modifiers, closed expanded controls and scroll at the top. SHA-256 `663CC5478B3E6A0F5B8FB1B0A73C26A362D85DAC5CDC098A4613514ACD660D01`. |
