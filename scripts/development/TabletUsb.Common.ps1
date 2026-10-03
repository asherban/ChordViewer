# Physical-tablet session resources. Never stops the product app or changes the default USB function.
if (-not ('ChordViewer.Testing.ChildProcess' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'testing/ProcessHost.cs') }

function Invoke-TabletAdb {
    param([string]$Serial, [string[]]$Arguments, [switch]$AllowFailure, [int]$TimeoutSeconds = 10)
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = 'adb.exe'
    $start.Arguments = [ChordViewer.Testing.ChildProcess]::JoinArguments(@('-s', $Serial) + $Arguments)
    $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill(); $process.WaitForExit()
            throw 'The selected tablet did not answer ADB before the timeout.'
        }
        $result = [pscustomobject]@{ ExitCode = $process.ExitCode; Text = ($stdout.Result + $stderr.Result).Trim() }
        if (-not $AllowFailure -and $result.ExitCode -ne 0) { throw "Tablet ADB operation failed: $($result.Text)" }
        return $result
    } finally { $process.Dispose() }
}

function Get-TabletReverseMappings([string]$Serial) {
    $text = (Invoke-TabletAdb $Serial @('reverse', '--list')).Text
    return @($text -split '\r?\n' | ForEach-Object {
        $parts = $_ -split '\s+'
        if ($parts.Count -eq 3) { [pscustomobject]@{ Local = $parts[1]; Remote = $parts[2] } }
    })
}

function Restore-TabletMappings($Context) {
    foreach ($mapping in $Context.OriginalMappings) {
        $current = @(Get-TabletReverseMappings $Context.Serial | Where-Object { $_.Local -eq $mapping.Local })
        if ($current.Count -gt 0 -and $current[0].Remote -ne $mapping.Remote) { throw "A reverse mapping for $($mapping.Local) changed; it was not overwritten." }
        if ($current.Count -eq 0) { $null = Invoke-TabletAdb $Context.Serial @('reverse', '--no-rebind', $mapping.Local, $mapping.Remote) }
    }
}

function New-TabletUsbContext([string]$Serial, [int]$BackendPort) {
    if ($Serial -match '^emulator-' -or $Serial -notmatch '\A[A-Za-z0-9._:-]+\z') { throw 'Choose a physical USB tablet serial from adb devices.' }
    if ((Invoke-TabletAdb $Serial @('get-state')).Text -ne 'device') { throw 'Authorize USB debugging on the selected tablet first.' }
    $original = (Invoke-TabletAdb $Serial @('shell', 'getprop', 'sys.usb.config')).Text
    $default = (Invoke-TabletAdb $Serial @('shell', 'getprop', 'persist.sys.usb.config')).Text
    $mappings = @(Get-TabletReverseMappings $Serial)
    $backend = @($mappings | Where-Object { $_.Local -eq 'tcp:3000' })
    if ($backend.Count -gt 0 -and $backend[0].Remote -ne "tcp:$BackendPort") { throw 'The tablet backend mapping conflicts with this session. It was not changed.' }
    $functions = @($original -split ',' | Where-Object { $_ -and $_ -ne 'adb' }) -join ','
    if ($functions -notin @('', 'none', 'sec_charging', 'mtp', 'ptp', 'rndis', 'midi')) {
        throw 'The current USB function cannot be safely restored by this launcher. Select MIDI manually, then retry.'
    }
    if ($functions -eq 'sec_charging' -and $default -ne $original) {
        throw 'The current Samsung charging function differs from its default. Select MIDI manually, then retry.'
    }
    return [pscustomobject]@{ Serial = $Serial; BackendPort = $BackendPort; OriginalUsb = $original;
        OriginalDefault = $default; PreviousFunctions = $functions; OriginalMappings = $mappings;
        ChangedUsb = $false; ExpectedUsb = $null; OwnBackend = $false }
}

function Wait-TabletUsb($Context, [string]$Expected, [switch]$Midi) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 20) {
        try {
            $current = (Invoke-TabletAdb $Context.Serial @('shell', 'getprop', 'sys.usb.config') -TimeoutSeconds 2).Text
            if (($Midi -and 'midi' -in ($current -split ',')) -or (-not $Midi -and $current -eq $Expected)) { return $current }
        } catch { }
        Start-Sleep -Milliseconds 200
    }
    throw 'USB re-enumeration did not reach the expected configuration within twenty seconds.'
}

function Enable-TabletUsbMidi($Context) {
    if ('midi' -notin ($Context.OriginalUsb -split ',')) {
        $Context.ChangedUsb = $true
        # The command can lose its own ADB connection with exit 255. Effective state is authoritative.
        $Context.ExpectedUsb = 'midi,adb'
        $null = Invoke-TabletAdb $Context.Serial @('shell', 'svc', 'usb', 'setFunctions', 'midi') -AllowFailure
    }
    $Context.ExpectedUsb = Wait-TabletUsb $Context -Midi
    Restore-TabletMappings $Context
    $null = Sync-TabletBackend $Context
}

function Sync-TabletBackend($Context) {
    try {
    $state = Invoke-TabletAdb $Context.Serial @('get-state') -AllowFailure -TimeoutSeconds 2
    if ($state.ExitCode -ne 0 -or $state.Text -ne 'device') { return $false }
    $current = @(Get-TabletReverseMappings $Context.Serial | Where-Object { $_.Local -eq 'tcp:3000' })
    $remote = "tcp:$($Context.BackendPort)"
    if ($current.Count -gt 0 -and $current[0].Remote -ne $remote) { throw 'The tablet backend mapping was changed by another session; it was not overwritten.' }
    if ($current.Count -eq 0) {
        $null = Invoke-TabletAdb $Context.Serial @('reverse', '--no-rebind', 'tcp:3000', $remote)
        if (-not @($Context.OriginalMappings | Where-Object { $_.Local -eq 'tcp:3000' }).Count) { $Context.OwnBackend = $true }
    }
    return $true
    } catch {
        # Cable removal can race any ADB operation, including enumeration and creation.
        if ($_.Exception.Message -match '(?i)device .*not found|device offline|no devices|transport|connection.*closed|disconnected|did not answer ADB|closed$') { return $false }
        throw
    }
}

function Close-TabletUsbSession($Context) {
    if ($Context.OwnBackend) {
        $mapping = @(Get-TabletReverseMappings $Context.Serial | Where-Object { $_.Local -eq 'tcp:3000' })
        if ($mapping.Count -gt 0 -and $mapping[0].Remote -eq "tcp:$($Context.BackendPort)") {
            $null = Invoke-TabletAdb $Context.Serial @('reverse', '--remove', 'tcp:3000')
        }
    }
    if ($Context.ChangedUsb) {
        $current = (Invoke-TabletAdb $Context.Serial @('shell', 'getprop', 'sys.usb.config')).Text
        $default = (Invoke-TabletAdb $Context.Serial @('shell', 'getprop', 'persist.sys.usb.config')).Text
        if ($current -eq $Context.ExpectedUsb -and $default -eq $Context.OriginalDefault) {
            $arguments = @('shell', 'svc', 'usb', 'setFunctions')
            if ($Context.PreviousFunctions -notin @('', 'none', 'sec_charging')) { $arguments += $Context.PreviousFunctions }
            $null = Invoke-TabletAdb $Context.Serial $arguments -AllowFailure
            $null = Wait-TabletUsb $Context $Context.OriginalUsb
        } else { Write-Warning 'USB settings changed during the session; the newer settings were preserved.' }
    }
    Restore-TabletMappings $Context
}
