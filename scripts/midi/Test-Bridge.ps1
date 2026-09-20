[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'WinMmMidi.cs')
function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "FAILED: $Message" }
}
function Open-Client {
    $connection = New-Object System.Net.Sockets.TcpClient
    $connection.ReceiveTimeout = 2000
    $connection.SendTimeout = 2000
    $connection.Connect('127.0.0.1', 39173)
    return $connection
}
function Write-Line($Connection, [string]$Line) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Line + "`n")
    $Connection.GetStream().Write($bytes, 0, $bytes.Length)
}
function Read-Line($Connection) {
    $bytes = New-Object 'System.Collections.Generic.List[byte]'
    while ($bytes.Count -lt 1024) {
        try { $next = $Connection.GetStream().ReadByte() }
        catch {
            $cause = $_.Exception.GetBaseException()
            if ($cause -is [Net.Sockets.SocketException] -and $cause.SocketErrorCode -eq [Net.Sockets.SocketError]::ConnectionReset) { return $null }
            throw
        }
        if ($next -eq -1) { return $null }
        if ($next -eq 10) { return [Text.Encoding]::UTF8.GetString($bytes.ToArray()) }
        $bytes.Add([byte]$next)
    }
    throw 'Server sent an oversized frame.'
}
function Assert-Rejected([byte[]]$Bytes) {
    $connection = Open-Client
    try {
        $connection.GetStream().Write($Bytes, 0, $Bytes.Length)
        # Read-Line accepts a reset connection, but a timeout still fails the test.
        Assert-True ($null -eq (Read-Line $connection)) 'Rejected client received no frames'
    } finally { $connection.Dispose() }
}
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
try { $random.GetBytes($bytes) } finally { $random.Dispose() }
$token = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
$hello = '{"type":"hello","token":"' + $token + '"}'
Assert-True ([ChordViewer.LocalMidi.Protocol]::Authenticate($hello, $token)) 'Valid hello'
Assert-True ([ChordViewer.LocalMidi.Protocol]::Authenticate(('{"token":"' + $token + '","type":"hello"}'), $token)) 'Property order is independent'
Assert-True (-not [ChordViewer.LocalMidi.Protocol]::Authenticate(($hello + 'extra'), $token)) 'Trailing data is rejected'
Assert-True (-not [ChordViewer.LocalMidi.Protocol]::Authenticate(('{"type":"hello","token":"' + $token + '","token":"' + $token + '"}'), $token)) 'Duplicate properties are rejected'
Assert-True ([ChordViewer.LocalMidi.Protocol]::MessageLength(0x403cc0) -eq 2) 'Program changes have two bytes'
Assert-True ([ChordViewer.LocalMidi.Protocol]::MessageLength(0x807f90) -eq 0) 'Invalid data byte is rejected'
Assert-True ([ChordViewer.LocalMidi.Protocol]::MessageLength(0xf8) -eq 0) 'Clock is filtered'
$bridge = New-Object ChordViewer.LocalMidi.Bridge($token)
$sender = $null
$connection = $null
try {
    $bridge.Start()
    Assert-Rejected ([Text.Encoding]::UTF8.GetBytes('{"type":"hello","token":"' + ('0' * 64) + '"}' + "`n"))
    Assert-Rejected ([Text.Encoding]::UTF8.GetBytes(('x' * 600) + "`n"))
    Assert-Rejected ([byte[]]@(255, 10))
    $connection = Open-Client
    $connection.ReceiveTimeout = 6000
    $deadline = [Diagnostics.Stopwatch]::StartNew()
    Assert-True ($null -eq (Read-Line $connection)) 'Silent client is disconnected'
    Assert-True ($deadline.ElapsedMilliseconds -lt 5500) 'Authentication has a bounded deadline'
    $connection.Dispose()
    $connection = Open-Client
    Write-Line $connection $hello
    $reset = Read-Line $connection | ConvertFrom-Json
    Assert-True ($reset.type -eq 'reset' -and $reset.sequence -eq 0) 'Authenticated session starts with reset'
    $sender = New-Object ChordViewer.LocalMidi.Sender
    $events = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'fixtures/smoke.json') | ConvertFrom-Json).events
    $previousTimestamp = 0
    $sequence = 0
    foreach ($event in $events) {
        $sender.Send([int[]]$event.data)
        $frame = Read-Line $connection | ConvertFrom-Json
        $sequence++
        Assert-True ($frame.type -eq 'midi' -and $frame.sequence -eq $sequence) 'MIDI frame sequence is contiguous'
        Assert-True (($frame.data -join ',') -eq ($event.data -join ',')) 'Real LoopBe bytes are preserved'
        Assert-True ($frame.timestampMs -ge $previousTimestamp) 'Timestamps are monotonic'
        $previousTimestamp = $frame.timestampMs
    }
    # Send a held note, disconnect, then reconnect: the prior session must not be replayed.
    $sender.Send([int[]]@(144, 70, 96))
    $null = Read-Line $connection
    $connection.Dispose()
    $connection = Open-Client
    Write-Line $connection $hello
    $reset = Read-Line $connection | ConvertFrom-Json
    Assert-True ($reset.type -eq 'reset' -and $reset.sequence -eq 0) 'Reconnection resets state and sequence'
    $sender.Send([int[]]@(128, 70, 0))
    $frame = Read-Line $connection | ConvertFrom-Json
    Assert-True ($frame.sequence -eq 1 -and ($frame.data -join ',') -eq '128,70,0') 'No stale event is replayed'
    # A second hello on an authenticated stream must close it.
    Write-Line $connection $hello
    Assert-True ($null -eq (Read-Line $connection)) 'Unexpected client input closes connection'
    Assert-True ([string]::IsNullOrEmpty($bridge.Failure)) 'Malformed clients do not stop the bridge'
    Write-Host "PASS: protocol validation, auth rejection/deadline, UTF-8/line bounds, $($events.Count) real LoopBe events, ordering, timestamps, reconnection and one-way stream."
} finally {
    if ($connection) { $connection.Dispose() }
    if ($sender) { $sender.Dispose() }
    $bridge.Dispose()
}
