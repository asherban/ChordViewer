[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{12}$')][string]$RestoreId)
. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$settings = Get-RestoredBackendSettings -RestoreId $RestoreId
Invoke-LocalBackendCompose -Settings $settings -Arguments @('--file', $settings.Override, 'down', '--timeout', '15')
Write-Host "Stopped $($settings.Project). Its restored data volume and private settings are preserved."
