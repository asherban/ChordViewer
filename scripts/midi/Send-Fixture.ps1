[CmdletBinding()]
param(
    [ValidateSet('smoke', 'authoring', 'authoring-replacement', 'authoring-held', 'melody')][string]$Fixture = 'smoke',
    [ValidateRange(0.1, 10.0)][double]$Speed = 1.0
)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'WinMmMidi.cs')
$events = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "fixtures/$Fixture.json") | ConvertFrom-Json).events
$sender = New-Object ChordViewer.LocalMidi.Sender
$timer = [System.Diagnostics.Stopwatch]::StartNew()
try {
    foreach ($event in $events) {
        $wait = [int]([Math]::Ceiling($event.atMs / $Speed - $timer.Elapsed.TotalMilliseconds))
        if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
        $sender.Send([int[]]$event.data)
    }
    Write-Host "Sent $($events.Count) fixture events to LoopBe Internal MIDI."
} finally { $sender.Dispose() }
