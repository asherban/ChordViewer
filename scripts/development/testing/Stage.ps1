param([ValidateSet('build', 'backend', 'web', 'android')][string]$Stage,
    [ValidateSet('development', 'test')][string]$Environment = 'development',
    [string]$SessionDirectory,
    [ValidatePattern('^emulator-[0-9]+$')][string]$Serial = 'emulator-5560')
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
Set-Location -LiteralPath $repository
switch ($Stage) {
    'build' {
        & npm.cmd run build -w '@chordviewer/contracts'
        if ($LASTEXITCODE -ne 0) { throw 'Contract build failed.' }
        & (Join-Path $repository 'apps/android/gradlew.bat') -p apps/android --no-daemon --max-workers=1 :app:assembleDebug
        if ($LASTEXITCODE -ne 0) { throw 'Android debug build failed.' }
    }
    'backend' {
        . (Join-Path $repository 'scripts/development/LocalBackend.Common.ps1')
        & (Join-Path $repository 'scripts/development/Initialize-LocalBackend.ps1') -Environment $Environment
        $settings = Get-LocalBackendSettings -Environment $Environment
        Invoke-LocalBackendCompose -Settings $settings -Arguments @('--file', (Join-Path $SessionDirectory 'compose-session.yaml'), 'up', '--detach', '--build', '--wait', '--wait-timeout', '120')
    }
    'web' {
        $env:API_PROXY_TARGET = if ($Environment -eq 'test') { 'http://127.0.0.1:3001' } else { 'http://127.0.0.1:3000' }
        & npm.cmd run dev
        if ($LASTEXITCODE -ne 0) { throw 'Web development server stopped.' }
    }
    'android' { & (Join-Path $repository 'scripts/development/Connect-AndroidMidi.ps1') -Serial $Serial }
}
