# ChordViewer

Create lead sheets at the piano, keep a YouTube lesson beside the score, and practice on the web or a native Android tablet.

**Rebuild status: M2 foundation.** The personal Library starts empty. Both clients render the same original score example with chords, one treble melody voice, rests, accidentals, dotted notes and ties. Web MIDI and the Android debug MIDI relay are available for local testing. Editing, accounts, saving, tutorial playback and practice advancement arrive in later milestones; the example is not saved to your Library.

The [product plan, selected mockups and milestones](docs/architecture/README.md) describe the agreed product. The [M2 verification record](docs/development/m2-verification.md) contains checks and screenshots; [notation licenses](docs/development/third-party-notices.md) document bundled components. The previous browser app remains recoverable from history and a private baseline; this checkout contains the rebuild. The existing `chordviewer.app` deployment and DNS have not been changed.

## Repository

| Directory | Purpose |
| --- | --- |
| `apps/web` | React/TypeScript browser client and direct Web MIDI input. |
| `apps/android` | Native Kotlin/Compose app, notation renderer and debug MIDI adapter. |
| `services/api` | Fastify API; M2 serves health and an immutable score example only. |
| `contracts` | Versioned score schema, TypeScript validation, OpenAPI and shared fixtures. |
| `scripts/development`, `scripts/midi` | Workstation setup, emulator launch helpers and real LoopBe tests. |
| `tests` | Browser acceptance and language-independent musical reference cases. |
| `docs/architecture` | Product decisions, score contract, milestones and design mockups. |

## Developer setup on this Windows computer

Run commands from the repository root. You need the pinned Node 24 version from `.node-version`, npm 11, and Chrome or Edge for Web MIDI. Android requires JDK 21, Android SDK 35, Build Tools 35.0.0, Platform Tools, Emulator and the API 35 default x86_64 system image. These tools and LoopBe1 are installed on this workstation; see the [installation record](docs/development/local-setup.md) for exact versions and paths. Docker is required starting with M3, not for this foundation.

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

In the initialized terminal:

```powershell
npm run dev
```

Keep this terminal running. Open **http://127.0.0.1:5173/** in Chrome or Edge. The API listens on **http://127.0.0.1:3000/**. Both bind to loopback; the web development server proxies `/api` and `/health`. No database, NAS, login or environment secrets are needed in M2.

The Library is empty. Choose **Explore the score preview** to see the shared example, toggle **Chords + melody / Chords only**, and enable MIDI. Create and Practice are clearly labeled previews, not working editors yet. The API connection indicator reports when the bundled sample is being used because the API is unavailable.

To check the API from another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/v1/score-example
```

Stop development with **Ctrl+C**. The command stops its contract watcher, API and web processes together. Ports 3000 and 5173 must be free; startup fails rather than silently choosing another port.

## Build and check

```powershell
npm run check
npx playwright install chromium
npm run test:web
```

`check` runs lint, unit/contract/API tests and web/API builds. Install Chromium once for browser acceptance. `test:web` starts and stops its own local services, so stop `npm run dev` first. Browser tests cover the empty Library, API score rendering, display switching and invalid/unavailable API responses. They do not replace the real LoopBe check below.

Additional commands:

```powershell
npm run lint
npm run test:run
npm run build
npm run start --workspace @chordviewer/api
```

The last command runs the compiled API after a build. The web output is `apps/web/dist`; API output is `services/api/dist`. Container packaging and PostgreSQL persistence begin in M3. There is no publish/deploy command in this milestone.

## Android: prepare and build

In a development PowerShell from the repository root:

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
.\scripts\development\Test-Prerequisites.ps1
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

Continue when the last command returns `1`. Use the actual serial from `adb devices` if it differs. Install and launch the native preview:

```powershell
adb -s emulator-5554 install -r -t apps/android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -n com.chordviewer.debug/com.chordviewer.MainActivity
```

The native preview loads the exact same score fixture from its packaged assets and draws it natively; no WebView or running API is needed for M2. Backend connectivity arrives in M3. The MIDI monitor is also available on the screen.

## MIDI testing without a piano or tablet

LoopBe1 must expose **LoopBe Internal MIDI**. For the browser, open the score preview, click **Enable MIDI**, allow site access and select that input. In another PowerShell terminal, send the fixture:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1 -Speed 0.25
```

Notes arrive through the browser's real Web MIDI API. The page shows held notes, sustained sounding notes and channel identity. MIDI input never edits the M2 sample. Switching inputs, disconnecting, or hiding the page clears input; select the device to resume after returning. This setup does not generate audio.

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
adb -s emulator-5554 emu kill
```

The debug bridge is excluded from the Android release build. Emulator testing does not establish physical USB/Bluetooth or Samsung hardware compatibility.

## Next milestones

M3 adds local containers, PostgreSQL, accounts and sheet persistence. M4 adds MIDI authoring; M5 melody editing/import; M6 the full Library and Practice workflow. NAS deployment stays at M8, after local validation. See the [milestone roadmap](docs/architecture/milestones.md) and [score contract](docs/architecture/score-contract.md).
