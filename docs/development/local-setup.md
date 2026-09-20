# Local development

The rebuild starts with local browser and Android MIDI testing. The backend and database arrive in M3; NAS deployment remains M8. See the [milestones](../architecture/milestones.md) for the current delivery boundary.

**M1 verified:** Android builds, all 17 JVM tests and the real LoopBe-to-emulator instrumentation test pass. Use the hardware-graphics profile below; software graphics stalled on this workstation. See the [M1 verification record](m1-verification.md) for evidence and limits.

## Workstation tools

Installed for M1 on 2026-09-20:

| Tool | Version / configuration |
| --- | --- |
| Android Studio | Quail 4, 2026.1.4 Patch 1; installed from Google's Windows ZIP |
| Build JDK | Microsoft OpenJDK 21.0.12.1; Studio runs on its separate bundled JBR |
| Android command-line tools | 22.0 |
| SDK platform | Android 15 / API 35, revision 2 |
| SDK Build Tools | 35.0.0 |
| Platform Tools | 37.0.1 |
| Emulator | 37.1.11, Windows Hypervisor Platform acceleration |
| Virtual device | `ChordViewerTabletLocal`, Pixel Tablet profile, 1280×800 at 160 dpi, API 35 default x86_64 image revision 2 |
| Emulator allocation | One emulator, 1 virtual CPU, 2560 MB RAM, host graphics, Vulkan disabled |
| MIDI driver | LoopBe1, input/output named `LoopBe Internal MIDI` |
| Containers | Docker Desktop with a working Linux engine; product containers are not implemented yet |

Google's SDK license was accepted with the user's explicit permission. The Studio, command-line tools and JDK downloads were checked against their publishers' SHA-256 checksums. The Gradle wrapper also verifies its distribution checksum.

The SDK is under `%USERPROFILE%\DeveloperTools\Android\Sdk`, Studio under `%LOCALAPPDATA%\Programs\Android\android-studio`, and JDK 21 under `%USERPROFILE%\DeveloperTools\Java`. These paths are local settings, not product configuration. Set `ANDROID_HOME` and `JAVA_HOME` in your shell to use another installation. In Android Studio's SDK settings, select the same SDK directory; in its Gradle settings, select this **JDK 21**, not the bundled JBR 25.

The environment helper prefers an SDK specified by `ANDROID_HOME`, then `DeveloperTools\Android\Sdk`, then the conventional `%LOCALAPPDATA%\Android\Sdk` location. It requires `platform-tools\adb.exe` and prints the selected SDK and JDK paths. This workstation uses `DeveloperTools` because Windows redirected the original AppData SDK installation into Codex's private storage, which ordinary PowerShell could not see.

## Check and build

Use a normal PowerShell terminal in the repository root, with Node/npm and Docker available. If local scripts are blocked by the default execution policy, start a development shell with the following command. It changes only the child process policy; machine and user policy stay unchanged:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass
```

The Android helper changes only the current process environment:

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
.\scripts\development\Test-Prerequisites.ps1
.\apps\android\gradlew.bat -p apps/android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease :app:assembleDebugAndroidTest
```

The first build downloads Gradle and Maven dependencies. Subsequent builds reuse the user's Gradle cache. On this 16 GB machine, finish the build before booting the emulator and release build-daemon memory with `apps/android/gradlew.bat -p apps/android --stop`. Build outputs, SDK paths, credentials and local test logs are ignored by version control.

The existing browser application remains the web MIDI reference until M2 replaces it:

```powershell
npm ci
npm run dev -- --host 127.0.0.1
```

Open the printed localhost URL in Chrome or Edge, allow MIDI access, and select `LoopBe Internal MIDI`. No physical instrument is needed. Do not forward received events back to the same LoopBe output.

## Run the tablet emulator

In an initialized PowerShell terminal:

```powershell
.\scripts\development\Initialize-AndroidEmulator.ps1
emulator -avd ChordViewerTabletLocal -memory 2560 -cores 1 -no-snapshot -gpu host -feature -Vulkan
```

For automated runs, add `-no-window -no-audio`. Keep that terminal running until testing finishes. List devices with `adb devices`; commands below use `emulator-5554` as an example. Always choose the actual serial explicitly when more than one device is connected.

The helper creates a missing profile after the SDK packages are installed, or validates an existing one without overwriting it. It respects `ANDROID_AVD_HOME` and prints the directory and launch command to use in another shell. It does not start the emulator or change global settings. Verify acceleration with:

```powershell
emulator -accel-check
```

This image/profile enforces at least 2560 MB even if a lower memory value is requested. First boot can take several minutes under memory pressure; wait for `adb -s emulator-5554 shell getprop sys.boot_completed` to return `1`. The tested profile uses hardware graphics because software/SwiftShader runs became unresponsive. Keep Windows virtualization and security settings unchanged.

## Real LoopBe MIDI test

Start the bridge in its own PowerShell terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Start-Bridge.ps1
```

This process listens only on `127.0.0.1:39173`. It creates a private, ignored, per-run credential under `.local/midi/`; stopping it removes the credential. Execution-policy bypass applies only to this process.

To inspect the native UI:

```powershell
. .\scripts\development\Initialize-AndroidEnvironment.ps1
adb -s emulator-5554 install -r -t apps/android/app/build/outputs/apk/debug/app-debug.apk
.\scripts\development\Connect-AndroidMidi.ps1 -Serial emulator-5554
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1
```

The launcher establishes the local `adb reverse` mapping, restarts the debug diagnostic app and passes the session token without printing it. The app shows held notes separately from sustained sounding notes. Backgrounding, disconnecting or restarting clears state; reconnect using the current bridge session.

To run the automated native test with the bridge running and both APKs already built:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/development/Test-AndroidMidi.ps1 -Serial emulator-5554
```

Close any interactive relay connection first. The test installs both APKs, waits for native readiness, sends the real LoopBe fixture, and requires one passing test with no skips. It verifies notes, sustain, channel separation and reconnect reset.

See the [bridge guide](../../scripts/midi/README.md) for fixture coverage and protocol tests, and the [Android guide](../../apps/android/README.md) for build boundaries and instrumentation. The test adapter is compiled into debug builds only. Native USB/Bluetooth integration belongs to later product work and is not verified by the emulator.

## Stop local testing

Stop the bridge with Ctrl+C in its terminal. Remove forwarding and stop the selected emulator:

```powershell
adb -s emulator-5554 reverse --remove tcp:39173
adb -s emulator-5554 emu kill
```

No NAS or public service is involved. The baseline source and private configuration were preserved outside the repository before cleanup. The source history, license, domain ownership and design mockups remain intact.
