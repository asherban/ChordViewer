# ChordViewer

Create lead sheets at the piano, keep a YouTube lesson beside the score, and practice on the web or a native Android tablet.

**Rebuild status: M3 local accounts and persistence.** Create an account in the browser or native Android app and use the same personal Library from both. New accounts start empty. Create a blank sheet or explicitly copy the original example, reopen it, and save its title and YouTube tutorial link. Both clients render chords and a treble melody voice. Note/chord editing, embedded tutorial playback and practice advancement arrive in later milestones.

The [product plan, selected mockups and milestones](docs/architecture/README.md) describe the agreed product. The [M3 verification record](docs/development/m3-verification.md) contains checks and screenshots; [notation licenses](docs/development/third-party-notices.md) document bundled components. The previous browser app remains recoverable from history and a private baseline; this checkout contains the rebuild. The existing `chordviewer.app` deployment and DNS have not been changed.

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

`fnm install` reads `.node-version`; it is only needed once per version. Run the `fnm env` and `fnm use` commands in each new development terminal. No PowerShell profile or system-wide Node default is changed. On another machine with a matching Node/npm installation, fnm is optional.

## Start the web client and API

Start Docker Desktop, then run in the initialized terminal:

```powershell
.\scripts\development\Start-LocalBackend.ps1
npm run dev
```

The helper generates private local credentials once, builds the API image and starts PostgreSQL and the API in the background. Keep the `npm run dev` terminal running for the web server and contract watcher. Open **http://127.0.0.1:5173/** in Chrome or Edge; this is the configured browser origin. The API is at **http://127.0.0.1:3000/**, and Vite proxies `/api` and `/health` to it. PostgreSQL has no published host port. No NAS is required.

Create an account using a password of 12–128 characters. Email verification and password recovery are not configured for this private milestone. Your Library starts empty; copying the example is an explicit action. Save details with the Save button. A stale revision produces a conflict instead of overwriting another device's changes. The local limit is 100 sheets per account and 1 MiB per write. Music entry/editing and full Library/Practice features remain future work.

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

Sign in with the same account as the browser to open and save the same sheets. The app renders notation natively. Android session credentials stay in memory; restarting the app process requires signing in again. Switch to the MIDI monitor for input diagnostics. Only debug builds permit loopback HTTP; the release API remains unconfigured pending a later HTTPS deployment.

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

Notes arrive through the browser's real Web MIDI API. The page shows held notes, sustained sounding notes and channel identity. MIDI input does not yet edit saved scores. Switching inputs, disconnecting, or hiding the page clears input; select the device to resume after returning. This setup does not generate audio.

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

When finished, stop the bridge with Ctrl+C in its terminal, then:

```powershell
adb -s emulator-5554 reverse --remove tcp:39173
adb -s emulator-5554 reverse --remove tcp:3000
adb -s emulator-5554 emu kill
```

The debug bridge is excluded from the Android release build. Emulator testing does not establish physical USB/Bluetooth or Samsung hardware compatibility.

## Next milestones

M4 adds MIDI authoring; M5 melody editing/import; M6 the full Library and Practice workflow. NAS deployment stays at M8, after local validation. See the [milestone roadmap](docs/architecture/milestones.md) and [score contract](docs/architecture/score-contract.md).
