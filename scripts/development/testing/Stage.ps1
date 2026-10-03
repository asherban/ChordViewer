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
    'android' {
        # A cold owned emulator can time out once boot_completed is already 1.
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            $previousPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                $output = @(& adb -s $Serial shell am start -S -W -n 'com.chordviewer.debug/com.chordviewer.MainActivity' 2>&1)
                $exitCode = $LASTEXITCODE
            } finally { $ErrorActionPreference = $previousPreference }
            $text = ($output | ForEach-Object { $_.ToString() }) -join "`n"
            $failed = $text -match '(?i)Error:|Exception'
            if ($exitCode -eq 0 -and -not $failed -and $text -match '(?im)^\s*Status:\s*ok\s*$') {
                Write-Host 'Native app opened for UI and backend testing.'
                return
            }
            if (-not $failed -and $text -match '(?im)^\s*Status:\s*timeout\s*$' -and $attempt -lt 3) {
                Start-Sleep -Seconds 2
                continue
            }
            throw "Android launch failed (ADB exit $exitCode): $text"
        }
    }
}
