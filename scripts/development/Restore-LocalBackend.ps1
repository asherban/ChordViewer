[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupDirectory, [ValidateRange(1024,65535)][int]$Port = 3002)

. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
if ($Port -in @(3000,3001)) { throw 'Restore uses a separate port; development/test ports are reserved.' }
$original = Get-LocalBackendSettings -Environment test
$root = Join-Path $original.Repository '.local\backups'
$directory = Assert-BackupLocalPath -Path $BackupDirectory -Root $root
$manifestFile = Assert-BackupLocalPath -Path (Join-Path $directory 'manifest.json') -Root $root
if (-not (Test-Path -LiteralPath $manifestFile) -or (Get-Item -LiteralPath $manifestFile).Length -gt 16384) { throw 'Completed backup manifest not found.' }
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.version -ne 1 -or $manifest.apiImage -notmatch '^sha256:[a-f0-9]{64}$' -or
    $manifest.databaseImage -notmatch '^postgres:[A-Za-z0-9.-]+@sha256:[a-f0-9]{64}$') { throw 'Invalid backup manifest.' }
foreach ($item in @(@{Name='database.dump'; Size=$manifest.databaseBytes; Hash=$manifest.databaseSha256}, @{Name='api-image.tar'; Size=$manifest.imageBytes; Hash=$manifest.imageSha256})) {
    $file = Assert-BackupLocalPath -Path (Join-Path $directory $item.Name) -Root $root
    if (-not (Test-Path -LiteralPath $file) -or $item.Size -le 0 -or $item.Size -gt 2GB -or (Get-Item -LiteralPath $file).Length -ne $item.Size -or
        $item.Hash -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Hash) { throw 'Backup archive size/hash verification failed.' }
}
# Image IDs have no mutable tag; loading this trusted local archive does not retag other projects.
$localImages = & docker image ls --quiet --no-trunc
if ($LASTEXITCODE -ne 0) { throw 'Could not list local release images.' }
if ($manifest.apiImage -notin $localImages) {
    & docker image load --input (Join-Path $directory 'api-image.tar') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not load the backed-up API image.' }
}
$imageId = & docker image inspect $manifest.apiImage --format '{{.Id}}'
if ($LASTEXITCODE -ne 0 -or $imageId -ne $manifest.apiImage) { throw 'The backed-up API image is unavailable.' }
$restoreId = [guid]::NewGuid().ToString('N').Substring(0,12)
$restoreDirectory = Assert-BackupLocalPath -Path (Join-Path $original.Directory "restore-$restoreId") -Root $original.Directory
New-Item -ItemType Directory -Path $restoreDirectory | Out-Null
Set-LocalBackendPrivateAcl -Path $restoreDirectory -Directory
$record = @{version=1; restoreId=$restoreId; port=$Port}
[IO.File]::WriteAllText((Join-Path $restoreDirectory 'restore.json'), ($record | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$settings = Get-RestoredBackendSettings -RestoreId $restoreId
$existingContainers = & docker ps --all --quiet --filter "label=com.docker.compose.project=$($settings.Project)"
if ($LASTEXITCODE -ne 0 -or $existingContainers) { throw 'Restore requires a new project with no existing containers.' }
$existingVolumes = & docker volume ls --quiet --filter "label=com.docker.compose.project=$($settings.Project)"
if ($LASTEXITCODE -ne 0 -or $existingVolumes) { throw 'Restore requires a fresh project with no existing volumes.' }
$allVolumes = & docker volume ls --quiet
if ($LASTEXITCODE -ne 0 -or "$($settings.Project)_database" -in $allVolumes) { throw 'The restore volume name is already in use.' }
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $lines = @("CHORDVIEWER_API_PORT=$Port")
    foreach ($key in @('CHORDVIEWER_DB_ADMIN_PASSWORD','CHORDVIEWER_DB_PASSWORD','CHORDVIEWER_AUTH_SECRET')) {
        $bytes = New-Object byte[] 32; $random.GetBytes($bytes)
        $lines += "$key=$([BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant())"
    }
    [IO.File]::WriteAllText($settings.EnvFile, ($lines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
} finally { $random.Dispose() }
Set-LocalBackendPrivateAcl -Path $settings.EnvFile
$override = "services:`n  api:`n    image: $($manifest.apiImage)`n    pull_policy: never`n  database:`n    image: $($manifest.databaseImage)`n"
[IO.File]::WriteAllText($settings.Override, $override, [Text.UTF8Encoding]::new($false))
try {
    # A new project means a fresh data volume. No --clean, DROP, or overwrite of an existing database.
    Invoke-LocalBackendCompose -Settings $settings -Arguments @('--file', $settings.Override, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'database')
    $database = Get-BackupContainer -Settings $settings -Service database
    & docker cp (Join-Path $directory 'database.dump') "${database}:/tmp/chordviewer-restore.dump"
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy the archive to the isolated restore target.' }
    & docker exec $database pg_restore -U postgres --role=chordviewer --no-owner --no-acl --exit-on-error --single-transaction -d chordviewer /tmp/chordviewer-restore.dump
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed; the original environment is unchanged.' }
    & docker exec $database rm -f -- /tmp/chordviewer-restore.dump
    if ($LASTEXITCODE -ne 0) { throw 'Could not remove the temporary restore archive.' }
    Invoke-LocalBackendCompose -Settings $settings -Arguments @('--file', $settings.Override, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '120')
    Write-Host "Restored backend ready: http://127.0.0.1:$Port"
    Write-Host "Restore ID: $restoreId"
    Write-Host "Stop with: .\scripts\development\Stop-RestoredBackend.ps1 -RestoreId $restoreId"
    Write-Host 'Sign in again. New environment secrets invalidate old sessions; account passwords and saved data are retained.'
} catch {
    $failure = $_
    try { Invoke-LocalBackendCompose -Settings $settings -Arguments @('--file', $settings.Override, 'down', '--timeout', '15') }
    catch { Write-Warning "Cleanup needs attention. Use Stop-RestoredBackend.ps1 -RestoreId $restoreId" }
    throw $failure
}
