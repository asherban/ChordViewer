# Local MIDI test tools

These Windows development tools send original fixtures through the installed **LoopBe Internal MIDI** driver. They need Windows PowerShell 5.1 or PowerShell 7 and LoopBe1. No piano, tablet, product backend or additional binary dependency is required.

Run the fixture sender from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/midi/Send-Fixture.ps1
```

For the web application, select LoopBe Internal MIDI in Chrome's MIDI input picker and allow the localhost origin's MIDI permission. Use the USB router for a physical Android tablet. Emulator musical tests use test APK fixtures.

## Physical tablet USB router

Select MIDI in the connected tablet's USB preferences, then list outputs and explicitly choose the tablet on first use:

```powershell
.\scripts\midi\Start-UsbRouter.ps1 -List
.\scripts\midi\Start-UsbRouter.ps1 -Select <Id>
```

The verified SM-X610 exposes **MIDI function** on Windows. Its name is a display hint; choose the actual tablet endpoint. Later runs can omit `-Select` when its remembered Windows device interface is unambiguous. Missing devices are never replaced with another output. Destinations without a persistent identity and ambiguous identities require selection again. Selection lives in ignored `.local/usb-midi/destination.json`; an exclusive worker-owned lock prevents concurrent routers.

The router receives LoopBe channel messages, sends them through native USB MIDI, and emits Active Sensing every 100 ms from the same forwarding worker. Startup/shutdown cleanup and a 300 ms input watchdog clear notes and pause score entry on interruption. No MIDI token or ADB forwarding is used. `-DurationSeconds 60` bounds a manual run; Ctrl+C requests cleanup. No notes are sent back to LoopBe. SysEx, clock routing and audio are outside this component.

The [tablet guide](../../docs/development/usb-midi.md) explains launcher integration, backend routing, first-time Android selection, and the remaining hardware checks.

The execution-policy option applies only to that process, allowing these repository scripts on a workstation with the default restrictive policy; it does not change machine or user policy.

`Send-Fixture.ps1 -Speed 2` replays twice as quickly. The four-second smoke fixture covers C major, sustain, zero-velocity note-off, a repeated note and independent MIDI channels. Data and relative event times are deterministic; this is not a hard real-time sequencer. The sender releases sustain and all notes on every channel when it closes, including after an error. Avoid playing unrelated LoopBe sessions while running it. Neither tool echoes received MIDI to LoopBe, which would risk a feedback loop and mute the driver.

M4 adds `-Fixture authoring`: C, F, Am, Am, G, including immediate press/release, rolled notes and separate gestures under sustain. Choose one-beat duration and start MIDI entry on a blank saved sheet. `-Fixture authoring-replacement` sends Dm followed by G to check that replacement changes one selected chord only. `-Fixture authoring-held` holds C for three seconds, allowing a mode change or disconnect before release. All fixtures reach connected LoopBe listeners and any running USB router; they never choose or arm an editor for you. See the [developer commands](../../README.md#midi-testing-without-a-piano-or-tablet) for automated authoring checks.

M5 adds `-Fixture melody`: C4, D4, F-sharp4, F-sharp4, G4, A4, each physically released before the next note. Repeated F-sharps occur under sustain, including a zero-velocity note-off. Choose G major, 3/4 and quarter-note melody entry to fill two bars. The complete testing launcher exposes the same sequence as **M**; **P** retains the chord/smoke sequence.

## Product testing

Development-only scripts and the USB router do not have dedicated test suites; see the [repository testing policy](../../AGENTS.md). The USB router and fixture sender remain available for local development and as input sources for product tests.

The [root README](../../README.md#midi-testing-without-a-piano-or-tablet) documents browser MIDI authoring tests and native UI/authoring acceptance. These verify application behavior such as chord insertion, editing, persistence and navigation. Native emulator acceptance injects musical product events from its test APK. Avoid concurrent real senders during browser or USB checks because every LoopBe listener receives the same input. Emulator results do not establish physical USB/Bluetooth compatibility.

Implementation references: [WinMM input](https://learn.microsoft.com/en-us/windows/win32/api/mmeapi/nf-mmeapi-midiinopen), [callback restrictions](https://learn.microsoft.com/en-us/previous-versions/dd798460(v=vs.85)), [short messages](https://learn.microsoft.com/en-us/windows/win32/api/mmeapi/nf-mmeapi-midioutshortmsg). No WinMM or network operations run inside the input callback.
