Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LocalBackendSettings {
    param([ValidateSet('development', 'test')][string]$Environment)
    $repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    $directory = Join-Path $repository '.local\backend'
    foreach ($candidate in @((Join-Path $repository '.local'), $directory, (Join-Path $directory "$Environment.env"))) {
        if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "The local backend settings path must not contain a symbolic link or junction: $candidate"
        }
    }
    [pscustomobject]@{
        Repository = $repository
        Directory = $directory
        EnvFile = Join-Path $directory "$Environment.env"
        ComposeFile = Join-Path $repository 'infra\backend\compose.yaml'
        Project = "chordviewer-$Environment"
        Port = $(if ($Environment -eq 'development') { 3000 } else { 3001 })
    }
}

function Set-LocalBackendPrivateAcl {
    param([Parameter(Mandatory)][string]$Path, [switch]$Directory)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    if ($Directory) {
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    } else {
        $acl = [Security.AccessControl.FileSecurity]::new()
        $inherit = [Security.AccessControl.InheritanceFlags]::None
    }
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($identity)
    foreach ($sid in @($identity, $system)) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', $inherit, 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    # Set-Acl can try to rewrite audit rules on repeated calls in Windows PowerShell.
    # The .NET API persists only the access/owner sections changed above.
    $item = Get-Item -LiteralPath $Path -Force
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        [IO.FileSystemAclExtensions]::SetAccessControl($item, $acl)
    } else {
        $item.SetAccessControl($acl)
    }
}

function Test-LocalBackendEnvironment {
    param([Parameter(Mandatory)]$Settings)
    if (-not (Test-Path -LiteralPath $Settings.EnvFile -PathType Leaf)) {
        throw 'Local backend settings are missing. Run Initialize-LocalBackend.ps1 first.'
    }
    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines($Settings.EnvFile)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^([A-Z_]+)=([a-z0-9]+)$' -or $values.ContainsKey($Matches[1])) {
            throw 'Local backend settings are invalid. Keep the original generated settings; do not replace credentials for an existing database volume.'
        }
        $values[$Matches[1]] = $Matches[2]
    }
    if ($values.Count -ne 4 -or $values['CHORDVIEWER_API_PORT'] -ne [string]$Settings.Port) {
        throw 'Local backend settings have an unexpected port or key set.'
    }
    foreach ($name in @('CHORDVIEWER_DB_PASSWORD', 'CHORDVIEWER_DB_ADMIN_PASSWORD', 'CHORDVIEWER_AUTH_SECRET')) {
        if ($values[$name] -notmatch '^[a-f0-9]{64}$') { throw 'Local backend settings contain an invalid credential.' }
    }
}

function Invoke-LocalBackendCompose {
    param([Parameter(Mandatory)]$Settings, [Parameter(Mandatory)][string[]]$Arguments)
    Test-LocalBackendEnvironment -Settings $Settings
    # An explicit env file bypasses the repository's unrelated private .env.
    # Shell values normally outrank --env-file, so temporarily remove only our own keys.
    $keys = @('CHORDVIEWER_API_PORT', 'CHORDVIEWER_DB_PASSWORD', 'CHORDVIEWER_DB_ADMIN_PASSWORD', 'CHORDVIEWER_AUTH_SECRET', 'COMPOSE_ENV_FILES', 'COMPOSE_PROFILES')
    $previous = @{}
    try {
        foreach ($key in $keys) {
            $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
        }
        & docker compose --project-name $Settings.Project --env-file $Settings.EnvFile --file $Settings.ComposeFile @Arguments
        if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed with exit code $LASTEXITCODE for $($Settings.Project)." }
    } finally {
        foreach ($key in $keys) {
            if ($null -eq $previous[$key]) {
                Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
            } else {
                [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
            }
        }
    }
}
