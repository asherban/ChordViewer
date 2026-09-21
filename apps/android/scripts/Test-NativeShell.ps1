[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('\A[A-Za-z0-9._:-]+\z')][string]$Serial,
    [Parameter(Mandatory = $true)][string]$FixturePath,
    [switch]$WithMidi,
    [switch]$Authoring
)
$ErrorActionPreference = 'Stop'
if ($Authoring) { $WithMidi = $true }
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
. (Join-Path $repositoryRoot 'scripts/development/Initialize-AndroidEnvironment.ps1')
$adb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
try { $fixtureText = Get-Content -LiteralPath $FixturePath -Raw } catch { throw 'Could not read the private UI fixture.' }
if ($fixtureText.Length -gt 8192) { throw 'UI fixture exceeds its size limit.' }
try { $fixture = $fixtureText | ConvertFrom-Json } catch { throw 'Private UI fixture is not valid JSON.' }
if (-not ($fixture.email -is [string]) -or -not ($fixture.password -is [string])) { throw 'Fixture must contain a synthetic test account email and password.' }
$apiPort = if ($fixture.apiPort) { [int]$fixture.apiPort } else { 3001 }
if ($apiPort -lt 1024 -or $apiPort -gt 65535) { throw 'Fixture API port is invalid.' }
$secrets = @($fixture.email, $fixture.password)
if ($WithMidi) {
    try { $bridge = Get-Content -LiteralPath (Join-Path $repositoryRoot '.local/midi/bridge.json') -Raw | ConvertFrom-Json }
    catch { throw 'Could not read the local MIDI bridge session.' }
    if ($bridge.host -ne '127.0.0.1' -or $bridge.port -ne 39173 -or $bridge.token -cnotmatch '\A[a-f0-9]{64}\z') { throw 'Start a valid local MIDI bridge before this test.' }
    $fixture | Add-Member -NotePropertyName midiToken -NotePropertyValue $bridge.token -Force
    $fixture | Add-Member -NotePropertyName expectMidi -NotePropertyValue $true -Force
    $secrets += $bridge.token
    Add-Type -Path (Join-Path $repositoryRoot 'scripts/midi/WinMmMidi.cs')
}
function Start-Adb([string[]]$Arguments, [switch]$InputPipe) {
    $process = New-Object Diagnostics.Process
    $process.StartInfo.FileName = $adb
    $argsToQuote = @('-s', $Serial) + $Arguments
    foreach ($value in $argsToQuote) { if ($value.Contains('"') -or $value.EndsWith('\')) { throw 'Unsupported ADB argument.' } }
    $process.StartInfo.Arguments = ($argsToQuote | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.RedirectStandardInput = [bool]$InputPipe
    $null = $process.Start()
    return $process
}
function Stop-Owned($process) {
    if ($null -eq $process) { return }
    if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(3000) }
    $process.Dispose()
}
function Invoke-Adb([string[]]$Arguments) {
    $process = Start-Adb $Arguments
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errorOutput = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(60000) -or $process.ExitCode -ne 0) { throw 'ADB operation failed; verify the selected emulator.' }
        $null = $errorOutput.GetAwaiter().GetResult()
        return $output.GetAwaiter().GetResult()
    } finally { Stop-Owned $process }
}
$createdMappings = New-Object 'Collections.Generic.List[string]'
function Ensure-Reverse([string]$remote, [string]$local) {
    $existing = Invoke-Adb @('reverse', '--list')
    $match = [regex]::Match($existing, '(?m)^\S+\s+' + [regex]::Escape($remote) + '\s+(\S+)\s*$')
    if ($match.Success) {
        if ($match.Groups[1].Value -ne $local) { throw 'A conflicting ADB reverse mapping exists; use an isolated test emulator.' }
    } else {
        $null = Invoke-Adb @('reverse', '--no-rebind', $remote, $local)
        $createdMappings.Add($remote)
    }
}
$runner = $null
$sender = $null
$transcript = New-Object 'Collections.Generic.List[string]'
function Send-Chord([int[]]$Notes, [int]$HoldMilliseconds = 20) {
    foreach ($pitch in $Notes) { $sender.Send([int[]]@(144, $pitch, 96)) }
    if ($HoldMilliseconds -gt 0) { Start-Sleep -Milliseconds $HoldMilliseconds }
    foreach ($pitch in $Notes) { $sender.Send([int[]]@(128, $pitch, 0)) }
}
try {
    $null = Invoke-Adb @('install', '-r', '-t', (Join-Path $repositoryRoot 'apps/android/app/build/outputs/apk/debug/app-debug.apk'))
    $null = Invoke-Adb @('install', '-r', '-t', (Join-Path $repositoryRoot 'apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
    $null = Invoke-Adb @('shell', 'am', 'force-stop', 'com.chordviewer.debug')
    Ensure-Reverse 'tcp:3000' "tcp:$apiPort"
    Ensure-Reverse "tcp:$apiPort" "tcp:$apiPort"
    if ($WithMidi) { Ensure-Reverse 'tcp:39173' 'tcp:39173' }
    $null = Invoke-Adb @('shell', 'run-as', 'com.chordviewer.debug', 'mkdir', '-p', 'files')
    # Tee is executed as the debug app. Credential data uses stdin, never process arguments or console output.
    $writer = Start-Adb @('exec-in', 'run-as', 'com.chordviewer.debug', 'tee', 'files/ui-fixture.json') -InputPipe
    try {
        $stdout = $writer.StandardOutput.ReadToEndAsync()
        $stderr = $writer.StandardError.ReadToEndAsync()
        $inputBytes = [Text.Encoding]::UTF8.GetBytes(($fixture | ConvertTo-Json -Compress))
        $writer.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
        $writer.StandardInput.Close()
        if (-not $writer.WaitForExit(10000) -or $writer.ExitCode -ne 0) { throw 'Could not deliver the private UI fixture.' }
        $null = $stdout.GetAwaiter().GetResult()
        $null = $stderr.GetAwaiter().GetResult()
    } finally { Stop-Owned $writer }
    $modeFlag = if ($Authoring) { 'authoringUi' } else { 'shellUi' }
    $testClass = if ($Authoring) { 'com.chordviewer.library.NativeChordAuthoringTest' } else { 'com.chordviewer.library.NativeShellFlowTest' }
    $runner = Start-Adb @('shell', 'am', 'instrument', '-w', '-r', '-e', $modeFlag, 'true', '-e', 'class',
        $testClass, 'com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner')
    $outLine = $runner.StandardOutput.ReadLineAsync()
    $errLine = $runner.StandardError.ReadLineAsync()
    $outDone = $false; $errDone = $false
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while (-not ($runner.HasExited -and $outDone -and $errDone)) {
        if ($clock.Elapsed.TotalSeconds -gt 240) { throw 'Native UI acceptance exceeded its deadline.' }
        foreach ($stream in @('out', 'err')) {
            $done = if ($stream -eq 'out') { $outDone } else { $errDone }
            $task = if ($stream -eq 'out') { $outLine } else { $errLine }
            if ($done -or -not $task.IsCompleted) { continue }
            $line = $task.GetAwaiter().GetResult()
            if ($null -eq $line) { if ($stream -eq 'out') { $outDone = $true } else { $errDone = $true }; continue }
            foreach ($secret in $secrets) { if ($secret) { $line = $line.Replace($secret, '[redacted]') } }
            $transcript.Add($line)
            if ($transcript.Count -gt 1000) { throw 'Native UI runner output exceeded its bound.' }
            if ($line -match 'NATIVE_UI_MIDI_READY') {
                if (-not $WithMidi -or $sender) { throw 'Unexpected MIDI readiness signal.' }
                $sender = New-Object ChordViewer.LocalMidi.Sender
                $sender.Send([int[]]@(144, 60, 96))
                Write-Host 'Holding C4 through native mode changes and metadata save.'
            }
            if ($line -match 'M4_NATIVE_ENTRY_READY') {
                if (-not $Authoring -or $sender) { throw 'Unexpected authoring readiness signal.' }
                $sender = New-Object ChordViewer.LocalMidi.Sender
                $sender.Send([int[]]@(176, 64, 127))
                Send-Chord @(60, 64, 67) 0
                Send-Chord @(62, 65, 69) 0
                $sender.Send([int[]]@(176, 64, 0))
                Write-Host 'Broadcast two immediate chords with sustain held through both gestures.'
            }
            if ($line -match 'M4_NATIVE_REPLACE_READY') {
                if (-not $Authoring -or -not $sender) { throw 'Unexpected replacement signal.' }
                Send-Chord @(65, 69, 72) 0
                Send-Chord @(64, 68, 71) 0
                Write-Host 'Broadcast F then E to verify replacement writes once.'
            }
            if ($line -match 'M4_NATIVE_PRACTICE_READY') {
                if (-not $Authoring -or -not $sender) { throw 'Unexpected practice signal.' }
                Send-Chord @(60, 64, 67) 1600
                Write-Host 'Broadcast held C major in read-only Practice.'
            }
            if ($line -match 'M4_NATIVE_PENDING_REPLACE_READY') {
                if (-not $Authoring -or -not $sender) { throw 'Unexpected pending replacement signal.' }
                Send-Chord @(67, 71, 74) 0
                Write-Host 'Broadcast G to verify a rejected replacement remains correctable without replay.'
            }
            if ($line -match 'M4_NATIVE_RECONNECT_READY') {
                if (-not $Authoring -or -not $sender) { throw 'Unexpected reconnect signal.' }
                Send-Chord @(67, 71, 74) 0
                Write-Host 'Broadcast a fresh G major gesture after reconnect.'
            }
            if ($stream -eq 'out') { $outLine = $runner.StandardOutput.ReadLineAsync() } else { $errLine = $runner.StandardError.ReadLineAsync() }
        }
        Start-Sleep -Milliseconds 10
    }
    $result = $transcript -join "`n"
    if ($runner.ExitCode -ne 0 -or $result -notmatch '(?m)^OK\s*\(1 test\)\s*$' -or
        $result -match '(?im)FAILURES|INSTRUMENTATION_FAILED|skipped|AssumptionFailure|^INSTRUMENTATION_STATUS_CODE:\s*-[1234]\s*$') { throw 'Native UI acceptance failed.' }
    $destination = Join-Path $repositoryRoot '.local/android-ui-evidence'
    $null = New-Item -ItemType Directory -Path $destination -Force
    $captures = if ($Authoring) { @('m4-native-entry.png', 'm4-native-practice.png', 'm4-native-reopened.png') }
        else { @('ui-native-library.png', 'ui-native-create.png', 'ui-native-practice.png', 'ui-native-chords.png') }
    foreach ($name in $captures) {
        $reader = Start-Adb @('exec-out', 'run-as', 'com.chordviewer.debug', 'cat', "files/ui-evidence/$name")
        try {
            $errorRead = $reader.StandardError.ReadToEndAsync()
            $target = [IO.File]::Create((Join-Path $destination $name))
            try { $reader.StandardOutput.BaseStream.CopyTo($target) } finally { $target.Dispose() }
            if (-not $reader.WaitForExit(10000) -or $reader.ExitCode -ne 0) { throw 'Could not collect native UI evidence.' }
            $null = $errorRead.GetAwaiter().GetResult()
        } finally { Stop-Owned $reader }
    }
    if ($Authoring) {
        Write-Host 'PASS: native real-MIDI authoring, sustain, rapid gestures, undo/redo, correction/delete, one-shot replacement, read-only Practice, reconnect, full save/reopen (1 test).'
    } else {
        Write-Host 'PASS: native account UI, Library/Create/Practice, retained draft, shared save, melody preference and sign-out (1 test).'
        if ($WithMidi) { Write-Host 'PASS: real held C4 survived navigation and save; sign-out disconnected MIDI.' }
    }
    Write-Host "Screenshots saved under $destination"
} catch {
    if ($transcript.Count) { Write-Host ($transcript -join "`n") }
    throw
} finally {
    if ($sender) { $sender.Dispose() }
    Stop-Owned $runner
    $null = Invoke-Adb @('shell', 'run-as', 'com.chordviewer.debug', 'rm', '-f', 'files/ui-fixture.json')
    foreach ($remote in $createdMappings) { $null = Invoke-Adb @('reverse', '--remove', $remote) }
}
