[CmdletBinding()]
param([ValidateSet('development', 'test')][string]$Environment = 'development')

. (Join-Path $PSScriptRoot 'LocalBackend.Common.ps1')
$settings = Get-LocalBackendSettings -Environment $Environment
Invoke-LocalBackendCompose -Settings $settings -Arguments @('down', '--timeout', '15')
Write-Host "Stopped $($settings.Project). Database data and private credentials were preserved."
