[CmdletBinding()]
param(
    [switch]$List,
    [ValidateRange(-1, 65535)][int]$Select = -1,
    [ValidateRange(0, 86400)][int]$DurationSeconds = 0,
    [string]$StopFile,
    [ValidateRange(0, 2147483647)][int]$ParentPid = 0,
    [string]$ParentStartTicks
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'The USB MIDI router requires Windows.' }
Add-Type -Path @((Join-Path $PSScriptRoot 'WinMmMidi.cs'), (Join-Path $PSScriptRoot 'UsbMidiRouter.cs'))
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$directory = Join-Path $repository '.local/usb-midi'
foreach ($path in @((Join-Path $repository '.local'), $directory)) {
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'USB MIDI state directories cannot be links.'
    }
}
$destinations = @([ChordViewer.LocalMidi.UsbMidiRouter]::Destinations())
if ($List) { $destinations | Select-Object Id, Name, CanRemember; return }
$null = New-Item -ItemType Directory -Path $directory -Force
$state = Join-Path $directory 'destination.json'
$lockPath = Join-Path $directory 'router.lock'
foreach ($path in @($state, $lockPath)) {
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'USB MIDI state files cannot be links.' }
}
$lock = $null; $router = $null; $lockTransferred = $false; $parent = $null
try {
    if ($StopFile -and ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($StopFile)) -ne [IO.Path]::GetFullPath($directory) -or
        [IO.Path]::GetFileName($StopFile) -notmatch '^[0-9a-f-]{36}\.stop$')) { throw 'Invalid owned router stop file.' }
    if ($ParentPid) {
        $parent = [Diagnostics.Process]::GetProcessById($ParentPid)
        $null = $parent.Handle
        if ($parent.StartTime.ToUniversalTime().Ticks.ToString() -ne $ParentStartTicks) { throw 'Tablet launcher process identity changed.' }
    }
    try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Another USB MIDI router owns this session. Close it before starting another.' }
    if ($Select -ge 0) {
        $choice = @($destinations | Where-Object { $_.Id -eq $Select })
        if ($choice.Count -ne 1) { throw 'Select a listed external MIDI output; LoopBe and synthesizers are excluded.' }
        $destination = $choice[0]
        $ambiguous = @($destinations | Where-Object { $_.DeviceInterface -eq $destination.DeviceInterface -and $_.Name -eq $destination.Name }).Count -gt 1
        if ($destination.CanRemember -and -not $ambiguous) {
            @{ deviceInterface = $destination.DeviceInterface; name = $destination.Name } | ConvertTo-Json |
                Set-Content -LiteralPath $state -Encoding UTF8
        } elseif (Test-Path -LiteralPath $state) { Remove-Item -LiteralPath $state }
    } elseif (Test-Path -LiteralPath $state) {
        $saved = Get-Content -LiteralPath $state -Raw | ConvertFrom-Json
        if (-not ($saved.deviceInterface -is [string]) -or [string]::IsNullOrWhiteSpace($saved.deviceInterface) -or
            -not ($saved.name -is [string]) -or $saved.name -eq 'LoopBe Internal MIDI') { throw 'Saved destination is invalid. List outputs and select again.' }
        $destination = @{ Id = 0; Name = $saved.name; DeviceInterface = $saved.deviceInterface }
    } else {
        $destinations | Select-Object Id, Name, CanRemember | Format-Table | Out-Host
        throw 'First use requires selection: run Start-UsbRouter.ps1 -Select <Id> for the tablet output.'
    }
    $router = [ChordViewer.LocalMidi.UsbMidiRouter]::new($destination.DeviceInterface, $destination.Name, $destination.Id, ($Select -ge 0))
    $router.Start($lock)
    $lockTransferred = $true
    Write-Host 'LoopBe -> selected USB MIDI device. No MIDI token or ADB forwarding is used. Press Ctrl+C to stop.'
    $timer = [Diagnostics.Stopwatch]::StartNew(); $lastStatus = ''
    while ($DurationSeconds -eq 0 -or $timer.Elapsed.TotalSeconds -lt $DurationSeconds) {
        if (($parent -and $parent.HasExited) -or ($StopFile -and (Test-Path -LiteralPath $StopFile))) { break }
        if ($router.Failure) { throw $router.Failure }
        if ($router.Status -ne $lastStatus) { $lastStatus = $router.Status; Write-Host $lastStatus }
        Start-Sleep -Milliseconds 200
    }
    Write-Host "Forwarded $($router.ForwardedMessages) LoopBe messages."
} finally {
    # The worker retains the exclusive lock until its owned handles actually close, even if joining times out.
    try { if ($router) { $router.Dispose() } } finally {
        if ($lock -and -not $lockTransferred) { $lock.Dispose() }
        if ($parent) { $parent.Dispose() }
    }
}
