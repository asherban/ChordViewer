[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('\A[A-Za-z0-9._:-]+\z')][string]$Serial,
    [ValidateRange(-1, 65535)][int]$MidiOutputId = -1,
    [ValidateRange(1, 65535)][int]$BackendPort = 3000,
    [switch]$InstallApk,
    [switch]$SkipBuild,
    [ValidateRange(0, 86400)][int]$DurationSeconds = 0
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Initialize-AndroidEnvironment.ps1')
. (Join-Path $PSScriptRoot 'TabletUsb.Common.ps1')
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$usb = $null; $router = $null; $stopFile = $null; $tabletLock = $null
try {
    $stateDirectory = Join-Path $repository '.local/usb-midi'
    foreach ($path in @((Join-Path $repository '.local'), $stateDirectory)) {
        if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Tablet session directories cannot be links.' }
    }
    $null = New-Item -ItemType Directory -Path $stateDirectory -Force
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $key = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Serial)))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
    $tabletLockPath = Join-Path $stateDirectory "tablet-$key.lock"
    if ((Test-Path -LiteralPath $tabletLockPath) -and ((Get-Item -LiteralPath $tabletLockPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Tablet session lock cannot be a link.' }
    try { $tabletLock = [IO.File]::Open($tabletLockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Another tablet session owns this device. It was not changed.' }
    if ($InstallApk) {
        if (-not $SkipBuild) {
            & (Join-Path $repository 'apps/android/gradlew.bat') -p (Join-Path $repository 'apps/android') --no-daemon --max-workers=1 :app:assembleDebug
            if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
        }
        $apk = Join-Path $repository 'apps/android/app/build/outputs/apk/debug/app-debug.apk'
        $null = Invoke-TabletAdb $Serial @('install', '-r', '-t', $apk) -TimeoutSeconds 90
    }
    # Capture settings after potentially lengthy build/install work, immediately before mutation.
    $usb = New-TabletUsbContext $Serial $BackendPort
    Enable-TabletUsbMidi $usb
    # No -S: ordinary MIDI reconnect must not force-stop an existing Activity or editor.
    $launch = Invoke-TabletAdb $Serial @('shell', 'am', 'start', '-W', '--activity-single-top', '--activity-clear-top', '-n', 'com.chordviewer.debug/com.chordviewer.MainActivity') -TimeoutSeconds 30
    if ($launch.Text -match '(?i)Error:|Exception' -or $launch.Text -notmatch '(?im)^\s*Status:\s*ok\s*$') { throw 'The installed ChordViewer debug app could not be opened.' }
    $routerScript = Join-Path $repository 'scripts/midi/Start-UsbRouter.ps1'
    $powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $stopFile = Join-Path $repository ('.local/usb-midi/' + [Guid]::NewGuid().ToString() + '.stop')
    $parentStart = [Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString()
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $routerScript, '-StopFile', $stopFile,
        '-ParentPid', [string]$PID, '-ParentStartTicks', $parentStart)
    if ($MidiOutputId -ge 0) { $arguments += @('-Select', [string]$MidiOutputId) }
    $log = Join-Path $repository '.local/usb-midi-tablet.log'
    $router = [ChordViewer.Testing.ChildProcess]::new($powershell, $arguments, $repository, $log)
    Write-Host 'Tablet session running. Choose its USB MIDI input in ChordViewer on first use. Press Ctrl+C to stop.'
    Write-Host 'Uses your running local backend. MIDI travels through USB; backend forwarding is maintained separately.'
    $timer = [Diagnostics.Stopwatch]::StartNew(); $sync = 0L
    while ($DurationSeconds -eq 0 -or $timer.Elapsed.TotalSeconds -lt $DurationSeconds) {
        while ($null -ne ($line = $router.ReadLine())) { Write-Host $line }
        if ($router.HasExited) { throw "USB MIDI router stopped. Inspect $log; choose its tablet destination with -MidiOutputId on first use." }
        if ($timer.ElapsedMilliseconds - $sync -ge 1000) {
            $null = Sync-TabletBackend $usb
            $sync = $timer.ElapsedMilliseconds
        }
        Start-Sleep -Milliseconds 100
    }
} finally {
    # Request graceful channel cleanup first; kill only the captured child if it cannot finish.
    try {
        if ($router) {
            if (-not $router.HasExited -and (Test-Path -LiteralPath (Split-Path $stopFile -Parent))) {
                [IO.File]::WriteAllText($stopFile, 'stop')
                $deadline = [Diagnostics.Stopwatch]::StartNew()
                while (-not $router.HasExited -and $deadline.Elapsed.TotalSeconds -lt 6) { Start-Sleep -Milliseconds 50 }
            }
            $router.Dispose()
        }
    } finally {
        try { if ($stopFile -and (Test-Path -LiteralPath $stopFile)) { Remove-Item -LiteralPath $stopFile } }
        finally {
            try { if ($usb) { Close-TabletUsbSession $usb } }
            finally { if ($tabletLock) { $tabletLock.Dispose() } }
        }
    }
}
