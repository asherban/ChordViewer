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
# Recreate the diagnostic Activity so a new bridge session replaces any consumed initial intent.
$launchOutput = & adb -s $Serial shell am start -S -W -n 'com.chordviewer.debug/com.chordviewer.MainActivity' --es 'chordviewer.midi.token' $bridgeConfig.token 2>&1
if ($LASTEXITCODE -ne 0 -or "$launchOutput" -match '(?i)Error:|Exception' -or "$launchOutput" -notmatch 'Status:\s*ok') {
    throw 'Could not start the debug application. Build and install it, then verify the selected emulator. Launch output is withheld to protect the session token.'
}
Write-Output 'Debug app launched with local MIDI forwarding. No token was printed.'
