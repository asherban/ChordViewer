# Local testing launcher

`scripts/development/Start-Testing.ps1` runs the complete Windows testing environment. See the [README workflow](../../README.md#run-the-complete-local-testing-environment) for setup, playback controls and options.

## Ownership and shutdown

The visible PowerShell launcher handles the menu. A separate hidden PowerShell watchdog owns the workloads and watches the launcher's captured process handle and creation time. This makes cleanup survive termination of the launcher process, including while startup is incomplete.

Before starting workers, the watchdog joins a Windows Job Object with `KILL_ON_JOB_CLOSE`. Its child processes inherit that job, including npm/Gradle descendants, Chromium processes and the emulator. Shutdown first releases MIDI and requests browser/emulator closure, then terminates remaining owned workers. It stops those workers before Docker cleanup so an interrupted `compose up` cannot keep creating resources afterward.

Docker containers and the Compose network receive a unique session label. Cleanup selects that label, stops/removes those resources and retains database volumes. The launcher refuses occupied ports, an existing matching Compose project, or an already-running tablet AVD. It rechecks backend ownership after the build. Do not start a second manual stack against the same environment while the launcher is running.

The shared Docker Desktop engine and ADB server remain available. Your normal browser profile is never attached or closed. The launcher's browser profile and private logs live under ignored `.local/testing`, restricted to the current Windows user and SYSTEM. Bridge credentials are generated per session, are never printed, and are removed on shutdown. No public host, NAS or deployment is involved.

Status and commands use small local files. Status replacement is atomic, readers permit Windows file replacement, and commands are acknowledged so repeated keys cannot queue overlapping playback. Browser control uses a narrow local stdin/stdout protocol. MIDI still travels through real LoopBe/WinMM, Web MIDI, and the authenticated debug Android bridge.

## Verification on this workstation

Checked on 2026-09-21 using Windows PowerShell 5.1, the pinned Node installation, Docker Desktop's Linux engine, Chrome, LoopBe1 and the API 35 tablet emulator:

| Check | Result |
| --- | --- |
| Existing development API/web conflict | Refused startup; original services remained healthy. |
| Default Android/contract build | Passed; native build completed before emulator startup. |
| Headless complete startup | API health, Vite proxy, installed Android app and actual browser MIDI input ready. |
| Visible complete startup | Dedicated Chrome and `ChordViewerTabletLocal:5560` windows opened. |
| Repeated broadcast | Two fixture runs reached Web MIDI; native UI showed sustained C4/E4/G4 on channel 1. Browser returned to no held/sounding notes. |
| Rapid repeated P commands | Extra commands ignored while playback was active; session stayed running. |
| Normal Q shutdown | Exit 0; no session listeners, containers, network or bridge credential remained. |
| Ctrl+C during playback | Exit 0; full stack removed, existing personal Chrome process preserved. |
| Ctrl+C during the build | Exit 0; build descendants stopped before application startup. |
| Forced launcher termination | Killed the exact launcher process with both backend containers running during emulator startup; watchdog independently removed containers, network, listeners and bridge credential. |
| Database/profile retention | Test database volume and dedicated browser profile survived shutdown. |
| Process helper regression | Four cases passed: quoting/output drain, explicit descendant cleanup, normal guardian exit and forced guardian termination; unrelated sentinel survived. |
| Source validation | PowerShell parsing, C# compilation, browser-worker syntax and repository lint passed. |

The process helper regression can be rerun without starting any application services:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/development/testing-process-host.ps1
```

For manual lifecycle acceptance, start with `-Environment test`, wait for **ready**, open the native example sheet, and play twice. Try rapid additional P commands, then Q. Repeat with Ctrl+C during a sequence. Check the printed session directory for `phase: stopped`; verify ports 3001, 5173, 39173, 5560 and 5561 are free and the session-labelled containers/network are absent. Keep an unrelated browser window open to check ownership isolation.

Code and security review covered process identity, child ownership, interrupted startup, Docker labels, preserved volumes, private browser state and credential handling. This change adds development orchestration only; the product's existing M3 feature limitations remain.

## Recovery and limits

Killing the watchdog itself causes Windows to terminate its workload job, but it cannot run Docker cleanup afterward. Machine shutdown/power loss or an unavailable Docker daemon can also prevent cleanup. The launcher reports incomplete/failed cleanup rather than treating it as success.

After confirming the old testing session is no longer active, stop the matching backend without deleting its volume:

```powershell
.\scripts\development\Stop-LocalBackend.ps1 -Environment test
# Use -Environment development for the default development database.
```

Inspect that session's `status.json`, `failure.log`, `guardian-error.log` and stage logs when present. Do not delete backend credentials while retaining the corresponding database volume. The launcher does not promise to preserve an unsaved in-memory sheet draft across process termination.

Emulator checks cover the debug adapter, not physical tablet USB/Bluetooth compatibility. LoopBe playback produces MIDI input, not audio. A disconnected app may miss a broadcast; reopen its sheet and MIDI connection before the next run.
