# Dot-source this file to configure the current PowerShell process only.
$ErrorActionPreference = 'Stop'

$sdkCandidates = @(@(
    $env:ANDROID_HOME,
    (Join-Path $env:USERPROFILE 'DeveloperTools\Android\Sdk'),
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
) | Where-Object {
    $_ -and (Test-Path -LiteralPath (Join-Path $_ 'platform-tools\adb.exe') -PathType Leaf)
})
$localJdkRoot = Join-Path $env:USERPROFILE 'DeveloperTools\Java'
$localJdks = @(if (Test-Path -LiteralPath $localJdkRoot) {
    Get-ChildItem -LiteralPath $localJdkRoot -Directory -Filter 'jdk-21*' |
        Sort-Object Name -Descending | Select-Object -ExpandProperty FullName
})
$jdkCandidates = @(@($env:JAVA_HOME) + $localJdks | Where-Object {
    $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe'))
})

if (-not $sdkCandidates) { throw 'Android SDK with Platform Tools not found. Install it under ~/DeveloperTools/Android/Sdk or set ANDROID_HOME to an SDK containing platform-tools/adb.exe in this shell.' }
if (-not $jdkCandidates) { throw 'Build JDK 21 not found. Install JDK 21 under ~/DeveloperTools/Java or set JAVA_HOME in this shell.' }

$javaRelease = Join-Path $jdkCandidates[0] 'release'
if (-not (Test-Path -LiteralPath $javaRelease) -or
    -not (Select-String -LiteralPath $javaRelease -Pattern '^JAVA_VERSION="21[.\"]' -Quiet)) {
    throw 'This Android build requires JDK 21. Set JAVA_HOME to JDK 21; recent Android Studio bundles a newer, incompatible JDK.'
}

$env:ANDROID_HOME = $sdkCandidates[0]
$env:JAVA_HOME = $jdkCandidates[0]
$androidCommandPaths = @(
    (Join-Path $env:JAVA_HOME 'bin'),
    (Join-Path $env:ANDROID_HOME 'platform-tools'),
    (Join-Path $env:ANDROID_HOME 'emulator'),
    (Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin')
)
$env:PATH = (($androidCommandPaths + ($env:PATH -split ';')) | Select-Object -Unique) -join ';'
Write-Host "Android SDK: $env:ANDROID_HOME"
Write-Host "Build JDK: $env:JAVA_HOME"
