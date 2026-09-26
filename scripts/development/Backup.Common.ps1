. (Join-Path $PSScriptRoot 'LocalBackend.Common.ps1')

function Assert-BackupLocalPath {
    param([string]$Path, [string]$Root)
    $resolved = [IO.Path]::GetFullPath($Path)
    $boundary = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup paths must stay inside the private backup directory.' }
    $candidate = $resolved
    while ($candidate.Length -ge $boundary.TrimEnd('\').Length) {
        if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Backup and restore paths must not contain symbolic links or junctions.'
        }
        $candidate = Split-Path -Parent $candidate
    }
    return $resolved
}

function Get-BackupContainer {
    param($Settings, [ValidateSet('api', 'database')][string]$Service)
    $name = "$($Settings.Project)-$Service-1"
    $raw = & docker inspect --format '{{json .Config.Labels}}' $name
    if ($LASTEXITCODE -ne 0) { throw "Could not identify the expected $Service container." }
    $labels = $raw | ConvertFrom-Json
    $running = & docker inspect --format '{{.State.Running}}' $name
    if ($LASTEXITCODE -ne 0 -or $labels.'com.docker.compose.project' -ne $Settings.Project -or
        $labels.'com.docker.compose.service' -ne $Service -or $running -ne 'true') { throw "The expected $Service container is not running in $($Settings.Project)." }
    return $name
}

function Get-RestoredBackendSettings {
    param([ValidatePattern('^[a-f0-9]{12}$')][string]$RestoreId)
    $original = Get-LocalBackendSettings -Environment test
    $directory = Join-Path $original.Directory "restore-$RestoreId"
    $registry = Assert-BackupLocalPath -Path (Join-Path $directory 'restore.json') -Root $original.Directory
    if (-not (Test-Path -LiteralPath $registry) -or (Get-Item -LiteralPath $registry).Length -gt 16384) { throw 'Restore record not found or invalid.' }
    $record = Get-Content -LiteralPath $registry -Raw | ConvertFrom-Json
    if ($record.version -ne 1 -or $record.restoreId -ne $RestoreId -or $record.port -lt 1024 -or $record.port -gt 65535 -or $record.port -in @(3000,3001)) { throw 'Invalid restore record.' }
    [pscustomobject]@{ Repository = $original.Repository; Directory = $directory; EnvFile = Join-Path $directory 'restore.env'
        ComposeFile = $original.ComposeFile; Project = "chordviewer-restore-$RestoreId"; Port = [int]$record.port; Override = Join-Path $directory 'compose.yaml' }
}
