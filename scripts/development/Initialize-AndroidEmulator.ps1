[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Initialize-AndroidEnvironment.ps1')

$avdName = 'ChordViewerTabletLocal'
$package = 'system-images;android-35;default;x86_64'
$avdManager = Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin\avdmanager.bat'
$imageDirectory = [IO.Path]::GetFullPath((Join-Path $env:ANDROID_HOME 'system-images\android-35\default\x86_64'))
if (-not (Test-Path -LiteralPath $avdManager -PathType Leaf)) { throw 'avdmanager is missing. Install the Android SDK command-line tools first.' }
if (-not (Test-Path -LiteralPath (Join-Path $imageDirectory 'system.img') -PathType Leaf)) {
    throw "Install the required system image first: sdkmanager `"$package`""
}

$selectedRoot = if ([string]::IsNullOrWhiteSpace($env:ANDROID_AVD_HOME)) {
    Join-Path $env:USERPROFILE '.android\avd'
} else { $env:ANDROID_AVD_HOME }
if ($selectedRoot -notmatch '\A(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)') {
    throw 'ANDROID_AVD_HOME must be an absolute Windows directory path.'
}
$avdRoot = [IO.Path]::GetFullPath($selectedRoot)
if ($avdRoot.Length -gt [IO.Path]::GetPathRoot($avdRoot).Length) { $avdRoot = $avdRoot.TrimEnd('\', '/') }
$avdDirectory = [IO.Path]::GetFullPath((Join-Path $avdRoot "$avdName.avd"))
$indexPath = Join-Path $avdRoot "$avdName.ini"
$configPath = Join-Path $avdDirectory 'config.ini'
if ([IO.Path]::GetDirectoryName($avdDirectory).TrimEnd('\', '/') -ne $avdRoot.TrimEnd('\', '/')) {
    throw 'The resolved AVD directory is outside the selected AVD root.'
}
# An explicit root and --path keep creation/lookup consistent even with a custom ANDROID_USER_HOME.
# This affects this PowerShell process only; no machine/user environment setting is changed.
$env:ANDROID_AVD_HOME = $avdRoot

$settings = [ordered]@{
    'hw.lcd.width' = '1280'
    'hw.lcd.height' = '800'
    'hw.lcd.density' = '160'
    'hw.ramSize' = '2560'
    'hw.cpu.ncore' = '1'
    'hw.gpu.enabled' = 'yes'
    'hw.gpu.mode' = 'host'
}
function Read-AvdIni([string]$Path) {
    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*([^#;][^=]*?)\s*=(.*)$') { $values[$matches[1].Trim()] = $matches[2].Trim() }
    }
    return $values
}
function Assert-AvdRegistration {
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf) -or -not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        throw "The AVD profile is incomplete at $avdDirectory. Inspect its .ini registration and config.ini before retrying; this helper will not overwrite or delete it."
    }
    $index = Read-AvdIni $indexPath
    if (-not $index['path'] -or [IO.Path]::GetFullPath($index['path']) -ne $avdDirectory) {
        throw "The existing $avdName registration points outside the expected directory $avdDirectory. Review $indexPath or choose a different ANDROID_AVD_HOME; no existing profile will be rewritten."
    }
}
function Assert-AvdProfile {
    Assert-AvdRegistration
    $values = Read-AvdIni $configPath
    $differences = New-Object 'Collections.Generic.List[string]'
    foreach ($key in $settings.Keys) {
        if ($values[$key] -ne $settings[$key]) { $differences.Add("${key}: expected $($settings[$key]), found '$($values[$key])'") }
    }
    foreach ($key in @('hw.device.name', 'abi.type')) {
        $expected = if ($key -eq 'hw.device.name') { 'pixel_tablet' } else { 'x86_64' }
        if ($values[$key] -ne $expected) { $differences.Add("${key}: expected $expected, found '$($values[$key])'") }
    }
    $imageReference = [string]$values['image.sysdir.1']
    $configuredImage = if ([string]::IsNullOrWhiteSpace($imageReference)) { '' }
    elseif ([IO.Path]::IsPathRooted($imageReference)) { [IO.Path]::GetFullPath($imageReference).TrimEnd('\', '/') }
    else { [IO.Path]::GetFullPath((Join-Path $env:ANDROID_HOME $imageReference)).TrimEnd('\', '/') }
    if ($configuredImage -ne $imageDirectory) { $differences.Add("image.sysdir.1: expected the installed $package image") }
    if ($differences.Count -gt 0) {
        throw ("AVD '$avdName' differs from the required local profile:`n" + ($differences -join "`n") +
            "`nStop that AVD, review and update $configPath manually, then rerun this helper. Existing profiles are never modified automatically.")
    }
}

if ((Test-Path -LiteralPath $indexPath) -or (Test-Path -LiteralPath $avdDirectory)) {
    Assert-AvdProfile
    Write-Host "Existing AVD '$avdName' matches the local development profile."
} else {
    $null = New-Item -ItemType Directory -Path $avdRoot -Force
    $previousErrorPreference = $ErrorActionPreference
    try {
        # Preserve native stderr for diagnostics without treating avdmanager progress as a PowerShell error.
        $ErrorActionPreference = 'Continue'
        $creationOutput = 'no' | & $avdManager create avd --name $avdName --package $package --device 'pixel_tablet' --path $avdDirectory 2>&1
        $creationExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorPreference }
    if ($creationExit -ne 0) {
        throw "avdmanager failed with exit code $creationExit. Review the required image/device profile and any partial files at $avdDirectory. Nothing was deleted.`n$($creationOutput -join "`n")"
    }
    Assert-AvdRegistration
    if (((Get-Item -LiteralPath $avdDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        ((Get-Item -LiteralPath $configPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'The newly created AVD directory or config is a reparse point. Its config will not be edited.'
    }
    # Edit only the new profile created successfully above, preserving every unrelated avdmanager setting.
    $updated = New-Object 'Collections.Generic.List[string]'
    $seen = @{}
    foreach ($line in [IO.File]::ReadAllLines($configPath)) {
        if ($line -match '^\s*([^#;][^=]*?)\s*=(.*)$' -and $settings.Contains($matches[1].Trim())) {
            $key = $matches[1].Trim()
            $updated.Add("$key=$($settings[$key])")
            $seen[$key] = $true
        } else { $updated.Add($line) }
    }
    foreach ($key in $settings.Keys) { if (-not $seen.ContainsKey($key)) { $updated.Add("$key=$($settings[$key])") } }
    [IO.File]::WriteAllLines($configPath, $updated.ToArray(), (New-Object Text.UTF8Encoding($false)))
    Assert-AvdProfile
    Write-Host "Created AVD '$avdName' at $avdDirectory."
}

Write-Host 'In a shell initialized with Initialize-AndroidEnvironment.ps1, start it with:'
Write-Host ('$env:ANDROID_AVD_HOME = ' + "'" + $avdRoot.Replace("'", "''") + "'")
Write-Host 'emulator -avd ChordViewerTabletLocal -memory 2560 -cores 1 -no-snapshot -gpu host -feature -Vulkan'
Write-Host 'Optional: append -no-window -no-audio for a hidden, silent emulator. This helper does not launch it.'
