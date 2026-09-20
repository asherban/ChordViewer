[CmdletBinding()]
param([ValidateRange(0, 86400)][int]$DurationSeconds = 0)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'The LoopBe bridge requires Windows.' }
Add-Type -Path (Join-Path $PSScriptRoot 'WinMmMidi.cs')
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$stateDirectory = Join-Path $repository '.local/midi'
$stateFile = Join-Path $stateDirectory 'bridge.json'
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
try { $random.GetBytes($bytes) } finally { $random.Dispose() }
$token = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
$bridge = New-Object ChordViewer.LocalMidi.Bridge($token)
$started = $false
try {
    $bridge.Start()
    $started = $true
    $null = New-Item -ItemType Directory -Path $stateDirectory -Force
    # Acquire the exclusive port before touching another run's directory or credential.
    # Restrict the directory before writing the per-run credential. Do not print the token.
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    # Start from the existing descriptor so a stale folder does not require owner/audit privileges.
    $acl = Get-Acl -LiteralPath $stateDirectory
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    if ($PSVersionTable.PSEdition -eq 'Desktop') {
        [IO.Directory]::SetAccessControl($stateDirectory, $acl)
    } else {
        [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]$stateDirectory, $acl)
    }
    # Remove a stale credential only after successfully acquiring the exclusive port.
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force }
    @{ host = '127.0.0.1'; port = 39173; token = $token; pid = $PID; startedAt = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Write-Host 'LoopBe -> Android bridge is listening on 127.0.0.1:39173.'
    Write-Host 'Credential: .local/midi/bridge.json (private, ignored). Press Ctrl+C to stop.'
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($DurationSeconds -eq 0 -or $timer.Elapsed.TotalSeconds -lt $DurationSeconds) {
        if ($bridge.Failure) { throw $bridge.Failure }
        Start-Sleep -Milliseconds 200
    }
} finally {
    try {
        # Remove credentials while still holding the port, so a replacement run cannot lose its file.
        if ($started -and (Test-Path -LiteralPath $stateFile)) { Remove-Item -LiteralPath $stateFile -Force }
        if ($started -and (Test-Path -LiteralPath $stateDirectory)) {
            try { [IO.Directory]::Delete($stateDirectory, $false) }
            catch [IO.IOException] { } # Preserve a nonempty directory; never delete other files.
        }
    } finally { $bridge.Dispose() }
}
