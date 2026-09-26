# ChordViewer

Create lead sheets at the piano, keep a YouTube lesson beside the score, and practice on the web or a native Android tablet.

**Rebuild status: M0–M7 complete locally; M8 private NAS deployment is next.** Create an account in the browser or native Android app and use the same personal Library from both. New accounts start empty. Enter chords and melody in separate MIDI passes or add chords, notes and rests by hand. Correct/delete/replace entries, undo/redo, choose a key/meter, link a YouTube tutorial and save/reopen the full sheet. Import supported MusicXML or ChordViewer JSON after a preview, and export the current score as JSON. Library supports search, filters, favorites, Draft designation, rename, duplicate and recoverable Trash. Practice offers manual navigation, optional fresh-gesture chord matching, temporary transposition and independent YouTube playback. Both clients keep confirmed local recovery copies; restore them from Library after a restart, then explicitly Save or resolve a conflict by saving as new.

The web and Android clients now use the shared cream/sage design from the mockups: a compact Library/Create/Practice header, personal sheet cards, and a score workspace with tutorial and live MIDI feedback beside it. The web app fills the browser window; **Enter full screen** in the header also hides the browser chrome. Use **Exit full screen** or **Esc** to leave that mode. Browsers that disallow it still get the full-window layout.

Scores use large serif chord names and compact four-bar rows, with connected staves when melody is visible. Narrow windows and dense music reflow into fewer bars at a readable size. See the [score layout screenshots and verification](docs/development/score-layout-verification.md). Run the testing launcher without `-SkipBuild` after pulling Android source changes so the emulator receives the updated app.

The [product plan, selected mockups and milestones](docs/architecture/README.md) describe the agreed product. See the [M7 verification record](docs/development/m7-verification.md) for recovery, complete local regression checks, backup restoration and resource measurements; the [M6 record](docs/development/m6-verification.md) for Library/Practice design and screenshots, the [M5 record](docs/development/m5-verification.md) for melody/import, the [M4 record](docs/development/m4-verification.md) for chord-entry acceptance, the [M3 record](docs/development/m3-verification.md) for persistence, and the [UI alignment record](docs/development/m3-ui-verification.md) for the shared design. [Notation licenses](docs/development/third-party-notices.md) document bundled components. The previous browser app remains recoverable from history and a private baseline; this checkout contains the rebuild. The existing `chordviewer.app` deployment and DNS have not been changed.

## Repository

| Directory | Purpose |
| --- | --- |
| `apps/web` | React/TypeScript browser client and direct Web MIDI input. |
| `apps/android` | Native Kotlin/Compose app, notation renderer and debug MIDI adapter. |
| `services/api` | Fastify API, Better Auth accounts and owner-scoped PostgreSQL sheet storage. |
| `infra/backend` | Local API/database containers, pinned images and persistent volumes. |
| `contracts` | Versioned score schema, TypeScript validation, OpenAPI and shared fixtures. |
| `scripts/development`, `scripts/midi` | Workstation setup, emulator launch helpers and local MIDI input fixtures. |
| `tests` | Browser acceptance and language-independent musical reference cases. |
| `docs/architecture` | Product decisions, score contract, milestones and design mockups. |

## Developer setup on this Windows computer

Run commands from the repository root. You need the pinned Node 24 version from `.node-version`, npm 11, Docker Desktop with its Linux engine running, and Chrome or Edge for Web MIDI. Android requires JDK 21, Android SDK 35, Build Tools 35.0.0, Platform Tools, Emulator and the API 35 default x86_64 system image. These tools and LoopBe1 are installed on this workstation; see the [installation record](docs/development/local-setup.md) for exact versions and paths.

Start a development PowerShell. This changes execution policy only for the new process:

```powershell
cd C:\Users\andre\Projects\ChordViewer
powershell -NoProfile -ExecutionPolicy Bypass
```

Use the existing fnm Node manager in that shell, then install the workspace:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm install
fnm use
node --version
npm ci
```

`fnm install` reads `.node-version`; it is only needed once per version. Run the `fnm env` and `fnm use` commands in each new terminal used for individual development commands. The complete testing launcher below initializes them automatically. No PowerShell profile or system-wide Node default is changed. On another machine with a matching Node/npm installation, fnm is optional.

## Run the complete local testing environment

Start Docker Desktop with Linux containers, then run this from the repository root after the one-time setup above:

```powershell
.\scripts\development\Start-Testing.ps1
```

The launcher selects the pinned Node and Android tools, builds the contracts and Android debug APK, starts the API/database and web development server, boots `ChordViewerTabletLocal`, installs the native app, and connects the real LoopBe MIDI bridge. It opens a dedicated Chrome window, falling back to Edge when Chrome is unavailable. The web app is at **http://127.0.0.1:5173/**; the launcher owns emulator **emulator-5560**. First startup can take several minutes. The native build finishes before the emulator boots to reduce memory pressure.

Wait for the **ready** message, then:

1. In Android, choose **Explore the example sheet**, or sign in and open a saved sheet, to see the live MIDI monitor. The bridge is already connected. Android sign-in is required again after each app-process restart.
2. The browser opens the anonymous score preview and enables LoopBe automatically. If its saved account opens Library instead, select or create a sheet. The launcher keeps the current sheet and unsaved draft when preparing later playback.
3. Enter **P** and press **Enter**, or just press **Enter**, to broadcast the chord/smoke fixture. Enter **M** for a six-note melody sequence. Both go to every connected client without producing audio. To write music, open a saved sheet in **Create**, choose the matching chord or melody pass, select a free position/duration and press **Start MIDI entry** on each client. For **M**, G major, 3/4 and quarter-note duration fill two bars. Restore the browser if minimized; the launcher brings the app tab forward and prepares its input before each broadcast. Keep Android in the foreground; after backgrounding, reopen **MIDI**, press **Connect**, then start entry again.
4. Save your edits, then enter **Q** and press **Enter**, or press **Ctrl+C**, to stop. Quitting also works during startup or playback. Confirmed local recovery copies survive ordinary shutdown; pending writes and unfinished MIDI gestures may not.

Both clients receive the same real LoopBe sequence; there is no synthetic browser event injection. Open the same saved sheet in each client to compare drafts. Save from one client at a time: revision conflicts prevent silently overwriting the other client's saved changes.

For an M6 smoke pass, search and filter Library, favorite and mark a sheet Draft, duplicate it, and move the copy to Trash and restore it. Open the original in Practice: Manual is the default; move between bars, enable On match, then broadcast **P** for a fresh chord gesture that matches the highlighted chart chord. Check live comparison and target advancement without changing saved notation. Link a YouTube URL in Sheet details, tap **Play tutorial**, hide it, and use **Edit sheet** to return to the selected Practice position. Run `npx playwright test tests/web/library-practice.spec.ts tests/web/library-practice-midi.spec.ts` for the focused browser checks; set `$env:CHORDVIEWER_REAL_MIDI='1'` first on this Windows/LoopBe workstation to run the physical-MIDI case (otherwise it skips). Native API, visual and UI commands below cover the emulator; add `-Organization` to `Test-NativeShell.ps1` for its isolated Library favorite/Draft/duplicate/Trash/restore UI check.

Useful options:

```powershell
# Reuse the existing debug APK after a successful build.
.\scripts\development\Start-Testing.ps1 -SkipBuild

# Use the isolated test database/API (port 3001) in both clients.
.\scripts\development\Start-Testing.ps1 -Environment test

# Playback speed multiplier; 0.25 is the default, 1 is normal fixture speed.
.\scripts\development\Start-Testing.ps1 -Speed 1

# Hidden browser and emulator windows for automated checks.
.\scripts\development\Start-Testing.ps1 -Environment test -SkipBuild -Headless
```

`-SkipBuild` requires an existing debug APK and does not rebuild Android changes. The backend still builds its image, and the web development process rebuilds/watches contracts. `-Headless` is intended for automation; use the default visible windows for interactive testing. Development is the default database environment; test mode keeps port 5173 for the browser and forwards the native app to the test API.

Close existing manual development sessions before starting. The launcher refuses an existing backend stack, an already-running `ChordViewerTabletLocal`, or conflicts on ports **3000** (or **3001** in test mode), **5173**, **39173**, **5560** and **5561**. It does not take over those services. Only one testing launcher can run at a time. Stop a manual backend with `Stop-LocalBackend.ps1 -Environment development` or `-Environment test`, matching the environment you intend to launch; stop its web server, bridge and emulator using their own terminals.

Shutdown releases MIDI, closes the owned browser and emulator, removes their port forwards, and stops/removes this session's backend containers and network. It preserves saved sheets, private backend credentials, emulator data, build caches and browser cookies. The private browser profile is `.local/testing/browser`; it is separate from your normal browser profile. Session status and logs are under the printed `.local/testing/<session-id>` directory. Docker Desktop and the shared ADB server remain running.

A separate watchdog also cleans up if the launcher terminal closes or its PowerShell process is forcibly terminated. Wait for cleanup to finish before relaunching. Forced termination of the watchdog itself or loss of the operating system/power can interrupt cleanup; after confirming the old session is no longer running, recover the matching backend with:

```powershell
.\scripts\development\Stop-LocalBackend.ps1 -Environment development
# Use -Environment test instead if that was the interrupted session.
```

Inspect the previous session's `status.json` and logs if cleanup reports a failure or startup still finds a conflict. See the [testing launcher verification and recovery record](docs/development/testing-launcher.md). The individual workflows below remain available for focused development and troubleshooting.

Android startup retries an explicit Activity Manager timeout up to three attempts while a cold emulator settles. Other launch errors stop immediately; the console and `android-launch.log` include a diagnostic with the MIDI token redacted.

## Start only the web client and API

Start Docker Desktop, then run in the initialized terminal:

```powershell
.\scripts\development\Start-LocalBackend.ps1
npm run dev
```

The helper generates private local credentials once, builds the API image and starts PostgreSQL and the API in the background. Keep the `npm run dev` terminal running for the web server and contract watcher. Open **http://127.0.0.1:5173/** in Chrome or Edge; this is the configured browser origin. The API is at **http://127.0.0.1:3000/**, and Vite proxies `/api` and `/health` to it. PostgreSQL has no published host port. No NAS is required.

Create an account using a password of 12–128 characters. Email verification and password recovery are not configured for this private milestone. Your Library starts empty; **New sheet** offers a blank sheet or an explicit example copy. **Edit** enters Create; use **Sheet details** for the title/tutorial. Library cards can be searched, filtered by favorites, Draft, Trash, notation or tutorial, and sorted by recent open or title. Their bounded first-bar chord labels describe actual stored music. **Practice** displays the current in-memory score with live MIDI feedback and never inserts chords. Manual movement is the default; On match waits for a new completed chord gesture. The tutorial plays independently in a YouTube embed after an explicit tap. Display mode, size and transposition are temporary. Switching modes retains the draft; opening a different sheet or signing out asks before leaving unsaved work. Confirmed local recovery copies survive ordinary reload/process restart. A stale revision produces a conflict instead of overwriting another device's changes. The local limit is 100 sheets per account including Trash, and 1 MiB per write.

### Create a chord sheet

1. Create/open a saved sheet and connect MIDI. Choose the chord entry pass, a free bar/beat and a duration (default: one current bar). New blank sheets offer key and meter controls.
2. Press **Start MIDI entry**. Play a chord and release every physical key: it inserts once and advances by the chosen duration. Sustain does not delay insertion. Rolled/overlapping keys form one chord until all are released.
3. Select an inserted chord to change its name/duration, choose an alternative name, **Replace from MIDI** once, or **Delete chord**. Replacement and deletion leave neighbouring chords and melody intact. **Undo/Redo** restores music and cursor position; web also supports Ctrl/Cmd+Z, Shift+Z, Ctrl/Cmd+Y and Delete.
4. Unknown voicings stay available for manual naming. A chord that overlaps another or crosses a barline remains pending: shorten its duration or choose another free slot, then apply it.
5. Press **Save sheet**. Failed saves retain the draft; revision conflicts offer an explicit reload after confirmation. Save details also saves the full score. Leaving Create, editing details, disconnecting, or backgrounding pauses entry; press **Start MIDI entry** again when ready.

Without MIDI, choose **Add chord by hand** on web or **Add chord** on Android. Music undo/redo retains up to 100 changes across both lanes and key/meter edits; it does not undo title/tutorial fields. See the [shared chord-entry behavior](docs/architecture/chord-authoring.md).

### Add melody, change the key and import a score

1. Switch to **Melody entry** on web or the **Melody** entry lane on Android. Each pass remembers its cursor; the first melody pass starts at bar 1, beat 1. Select a duration, start MIDI entry, then play and release one pitch at a time. Overlapping pitches are rejected and pause entry until you restart it. Sustain does not delay insertion.
2. Use **Add note by hand** / **Add note / rest**, or **Insert rest**, without MIDI. Select a note/rest on the staff or from its event picker to edit pitch, accidental, octave, duration and ties. **Delete note → rest** keeps later timing unchanged. A tie needs an adjacent note with identical pitch spelling. **Replace from MIDI** changes one selected event and pauses.
3. If an event cannot fit, its capture stays pending. Change duration or position, then apply or discard it. Whole through sixteenth notes/rests, one dot, single accidentals and one treble voice are supported. MIDI pitches span C3–B6.
4. **Sheet details** changes the global key and meter. Choose among 30 standard major/minor signatures and 1–12 beats over 2, 4 or 8. Web uses **Apply key and meter** before **Save details**. Key changes preserve written pitches; a shorter meter must still fit every existing event. Invalidated ties are cleared. Existing v1 C/4/4 scores remain readable.
5. In **Library**, choose **Import score** (web) or **Import** (Android). Select `.musicxml`, `.xml` or ChordViewer `.json`, up to 1 MiB, inspect the preview/warnings and choose **Save as new sheet**. MusicXML supports one part, treble staff and voice with the supported notes/rests, ties and chord symbols. Compressed MXL, pickups, repeats, multiple voices/staves, tuplets and mid-score key/meter changes are rejected. Lyrics, layout and performance metadata are omitted with a warning.
6. **Export score JSON** on web, or **Sheet details → Export ChordViewer JSON** on Android, writes the current draft through the browser download/native document picker. JSON preserves score data and title; it excludes the separately stored YouTube URL and account information. Exporting does not save the draft to your library. Reimport always creates a new sheet.

An original import example is checked in at [lead-sheet.musicxml](tests/fixtures/music/import/lead-sheet.musicxml). The [melody and import contract](docs/architecture/melody-authoring.md) records the complete M5 behavior and limitations.

To check the API from another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/v1/score-example
```

After backend changes, rerun `Start-LocalBackend.ps1` to rebuild/recreate the API and apply explicit migrations. Data and credentials persist. Stop the web server/watcher with **Ctrl+C**, then stop the backend without deleting its database:

```powershell
.\scripts\development\Stop-LocalBackend.ps1
```

Ports 3000 and 5173 must be free. Private settings live in ignored `.local/backend/development.env`; keep this file with its existing database volume. Do not replace credentials while retaining the volume. See [local container setup](docs/development/m3-containers.md) for isolation, resources and troubleshooting.

## Recover unsaved work

Both apps keep a local recovery copy automatically while **Save remains explicit**. Wait for **Local recovery copy updated** before closing. After restarting, sign into the same account and use **Recover unsaved work → Restore draft** in Library. The recovered sheet starts with MIDI entry paused and fresh undo history.

If another client saved meanwhile, use **Save as new sheet** to keep both versions, or confirm **Reload latest version** to replace your draft. A failed save during an outage leaves the draft available; retry after reconnecting. Signing out hides local copies without deleting them.

Each device/browser store allows 20 copies, without silently deleting old drafts. Save or explicitly delete copies to free space. Storage failures are visible; save/export while the sheet is open. Browser/app data clearing, uninstalling or device loss can remove copies. Cold-start sign-in needs a reachable backend. Details and privacy limits are in the [recovery contract](docs/architecture/draft-recovery.md).

## Back up and rehearse a restore locally

Run in the initialized development PowerShell with Docker Desktop and the source backend running:

```powershell
.\scripts\development\Backup-LocalBackend.ps1 -Environment development
# Use -Environment test for the isolated test database.

# Replace the placeholder with the completed directory printed by Backup.
.\scripts\development\Restore-LocalBackend.ps1 -BackupDirectory .local\backups\<timestamp-id>
Invoke-RestMethod http://127.0.0.1:3002/health

# Replace the placeholder with the restore ID printed above.
.\scripts\development\Stop-RestoredBackend.ps1 -RestoreId <12-character-id>
```

Backups include saved data and the exact running API image. Restore verifies the archives, creates a separate project/volume on port 3002 and leaves the source unchanged. Sign in again to the restored backend. Stop preserves restored data. Backups contain private accounts and music; keep completed directories in protected storage on another device for disaster recovery. See [backup contents, limits and cleanup](docs/development/local-backup-restore.md). These commands do not back up unsaved device-local drafts.

## Build and check

Automated tests cover product behavior. Development-only scripts and features do not require tests; see [AGENTS.md](AGENTS.md) for the testing scope.

```powershell
npm run check
npx playwright install chromium
.\scripts\development\Start-LocalBackend.ps1 -Environment test
npm run test:web
npm run test:persistence
npm run test:api
.\scripts\development\Stop-LocalBackend.ps1 -Environment test
```

`check` runs lint, unit/contract tests and web/API builds. Install Chromium once. `test:web` starts/stops its own Vite server, so stop `npm run dev` first; it uses the separate test API on **127.0.0.1:3001**. The integration suites create random accounts in the test database and check persistence, isolation, conflicts, Library metadata/Trash/quota, and Practice UI. Start the isolated backend with `./scripts/development/Start-LocalBackend.ps1 -Environment test` before `npm run test:api` or `npm run test:web`; stop it with `./scripts/development/Stop-LocalBackend.ps1 -Environment test` when done. Windows-only `test:persistence` checks session renewal/expiry and restarts, rebuilds and recreates the labelled test containers while retaining their volume. Close interactive test clients before that suite; it does not operate on development containers. Run suites sequentially: API throttling tests deliberately exhaust sign-in limits for up to 60 seconds. These checks do not replace real LoopBe testing below.

Additional commands:

```powershell
npm run lint
npm run test:run
npm run test:coverage
npm run build
```

`test:coverage` writes product unit/contract coverage to `coverage/index.html` and `coverage/coverage-summary.json`, including source files with no unit tests. It excludes development tools and does not measure browser acceptance, database integration or Android coverage. CI uploads the report as `product-unit-coverage`.

See the [September project review](docs/development/project-review-2026-09.md) for corrected defects, security findings, validation results and the prioritized maintenance plan.

The web output is `apps/web/dist`; API output is `services/api/dist`. The normal backend workflow uses Compose; direct `dev:api`/workspace `start` commands require all explicit backend environment settings and database connectivity. There is no public publish/deploy command in this milestone.

## Android: prepare and build

In a development PowerShell from the repository root:

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
.\scripts\development\Test-Prerequisites.ps1 -RequireContainers
.\apps\android\gradlew.bat -p apps/android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease :app:assembleDebugAndroidTest
.\apps\android\gradlew.bat -p apps/android --stop
```

The environment helper prints its chosen SDK and JDK. This workstation's SDK is at `%USERPROFILE%\DeveloperTools\Android\Sdk`; JDK 21 is under `%USERPROFILE%\DeveloperTools\Java`. Explicit `ANDROID_HOME` and `JAVA_HOME` values can select other installations. In Android Studio, open `apps/android`, select that SDK and **JDK 21** for Gradle. Studio's own bundled runtime is separate.

Finish builds and stop Gradle daemons before booting the emulator on this 16 GB computer. The release APK is unsigned and is not a public release.

If other applications leave little free memory, this verified alternative uses one smaller compiler JVM for the invocation:

```powershell
.\apps\android\gradlew.bat -p apps/android --no-daemon --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8' '-Pkotlin.compiler.execution.strategy=in-process' :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug :app:assembleRelease
```

It can take several minutes and does not change project defaults. Keep the emulator stopped until it completes.

## Android: run the tablet emulator

In terminal 1, leave this command running:

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
.\scripts\development\Initialize-AndroidEmulator.ps1
emulator -avd ChordViewerTabletLocal -memory 2560 -cores 1 -no-snapshot -gpu host -feature -Vulkan
```

The helper creates or validates the tablet profile. Hardware graphics is the tested configuration; software rendering stalled on this machine. For unattended checks, append `-no-window -no-audio`. First boot may take several minutes.

In terminal 2, initialize the Android environment and wait for boot completion:

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
adb devices
adb -s emulator-5554 shell getprop sys.boot_completed
```

Continue when the last command returns `1`. Use the actual serial from `adb devices` if it differs. With the development backend running, install the app, forward its local API and launch:

```powershell
adb -s emulator-5554 install -r -t apps/android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 reverse tcp:3000 tcp:3000
adb -s emulator-5554 shell am start -n com.chordviewer.debug/com.chordviewer.MainActivity
```

Sign in with the same account as the browser to open and save the same sheets. The app renders notation natively. Use **Library**, **Create** and **Practice** in the header; **Sheet details** opens the native editing dialog. **MIDI** in the header opens connection controls; live notes stay beside the score. Android session credentials stay in memory; restarting the app process requires signing in again. Only debug builds permit loopback HTTP; the release API remains unconfigured pending a later HTTPS deployment.

To run native backend acceptance against the isolated test environment:

```powershell
.\scripts\development\Start-LocalBackend.ps1 -Environment test
adb -s emulator-5554 reverse tcp:3001 tcp:3001
adb -s emulator-5554 install -r -t apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell am instrument -w -r -e class com.chordviewer.library.LibraryIntegrationTest -e libraryApi true -e apiPort 3001 com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
adb -s emulator-5554 reverse --remove tcp:3001
```

For an interactive native UI against test data, map `adb -s emulator-5554 reverse tcp:3000 tcp:3001`. Restore the development mapping before using your personal library. [Native development](apps/android/README.md) explains session and network boundaries.

With the debug and test APKs installed, these product checks exercise Android's actual XML parser and native notation layout without a backend or MIDI. Save and close any current native editing session first:

```powershell
adb -s emulator-5554 shell am instrument -w -r -e class com.chordviewer.score.ScoreImportAndroidTest com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
adb -s emulator-5554 shell am instrument -w -r -e class com.chordviewer.score.NativeScoreVisualTest -e scoreVisual true com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
```

## MIDI testing without a piano or tablet

LoopBe1 must expose **LoopBe Internal MIDI**. For the browser, open the score preview, click **Enable MIDI**, allow site access and select that input. In another PowerShell terminal, send the fixture:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1 -Speed 0.25
```

Notes arrive through the browser's real Web MIDI API. The page shows held notes, sustained sounding notes and channel identity. MIDI edits the draft only with entry enabled in Create. Mode changes and saving preserve the connection but pause entry. Switching inputs clears notes; choosing **Disconnected**, signing out, or hiding the browser page detaches input. Press **Enable MIDI** to reconnect after returning. This setup does not generate audio.

For a chord-entry sequence, choose **1 beat** duration and start MIDI entry on a blank sheet, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1 -Fixture authoring
```

This broadcasts C, F, Am, Am, G, including a rapid gesture, rolled notes and two chords with sustain held. For automated browser authoring acceptance in installed Chrome, stop other Vite/LoopBe senders, start the test backend and run from the initialized Node shell:

```powershell
.\scripts\development\Start-LocalBackend.ps1 -Environment test
$env:CHORDVIEWER_REAL_MIDI = '1'
npx playwright test tests/web/authoring.spec.ts
npx playwright test tests/web/melody-authoring.spec.ts
Remove-Item Env:CHORDVIEWER_REAL_MIDI
```

The authoring suites create synthetic accounts and check chord/melody insertion, direct editing, import/export, corrections, save/reopen, interrupted gestures, failed saves and conflicts. MIDI cases are opt-in and use the actual Windows LoopBe driver; ordinary manual-entry/import cases also run in the normal browser suite.

To play melody interactively, choose G major, 3/4, the melody pass and quarter notes, then start entry:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1 -Fixture melody
```

This broadcasts C4, D4, F-sharp4, F-sharp4, G4 and A4 as separate gestures, including repeated notes under sustain.

For the Android emulator, keep the MIDI bridge running in a separate terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Start-Bridge.ps1
```

In the initialized Android terminal, connect the debug app and send notes:

```powershell
.\scripts\development\Connect-AndroidMidi.ps1 -Serial emulator-5554
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1 -Speed 0.25
```

The bridge listens only on `127.0.0.1:39173`; the helper creates `adb reverse` and passes a private per-run token without printing it. You do not need to copy the token. The [bridge guide](scripts/midi/README.md) documents connection behavior and fixture options. The development bridge and debug relay have no dedicated test suites; the product acceptance tests below can still use them to supply MIDI input.

For the optional native UI acceptance test, prepare a synthetic account with at least one saved sheet in the **test** backend. Store its `email` and `password` as a JSON object in a private, ignored fixture file, then run with the bridge active:

```powershell
.\apps\android\scripts\Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local\backend\ui-native-fixture.json -WithMidi
```

This changes a test sheet's title, checks draft preservation and read-only Practice, holds a real LoopBe note through navigation and saving, advances on a fresh matching gesture, verifies sign-out, and captures native screenshots under `.local/android-ui-evidence`. Run the separate Library organization UI check with the same private fixture and test API:

```powershell
.\apps\android\scripts\Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local\backend\ui-native-fixture.json -Organization
```

The organization check uses a fresh synthetic sheet for favorite, Draft, duplicate, Trash and restore. Both commands pass credentials over stdin, not command-line arguments. They require the test API on port 3001 and refuse conflicting emulator port mappings. Remove an existing development mapping with `adb -s emulator-5554 reverse --remove tcp:3000` before the test; restore `adb -s emulator-5554 reverse tcp:3000 tcp:3000` afterward. Omit `-WithMidi` for UI-only Practice acceptance. See the [native guide](apps/android/README.md) for fixture details.

M7 recovery acceptance uses a separate synthetic account with an empty Library and a private fixture containing `email`, `password` and optional `apiPort` (defaults to 3001). Build the debug and test APKs first, then run both phases in order on an isolated emulator:

```powershell
npx playwright test tests/web/recovery.spec.ts
.\apps\android\scripts\Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local\backend\m7-native-fixture.json -RecoveryPhase 1
.\apps\android\scripts\Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local\backend\m7-native-fixture.json -RecoveryPhase 2
```

Phase 1 creates music through the native UI, temporarily disconnects its backend route, retries Save after reconnecting, and leaves a confirmed unsaved recovery copy. Phase 2 force-stops/relaunches the app, changes the saved original from another client, restores the local copy and saves it as a new sheet. Phase 1 requires its own port-3000 reverse mapping; the runner preserves unrelated mappings. These are product acceptance tests using the development adapter, not tests for the adapter itself. Screenshots are under `.local/android-ui-evidence`; [M7 verification](docs/development/m7-verification.md) records checked results.

For native chord/melody authoring acceptance, use the same private synthetic account and running bridge:

```powershell
.\apps\android\scripts\Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local\backend\ui-native-fixture.json -Authoring
```

This installs the built debug/test APKs and broadcasts real MIDI only when instrumentation signals readiness. It checks chord and melody entry, polyphony rejection, direct editing, ties/rests, key/meter changes, history, replacement, read-only Practice, reconnect, save/reopen, and JSON export/import through Android's document pickers. It creates synthetic sheets and captures M4/M5 screenshots. Run it separately from browser MIDI tests and other senders; all LoopBe listeners hear the same broadcasts.

When finished, stop the bridge with Ctrl+C in its terminal, then:

```powershell
adb -s emulator-5554 reverse --remove tcp:39173
adb -s emulator-5554 reverse --remove tcp:3000
adb -s emulator-5554 emu kill
```

The debug bridge is excluded from the Android release build. Emulator testing does not establish physical USB/Bluetooth or Samsung hardware compatibility.

## Next milestones

M6 Library and Practice implementation and local validation are recorded in the [M6 verification record](docs/development/m6-verification.md). NAS deployment stays at M8, after local validation. See the [milestone roadmap](docs/architecture/milestones.md) and [score contract](docs/architecture/score-contract.md).
