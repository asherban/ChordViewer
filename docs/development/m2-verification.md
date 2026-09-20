# M2 verification record

Date: 2026-09-20. **M2 is complete.** This record covers the clean three-part foundation, developer setup and notation proof. The [root README](../../README.md) contains the commands to reproduce local development and acceptance checks.

## Implemented scope

The npm workspace separates React web, Fastify API and versioned contracts; Android remains native Kotlin/Compose. Both clients render the same original four-measure fixture with independent chords and one treble melody voice. The user accepted this initial voice scope. The proof includes rests, sharps/flats/naturals, dotted notes/rests and cross-bar ties. C major and 4/4 are the current contract limits.

Library starts empty. The web Create/Practice screens and native score screen are explicitly examples. MIDI shows played notes/chords without changing the example. Accounts, persistence, authoring, real tutorial playback and practice advancement remain later milestones. PostgreSQL and Better Auth are the selected M3 direction, not implemented dependencies.

## Verification

- A clean `npm ci` using Node 24.21.0/npm 11.19.0 succeeded. The lockfile and workspace versions are aligned. Node's physical executable path is in the ordinary fnm user directory, outside Codex's package-private cache.
- `npm run dev` started the contract watcher, API and web client together. The health route and score request worked through the development proxy. Ctrl+C stopped the owned development processes.
- Web/API lint, **80 unit tests across seven files**, and production builds passed. The tests cover musical behavior, shared score validation, API responses and MIDI lifecycle recovery.
- Three Playwright browser acceptance cases passed: empty Library and API score rendering/display switching, unavailable API fallback, and rejection of an incompatible score schema. Tests start and stop their own development services.
- Real Chrome Web MIDI received the committed fixture through the actual LoopBe driver: held C major, sustain release, zero-velocity note-off, channel 2 and final clear. Re-selecting the already active LoopBe input also passed. This check used real MIDI messages, not injected browser note state.
- Native Gradle unit tests: **25 passed**, zero failures/errors/skips. One score test runs all **38 shared conformance cases**, also used by the TypeScript validator. Debug, release and instrumentation APK builds passed.
- Native lint: **zero errors, ten warnings**, unchanged from M1. The warnings concern version/target updates, future backup extraction rules and the diagnostic launcher icon; they remain visible.
- The M2 debug app passed the real LoopBe → Windows bridge → emulator instrumentation check: **one passing, non-skipped test**, including notes, sustain, channel identity, final clear and reconnect reset. The documented host-graphics AVD booted with `sys.boot_completed=1`.
- Both native score displays and web Library/score/chord-only views were inspected visually. All four measures, accidentals, rests, dots and ties rendered without missing glyphs. The narrow web layout stacks its panels and scrolls the score horizontally.
- The built Android release contains the canonical fixture and its font license, with no Internet permission, debug relay classes or token endpoint. Web output includes all notation font/code notices under `licenses/`; see [third-party notices](third-party-notices.md).
- The README prerequisite command passed in Windows PowerShell 5.1 with the normal developer SDK/JDK paths. PowerShell scripts parsed successfully and all 94 checked local Markdown links resolved. The owned emulator, MIDI bridge and development/test servers were stopped after acceptance; the bridge credential was removed.

The isolated Chrome automation context required both `midi` and `midi-sysex` permission grants for Chrome to expose the port. Application code still requests `{ sysex: false }`; the fixture sends no SysEx. This test did not modify permissions in the user's existing browser profile.

## Cleanup and review

The private baseline created before the rebuild remains outside the repository. Before removal, all **46 retired tracked files** matched that baseline by SHA-256. Obsolete Learn/Transcribe/Play code, old root build configuration, starter artwork, Pages publication configuration and automatic push/deploy instructions were removed. Useful chord recognition/notation behavior was retained in focused modules and tests; unused compatibility wrappers were removed. The license, history, private settings and agreed mockups were preserved. No browser-library migration was required.

Independent code and security review covered web/API/contracts, native rendering, build configuration and developer commands. Findings were corrected before completion: cross-bar tie accidental state, permission responses arriving after a hidden page, stale MIDI access handlers, and the asynchronous close race when reselecting the same input. Regression tests cover these behaviors. Final review found no remaining actionable findings.

The complete npm dependency audit reported **zero vulnerabilities**. The local API binds to loopback and exposes only health and an immutable example; schema validation bounds input shape, event counts and musical relationships. No authentication or authorization claim is made for M2. M3 must review account isolation, session storage and persistence operations when they exist.

## Evidence and limits

| View | Screenshot |
| --- | --- |
| Empty web Library | [Library](../architecture/evidence/m2-web-library.png) |
| Web melody with live MIDI | [Score and played chord](../architecture/evidence/m2-web-score.png) |
| Web chord-only view | [Chords](../architecture/evidence/m2-web-chords.png) |
| Native melody | [Native score](../architecture/evidence/m2-native-score.png) |
| Native chord-only view | [Native chords](../architecture/evidence/m2-native-chords-only.png) |

CI is configured for web/API checks and native builds, but was not run remotely. Android Studio's graphical import/build and physical Samsung USB/Bluetooth behavior are not covered by command-line/emulator acceptance. The release APK is unsigned. VexFlow and its bundled fonts produce an approximately 1.06 MB JavaScript chunk (493 KB gzip), exceeding Vite's default size warning; loading/performance optimization remains later work. npm reports an unapproved optional esbuild installation script; the documented install, tests and builds succeeded without changing that policy. Combined database/emulator resource use, other keys/meters and denser engraving remain later work. No NAS/public deployment, push, pull request, DNS or hosted-site change was performed.
