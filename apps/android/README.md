# Native Android development

The native Kotlin / Jetpack Compose app signs in to the shared local backend and manages each account's persistent library. Create supports automatic MIDI chord insertion, duration and position selection, correction, deletion, undo/redo and full-score saves with revision conflict detection. Melody editing and guided practice remain later milestones. A compact Library / Create / Practice shell follows the agreed warm-white and sage mockups. Library uses two columns on wide tablets. Create and Practice keep the score beside tutorial and live MIDI cards; narrower windows stack these surfaces. Sheet metadata and connection settings are available in dialogs. Held/sounding notes, recognized chords, sustain and channel identity remain visible in the live MIDI card.

## Local accounts and library

Start the backend using the [root README](../../README.md), install the debug APK, and forward its loopback API port:

```powershell
adb -s emulator-5554 reverse tcp:3000 tcp:3000
adb -s emulator-5554 shell am start -n com.chordviewer.debug/com.chordviewer.MainActivity
```

Create an account in **Library** or sign in with the same account used on the web. A new account starts empty. **Copy example** makes a real, separately saved sheet only when selected explicitly. The tutorial field accepts an HTTPS YouTube watch or youtu.be link; the server normalizes it without loading the video. If another client saves first, go to **Library → Refresh**, confirm discarding the stale draft, then reopen the sheet before trying again.

Session tokens remain only in the activity's ViewModel. Rotation preserves the session; process death or force-stop requires sign-in again. Passwords and tokens are never written to saved instance state, preferences, files or logs. Sign-out clears local account data immediately and requests server revocation; a failed revocation is shown explicitly. The app does not automatically retry a failed write. Unsaved score, title and tutorial edits stay in the ViewModel when switching between Library, Create and Practice or rotating the device. Selecting a different sheet, refreshing the library or signing out asks before discarding them. Closing Sheet details keeps its draft; returning to that dialog restores it. Failed saves retain the draft and the last saved revision. An unavailable library is shown as not loaded, rather than empty.

### Create chord sheets

Open a personal sheet in **Create**, use the position and duration controls to choose the target bar, beat and length, then choose **Start MIDI entry**. Whole bar is the default. Play a chord and release every physical key: one symbol is inserted and the target advances by the selected duration. Sustain does not delay insertion. Overlapping or rolled notes belong to one gesture until all keys release; a single note or octave doubling alone is ignored. If keys were already held when arming, release them before playing a fresh chord.

**Pause entry** permits exploratory playing. **Change chord** opens a picker for the current bar; selecting a chord pauses entry and exposes its symbol, duration, **Delete chord** and explicitly armed **Replace from MIDI**. Replacement changes one selected chord and pauses again. **Change last** opens recognized alternatives and manual symbol correction. An unknown gesture stays pending until a symbol is entered or it is discarded. A blocked insertion stays pending: shorten its duration or choose a free position, then apply it without replaying. Existing chords are never silently overwritten or shortened, and durations cannot cross a barline. A virtual next bar becomes a real bar only when a chord is inserted, up to the existing 256-bar limit.

**Undo/Redo** keeps the previous 100 score-and-position changes. **Save sheet** saves chords together with the title, tutorial and untouched melody lane; reopening restores the full score. Mode changes, dialogs, saving, disconnects and backgrounding pause entry. Library and Practice never write played notes to the score. Durable offline recovery and physical USB/Bluetooth input remain later work.

Only the debug source set permits HTTP, restricted to `127.0.0.1` through `adb reverse`. Release networking requires HTTPS and has no API origin configured until public hosting is selected. Redirects are rejected so credentials cannot follow a server redirect to another host. Requests have connection/read timeouts; response reads stop at 2 MiB and score writes at 1 MiB. Android's normal certificate verification applies to HTTPS.

The implementation separates `library/LibraryApi.kt` (bounded HTTP), `LibraryModels.kt` (validated contracts), `LibraryViewModel.kt` (session and request lifetime), and `LibraryScreen.kt` (Compose UI). It uses the platform HTTP client and the existing AndroidX lifecycle family; no third-party HTTP or credential-storage implementation was added.

### Real backend instrumentation

Run this only against the isolated test API/database: the test creates new random test accounts and sheets. It does not reset a developer database. Build the test APK before starting the emulator, establish the reverse mapping, and install both APKs:

```powershell
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest
adb -s emulator-5554 reverse tcp:3001 tcp:3001
adb -s emulator-5554 install -r -t app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell am instrument -w -r -e class com.chordviewer.library.LibraryIntegrationTest -e libraryApi true -e apiPort 3001 com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
adb -s emulator-5554 reverse --remove tcp:3001
```

The test checks an empty account, example/blank creation, score reading and updates, canonical tutorial URLs, stale revision conflicts, persisted data after a new login, cross-account denial, and server session revocation. Without `libraryApi=true`, it is skipped and does not provide evidence of backend coverage. Credentials are generated in the test process and are not printed.

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

Use the header MIDI button for connection settings, then open a sheet or Explore example in Create / Practice to see live feedback. Connection ownership stays at the app root, so opening dialogs, switching modes and saving do not reset the live held-note display; they pause automatic writing and cancel any incomplete entry gesture. Send the fixture through LoopBe1. Held notes should appear immediately, note-off should clear held notes, and sustain should retain only sounding notes until pedal release. **Disconnect / clear** and backgrounding the app clear state. Restarting the bridge requires a fresh connection and may require its new token. This setup does not create sound or send notes back to the loopback device.

## Boundaries and tests

- `src/main` contains the transport-independent MIDI byte parser, shared MIDI view state, native app shell and live note cards.
- `src/debug` contains all TCP transport, authentication token handling, relay framing and connection controls. It connects only to `127.0.0.1:39173` through `adb reverse`; it has no configurable remote endpoint. A reset must precede ordered MIDI frames; malformed input closes the connection and clears notes.
- `src/release` provides a placeholder for future device MIDI input and an unconfigured public API origin. Release includes Internet permission for future HTTPS API use, but has no relay endpoint, relay token field, debug cleartext exception or debug transport. USB and Bluetooth transport are not implemented in this milestone.
- Local product tests exercise fragmented and running-status MIDI, interleaved realtime messages, note-on with zero velocity, sustain and channel separation, and panic/reset behavior. Development-only bridge and relay tests are excluded under the repository's [testing policy](../../AGENTS.md).

The debug relay coalesces only the live screen snapshot. A separate ordered queue delivers every validated raw frame to the common gesture engine before updating the screen. The queue is bounded to 1,024 frames with at most one posted delivery; overflow closes the connection, clears the queue and pauses entry rather than dropping a note-off. Recognition uses `contracts/fixtures/chord-vocabulary-v1.json` directly, with shared native/web recognition and gesture fixtures. It does not infer gestures from recomposition or from held-note snapshots.

M1 builds, 17 JVM tests and real LoopBe/emulator instrumentation passed on 2026-09-20. See the [verification record](../../docs/development/m1-verification.md) and [local setup guide](../../docs/development/local-setup.md) for the tested hardware-graphics AVD. A successful loopback run covers application input behavior; it does not verify a physical tablet's USB/Bluetooth compatibility.

The earlier relay-only instrumentation and protocol tests have been removed. Native shell and chord-authoring acceptance tests remain because they verify product behavior, using the debug relay only to supply input.

Build references: [AGP 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes), [Kotlin compatibility](https://kotlinlang.org/docs/gradle-configure-project.html), [Gradle security advisory](https://github.com/gradle/gradle/security/advisories/GHSA-w78c-w6vf-rw82), [Compose compiler setup](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler), [Compose BOM mapping](https://developer.android.com/develop/ui/compose/bom/bom-mapping).

## Native score proof

The app decodes `contracts/fixtures/lead-sheet-v1.json` directly through Gradle asset and test-resource source directories. There is no copied Android-only score file. The v1 reader validates the agreed C-major, 4/4, single-treble-voice subset, including independent chord timing, rhythmic duration, globally unique IDs, bar boundaries and ties between adjacent equal spelled pitches.

Compose Canvas draws staff lines, stems, ledger lines and ties. The bundled **Bravura** font supplies SMuFL noteheads, accidentals, rests, flags, clef and time signature. A chord-only switch changes the view without changing the score. Chord-only rows use prominent serif symbols centered within their duration spans, small bar numbers and vertical dividers. Melody rows align chord labels with their onset, use continuous staff lines, a clef on each row and the time signature on the first row. Accidentals persist within each bar and a natural cancels an earlier alteration. Rows hold four bars when readable, fall back to two or one for narrow windows or dense notation, and scroll individually when needed. Measured symbol widths and note spacing prevent neighboring events from colliding; high and low notes expand vertical spacing. The canvas exposes a textual score description for accessibility. Chords are selected through labeled controls for the current bar. Advanced engraving, beaming, multiple voices, lyrics and melody editing remain later work.

### Score layout visual acceptance

For isolated layout screenshots, install the debug and test APKs on the 1280×800 emulator, then run the following. This opt-in test renders synthetic sheets in the native shell and writes `score-native-*.png` under the app-private `files/ui-evidence/` directory. It requires no backend, credentials or MIDI and should run only after saving and closing any current native editing session.

```powershell
adb -s emulator-5554 shell am instrument -w -r -e class com.chordviewer.score.NativeScoreVisualTest -e scoreVisual true com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner
```

Bravura is unmodified and licensed under SIL Open Font License 1.1. The license is bundled in `app/src/main/assets/licenses/Bravura-OFL.txt`. Source: [Steinberg Bravura commit 37b1943](https://github.com/steinbergmedia/bravura/tree/37b194378b710cc40e406ab6c4b07608bb9548ae). `bravura.otf` SHA256: `cdf0f893ee1fdb64b7f6713d71ee0dcfc349c0ac01429a8e451b01a9e79f5f3b`.

## Native shell acceptance

Build the debug app and test APK before starting the emulator. This opt-in UI test uses an already-created synthetic account on the isolated test API, with at least one saved sheet. Keep its `email`, `password` and optional `apiPort` (default 3001) in an ignored, access-restricted JSON file. Do not use a real account: the test renames one sheet. When the account contains **Evening study**, that sheet is used; otherwise the first library item is used.

From the repository root, with the test API and emulator running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/android/scripts/Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local/backend/ui-native-fixture.json
```

The helper installs the APKs and maps the local API ports. It streams the fixture over ADB stdin to an app-private file; credentials never enter process arguments. The instrumentation reads and immediately deletes that temporary test file, fills the native accessible fields, checks Library/Create/Practice navigation and unsaved details, saves through the real API, verifies the saved record, checks the preserved melody display preference, captures screenshots, and signs out. Screenshots are captured only after the password form is gone and are copied to `.local/android-ui-evidence/`.

For the full UI plus real loopback gesture check, start `scripts/midi/Start-Bridge.ps1` in another terminal and add `-WithMidi`. Do not run another LoopBe sender at the same time. The helper supplies the bridge token through the same private fixture, sends and holds C4 only after native instrumentation reports readiness, verifies that navigation and saving preserve it, and verifies that sign-out disconnects MIDI. It always releases its notes, removes its temporary fixture and removes only reverse mappings it created. Existing mappings and the caller's bridge/emulator remain available.

For real MIDI authoring acceptance, use a synthetic account on the test backend, start the bridge, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/android/scripts/Test-NativeShell.ps1 -Serial emulator-5554 -FixturePath .local/backend/ui-native-fixture.json -Authoring
```

This creates a new test sheet, sends two immediate chords with sustain held, checks undo/redo, manual correction, delete/undo and one-shot replacement, confirms Practice cannot edit, reconnects MIDI, then saves and reopens the full score and tutorial. It captures three screenshots under `.local/android-ui-evidence/`. Do not run another LoopBe sender concurrently.

`NativeShellFlowTest` and `NativeChordAuthoringTest` are skipped unless explicitly run by this helper (`shellUi=true` or `authoringUi=true`). A skipped run does not establish UI acceptance. The helper bounds the instrumentation run to four minutes and redacts fixture values from any failure transcript. Test-only fixture delivery is separate from the application: normal sign-in still keeps all credentials and sessions in memory.
