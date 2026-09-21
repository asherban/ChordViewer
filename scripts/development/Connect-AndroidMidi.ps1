[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('\A[A-Za-z0-9._:-]+\z')]
    [string]$Serial
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Initialize-AndroidEnvironment.ps1')
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$bridgeState = Join-Path $repositoryRoot '.local\midi\bridge.json'
if (-not (Test-Path -LiteralPath $bridgeState)) { throw 'Start the local MIDI bridge first; .local/midi/bridge.json is missing.' }
try { $bridgeConfig = Get-Content -LiteralPath $bridgeState -Raw | ConvertFrom-Json }
catch { throw 'The local bridge metadata could not be read. Restart the bridge.' }
if (-not ($bridgeConfig.token -is [string]) -or $bridgeConfig.token -cnotmatch '\A[a-f0-9]{64}\z') {
    throw 'The local bridge token is invalid. Restart the bridge.'
}

& adb -s $Serial reverse tcp:39173 tcp:39173
if ($LASTEXITCODE -ne 0) { throw 'ADB reverse failed. Check the selected emulator with adb devices.' }
# Recreate the Activity so a new bridge session replaces any consumed initial intent.
# A cold emulator can report Status: timeout even after sys.boot_completed becomes 1.
# Retry that explicit transient result only; never report readiness on an unknown failure.
for ($attempt = 1; $attempt -le 3; $attempt++) {
    $savedPreference = $ErrorActionPreference
    try {
        # Windows PowerShell turns native stderr into ErrorRecords. Capture those too,
        # without allowing a raw intent (which can include the MIDI token) to escape.
        $ErrorActionPreference = 'Continue'
        $launchOutput = @(& adb -s $Serial shell am start -S -W -n 'com.chordviewer.debug/com.chordviewer.MainActivity' --es 'chordviewer.midi.token' $bridgeConfig.token 2>&1)
        $launchExitCode = $LASTEXITCODE
    } catch {
        $launchOutput = @($_)
        $launchExitCode = -1
    } finally { $ErrorActionPreference = $savedPreference }
    $launchText = ($launchOutput | ForEach-Object { $_.ToString() }) -join "`n"
    $launchError = $launchText -match '(?i)Error:|Exception'
    if ($launchExitCode -eq 0 -and -not $launchError -and $launchText -match '(?im)^\s*Status:\s*ok\s*$') {
        Write-Output 'Debug app launched with local MIDI forwarding. No token was printed.'
        return
    }
    if ($attempt -lt 3 -and -not $launchError -and $launchText -match '(?im)^\s*Status:\s*timeout\s*$') {
        Write-Output "Android is still starting (attempt $attempt of 3); retrying in two seconds."
        Start-Sleep -Seconds 2
        continue
    }
    # Redact before truncating, and flatten so the guardian can forward one safe line.
    $diagnostic = ($launchText.Replace($bridgeConfig.token, '[redacted]') -replace '(?i)\b[a-f0-9]{64}\b', '[redacted]') -replace '\s+', ' '
    $diagnostic = $diagnostic.Trim()
    if (-not $diagnostic) { $diagnostic = 'ADB returned no launch details.' }
    if ($diagnostic.Length -gt 1500) { $diagnostic = $diagnostic.Substring(0, 1500) + ' ...' }
    Write-Output "Android launch failed (ADB exit $launchExitCode, attempt $attempt of 3): $diagnostic"
    throw 'Could not start the debug application. See the redacted Android launch diagnostic above.'
}
