# Native Android development

This first milestone is a native Kotlin / Jetpack Compose MIDI input monitor. It separates physically held keys from sounding notes and sustain, including channel identity. Sheet authoring and practice will build on this input boundary in later milestones.

## Build

Open this directory in Android Studio or use the checked-in Gradle wrapper. Install Android SDK platform 35 and build tools 35.0.0. Point `ANDROID_HOME` to the SDK and `JAVA_HOME` to **JDK 21**, which the repository's development setup installs separately. Select the same JDK for Gradle in Android Studio; its bundled runtime may be newer than this build supports. A generated `local.properties` file may contain the SDK path; it is ignored.

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease
```

The build pins AGP 8.13.2, Gradle 8.14.5, Kotlin / Compose compiler 2.3.21, Compose BOM 2025.04.01 and SDK 35. Gradle's distribution checksum is pinned. Gradle 8.14.5 includes the repository-resolution security fixes announced in January 2026. These form a compatible baseline rather than a promise of current Play Store submission readiness; review target SDK and dependency updates before the public launch milestone.

## Emulator MIDI input

Start the [Windows bridge](../../scripts/midi/README.md) on the development machine, then run:

```powershell
adb reverse tcp:39173 tcp:39173
.\gradlew.bat :app:installDebug
```

Launch **ChordViewer** in the emulator, paste the session token from the bridge's ignored `.local/midi/bridge.json` file into the masked field and press **Connect**. The root development launcher can pass the same token through the debug-only `chordviewer.midi.token` intent extra. The debug application ID is `com.chordviewer.debug`; its activity is `com.chordviewer.MainActivity`.

Send the fixture through LoopBe1. Held notes should appear immediately, note-off should clear held notes, and sustain should retain only sounding notes until pedal release. **Disconnect / clear** and backgrounding the app clear state. Restarting the bridge requires a fresh connection and may require its new token. This setup does not create sound or send notes back to the loopback device.

## Boundaries and tests

- `src/main` contains the transport-independent MIDI byte parser and native monitor UI.
- `src/debug` contains all TCP transport, authentication token handling, relay framing and connection controls. It connects only to `127.0.0.1:39173` through `adb reverse`; it has no configurable remote endpoint. A reset must precede ordered MIDI frames; malformed input closes the connection and clears notes.
- `src/release` provides a placeholder for future device MIDI input. The release manifest has no Internet permission, relay endpoint, token field or debug transport. USB and Bluetooth transport are not implemented in this milestone.
- Local tests exercise fragmented and running-status MIDI, interleaved realtime messages, note-on with zero velocity, sustain and channel separation, panic/reset behavior, bounded framing and out-of-order or malformed relay data.

The debug relay processes every MIDI frame but coalesces screen updates to avoid an unbounded UI queue. Future automatic insertion must recognize gestures before that UI update boundary, so a quick press/release can never disappear from the authoring model.

M1 builds, 17 JVM tests and real LoopBe/emulator instrumentation passed on 2026-09-20. See the [verification record](../../docs/development/m1-verification.md) and [local setup guide](../../docs/development/local-setup.md) for the tested hardware-graphics AVD. A successful loopback run covers application input behavior; it does not verify a physical tablet's USB/Bluetooth compatibility.

`LoopbackRelayTest` is an opt-in instrumentation integration test. Install the debug and Android test APKs, establish `adb reverse`, and run `AndroidJUnitRunner` with the `midiToken` argument read from the current bridge metadata (do not log it). Once the runner emits `MIDI_RELAY_READY`, send the host smoke fixture within 30 seconds at its default speed. The test verifies held C major, sustained release, zero-velocity note-off, channel separation, final clear, explicit disconnect reset and reconnect reset through the actual socket and native parser. Without the token it is skipped, so an ordinary skipped run is not evidence of emulator loopback coverage.

Build references: [AGP 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes), [Kotlin compatibility](https://kotlinlang.org/docs/gradle-configure-project.html), [Gradle security advisory](https://github.com/gradle/gradle/security/advisories/GHSA-w78c-w6vf-rw82), [Compose compiler setup](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler), [Compose BOM mapping](https://developer.android.com/develop/ui/compose/bom/bom-mapping).
