# Score layout alignment

This follow-up on `codex/score-layout` brings the working score renderers closer to the selected [chord-only](../architecture/mockups/a-balanced-practice.png) and [melody](../architecture/mockups/practice.png) mockups. It does not advance M5 or M6.

## Changes

Both clients use large bold serif chord symbols, small bar numbers and compact four-bar systems when the content fits. Chord-only mode uses vertical dividers without a horizontal baseline. Melody mode draws continuous staff lines, places chord names at their musical onset and repeats the clef at each system, with the time signature only at the start.

Measured label and notation widths determine when a system needs two or one bar. Short stored durations, gaps and long manual names retain readable space without dividing label width by duration. Extreme pitches and decorations reserve vertical/horizontal room. Dense content scrolls instead of shrinking the whole score. The compact Practice heading leaves more space for music.

Web Create and Practice now share one renderer; chord selection works in both display modes. The duplicate editing grid was removed. The next insertion bar is a presentation-only preview in either mode. Android remains native Compose/Canvas, with its existing chord picker. No notes, sections or Practice progress are invented to resemble a mockup. Stored score data, MIDI capture, authentication and persistence contracts are unchanged.

## Verification

Verification date: 2026-09-21. The user's running launcher was left intact until they confirmed saving and stopping it. Browser integration uses the isolated test backend; visual cases use synthetic API responses and native shell fixtures, never a user's sheets.

- All 205 unit tests passed across 13 files, including the five focused layout/editor cases for reflow, dense/partial rows, gaps, one-tick manual labels and pending correction. ESLint passed.
- Twelve browser checks passed, including the three new score-layout cases and existing shell, notation, navigation, account isolation, failed-save and conflict checks.
- Browser layout checks cover 1280 × 800 and 360 × 800, all 48 notes in the synthetic melody, four normal bars per system, editing in both modes, and a long chord at tick 1919 without clipping.
- The real LoopBe MIDI browser regression passed: automatic insertion, undo/redo, manual correction, replacement from MIDI, deletion, saving and reopening the complete score.
- Contracts, API and web production builds passed. The existing large-bundle warning remains; the notation library is still included in the main web bundle.
- All 58 Android JVM tests passed after the final spacing adjustment, and the debug app and instrumentation APKs built successfully.
- The opt-in native visual acceptance passed on the 1280 × 800 emulator. All five final captures were inspected: 12 chords and 48 melody notes fit in three four-bar systems, including the bottom notes and clef; blank sheets and the accidentals/rests/dots/ties fixture also render correctly.
- The final Android release build, R8 optimization and release checks passed. Debug lint passed with zero errors and 12 existing warnings. The existing Android SDK XML-version warning remains.

All owned test services were stopped: the isolated API/database (with data and credentials preserved), browser test servers, emulator and Gradle/Kotlin daemons. The shared ADB server was preserved. Local links to all eight final screenshots and the updated documentation resolve.

An initial VexFlow measurement called the formatted-width accessor too early. Using intrinsic text width during measurement fixed the renderer exception; the final browser cases pass. The estimator's extra duration-variance padding also forced ordinary melody into two-bar systems; actual glyph minima plus explicit padding now govern layout. A unit-test worker timed out under concurrent Android build memory pressure; the focused tests passed after rerunning sequentially. Failed attempts are not counted as passes.

The first native capture was blocked by an emulator System UI boot dialog. After dismissal, visual review exposed clipping at the bottom of the third melody row. A tighter header and 154dp minimum row height resolved it while retaining expanded bounds for extreme pitches; the final rebuilt APK was recaptured and reviewed.

Code and security review covered onset alignment, timing gaps, dense symbols, extreme pitches, dots/accidentals, cross-system ties, editable hit areas and presentation-only bars. Identified issues were corrected and covered by focused checks. Text remains text, without HTML interpretation or new network requests. Synthetic native fixtures are opt-in instrumentation only and do not ship in the app.

## Screenshots

- [Web chord-only Practice](../architecture/evidence/score-web-chords.png)
- [Web melody Practice](../architecture/evidence/score-web-melody.png)
- [Web narrow layout](../architecture/evidence/score-web-narrow.png)
- [Native chord-only Practice](../architecture/evidence/score-native-chords.png)
- [Native melody Practice](../architecture/evidence/score-native-melody.png)
- [Native empty chord sheet](../architecture/evidence/score-native-empty.png)
- [Native empty melody staff](../architecture/evidence/score-native-empty-melody.png)
- [Native accidentals, rests, dots and ties](../architecture/evidence/score-native-notation.png)

The captures show running application components, not newly generated mockups. The original selected mockups remain unchanged.

## Reproduce

Use the normal [testing launcher](../../README.md#run-the-complete-local-testing-environment), without `-SkipBuild` after changing Android source. Open a saved sheet and switch between **Chords only** and **Chords + melody**. Create retains its existing duration, position, correction and undo controls.

With Node initialized and the isolated test backend running, the browser visual checks are:

```powershell
npx playwright test tests/web/score-layout.spec.ts
# Optional: refresh the reviewed evidence files from the synthetic visual cases.
$env:CHORDVIEWER_CAPTURE_EVIDENCE = '1'
npx playwright test tests/web/score-layout.spec.ts
Remove-Item Env:CHORDVIEWER_CAPTURE_EVIDENCE
```

The opt-in native capture command is documented in the [Android README](../../apps/android/README.md#score-layout-visual-acceptance).
