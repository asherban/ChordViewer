# Local MIDI test tools

These Windows development tools send original fixtures through the installed **LoopBe Internal MIDI** driver. They need Windows PowerShell 5.1 or PowerShell 7 and LoopBe1. No piano, tablet, product backend or additional binary dependency is required.

Run from the repository root in separate terminals:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Start-Bridge.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1
```

For the web application, select LoopBe Internal MIDI in Chrome's MIDI input picker and allow the localhost origin's MIDI permission. The sender alone is sufficient; the bridge is only needed for Android.

The execution-policy option applies only to that process, allowing these repository scripts on a workstation with the default restrictive policy; it does not change machine or user policy.

For the Android emulator, create `adb reverse tcp:39173 tcp:39173`, connect the debug app to `127.0.0.1:39173`, and supply the per-run token from `.local/midi/bridge.json` using the debug connection controls. The token is deliberately absent from console output. Stop the bridge with Ctrl+C; `-DurationSeconds 60` provides a bounded run. The app must clear held/sustained notes on every reset or disconnect. Release builds must exclude this transport.

`Send-Fixture.ps1 -Speed 2` replays twice as quickly. The four-second smoke fixture covers C major, sustain, zero-velocity note-off, a repeated note and independent MIDI channels. Data and relative event times are deterministic; this is not a hard real-time sequencer. The sender releases sustain and all notes on every channel when it closes, including after an error. Avoid playing unrelated LoopBe sessions while running it. Neither tool echoes received MIDI to LoopBe, which would risk a feedback loop and mute the driver.

M4 adds `-Fixture authoring`: C, F, Am, Am, G, including immediate press/release, rolled notes and separate gestures under sustain. Choose one-beat duration and start MIDI entry on a blank saved sheet. `-Fixture authoring-replacement` sends Dm followed by G to check that replacement changes one selected chord only. `-Fixture authoring-held` holds C for three seconds, allowing a mode change or disconnect before release. All fixtures broadcast to both clients; they never choose or arm an editor for you. See the [developer commands](../../README.md#midi-testing-without-a-piano-or-tablet) for automated authoring checks.

## Protocol

The only listener is IPv4 loopback `127.0.0.1:39173`. There is no bind-address option. One authenticated client is served at a time. UTF-8 JSON records are separated by LF:

```json
{"type":"hello","token":"<64 lowercase hexadecimal characters>"}
{"type":"reset","sequence":0,"timestampMs":0}
{"type":"midi","sequence":1,"timestampMs":1234,"data":[144,60,96]}
```

The first line comes from the client, and contains exactly `type` and `token` (either property order). All following records come from the server. Two- and three-byte channel messages retain their raw status/channel; SysEx and MIDI clock are not forwarded. Sequence restarts at 1 after every initial reset. `timestampMs` is monotonic elapsed bridge time, not a shared clock epoch. No live notes from a previous connection are replayed.

The credential is 32 cryptographically random bytes generated for each run. The ignored metadata directory grants access only to the current Windows user. Authentication uses a fixed-length comparison, has a three-second total deadline and a 512-byte line limit. Invalid credentials, malformed input and extra client messages close that connection. A 1,024-event queue bounds memory; overflow or a blocked socket closes the connection so the client resets its state instead of silently losing note-offs. This is local development authentication, not a public service; do not port-forward the listener beyond the emulator's `adb reverse` route.

## Verification

Stop any running bridge first, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Test-Bridge.ps1
```

The test opens the actual LoopBe input and output, validates every fixture byte through the TCP bridge, checks sequencing/timestamps, reconnect reset, authentication rejection, oversized and invalid UTF-8 input, and rejection of extra client messages. It does not prove physical USB/Bluetooth compatibility or editor behavior. The shared fixture can also drive client processing tests without Windows or LoopBe.

For the complete native emulator path, build both debug APKs and keep `Start-Bridge.ps1` running in a separate terminal, then use the selected emulator's serial:

```powershell
. scripts/development/Initialize-AndroidEnvironment.ps1
apps/android/gradlew.bat -p apps/android assembleDebug assembleDebugAndroidTest
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/development/Test-AndroidMidi.ps1 -Serial emulator-5554
```

The runner installs the debug application and test APK, reuses or creates the selected device's `tcp:39173` reverse mapping, supplies the private bridge token without displaying it, and starts the fixture only after native instrumentation reports readiness. It requires exactly one passing test, rejects failures/skips, and bounds instrumentation to 60 seconds. On an early failure, it allows up to eight additional seconds for the fixture to release its notes normally; a forced stop sends explicit pedal/all-notes-off cleanup to LoopBe. It leaves the bridge, emulator and reverse mapping available for interactive testing. Close other debug relay connections before this test; the bridge serves one client at a time. The test owns and cleans up only its child ADB/sender processes.

Implementation references: [WinMM input](https://learn.microsoft.com/en-us/windows/win32/api/mmeapi/nf-mmeapi-midiinopen), [callback restrictions](https://learn.microsoft.com/en-us/previous-versions/dd798460(v=vs.85)), [short messages](https://learn.microsoft.com/en-us/windows/win32/api/mmeapi/nf-mmeapi-midioutshortmsg). No WinMM or network operations run inside the input callback.
