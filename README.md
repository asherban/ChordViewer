# ChordViewer

Create lead sheets at the piano, keep a YouTube lesson beside the score, and practice on the web or a native Android tablet.

**Rebuild status: M4 MIDI chord authoring.** Create an account in the browser or native Android app and use the same personal Library from both. New accounts start empty. Create a blank sheet, automatically insert chords from MIDI, correct/delete/replace them, undo/redo, link a YouTube tutorial and save/reopen the full sheet. Both clients also display existing treble melody notation. Melody editing, embedded tutorial playback and practice advancement arrive in later milestones.

The web and Android clients now use the shared cream/sage design from the mockups: a compact Library/Create/Practice header, personal sheet cards, and a score workspace with tutorial and live MIDI feedback beside it. The web app fills the browser window; **Enter full screen** in the header also hides the browser chrome. Use **Exit full screen** or **Esc** to leave that mode. Browsers that disallow it still get the full-window layout.

Scores use large serif chord names and compact four-bar rows, with connected staves when melody is visible. Narrow windows and dense music reflow into fewer bars at a readable size. See the [score layout screenshots and verification](docs/development/score-layout-verification.md). Run the testing launcher without `-SkipBuild` after pulling Android source changes so the emulator receives the updated app.

The [product plan, selected mockups and milestones](docs/architecture/README.md) describe the agreed product. See the [M4 verification record](docs/development/m4-verification.md) for authoring checks and current screenshots, the [M3 verification record](docs/development/m3-verification.md) for persistence, and the [UI alignment record](docs/development/m3-ui-verification.md) for the shared design. [Notation licenses](docs/development/third-party-notices.md) document bundled components. The previous browser app remains recoverable from history and a private baseline; this checkout contains the rebuild. The existing `chordviewer.app` deployment and DNS have not been changed.

## Repository

| Directory | Purpose |
| --- | --- |
| `apps/web` | React/TypeScript browser client and direct Web MIDI input. |
| `apps/android` | Native Kotlin/Compose app, notation renderer and debug MIDI adapter. |
| `services/api` | Fastify API, Better Auth accounts and owner-scoped PostgreSQL sheet storage. |
| `infra/backend` | Local API/database containers, pinned images and persistent volumes. |
| `contracts` | Versioned score schema, TypeScript validation, OpenAPI and shared fixtures. |
| `scripts/development`, `scripts/midi` | Workstation setup, emulator launch helpers and real LoopBe tests. |
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
3. Enter **P** and press **Enter**, or just press **Enter**, to broadcast the fixture to both connected clients. Wait for playback to finish, then repeat as often as needed. It displays notes, sustain and channels without producing audio. To insert its chords, open a saved sheet in **Create**, select a free position and press **Start MIDI entry** on each client. Single notes are ignored. Restore the browser if minimized; the launcher brings the app tab forward and prepares its input before each broadcast. Keep Android in the foreground; after backgrounding, reopen **MIDI**, press **Connect**, then start entry again.
4. Save any draft edits, then enter **Q** and press **Enter**, or press **Ctrl+C**, to stop. Quitting also works during startup or playback; unsaved drafts do not survive shutdown.

Both clients receive the same real LoopBe sequence; there is no synthetic browser event injection. Open the same saved sheet in each client to compare drafts. Save from one client at a time: revision conflicts prevent silently overwriting the other client's saved changes.

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

## Start only the web client and API

Start Docker Desktop, then run in the initialized terminal:

```powershell
.\scripts\development\Start-LocalBackend.ps1
npm run dev
```

The helper generates private local credentials once, builds the API image and starts PostgreSQL and the API in the background. Keep the `npm run dev` terminal running for the web server and contract watcher. Open **http://127.0.0.1:5173/** in Chrome or Edge; this is the configured browser origin. The API is at **http://127.0.0.1:3000/**, and Vite proxies `/api` and `/health` to it. PostgreSQL has no published host port. No NAS is required.

Create an account using a password of 12–128 characters. Email verification and password recovery are not configured for this private milestone. Your Library starts empty; **New sheet** offers a blank sheet or an explicit example copy. **Open** enters Create; use **Sheet details** for the title/tutorial. **Practice** displays the current draft with live MIDI feedback and never inserts chords. Switching modes retains the draft; opening a different sheet or signing out asks before discarding changes. Drafts are not durable across reloads. A stale revision produces a conflict instead of overwriting another device's changes. The local limit is 100 sheets per account and 1 MiB per write.

### Create a chord sheet

1. Create/open a saved sheet and connect MIDI. Choose a free bar/beat and a duration (default: four beats, one bar).
2. Press **Start MIDI entry**. Play a chord and release every physical key: it inserts once and advances by the chosen duration. Sustain does not delay insertion. Rolled/overlapping keys form one chord until all are released.
3. Select an inserted chord to change its name/duration, choose an alternative name, **Replace from MIDI** once, or **Delete chord**. Replacement and deletion leave neighbouring chords and melody intact. **Undo/Redo** restores music and cursor position; web also supports Ctrl/Cmd+Z, Shift+Z, Ctrl/Cmd+Y and Delete.
4. Unknown voicings stay available for manual naming. A chord that overlaps another or crosses a barline remains pending: shorten its duration or choose another free slot, then apply it.
5. Press **Save sheet**. Failed saves retain the draft; revision conflicts offer an explicit reload after confirmation. Save details also saves the full score. Leaving Create, editing details, disconnecting, or backgrounding pauses entry; press **Start MIDI entry** again when ready.

The current contract uses a C key signature and 4/4, with chords in any pitch class and half-beat through whole-bar durations. Single-note melody entry is M5. Music undo/redo retains up to 100 changes and does not undo title/tutorial fields. See the [shared chord-entry behavior](docs/architecture/chord-authoring.md) and [M4 verification](docs/development/m4-verification.md).

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

## Build and check

```powershell
npm run check
npx playwright install chromium
.\scripts\development\Start-LocalBackend.ps1 -Environment test
npm run test:web
npm run test:persistence
npm run test:api
.\scripts\development\Stop-LocalBackend.ps1 -Environment test
```

`check` runs lint, unit/contract tests and web/API builds. Install Chromium once. `test:web` starts/stops its own Vite server, so stop `npm run dev` first; it uses the separate test API on **127.0.0.1:3001**. The integration suites create random accounts in the test database and check persistence, isolation, conflicts and failures. Windows-only `test:persistence` checks session renewal/expiry and restarts, rebuilds and recreates the labelled test containers while retaining their volume. Close interactive test clients before that suite; it does not operate on development containers. Run suites sequentially: API throttling tests deliberately exhaust sign-in limits for up to 60 seconds. These checks do not replace real LoopBe testing below.

Additional commands:

```powershell
npm run lint
npm run test:run
npm run build
```

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
Remove-Item Env:CHORDVIEWER_REAL_MIDI
```

These three opt-in tests create synthetic accounts and check insertion, corrections, replacement, save/reopen, interruption recovery, failed saves and conflicts. The normal browser suite skips them unless explicitly enabled. They require the actual Windows LoopBe driver; MIDI is not mocked.

For the Android emulator, keep the MIDI bridge running in a separate terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Start-Bridge.ps1
```

In the initialized Android terminal, connect the debug app and send notes:

```powershell
.\scripts\development\Connect-AndroidMidi.ps1 -Serial emulator-5554
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1 -Speed 0.25
```

The bridge listens only on `127.0.0.1:39173`; the helper creates `adb reverse` and passes a private per-run token without printing it. You do not need to copy the token. Disconnect the interactive app before running the automated real-input check:

```powershell
adb -s emulator-5554 shell am force-stop com.chordviewer.debug
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/development/Test-AndroidMidi.ps1 -Serial emulator-5554
```

This installs both built APKs, sends the real LoopBe fixture and requires a passing native instrumentation test covering notes, sustain, channels and reconnect reset. A skipped test is not a pass. The [bridge guide](scripts/midi/README.md) documents protocol checks and fixture options.

For the optional native UI acceptance test, prepare a synthetic account with at least one saved sheet in the **test** backend. Store its `email` and `password` as a JSON object in a private, ignored fixture file, then run with the bridge active:

```powershell
.\apps\android\scripts\Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local\backend\ui-native-fixture.json -WithMidi
```

This changes a test sheet's title, checks mode/draft preservation, holds a real LoopBe note through navigation and saving, verifies sign-out, and captures native screenshots under `.local/android-ui-evidence`. It passes credentials over stdin, not command-line arguments. It requires the test API on port 3001 and refuses conflicting emulator port mappings. Remove an existing development mapping with `adb -s emulator-5554 reverse --remove tcp:3000` before the test; restore `adb -s emulator-5554 reverse tcp:3000 tcp:3000` afterward. Omit `-WithMidi` for UI-only acceptance. See the [native guide](apps/android/README.md) for fixture details.

For native M4 chord-entry acceptance, use the same private synthetic account and running bridge:

```powershell
.\apps\android\scripts\Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local\backend\ui-native-fixture.json -Authoring
```

This installs the built debug/test APKs and broadcasts real MIDI only when instrumentation signals readiness. It checks fast sustained chords, correction, deletion, undo/redo, one-shot replacement, read-only Practice, reconnect and full-score save/reopen. It creates a new test sheet and captures three M4 screenshots. Run this separately from browser MIDI tests and other senders; all LoopBe listeners hear the same broadcasts.

When finished, stop the bridge with Ctrl+C in its terminal, then:

```powershell
adb -s emulator-5554 reverse --remove tcp:39173
adb -s emulator-5554 reverse --remove tcp:3000
adb -s emulator-5554 emu kill
```

The debug bridge is excluded from the Android release build. Emulator testing does not establish physical USB/Bluetooth or Samsung hardware compatibility.

## Next milestones

M5 adds melody editing/import; M6 completes the Library and Practice workflow. NAS deployment stays at M8, after local validation. See the [milestone roadmap](docs/architecture/milestones.md) and [score contract](docs/architecture/score-contract.md).
