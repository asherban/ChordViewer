[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('\A[A-Za-z0-9._:-]+\z')]
    [string]$Serial
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Initialize-AndroidEnvironment.ps1')
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$adbPath = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
$applicationApk = Join-Path $repositoryRoot 'apps\android\app\build\outputs\apk\debug\app-debug.apk'
$testApk = Join-Path $repositoryRoot 'apps\android\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk'
$senderScript = Join-Path $repositoryRoot 'scripts\midi\Send-Fixture.ps1'
$bridgeState = Join-Path $repositoryRoot '.local\midi\bridge.json'
$buildHint = '. scripts/development/Initialize-AndroidEnvironment.ps1; apps/android/gradlew.bat -p apps/android assembleDebug assembleDebugAndroidTest'
if (-not (Test-Path -LiteralPath $adbPath -PathType Leaf)) { throw 'ADB is missing from the Android SDK platform-tools directory.' }
if (-not (Test-Path -LiteralPath $applicationApk -PathType Leaf) -or -not (Test-Path -LiteralPath $testApk -PathType Leaf)) {
    throw "Build both debug APKs first, from the repository root: $buildHint"
}
if (-not (Test-Path -LiteralPath $bridgeState -PathType Leaf)) {
    throw 'Start scripts/midi/Start-Bridge.ps1 in another terminal first. Keep it running for this test.'
}
try { $bridgeConfig = Get-Content -LiteralPath $bridgeState -Raw | ConvertFrom-Json }
catch { throw 'The local bridge metadata could not be read. Restart the bridge.' }
if ($bridgeConfig.host -ne '127.0.0.1' -or $bridgeConfig.port -ne 39173 -or
    -not ($bridgeConfig.token -is [string]) -or $bridgeConfig.token -cnotmatch '\A[a-f0-9]{64}\z') {
    throw 'The local bridge metadata is invalid. Restart the bridge.'
}
$token = [string]$bridgeConfig.token

function New-HiddenProcess([string]$FileName, [string[]]$Arguments) {
    # Arguments are fixed flags, validated identifiers or Windows file paths; none may contain quotes.
    foreach ($argument in $Arguments) {
        if ($argument.Contains('"') -or $argument.EndsWith('\')) { throw 'Unsupported process argument.' }
    }
    $process = New-Object Diagnostics.Process
    $process.StartInfo.FileName = $FileName
    $process.StartInfo.Arguments = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $process.StartInfo.WorkingDirectory = $repositoryRoot
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    try { $null = $process.Start() }
    catch { $process.Dispose(); throw 'Could not start a required local test process.' }
    return $process
}
function Stop-OwnedProcess($Process) {
    if ($null -eq $Process) { return }
    try {
        if (-not $Process.HasExited) {
            $Process.Kill()
            $null = $Process.WaitForExit(3000)
        }
    } finally { $Process.Dispose() }
}
function Stop-FixtureProcess($Process) {
    if ($null -eq $Process) { return }
    $forced = $false
    try {
        # Normal completion runs Sender.Dispose and releases notes for every LoopBe consumer.
        if (-not $Process.HasExited -and -not $Process.WaitForExit(8000)) {
            $forced = $true
            $Process.Kill()
            $null = $Process.WaitForExit(3000)
        }
    } finally {
        $Process.Dispose()
        if ($forced) {
            # Killing PowerShell skips its finally block. Release sustain/all notes explicitly.
            if (-not ('ChordViewer.LocalMidi.Sender' -as [type])) {
                Add-Type -Path (Join-Path $repositoryRoot 'scripts\midi\WinMmMidi.cs')
            }
            $panicSender = New-Object ChordViewer.LocalMidi.Sender
            $panicSender.Dispose()
        }
    }
}
function Invoke-AdbChecked([string[]]$Arguments, [string]$Description) {
    $process = New-HiddenProcess $adbPath (@('-s', $Serial) + $Arguments)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(60000)) { throw "$Description timed out." }
        $text = ($stdout.GetAwaiter().GetResult() + "`n" + $stderr.GetAwaiter().GetResult()).Trim()
        if ($process.ExitCode -ne 0) { throw "$Description failed. Check the selected device with adb devices." }
        return $text
    } finally { Stop-OwnedProcess $process }
}

$deviceState = Invoke-AdbChecked @('get-state') 'Checking the selected Android device'
if ($deviceState -notmatch '(?m)^device\s*$') { throw 'The selected device is unavailable or unauthorized. Check adb devices.' }
$null = Invoke-AdbChecked @('install', '-r', '-t', $applicationApk) 'Installing the debug application'
$null = Invoke-AdbChecked @('install', '-r', '-t', $testApk) 'Installing the instrumentation tests'
$reverseList = Invoke-AdbChecked @('reverse', '--list') 'Reading Android reverse mappings'
$mapping = [regex]::Match($reverseList, '(?m)^\S+\s+tcp:39173\s+(\S+)\s*$')
if ($mapping.Success) {
    if ($mapping.Groups[1].Value -ne 'tcp:39173') { throw 'The selected device already has a conflicting tcp:39173 reverse mapping.' }
} else {
    $null = Invoke-AdbChecked @('reverse', '--no-rebind', 'tcp:39173', 'tcp:39173') 'Creating the local MIDI reverse mapping'
}

$runner = $null
$sender = $null
$transcript = New-Object 'Collections.Generic.List[string]'
$capturedLength = 0
$ready = $false
$stdoutDone = $false
$stderrDone = $false
try {
    $runner = New-HiddenProcess $adbPath @(
        '-s', $Serial, 'shell', 'am', 'instrument', '-w', '-r',
        '-e', 'midiToken', $token,
        '-e', 'class', 'com.chordviewer.midi.LoopbackRelayTest',
        'com.chordviewer.debug.test/androidx.test.runner.AndroidJUnitRunner'
    )
    # Drain both pipes asynchronously so instrumentation status can trigger the fixture immediately.
    $stdoutLine = $runner.StandardOutput.ReadLineAsync()
    $stderrLine = $runner.StandardError.ReadLineAsync()
    $deadline = [Diagnostics.Stopwatch]::StartNew()
    while (-not ($runner.HasExited -and $stdoutDone -and $stderrDone)) {
        if ($deadline.Elapsed.TotalSeconds -ge 60) { throw 'Android MIDI instrumentation exceeded its 60-second deadline.' }
        foreach ($streamName in @('stdout', 'stderr')) {
            $finished = if ($streamName -eq 'stdout') { $stdoutDone } else { $stderrDone }
            $pending = if ($streamName -eq 'stdout') { $stdoutLine } else { $stderrLine }
            if ($finished -or -not $pending.IsCompleted) { continue }
            $line = $pending.GetAwaiter().GetResult()
            if ($null -eq $line) {
                if ($streamName -eq 'stdout') { $stdoutDone = $true } else { $stderrDone = $true }
                continue
            }
            $capturedLength += $line.Length
            # This bounds retained transcript text; ReadLineAsync is reading our own test runner.
            if ($capturedLength -gt 65536) { throw 'Instrumentation exceeded the 64K-character transcript limit.' }
            # Never emit a raw runner line: Android launch failures can include instrumentation arguments.
            $transcript.Add($line.Replace($token, '[redacted]'))
            if ($streamName -eq 'stdout' -and $line -match '^(?:INSTRUMENTATION_STATUS:\s*stream=)?MIDI_RELAY_READY\s*$') {
                if ($ready) { throw 'Instrumentation unexpectedly requested the fixture twice.' }
                $ready = $true
                $sender = New-HiddenProcess (Join-Path $PSHOME $(if ($PSVersionTable.PSEdition -eq 'Desktop') { 'powershell.exe' } else { 'pwsh.exe' })) @(
                    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $senderScript
                )
                $senderOutput = $sender.StandardOutput.ReadToEndAsync()
                $senderError = $sender.StandardError.ReadToEndAsync()
                Write-Host 'Android relay is ready; replaying the LoopBe smoke fixture.'
            }
            if ($streamName -eq 'stdout') { $stdoutLine = $runner.StandardOutput.ReadLineAsync() }
            else { $stderrLine = $runner.StandardError.ReadLineAsync() }
        }
        if ($sender -and $sender.HasExited -and $sender.ExitCode -ne 0) { throw 'The LoopBe fixture sender failed. Check LoopBe1 and scripts/midi/Test-Bridge.ps1.' }
        Start-Sleep -Milliseconds 10
    }
    # The last MIDI cleanup event can reach Android just before its PowerShell sender exits.
    while ($sender -and -not $sender.HasExited -and $deadline.Elapsed.TotalSeconds -lt 60) {
        Start-Sleep -Milliseconds 10
    }
    $result = $transcript -join "`n"
    $failedOrSkipped = $result -match '(?im)\bFAILURES?\b|INSTRUMENTATION_FAILED|INSTRUMENTATION_ABORTED|\b(?:skipped|ignored|AssumptionFailure)\b|^INSTRUMENTATION_STATUS_CODE:\s*-[1234]\s*$'
    if (-not $ready -or -not $sender -or -not $sender.HasExited -or $sender.ExitCode -ne 0 -or
        $runner.ExitCode -ne 0 -or $failedOrSkipped -or $result -notmatch '(?m)^OK\s*\(1 test\)\s*$') {
        throw 'Android MIDI instrumentation did not report exactly one passing test and a successful fixture replay.'
    }
    $null = $senderOutput.GetAwaiter().GetResult()
    $null = $senderError.GetAwaiter().GetResult()
    Write-Host 'PASS: real LoopBe -> local bridge -> Android emulator MIDI state, including sustain, channels and reconnect reset (1 test).'
} catch {
    if ($transcript.Count -gt 0) { Write-Host ($transcript -join "`n") }
    throw $_.Exception.Message.Replace($token, '[redacted]')
} finally {
    try { Stop-FixtureProcess $sender } finally { Stop-OwnedProcess $runner }
    # Leave the per-device reverse mapping available for interactive debug sessions. Never remove a shared mapping.
}
