[CmdletBinding()]
param([ValidateSet('development', 'test')][string]$Environment = 'development', [string]$DevHost)

. (Join-Path $PSScriptRoot 'LocalBackend.Common.ps1')
Assert-DevelopmentHost $DevHost -RequireLocalAddress
& (Join-Path $PSScriptRoot 'Initialize-LocalBackend.ps1') -Environment $Environment
$settings = Get-LocalBackendSettings -Environment $Environment
$engine = & docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $engine -ne 'linux') {
    throw 'Start Docker Desktop with Linux containers before starting the local backend.'
}
Invoke-LocalBackendCompose -Settings $settings -DevHost $DevHost -Arguments @('config', '--quiet')
Invoke-LocalBackendCompose -Settings $settings -DevHost $DevHost -Arguments @('up', '--detach', '--build', '--wait', '--wait-timeout', '120')
Write-Host "Backend ready: http://127.0.0.1:$($settings.Port) ($($settings.Project))"
if ($DevHost) {
    Write-Host "LAN API: $(Get-DevelopmentApiOrigin $DevHost $settings.Port)"
    Write-Host "Windows Firewall must allow TCP $($settings.Port) on $DevHost for your private LAN. See docs/development/lan-development.md."
}
Write-Host 'The database is private to Docker. Stopping or rebuilding preserves its named volume.'
