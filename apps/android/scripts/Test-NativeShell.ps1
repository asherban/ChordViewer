[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('\A[A-Za-z0-9._:-]+\z')][string]$Serial,
    [Parameter(Mandatory = $true)][string]$FixturePath,
    [switch]$WithMidi,
    [switch]$Authoring,
    [switch]$Organization,
    [ValidateRange(0,2)][int]$RecoveryPhase = 0
)
$ErrorActionPreference = 'Stop'
if ($RecoveryPhase -and ($Organization -or $Authoring -or $WithMidi)) { throw 'Recovery acceptance runs separately from other native scenarios.' }
if ($Organization -and ($Authoring -or $WithMidi)) { throw 'Organization acceptance runs separately from MIDI and authoring.' }
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
# Musical events are injected by the test APK through LibraryViewModel, without a host MIDI transport.
$fixture | Add-Member -NotePropertyName injectMidi -NotePropertyValue ([bool]$WithMidi) -Force
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
$transcript = New-Object 'Collections.Generic.List[string]'
try {
    $null = Invoke-Adb @('install', '-r', '-t', (Join-Path $repositoryRoot 'apps/android/app/build/outputs/apk/debug/app-debug.apk'))
    $null = Invoke-Adb @('install', '-r', '-t', (Join-Path $repositoryRoot 'apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
    $null = Invoke-Adb @('shell', 'am', 'force-stop', 'com.chordviewer.debug')
    Ensure-Reverse 'tcp:3000' "tcp:$apiPort"
    Ensure-Reverse "tcp:$apiPort" "tcp:$apiPort"
    if ($RecoveryPhase -eq 1 -and -not $createdMappings.Contains('tcp:3000')) { throw 'Recovery outage acceptance requires its own app reverse mapping; use an isolated emulator.' }
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
    $delivered = Invoke-Adb @('shell', 'run-as', 'com.chordviewer.debug', 'wc', '-c', 'files/ui-fixture.json')
    if ($delivered -notmatch '^\s*(\d+)\s' -or [int]$Matches[1] -ne $inputBytes.Length) { throw 'The private UI fixture was not delivered completely.' }
    $modeFlag = if ($RecoveryPhase) { 'recoveryUi' } elseif ($Authoring) { 'authoringUi' } else { 'shellUi' }
    $testClass = if ($RecoveryPhase -eq 1) { 'com.chordviewer.library.NativeRecoveryFlowTest#writeRecoveryAcrossConnectionLoss' }
        elseif ($RecoveryPhase -eq 2) { 'com.chordviewer.library.NativeRecoveryFlowTest#restoreAfterProcessRestartAndSaveConflictAsNew' }
        elseif ($Authoring) { 'com.chordviewer.library.NativeChordAuthoringTest' }
        elseif ($Organization) { 'com.chordviewer.library.NativeShellFlowTest#nativeLibraryOrganizationActions' }
        else { 'com.chordviewer.library.NativeShellFlowTest#nativeLibraryModesRetainDraftsAndSaveToSharedBackend' }
    $runner = Start-Adb @('shell', 'am', 'instrument', '-w', '-r', '-e', $modeFlag, 'true', '-e', 'class',
        $testClass, 'com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner')
    $outLine = $runner.StandardOutput.ReadLineAsync()
    $errLine = $runner.StandardError.ReadLineAsync()
    $outDone = $false; $errDone = $false
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while (-not ($runner.HasExited -and $outDone -and $errDone)) {
        if ($clock.Elapsed.TotalSeconds -gt 360) { throw 'Native UI acceptance exceeded its deadline.' }
        foreach ($stream in @('out', 'err')) {
            $done = if ($stream -eq 'out') { $outDone } else { $errDone }
            $task = if ($stream -eq 'out') { $outLine } else { $errLine }
            if ($done -or -not $task.IsCompleted) { continue }
            $line = $task.GetAwaiter().GetResult()
            if ($null -eq $line) { if ($stream -eq 'out') { $outDone = $true } else { $errDone = $true }; continue }
            foreach ($secret in $secrets) { if ($secret) { $line = $line.Replace($secret, '[redacted]') } }
            $transcript.Add($line)
            if ($transcript.Count -gt 1000) { throw 'Native UI runner output exceeded its bound.' }
            if ($line -match 'M7_NATIVE_OFFLINE_READY') {
                if ($RecoveryPhase -ne 1) { throw 'Unexpected outage signal.' }
                $null = Invoke-Adb @('reverse', '--remove', 'tcp:3000')
                Write-Host 'Temporarily disconnected the app route; verification route remains available.'
            }
            if ($line -match 'M7_NATIVE_ONLINE_READY') {
                if ($RecoveryPhase -ne 1) { throw 'Unexpected reconnect signal.' }
                $null = Invoke-Adb @('reverse', '--no-rebind', 'tcp:3000', "tcp:$apiPort")
                Write-Host 'Restored the app route for an explicit save retry.'
            }
            if ($line -match 'M6_PLAYER_HTML') { Write-Host $line }
            if ($stream -eq 'out') { $outLine = $runner.StandardOutput.ReadLineAsync() } else { $errLine = $runner.StandardError.ReadLineAsync() }
        }
        Start-Sleep -Milliseconds 10
    }
    $result = $transcript -join "`n"
    if ($runner.ExitCode -ne 0 -or $result -notmatch '(?m)^OK\s*\(1 test\)\s*$' -or
        $result -match '(?im)FAILURES|INSTRUMENTATION_FAILED|skipped|AssumptionFailure|^INSTRUMENTATION_STATUS_CODE:\s*-[1234]\s*$') { throw 'Native UI acceptance failed.' }
    $destination = Join-Path $repositoryRoot '.local/android-ui-evidence'
    $null = New-Item -ItemType Directory -Path $destination -Force
    $captures = if ($RecoveryPhase -eq 1) { @('m7-native-before-restart.png') }
        elseif ($RecoveryPhase -eq 2) { @('m7-native-recovery.png', 'm7-native-conflict.png', 'm7-native-recovered-practice.png') }
        elseif ($Authoring) { @('m4-native-entry.png', 'm4-native-practice.png', 'm4-native-reopened.png', 'm5-native-melody.png', 'm5-native-import.png', 'm5-native-imported.png') }
        elseif ($Organization) { @('m6-native-library-organized.png') }
        else { @('ui-native-library.png', 'ui-native-create.png', 'ui-native-practice.png', 'ui-native-chords.png',
            'm6-native-practice-player.png', 'm6-native-practice.png') }
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
    if ($RecoveryPhase) {
        Write-Host "PASS: native recovery phase $RecoveryPhase (1 test)."
    } elseif ($Authoring) {
        Write-Host 'PASS: native chord/melody MIDI and manual authoring, correction, history, key/meter, save/reopen and document import/export (1 test).'
    } elseif ($Organization) {
        Write-Host 'PASS: native Library favorite, Draft, duplicate, Trash and restore through the UI (1 test).'
    } else {
        Write-Host 'PASS: native account UI, Library/Create/Practice, retained draft, shared save, melody preference and sign-out (1 test).'
        if ($WithMidi) { Write-Host 'PASS: injected held chord survived navigation and save; fresh G7 advanced Practice once; sign-out reset product MIDI state.' }
    }
    Write-Host "Screenshots saved under $destination"
} catch {
    if ($transcript.Count) { Write-Host ($transcript -join "`n") }
    throw
} finally {
    Stop-Owned $runner
    $null = Invoke-Adb @('shell', 'run-as', 'com.chordviewer.debug', 'rm', '-f', 'files/ui-fixture.json')
    foreach ($remote in $createdMappings) { $null = Invoke-Adb @('reverse', '--remove', $remote) }
}
