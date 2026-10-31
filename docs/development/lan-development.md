# Android development over LAN

The debug app can connect directly to the development PC's private IPv4 address or to `https://chordviewer.app`. The local address is baked into the APK. **Account (or Sign in) → ⋮ → Switch backend** selects local or public service and remembers that choice across restarts and updates; a fresh installation defaults to local. LAN and public API traffic need no ADB connection. USB MIDI still uses its existing USB workflow.

Connect the tablet and PC to the same reachable private LAN. Prefer a DHCP reservation for the PC. Replace `192.168.1.50` below with the PC's actual address; the backend launcher checks that the address belongs to this computer.

## Start the backend and tablet

```powershell
.\scripts\development\Start-LocalBackend.ps1 -DevHost 192.168.1.50
.\scripts\development\Start-Testing.ps1 -TabletSerial <serial> -DevHost 192.168.1.50 -InstallApk
```

For the isolated test database, add `-Environment test` to both commands. The app then uses port 3001 instead of 3000. The physical-tablet launcher expects the backend to be running already. It installs the app when `-InstallApk` is supplied, then starts the existing USB MIDI session. Without `-InstallApk`, it checks the endpoint in the installed APK before starting.

For the full browser and emulator session, omit `-TabletSerial` and `-InstallApk`:

```powershell
.\scripts\development\Start-Testing.ps1 -DevHost 192.168.1.50
```

The emulator uses the same LAN address. The full launcher owns and starts its backend, so stop a manually started backend before using it. LAN mode creates no backend reverse mapping and does not recreate one when USB reconnects. Unrelated pre-existing forwarding mappings are preserved by the USB workflow.

`-SkipBuild` checks the local URL inside the existing APK and refuses a mismatch. To change that address or port, rebuild and reinstall. Omitting `-DevHost` selects the original `127.0.0.1:3000` APK and ADB reverse workflow; changing back to that local address also requires a matching APK. Launchers preserve the app's saved local/public choice: select **Use local backend** in the app for local testing. Direct Android Studio or Gradle builds default to loopback, or accept the explicit project property:

```powershell
.\apps\android\gradlew.bat -p apps/android :app:assembleDebug -PdevApiUrl=http://192.168.1.50:3000
```

The generated `assets/api-origin.txt` defines the local option. Debug HTTP is restricted to that host and loopback (used by existing product instrumentation). The debug preference selects only local or `https://chordviewer.app`; it cannot contain an arbitrary URL. Launch Intents cannot override the endpoint.

## Network access

Docker publishes the API on loopback and the selected LAN address. It publishes no database port and no wildcard host binding. Backend authentication accepts the configured LAN API origin while retaining the existing browser origin, `http://127.0.0.1:5173`. The web development server remains on loopback.

Windows Firewall must allow the API port. For example, run this once in an elevated PowerShell terminal, using your actual private address:

```powershell
New-NetFirewallRule -Name ChordViewer-Development-LAN -DisplayName 'ChordViewer development API' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 192.168.1.50 -LocalPort 3000 -RemoteAddress LocalSubnet -Profile Private
```

Use a separately named rule on port 3001 for the isolated test backend. Remove the rule when it is no longer needed with `Remove-NetFirewallRule -Name ChordViewer-Development-LAN`. The launchers do not silently change firewall rules. Guest Wi-Fi/client isolation can block tablet-to-PC traffic even when both devices use the same access point.

Open `http://192.168.1.50:3000/health` on the tablet to check reachability. HTTP development traffic is unencrypted; use a trusted development LAN and test accounts. Public HTTPS deployment is a separate milestone.

Switching backends signs out, waits for accepted recovery writes, removes the saved credential, attempts revocation on the old server and starts a fresh workspace. Failed local credential removal blocks the switch; an unreachable old server does not. Saved credentials are encrypted for their original origin. Recovery drafts are stored separately by origin; existing loopback drafts remain in their original directory. Changing the PC address does not delete old drafts, but accessing them again requires rebuilding for that original origin. Confirm before leaving unsaved work, and save or export it first if recovery is unavailable.

Stop the backend normally with `Stop-LocalBackend.ps1 -Environment development` (or `test`). Restarting without `-DevHost` removes its LAN publication while retaining the database.

## Production boundary

`apps/android/production-api-origin.txt` contains `https://chordviewer.app`. Production packaging requires exactly this origin. Developer command-line properties never supply this value. Release source sets contain no backend selector or preference reader. The release API client checks every destination against the approved origin before opening a connection and rejects redirects.

Both APK and app-bundle production packaging fail while the file is empty or invalid. Release source compilation and `:app:verifyReleaseIsolation` remain available to CI. The latter verifies the merged manifest and actual merged endpoint asset, including when a development URL is supplied to Gradle. Release networking explicitly prohibits HTTP and has no network-policy override or debug trust anchors.

`assembleRelease` and `bundleRelease` verify the packaged endpoint asset and absence of the debug network policy. The APK check also inspects its compiled manifest using AAPT2; the bundle uses the verified merged manifest and packaged endpoint. Release signing credentials are required for packaging.

CI builds with an explicit development URL, checks release isolation, and checks that APK and bundle packaging refuse the missing production origin. It switches to verifying both production artifacts once an origin is configured. Product tests cover origin rejection, credentials/redirect behavior and recovery isolation. Development launchers receive syntax checks and runtime diagnostics rather than dedicated automated test suites.

For manual acceptance, sign in and save/reopen a sheet on the tablet with backend reverse mappings absent, reopen the app from its icon, disconnect USB and refresh the Library, and check that test port 3001 uses the isolated database. MIDI requires its own USB connection independently of API traffic.
