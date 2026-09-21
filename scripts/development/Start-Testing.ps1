[CmdletBinding()]
param(
    [ValidateSet('development', 'test')][string]$Environment = 'development',
    [ValidateRange(0.1, 10.0)][double]$Speed = 0.25,
    [switch]$SkipBuild,
    [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$guardian = $null
$session = $null
$inputConfigured = $false
$previousControlC = $false
$previousLocation = Get-Location
$shutdownFailure = $null
function Read-TestingStatus([string]$Path) {
    $stream = $null; $reader = $null
    try {
        # Permit the guardian to atomically replace status while this snapshot is read.
        $stream = [IO.File]::Open($Path, 'Open', 'Read', ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
        $reader = [IO.StreamReader]::new($stream)
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    } catch [IO.IOException] { return $null }
    finally { if ($reader) { $reader.Dispose() } elseif ($stream) { $stream.Dispose() } }
}
try {
    if ($env:OS -ne 'Windows_NT') { throw 'The local LoopBe testing launcher requires Windows.' }
    Set-Location -LiteralPath $repository
    . (Join-Path $PSScriptRoot 'LocalBackend.Common.ps1')
    . (Join-Path $PSScriptRoot 'Initialize-AndroidEnvironment.ps1')
    if (Get-Command fnm -ErrorAction SilentlyContinue) {
        fnm env --shell powershell | Out-String | Invoke-Expression
        fnm use
        if ($LASTEXITCODE -ne 0) { throw 'Install the pinned Node version with fnm install, then retry.' }
    }
    $required = (Get-Content -LiteralPath (Join-Path $repository '.node-version') -Raw).Trim()
    if ((& node --version).TrimStart('v') -ne $required) { throw "Use the pinned Node $required version before launching." }
    if (-not (Test-Path -LiteralPath (Join-Path $repository 'node_modules/@playwright/test/package.json'))) {
        throw 'Install repository dependencies with npm ci before launching.'
    }
    $local = Join-Path $repository '.local'
    $testing = Join-Path $local 'testing'
    foreach ($path in @($local, $testing)) {
        if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Testing state directories must not be symbolic links or junctions.'
        }
        $null = New-Item -ItemType Directory -Path $path -Force
    }
    Set-LocalBackendPrivateAcl -Path $testing -Directory
    $sessionId = [Guid]::NewGuid().ToString()
    $session = Join-Path $testing $sessionId
    $null = New-Item -ItemType Directory -Path $session
    $current = [Diagnostics.Process]::GetCurrentProcess()
    @{
        id = $sessionId; parentPid = $PID; parentStartTicks = $current.StartTime.ToUniversalTime().Ticks.ToString()
        environment = $Environment; speed = $Speed; skipBuild = [bool]$SkipBuild; headless = [bool]$Headless
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $session 'config.json') -Encoding UTF8
    if (-not ('ChordViewer.Testing.MenuInput' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'testing/ProcessHost.cs') }
    # ADB is shared workstation infrastructure, like Docker Desktop. Start it outside the workload job.
    & adb start-server
    if ($LASTEXITCODE -ne 0) { throw 'ADB could not start.' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $start.Arguments = [ChordViewer.Testing.ChildProcess]::JoinArguments(@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'testing/Guardian.ps1'), '-SessionDirectory', $session))
    $start.WorkingDirectory = $repository
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $guardian = [Diagnostics.Process]::Start($start)
    # Capture its handle now; a later recycled PID must not be treated as this guardian.
    $null = $guardian.Handle
    Write-Host "Testing session: $session"
    Write-Host 'Press Ctrl+C or enter Q at any time to stop. Startup logs are in the session folder.'
    if (-not [Console]::IsInputRedirected) { $previousControlC = [Console]::TreatControlCAsInput }
    [ChordViewer.Testing.MenuInput]::Begin()
    $inputConfigured = $true
    $lastStatus = ''
    $lastPhase = ''
    $command = 0
    $pendingCommand = 0
    while ($true) {
        $statusPath = Join-Path $session 'status.json'
        $status = Read-TestingStatus $statusPath
        if ($status) {
            $text = "$($status.phase): $($status.message)"
            if ($text -ne $lastStatus) {
                Write-Host $text
                $lastStatus = $text
                if ($status.phase -eq 'ready') { Write-Host '[P] Play MIDI sequence to web + Android   [Q] Quit' }
            }
            $lastPhase = $status.phase
            if ($lastPhase -eq 'ready' -and $status.command -ge $pendingCommand) { $pendingCommand = 0 }
            if ($lastPhase -eq 'failed') { throw "Testing session failed. See $session for details." }
            if ($lastPhase -eq 'stopped') { break }
        }
        if ($guardian.HasExited) {
            $finished = Read-TestingStatus $statusPath
            if (-not $finished -or $finished.phase -ne 'stopped' -or $guardian.ExitCode -ne 0) {
                throw "The watchdog stopped without confirming successful cleanup. Inspect $session before restarting."
            }
            break
        }
        $answer = [ChordViewer.Testing.MenuInput]::Poll()
        if ($null -ne $answer) {
            $answer = $answer.Trim().ToLowerInvariant()
            if ($answer -in @('q', 'quit', 'exit')) { break }
            if ($answer -in @('p', 'play', '')) {
                if ($lastPhase -eq 'ready' -and $pendingCommand -eq 0) {
                    $command++
                    $temporary = Join-Path $session 'request.tmp'
                    @{ id = $command; action = 'play' } | ConvertTo-Json -Compress | Set-Content -LiteralPath $temporary -Encoding UTF8
                    [IO.File]::Move($temporary, (Join-Path $session 'request.json'))
                    $pendingCommand = $command
                } else { Write-Host 'Wait until startup or the current sequence finishes, or press Q to stop.' }
            } else { Write-Host 'Use P to play or Q to stop.' }
        }
        Start-Sleep -Milliseconds 100
    }
} finally {
    if ($guardian) {
        # This file is also seen while the guardian waits for builds, health checks or MIDI timing.
        [IO.File]::WriteAllText((Join-Path $session 'stop'), 'stop')
        Write-Host 'Stopping this testing session; saved sheets and browser profile will be kept...'
        if (-not $guardian.WaitForExit(90000)) {
            $shutdownFailure = "Cleanup is still running. The watchdog remains active; inspect $session/status.json."
        } elseif (Test-Path -LiteralPath (Join-Path $session 'status.json')) {
            $finalStatus = Get-Content -LiteralPath (Join-Path $session 'status.json') -Raw | ConvertFrom-Json
            if ($finalStatus.phase -eq 'failed') { $shutdownFailure = $finalStatus.message }
            elseif ($finalStatus.phase -ne 'stopped' -or $guardian.ExitCode -ne 0) { $shutdownFailure = "The watchdog exited without confirming cleanup. Inspect $session." }
            else { Write-Host $finalStatus.message }
        } else { $shutdownFailure = "The watchdog exited without a status file. Inspect $session." }
        $guardian.Dispose()
    }
    if ($inputConfigured -and -not [Console]::IsInputRedirected) { [Console]::TreatControlCAsInput = $previousControlC }
    Set-Location -LiteralPath $previousLocation.Path
}
if ($shutdownFailure) { throw $shutdownFailure }
