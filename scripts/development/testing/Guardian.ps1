param([Parameter(Mandatory)][string]$SessionDirectory)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
. (Join-Path $repository 'scripts/development/LocalBackend.Common.ps1')
$testing = Join-Path $repository '.local/testing'
$SessionDirectory = [IO.Path]::GetFullPath($SessionDirectory)
if ([IO.Path]::GetDirectoryName($SessionDirectory) -ne [IO.Path]::GetFullPath($testing) -or
    [IO.Path]::GetFileName($SessionDirectory) -notmatch '^[0-9a-f-]{36}$') { throw 'Invalid session directory.' }
trap {
    [IO.File]::WriteAllText((Join-Path $SessionDirectory 'guardian-error.log'), ($_ | Out-String))
    exit 1
}
$config = Get-Content -LiteralPath (Join-Path $SessionDirectory 'config.json') -Raw | ConvertFrom-Json
if ($config.id -ne [IO.Path]::GetFileName($SessionDirectory) -or $config.environment -notin @('development', 'test') -or
    $config.speed -lt 0.1 -or $config.speed -gt 10) { throw 'Invalid testing configuration.' }
$lock = $null; $parent = $null; $bridge = $null; $sender = $null; $browser = $null; $emulator = $null; $web = $null
$backendIntent = $false; $jobAttached = $false; $bridgeOwned = $false; $failure = $null
$children = New-Object 'Collections.Generic.List[object]'
$mappings = New-Object 'Collections.Generic.List[string]'
$serial = 'emulator-5560'
$settings = Get-LocalBackendSettings -Environment $config.environment
$powershell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$stage = Join-Path $PSScriptRoot 'Stage.ps1'
$label = "com.chordviewer.testing-session=$($config.id)"
$sequence = 0
$handledCommand = 0
$logCounts = @{}
function Publish([string]$Phase, [string]$Message) {
    $value = @{ phase = $Phase; message = $Message; guardianPid = $PID; session = $config.id; command = $handledCommand } | ConvertTo-Json -Compress
    $temporary = Join-Path $SessionDirectory 'status.tmp'
    $target = Join-Path $SessionDirectory 'status.json'
    [IO.File]::WriteAllText($temporary, $value, (New-Object Text.UTF8Encoding($false)))
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        try {
            # Windows PowerShell converts a null string argument to an empty path;
            # use an explicit backup path for the .NET Framework Replace overload.
            if (Test-Path -LiteralPath $target) { [IO.File]::Replace($temporary, $target, (Join-Path $SessionDirectory 'status.previous.json')) }
            else { [IO.File]::Move($temporary, $target) }
            return
        } catch [IO.IOException] {
            if ($attempt -eq 9) { throw }
            Start-Sleep -Milliseconds 20
        }
    }
}
function Check-Stop {
    if ((Test-Path -LiteralPath (Join-Path $SessionDirectory 'stop')) -or $parent.HasExited) { throw [OperationCanceledException]::new('Testing session was stopped.') }
}
function Start-Child([string]$Name, [string]$Executable, [string[]]$Arguments) {
    if (-not $logCounts.ContainsKey($Name)) { $logCounts[$Name] = 0 }
    $logCounts[$Name]++
    $logName = if ($logCounts[$Name] -eq 1) { "$Name.log" } else { "$Name-$($logCounts[$Name]).log" }
    $child = [ChordViewer.Testing.ChildProcess]::new($Executable, $Arguments, $repository, (Join-Path $SessionDirectory $logName))
    $children.Add($child)
    return $child
}
function Run-Child([string]$Name, [string]$Executable, [string[]]$Arguments, [int]$Timeout = 60, [switch]$Cleanup) {
    $child = Start-Child $Name $Executable $Arguments
    try {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        while (-not $child.HasExited) {
            if (-not $Cleanup) { Check-Stop }
            if ($timer.Elapsed.TotalSeconds -gt $Timeout) { throw "$Name exceeded its timeout. See its session log." }
            Start-Sleep -Milliseconds 100
        }
        $child.WaitForOutput()
        if ($child.ExitCode -ne 0) { throw "$Name failed with exit code $($child.ExitCode). See its session log." }
        $output = New-Object 'Collections.Generic.List[string]'
        while ($null -ne ($line = $child.ReadLine())) { $output.Add($line) }
        return ($output -join "`n")
    } finally {
        $child.Dispose()
        $null = $children.Remove($child)
    }
}
function Assert-BackendAvailable {
    Assert-FreePort $settings.Port
    $existing = Run-Child 'existing-containers' 'docker.exe' @('ps', '-aq', '--filter', "label=com.docker.compose.project=$($settings.Project)")
    $existingNetwork = Run-Child 'existing-networks' 'docker.exe' @('network', 'ls', '-q', '--filter', "label=com.docker.compose.project=$($settings.Project)")
    if ($existing.Trim() -or $existingNetwork.Trim()) { throw "The $($settings.Project) stack already exists. Stop it with Stop-LocalBackend.ps1 before using this launcher; nothing was changed." }
}
function Assert-FreePort([int]$Port) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    $listener.Server.ExclusiveAddressUse = $true
    try { $listener.Start() } catch { throw "Port $Port is already in use. Stop the existing service before launching; it was not changed." }
    finally { $listener.Stop() }
}
function Wait-Health([string]$Url, [int]$Timeout) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $Timeout) {
        Check-Stop
        try { $health = Invoke-RestMethod -Uri $Url -TimeoutSec 2; if ($health.service -eq 'chordviewer-api' -and $health.database -eq 'ready') { return } } catch { }
        if ($web -and $web.HasExited) { throw 'Web server exited before becoming ready.' }
        Start-Sleep -Milliseconds 200
    }
    throw "Local health check did not become ready within $Timeout seconds."
}
function Browser-Request([string]$Action, [switch]$Cleanup) {
    $script:sequence++
    $id = $script:sequence
    $browser.SendLine((@{ id = $id; action = $Action } | ConvertTo-Json -Compress))
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 30) {
        if (-not $Cleanup) { Check-Stop }
        while ($null -ne ($line = $browser.ReadLine())) {
            try { $reply = $line | ConvertFrom-Json } catch { continue }
            if ($reply.PSObject.Properties['id'] -and $reply.id -eq $id) { return $reply }
        }
        if ($browser.HasExited) { throw 'The testing browser closed.' }
        Start-Sleep -Milliseconds 50
    }
    throw 'The testing browser did not answer within thirty seconds.'
}
function Remove-OwnedBackend {
    # Select by immutable run label, never by a remembered PID/name or the project's shared volume.
    for ($round = 0; $round -lt 3; $round++) {
        $ids = @( (Run-Child "cleanup-containers-$round" 'docker.exe' @('ps', '-aq', '--filter', "label=$label") -Cleanup) -split '\s+' | Where-Object { $_ } )
        if ($ids.Count) {
            $null = Run-Child "cleanup-stop-$round" 'docker.exe' (@('stop', '--time', '15') + $ids) 45 -Cleanup
            $null = Run-Child "cleanup-remove-$round" 'docker.exe' (@('rm') + $ids) 30 -Cleanup
        }
        $networks = @( (Run-Child "cleanup-networks-$round" 'docker.exe' @('network', 'ls', '-q', '--filter', "label=$label") -Cleanup) -split '\s+' | Where-Object { $_ } )
        if ($networks.Count) { $null = Run-Child "cleanup-network-remove-$round" 'docker.exe' (@('network', 'rm') + $networks) 30 -Cleanup }
        Start-Sleep -Milliseconds 250
    }
}
try {
    $lockPath = Join-Path $testing 'session.lock'
    if ((Test-Path -LiteralPath $lockPath) -and ((Get-Item -LiteralPath $lockPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Session lock cannot be a symbolic link.' }
    $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    $parent = [Diagnostics.Process]::GetProcessById([int]$config.parentPid)
    $null = $parent.Handle
    if ($parent.StartTime.ToUniversalTime().Ticks.ToString() -ne $config.parentStartTicks) { throw 'Launcher process identity changed.' }
    Add-Type -Path (Join-Path $PSScriptRoot 'ProcessHost.cs')
    [ChordViewer.Testing.WorkloadJob]::AttachGuardian()
    $jobAttached = $true
    Publish 'starting' 'Checking local prerequisites and ownership.'
    Check-Stop
    foreach ($port in @($settings.Port, 5173, 39173, 5560, 5561)) { Assert-FreePort $port }
    $engine = Run-Child 'docker-engine' 'docker.exe' @('info', '--format', '{{.OSType}}') 20
    if ($engine.Trim() -ne 'linux') { throw 'Start Docker Desktop with Linux containers before launching.' }
    Assert-BackendAvailable
    $devices = Run-Child 'adb-devices' 'adb.exe' @('devices')
    foreach ($match in [regex]::Matches($devices, '(?m)^(emulator-[0-9]+)\s+device')) {
        $name = Run-Child ('avd-' + $match.Groups[1].Value) 'adb.exe' @('-s', $match.Groups[1].Value, 'emu', 'avd', 'name')
        if ($name -match '(?m)^ChordViewerTabletLocal\s*$') { throw 'ChordViewerTabletLocal is already running. Close that emulator before using the launcher.' }
    }
    $null = Run-Child 'avd-profile' $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $repository 'scripts/development/Initialize-AndroidEmulator.ps1')) 60
    if (-not $config.skipBuild) {
        Publish 'building' 'Building contracts and the native debug app before booting the emulator.'
        $null = Run-Child 'build' $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $stage, '-Stage', 'build') 600
    }
    $apk = Join-Path $repository 'apps/android/app/build/outputs/apk/debug/app-debug.apk'
    if (-not (Test-Path -LiteralPath $apk)) { throw 'Debug APK is missing. Run again without -SkipBuild.' }
    $override = "services:`n  api:`n    labels:`n      com.chordviewer.testing-session: '$($config.id)'`n  database:`n    labels:`n      com.chordviewer.testing-session: '$($config.id)'`nnetworks:`n  default:`n    labels:`n      com.chordviewer.testing-session: '$($config.id)'`n"
    [IO.File]::WriteAllText((Join-Path $SessionDirectory 'compose-session.yaml'), $override)
    Publish 'backend' 'Starting the local API and database; existing saved sheets are preserved.'
    # Builds may be lengthy. Refuse a backend started by another terminal during that time.
    Assert-BackendAvailable
    $backendIntent = $true
    $null = Run-Child 'backend' $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $stage, '-Stage', 'backend', '-Environment', $config.environment, '-SessionDirectory', $SessionDirectory) 600
    Wait-Health "http://127.0.0.1:$($settings.Port)/health" 30
    Publish 'web' 'Starting the web development server.'
    Assert-FreePort 5173
    $web = Start-Child 'web' $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $stage, '-Stage', 'web', '-Environment', $config.environment)
    Wait-Health 'http://127.0.0.1:5173/health' 60
    Add-Type -Path (Join-Path $repository 'scripts/midi/WinMmMidi.cs')
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 32
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $token = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    $bridge = [ChordViewer.LocalMidi.Bridge]::new($token)
    $bridge.Start()
    $bridgeOwned = $true
    $midiDirectory = Join-Path $repository '.local/midi'
    $bridgeFile = Join-Path $midiDirectory 'bridge.json'
    foreach ($path in @($midiDirectory, $bridgeFile)) {
        if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'MIDI session paths cannot be links.' }
    }
    $null = New-Item -ItemType Directory -Path $midiDirectory -Force
    Set-LocalBackendPrivateAcl -Path $midiDirectory -Directory
    @{ host = '127.0.0.1'; port = 39173; token = $token; pid = $PID; startedAt = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath $bridgeFile -Encoding UTF8
    Publish 'emulator' 'Booting the tablet emulator; this can take a few minutes.'
    Assert-FreePort 5560
    Assert-FreePort 5561
    $emulatorArgs = @('-avd', 'ChordViewerTabletLocal', '-port', '5560', '-memory', '2560', '-cores', '1', '-no-snapshot', '-gpu', 'host', '-feature', '-Vulkan')
    if ($config.headless) { $emulatorArgs += @('-no-window', '-no-audio') }
    $emulator = Start-Child 'emulator' 'emulator.exe' $emulatorArgs
    $boot = [Diagnostics.Stopwatch]::StartNew()
    while ($true) {
        Check-Stop
        if ($emulator.HasExited) { throw 'Emulator exited before boot completed. See emulator.log.' }
        try { $completed = Run-Child 'boot-check' 'adb.exe' @('-s', $serial, 'shell', 'getprop', 'sys.boot_completed') 5 } catch [OperationCanceledException] { throw } catch { $completed = '' }
        if ($completed.Trim() -eq '1') { break }
        if ($boot.Elapsed.TotalSeconds -gt 300) { throw 'Emulator did not finish booting within five minutes.' }
        Start-Sleep -Milliseconds 500
    }
    Publish 'android' 'Installing and opening the native app with MIDI connected.'
    $null = Run-Child 'android-install' 'adb.exe' @('-s', $serial, 'install', '-r', '-t', $apk) 90
    foreach ($mapping in @(@('tcp:3000', "tcp:$($settings.Port)"), @('tcp:39173', 'tcp:39173'))) {
        $null = Run-Child ('reverse-' + $mapping[0].Replace(':','-')) 'adb.exe' @('-s', $serial, 'reverse', '--no-rebind', $mapping[0], $mapping[1])
        $mappings.Add($mapping[0])
    }
    $null = Run-Child 'android-launch' $powershell @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $stage, '-Stage', 'android', '-Serial', $serial) 60
    Publish 'browser' 'Opening the dedicated Chrome window and enabling real MIDI input.'
    $browserArgs = @((Join-Path $PSScriptRoot 'browser.mjs'), '--profile', (Join-Path $testing 'browser'))
    if ($config.headless) { $browserArgs += '--headless' }
    $browser = Start-Child 'browser' 'node.exe' $browserArgs
    $browserTimer = [Diagnostics.Stopwatch]::StartNew()
    while ($true) {
        Check-Stop
        $ready = $null
        while ($null -ne ($line = $browser.ReadLine())) {
            try { $candidate = $line | ConvertFrom-Json; if ($candidate.PSObject.Properties['event'] -and $candidate.event -eq 'ready') { $ready = $candidate } } catch { }
        }
        if ($ready) { break }
        if ($browser.HasExited -or $browserTimer.Elapsed.TotalSeconds -gt 60) { throw 'Testing browser did not start; see browser.log.' }
        Start-Sleep -Milliseconds 100
    }
    $events = (Get-Content -LiteralPath (Join-Path $repository 'scripts/midi/fixtures/smoke.json') -Raw | ConvertFrom-Json).events
    Publish 'ready' 'Web + Android are running. In Android, open a sheet or choose Explore the example sheet to see notes.'
    while ($true) {
        Check-Stop
        if ($web.HasExited -or $emulator.HasExited -or $browser.HasExited) { throw 'A testing application closed. Stopping the remaining services.' }
        if ($bridge.Failure) { throw 'The local MIDI bridge stopped. See session logs.' }
        $requestFile = Join-Path $SessionDirectory 'request.json'
        if (Test-Path -LiteralPath $requestFile) {
            if ((Get-Item -LiteralPath $requestFile).Length -gt 1024) { throw 'Invalid launcher command size.' }
            $request = Get-Content -LiteralPath $requestFile -Raw | ConvertFrom-Json
            Remove-Item -LiteralPath $requestFile
            if ($request.action -ne 'play') { throw 'Unknown launcher command.' }
            $handledCommand = [int]$request.id
            Publish 'playing' 'Preparing the web input, then broadcasting the MIDI sequence to both clients.'
            $reply = Browser-Request 'prepare'
            if (-not $reply.ok) { Publish 'playing' 'Web input is unavailable. Broadcasting to connected clients; open a web sheet and enable MIDI for the next playback.' }
            try {
                $sender = [ChordViewer.LocalMidi.Sender]::new()
                $timer = [Diagnostics.Stopwatch]::StartNew()
                foreach ($event in $events) {
                    while ($timer.Elapsed.TotalMilliseconds -lt $event.atMs / $config.speed) { Check-Stop; Start-Sleep -Milliseconds 20 }
                    Check-Stop
                    $sender.Send([int[]]$event.data)
                }
            } finally { if ($sender) { $sender.Dispose(); $sender = $null } }
            $null = Browser-Request 'status'
            Publish 'ready' 'Sequence broadcast to connected clients. Press P to play again.'
        }
        Start-Sleep -Milliseconds 100
    }
} catch [OperationCanceledException] {
    # Expected when the menu quits, Ctrl+C is pressed, the terminal closes or its process is killed.
} catch {
    $failure = $_.Exception.Message
    [IO.File]::WriteAllText((Join-Path $SessionDirectory 'failure.log'), ($_ | Out-String))
} finally {
    $cleanupErrors = New-Object 'Collections.Generic.List[string]'
    try { Publish 'stopping' 'Releasing MIDI and stopping only this session; database volumes are retained.' } catch { }
    if ($sender) { try { $sender.Dispose() } catch { $cleanupErrors.Add('MIDI release failed.') } }
    if ($browser -and -not $browser.HasExited) { try { $null = Browser-Request 'stop' -Cleanup } catch { } }
    if ($emulator -and -not $emulator.HasExited) {
        try { $null = Run-Child 'cleanup-android-stop' 'adb.exe' @('-s', $serial, 'shell', 'am', 'force-stop', 'com.chordviewer.debug') 10 -Cleanup } catch { }
        foreach ($mapping in $mappings) { try { $null = Run-Child ('cleanup-' + $mapping.Replace(':','-')) 'adb.exe' @('-s', $serial, 'reverse', '--remove', $mapping) 10 -Cleanup } catch { } }
        try { $null = Run-Child 'cleanup-emulator' 'adb.exe' @('-s', $serial, 'emu', 'kill') 10 -Cleanup } catch { }
    }
    if ($bridgeOwned) {
        try {
            if (Test-Path -LiteralPath $bridgeFile) {
                $stored = Get-Content -LiteralPath $bridgeFile -Raw | ConvertFrom-Json
                if ($stored.token -ceq $token) { Remove-Item -LiteralPath $bridgeFile -Force }
            }
        } catch { $cleanupErrors.Add('MIDI credential cleanup failed.') }
    }
    if ($bridge) { try { $bridge.Dispose() } catch { $cleanupErrors.Add('MIDI bridge cleanup failed.') } }
    # Kill all remaining owned workers, including build descendants, before Docker cleanup.
    if ($jobAttached) { try { [ChordViewer.Testing.WorkloadJob]::StopChildren() } catch { $cleanupErrors.Add('Child process cleanup failed.') } }
    if ($backendIntent) { try { Remove-OwnedBackend } catch { $cleanupErrors.Add('Owned Docker resource cleanup failed; inspect cleanup logs.') } }
    foreach ($child in $children) { try { $child.Dispose() } catch { } }
    if ($parent) { $parent.Dispose() }
    if ($lock) { $lock.Dispose() }
    if ($cleanupErrors.Count) { $failure = "$failure $($cleanupErrors -join ' ')".Trim() }
    if ($failure) { Publish 'failed' $failure } else { Publish 'stopped' 'All session services stopped. Saved sheets, profile and build caches were kept.' }
}
