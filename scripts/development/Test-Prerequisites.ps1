[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$name, [bool]$ready, [string]$detail) {
    $checks.Add([pscustomobject]@{ Component = $name; Ready = $ready; Detail = $detail })
}

foreach ($commandName in @('node', 'npm', 'docker')) {
    $commandInfo = Get-Command $commandName -ErrorAction SilentlyContinue
    Add-Check $commandName ([bool]$commandInfo) $(if ($commandInfo) { $commandInfo.Source } else { 'Not found; use a normal development shell with the installed tool on PATH.' })
}

try {
    . (Join-Path $PSScriptRoot 'Initialize-AndroidEnvironment.ps1')
    Add-Check 'Build JDK' $true $env:JAVA_HOME
    Add-Check 'Android SDK' $true $env:ANDROID_HOME
    foreach ($relativeTool in @('platform-tools\adb.exe', 'emulator\emulator.exe', 'cmdline-tools\latest\bin\sdkmanager.bat')) {
        $toolPath = Join-Path $env:ANDROID_HOME $relativeTool
        Add-Check $relativeTool (Test-Path -LiteralPath $toolPath -PathType Leaf) $toolPath
    }
} catch {
    Add-Check 'Android environment' $false $_.Exception.Message
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $engineResult = & docker info --format '{{.OSType}}' 2>&1
    Add-Check 'Docker Linux engine' ($LASTEXITCODE -eq 0 -and "$engineResult" -eq 'linux') $(if ($LASTEXITCODE -eq 0) { "$engineResult" } else { 'Start Docker Desktop with its Linux engine, then rerun this check.' })
}

$checks | Format-Table -AutoSize -Wrap
if ($checks.Where({ -not $_.Ready }).Count -gt 0) { exit 1 }
