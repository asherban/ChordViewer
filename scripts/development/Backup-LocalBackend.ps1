[CmdletBinding()]
param([ValidateSet('development', 'test')][string]$Environment = 'development')

. (Join-Path $PSScriptRoot 'Backup.Common.ps1')
$settings = Get-LocalBackendSettings -Environment $Environment
Test-LocalBackendEnvironment -Settings $settings
$database = Get-BackupContainer -Settings $settings -Service database
$api = Get-BackupContainer -Settings $settings -Service api
$apiImage = & docker inspect --format '{{.Image}}' $api
if ($LASTEXITCODE -ne 0 -or $apiImage -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Could not identify the running API image.' }
$databaseImage = & docker inspect --format '{{.Config.Image}}' $database
if ($LASTEXITCODE -ne 0 -or $databaseImage -notmatch '^postgres:[A-Za-z0-9.-]+@sha256:[a-f0-9]{64}$') { throw 'The database must use a pinned PostgreSQL image.' }
$root = Join-Path $settings.Repository '.local\backups'
$backupId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$directory = Assert-BackupLocalPath -Path (Join-Path $root $backupId) -Root $root
New-Item -ItemType Directory -Path $root -Force | Out-Null
Set-LocalBackendPrivateAcl -Path $root -Directory
New-Item -ItemType Directory -Path $directory | Out-Null
Set-LocalBackendPrivateAcl -Path $directory -Directory
$dump = Join-Path $directory 'database.dump'
$image = Join-Path $directory 'api-image.tar'
$containerDump = "/tmp/chordviewer-$backupId.dump"
try {
    # The generated path contains no whitespace or shell metacharacters; compatible with Windows PowerShell 5.1.
    & docker exec $database sh -c 'umask 077; pg_dump -U postgres --format=custom --file=$1 chordviewer' sh $containerDump
    if ($LASTEXITCODE -ne 0) { throw 'Database backup failed; no completed backup manifest was written.' }
    & docker cp "${database}:$containerDump" $dump
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy the database archive.' }
    & docker image save --output $image $apiImage
    if ($LASTEXITCODE -ne 0) { throw 'Could not archive the API release image.' }
    Set-LocalBackendPrivateAcl -Path $dump
    Set-LocalBackendPrivateAcl -Path $image
    $manifest = [ordered]@{ version = 1; createdAt = [DateTime]::UtcNow.ToString('o'); sourceEnvironment = $Environment
        databaseImage = $databaseImage; apiImage = $apiImage
        databaseBytes = (Get-Item -LiteralPath $dump).Length; databaseSha256 = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant()
        imageBytes = (Get-Item -LiteralPath $image).Length; imageSha256 = (Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash.ToLowerInvariant() }
    [IO.File]::WriteAllText((Join-Path $directory 'manifest.json'), ($manifest | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    Write-Host "Backup complete: $directory"
    Write-Host 'Keep this private: it contains account/password-hash and sheet data. Copy it to separate protected storage for disaster recovery.'
} finally {
    & docker exec $database rm -f -- $containerDump | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning 'The temporary archive could not be removed from the source container.' }
}
