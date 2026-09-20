[CmdletBinding()]
param([ValidateSet('development', 'test')][string]$Environment = 'development')

. (Join-Path $PSScriptRoot 'LocalBackend.Common.ps1')
$settings = Get-LocalBackendSettings -Environment $Environment
if (-not (Test-Path -LiteralPath $settings.Directory)) {
    New-Item -ItemType Directory -Path $settings.Directory -Force | Out-Null
}
Set-LocalBackendPrivateAcl -Path $settings.Directory -Directory

if (-not (Test-Path -LiteralPath $settings.EnvFile)) {
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $lines = @("CHORDVIEWER_API_PORT=$($settings.Port)")
        foreach ($name in @('CHORDVIEWER_DB_ADMIN_PASSWORD', 'CHORDVIEWER_DB_PASSWORD', 'CHORDVIEWER_AUTH_SECRET')) {
            $bytes = New-Object byte[] 32
            $random.GetBytes($bytes)
            $secret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
            $lines += "$name=$secret"
        }
        $content = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n") + "`n")
        $stream = [IO.File]::Open($settings.EnvFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($content, 0, $content.Length) } finally { $stream.Dispose() }
    } finally {
        $random.Dispose()
    }
}
Set-LocalBackendPrivateAcl -Path $settings.EnvFile
Test-LocalBackendEnvironment -Settings $settings
Write-Host "Local backend settings ready for $Environment. Existing credentials were preserved."
Write-Host "Private settings: $($settings.EnvFile)"
