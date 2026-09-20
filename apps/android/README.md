# Native Android development

The native Kotlin / Jetpack Compose app includes a developer score preview and a MIDI input monitor. The score preview reads the same original JSON fixture as the web client; it is not a saved personal sheet. The monitor separates physically held keys from sounding notes and sustain, including channel identity. Sheet authoring and practice will build on these boundaries in later milestones.

## Build

Open this directory in Android Studio or use the checked-in Gradle wrapper. Install Android SDK platform 35 and build tools 35.0.0. Point `ANDROID_HOME` to the SDK and `JAVA_HOME` to **JDK 21**, which the repository's development setup installs separately. Select the same JDK for Gradle in Android Studio; its bundled runtime may be newer than this build supports. A generated `local.properties` file may contain the SDK path; it is ignored.

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease
```

The build pins AGP 8.13.2, Gradle 8.14.5, Kotlin / Compose compiler 2.3.21, Compose BOM 2025.04.01 and SDK 35. Gradle's distribution checksum is pinned. Gradle 8.14.5 includes the repository-resolution security fixes announced in January 2026. These form a compatible baseline rather than a promise of current Play Store submission readiness; review target SDK and dependency updates before the public launch milestone.

## Emulator MIDI input

Build before booting the emulator, then start the [Windows bridge](../../scripts/midi/README.md) on the development machine. From the repository root in an initialized Android shell, run:

```powershell
adb -s emulator-5554 install -r -t apps/android/app/build/outputs/apk/debug/app-debug.apk
.\scripts\development\Connect-AndroidMidi.ps1 -Serial emulator-5554
```

The first command installs the built debug APK. The helper establishes `adb reverse` and launches **ChordViewer** with the private session token without printing it. Use the actual serial from `adb devices` if it differs. The debug application ID is `com.chordviewer.debug`; its activity is `com.chordviewer.MainActivity`. The [root README](../../README.md) gives the full build, boot, test and shutdown commands.

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

## Native score proof

The app decodes `contracts/fixtures/lead-sheet-v1.json` directly through Gradle asset and test-resource source directories. There is no copied Android-only score file. The v1 reader validates the agreed C-major, 4/4, single-treble-voice subset, including independent chord timing, rhythmic duration, globally unique IDs, bar boundaries and ties between adjacent equal spelled pitches.

Compose Canvas draws staff lines, stems, ledger lines and ties. The bundled **Bravura** font supplies SMuFL noteheads, accidentals, rests, flags, clef and time signature. A chord-only switch changes the view without changing the score. Accidentals persist within each bar and a natural cancels an earlier alteration. Dense measures scroll horizontally; rows contain one or two measures according to available width. The canvas exposes a textual score description for accessibility. This is a notation feasibility proof; advanced engraving, beaming, multiple voices, lyrics, editing and saved-library behavior remain later work.

Bravura is unmodified and licensed under SIL Open Font License 1.1. The license is bundled in `app/src/main/assets/licenses/Bravura-OFL.txt`. Source: [Steinberg Bravura commit 37b1943](https://github.com/steinbergmedia/bravura/tree/37b194378b710cc40e406ab6c4b07608bb9548ae). `bravura.otf` SHA256: `cdf0f893ee1fdb64b7f6713d71ee0dcfc349c0ac01429a8e451b01a9e79f5f3b`.
