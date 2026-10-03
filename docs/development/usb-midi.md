# USB MIDI setup and verification

The [connection design](../architecture/usb-midi-connection.md) uses the computer as USB host and the tablet as USB MIDI peripheral. The Windows router forwards LoopBe input to the selected physical output. Shared Android input supports this route and a piano attached with the tablet as host.

## Local tablet workflow

Start the local backend using `scripts/development/Start-LocalBackend.ps1` when needed. The focused tablet mode uses that running backend and does not start an emulator, web server, or another backend stack.

On first use, connect the cable, authorize USB debugging for development, and select MIDI in the tablet's USB preferences. List Windows outputs:

```powershell
.\scripts\midi\Start-UsbRouter.ps1 -List
```

Choose the tablet output ID explicitly. The verified tablet displays **MIDI function**. Start the physical session, optionally building/installing the new debug APK:

```powershell
.\scripts\development\Start-Testing.ps1 -TabletSerial <serial> -MidiOutputId <Id> -InstallApk
```

Use the serial from `adb devices`. In ChordViewer's MIDI controls, choose **Use Computer via USB**. Wait for readiness, then explicitly resume score entry. To supply original notes through LoopBe, run `scripts/midi/Send-Fixture.ps1` in another terminal.

Later sessions reuse the built/installed app and remembered Windows destination:

```powershell
.\scripts\development\Start-Testing.ps1 -TabletSerial <serial>
```

`-Environment test` routes the device's backend port 3000 to the running test API on host port 3001. `-InstallApk -SkipBuild` installs an existing APK. The focused `Start-Tablet.ps1` also accepts `-DurationSeconds` for bounded manual sessions.

The launcher owns a tablet lock before changing settings. It snapshots current/default USB settings and mappings immediately before selecting MIDI, verifies effective state after USB re-enumeration, maintains backend forwarding through reconnect, and refuses mapping conflicts. Activity launch reuses the existing instance without force-stop. Normal shutdown requests router cleanup, restores the previous USB function if it still owns that change, and restores original mappings. The default USB function is never changed. Killing the launcher or losing ADB during cleanup can leave temporary USB/backend resources in place; the router stops when its captured parent exits, and the launcher reports cleanup failures when it can.

## Native operation

Without the development launcher, start `scripts/midi/Start-UsbRouter.ps1`, connect the cable and select MIDI in Android's USB preferences. Native MIDI has no ADB or network dependency. The debug app's local backend remains a separate route; release backend deployment is still unconfigured.

Android remembers one selected source and port. Local peripheral identities reconnect when unique. Pianos without a stable serial, and identities observed to be ambiguous, require explicit selection after attachment loss. Windows also forgets its saved destination when it observes an indistinguishable duplicate, before forwarding can continue. **Disconnect** persists the user's choice to stay disconnected; **Clear notes** clears live state and pauses entry. Foreground return can reconnect an enabled source, but does not rearm score entry. Realtime heartbeats never become musical gestures.

## Verification

The original [hardware proof](usb-midi-hardware-proof.json) established exact native receipt in two passes. The implementation was checked on 3 October 2026 with the attached Samsung SM-X610 and Windows computer. An Astra subagent reviewed and approved every changed code file, including the persisted destination ambiguity fix.

| Check | Verified result |
| --- | --- |
| Android product tests | All 122 JVM tests passed, including nine native MIDI session tests for readiness, fragmented messages, running status, sustain, timeout, cleanup boundaries and entry pause. |
| Builds and lint | Debug, release and hardware instrumentation APKs built successfully. Android lint passed, and the release APK contained no debug relay or token implementation. |
| Physical LoopBe route | The 22-event fixture reached the native Android receiver and shared gesture engine. Triad completion, sustain after key release, channel separation and ordered delivery on the main thread passed. |
| Router failure and recovery | Terminating the owned router while a note and sustain were held cleared the native state and paused the gesture engine. Restart restored readiness without rearming entry. Manual Disconnect survived foreground transitions. |
| Activity reuse | Reopening the app with the tablet launch flags retained the same Activity and LibraryViewModel objects and the previewed practice score. |
| Development resources | The launcher recovered backend forwarding after USB reconfiguration. Normal shutdown restored the original current and default USB configuration and reverse mappings. C# compilation and PowerShell syntax diagnostics passed. |

The physical MIDI check exercised a native controller connected to the shared gesture engine. Activity and ViewModel reuse were checked separately; direct delivery into the shell's authoring stream and preservation of an unsaved draft or undo history were not physically measured. Existing product tests cover authoring behavior. Development-only tooling receives compilation, syntax diagnostics and bounded manual checks rather than new automated test suites.

The opt-in `NativeUsbMidiInputTest` starts and finishes MainActivity, so save open work before running it. It uses an unsaved bundled practice sample, restores MIDI source preferences, and does not write saved library records.

The remaining manual acceptance cases include physical unplug/replug, MIDI mode persistence, tablet lock/reboot, Windows sleep/resume, a direct Roland RP102 connection, and native receipt with USB debugging disabled. These require the corresponding device interaction; software reconfiguration alone does not establish them.
