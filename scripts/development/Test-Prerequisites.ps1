[CmdletBinding()]
param([switch]$RequireContainers)

$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$name, [bool]$ready, [string]$detail) {
    $checks.Add([pscustomobject]@{ Component = $name; Ready = $ready; Detail = $detail })
}

foreach ($commandName in @('node', 'npm')) {
    $commandInfo = Get-Command $commandName -ErrorAction SilentlyContinue
    Add-Check $commandName ([bool]$commandInfo) $(if ($commandInfo) { $commandInfo.Source } else { 'Not found; use a normal development shell with the installed tool on PATH.' })
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $requiredNode = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\..\.node-version') -Raw).Trim()
    $actualNode = (& node --version).TrimStart('v')
    Add-Check 'Pinned Node version' ($actualNode -eq $requiredNode) "Expected $requiredNode; found $actualNode. Run fnm env --shell powershell | Out-String | Invoke-Expression, then fnm use."
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

if ($RequireContainers -and (Get-Command docker -ErrorAction SilentlyContinue)) {
    $engineResult = & docker info --format '{{.OSType}}' 2>&1
    Add-Check 'Docker Linux engine' ($LASTEXITCODE -eq 0 -and "$engineResult" -eq 'linux') $(if ($LASTEXITCODE -eq 0) { "$engineResult" } else { 'Start Docker Desktop with its Linux engine, then rerun this check.' })
} elseif ($RequireContainers) {
    Add-Check 'Docker' $false 'Install/start Docker Desktop with its Linux engine for M3 container development.'
}

$checks | Format-Table -AutoSize -Wrap
if ($checks.Where({ -not $_.Ready }).Count -gt 0) { exit 1 }
