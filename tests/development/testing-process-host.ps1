[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSEdition -ne 'Desktop') {
    throw 'Run this Windows regression check with powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/development/testing-process-host.ps1.'
}
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
. (Join-Path $repository 'scripts/development/LocalBackend.Common.ps1')
$testRoot = Join-Path $repository '.local/testing-process-host'
foreach ($path in @((Join-Path $repository '.local'), $testRoot)) {
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Regression test directories must not be symbolic links or junctions.'
    }
    $null = New-Item -ItemType Directory -Path $path -Force
}
Set-LocalBackendPrivateAcl -Path $testRoot -Directory
# Include spaces to exercise executable and working-directory paths too.
$runDirectory = Join-Path $testRoot ('run ' + [Guid]::NewGuid().ToString())
$null = New-Item -ItemType Directory -Path $runDirectory
$owned = New-Object 'Collections.Generic.List[Diagnostics.Process]'
$wrapped = $null
$sentinel = $null

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Wait-File([string]$Path, [Diagnostics.Process]$Process) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        if ($Process.HasExited) { throw 'Regression helper exited before its readiness signal.' }
        if ($timer.Elapsed.TotalSeconds -ge 12) { throw 'Regression helper did not become ready within twelve seconds.' }
        Start-Sleep -Milliseconds 25
    }
}
function Start-Owned([string[]]$Arguments) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $helperExecutable
    $start.Arguments = [ChordViewer.Testing.ChildProcess]::JoinArguments($Arguments)
    $start.WorkingDirectory = $runDirectory
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $process = [Diagnostics.Process]::Start($start)
    $null = $process.Handle
    $owned.Add($process)
    return $process
}
function Open-OwnedIdentity([string]$Path) {
    $identity = [IO.File]::ReadAllText($Path).Split('|')
    Assert-True ($identity.Count -eq 2) 'Invalid helper process identity.'
    $process = [Diagnostics.Process]::GetProcessById([int]$identity[0])
    try {
        $null = $process.Handle
        Assert-True ($process.StartTime.ToUniversalTime().Ticks.ToString() -eq $identity[1]) 'Helper process identity changed.'
        $owned.Add($process)
        return $process
    } catch { $process.Dispose(); throw }
}

try {
    $helperSource = Join-Path $runDirectory 'Process host helper.cs'
    $helperExecutable = Join-Path $runDirectory 'Process host helper.exe'
    @'
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using ChordViewer.Testing;

public static class ProcessHostRegressionHelper
{
    private static void Identity(string directory, string name)
    {
        using (var process = Process.GetCurrentProcess())
        {
            string path = Path.Combine(directory, name + ".identity");
            File.WriteAllText(path + ".tmp", process.Id + "|" + process.StartTime.ToUniversalTime().Ticks);
            File.Move(path + ".tmp", path);
        }
    }
    private static void WaitFile(string path)
    {
        var timer = Stopwatch.StartNew();
        while (!File.Exists(path))
        {
            if (timer.ElapsedMilliseconds > 30000) throw new TimeoutException("Helper deadline exceeded.");
            Thread.Sleep(20);
        }
    }
    private static Process StartSelf(string mode, string directory)
    {
        var start = new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,
            ChildProcess.JoinArguments(new [] { mode, directory }));
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        return Process.Start(start);
    }
    public static int Main(string[] args)
    {
        try
        {
            if (args[0] == "quote")
            {
                for (int i = 1; i < args.Length; i++)
                    Console.WriteLine("ARG:" + Convert.ToBase64String(Encoding.Unicode.GetBytes(args[i])));
                for (int i = 0; i < 1000; i++)
                {
                    Console.WriteLine("OUT:" + i);
                    Console.Error.WriteLine("ERR:" + i);
                }
                Console.Error.WriteLine("ERR:FINAL");
                Console.WriteLine("OUT:FINAL");
                return 0;
            }
            string directory = args[1];
            if (args[0] == "sentinel" || args[0] == "grandchild")
            {
                Identity(directory, args[0]);
                WaitFile(Path.Combine(directory, "release"));
                return 0;
            }
            if (args[0] == "child")
            {
                using (var grandchild = StartSelf("grandchild", directory))
                {
                    Identity(directory, "child");
                    WaitFile(Path.Combine(directory, "release"));
                }
                return 0;
            }
            if (args[0] != "guardian") return 2;
            WorkloadJob.AttachGuardian();
            using (var child = StartSelf("child", directory))
            {
                WaitFile(Path.Combine(directory, "grandchild.identity"));
                File.WriteAllText(Path.Combine(directory, "ready"), "ready");
                WaitFile(Path.Combine(directory, "action"));
                if (args[2] == "stop")
                {
                    WorkloadJob.StopChildren();
                    File.WriteAllText(Path.Combine(directory, "children-stopped"), "stopped");
                    WaitFile(Path.Combine(directory, "release"));
                }
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
            return 1;
        }
    }
}
'@ | Set-Content -LiteralPath $helperSource -Encoding UTF8
    # Compile the production source unchanged into a disposable .NET Framework
    # executable. The helpers never start Docker, a browser or an emulator.
    $compiler = New-Object Microsoft.CSharp.CSharpCodeProvider
    $parameters = New-Object CodeDom.Compiler.CompilerParameters
    $parameters.GenerateExecutable = $true
    $parameters.OutputAssembly = $helperExecutable
    $null = $parameters.ReferencedAssemblies.Add('System.dll')
    $null = $parameters.ReferencedAssemblies.Add('System.Core.dll')
    try {
        $compiled = $compiler.CompileAssemblyFromFile($parameters, [string[]]@(
            (Join-Path $repository 'scripts/development/testing/ProcessHost.cs'), $helperSource
        ))
        if ($compiled.Errors.HasErrors) { throw (($compiled.Errors | ForEach-Object { $_.ToString() }) -join "`n") }
    } finally { $compiler.Dispose() }
    $null = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($helperExecutable))

    $arguments = [string[]]@('', 'plain', 'two words', 'embedded"quote', 'trailing\', 'space and trailing\', '\\server\share\', 'slashes\\"quote', "apostrophe'`tand tab", 'literal $(never-execute) & | ;')
    $wrapped = [ChordViewer.Testing.ChildProcess]::new($helperExecutable, ([string[]]@('quote') + $arguments), $runDirectory, (Join-Path $runDirectory 'output.log'))
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while (-not $wrapped.HasExited) {
        if ($timer.Elapsed.TotalSeconds -ge 12) { throw 'Argument/output helper exceeded twelve seconds.' }
        Start-Sleep -Milliseconds 20
    }
    $wrapped.WaitForOutput()
    Assert-True ($wrapped.ExitCode -eq 0) 'Argument/output helper failed.'
    $lines = New-Object 'Collections.Generic.List[string]'
    while ($null -ne ($line = $wrapped.ReadLine())) { $lines.Add($line) }
    Assert-True ($lines.Count -eq ($arguments.Count + 1001)) 'Final stdout lines were lost or duplicated.'
    for ($index = 0; $index -lt $arguments.Count; $index++) {
        $expected = 'ARG:' + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($arguments[$index]))
        Assert-True ($lines[$index] -ceq $expected) "Windows argument $index changed during process creation."
    }
    for ($index = 0; $index -lt 1000; $index++) {
        Assert-True ($lines[$arguments.Count + $index] -ceq "OUT:$index") 'Stdout was reordered or lost.'
    }
    Assert-True ($lines[$lines.Count - 1] -ceq 'OUT:FINAL') 'Final stdout marker was not drained.'
    $wrapped.Dispose(); $wrapped = $null
    Assert-True (([IO.File]::ReadAllLines((Join-Path $runDirectory 'output.log')) -contains 'ERR:FINAL')) 'Final stderr marker was not drained to the log.'
    Write-Host 'PASS: Windows argument quoting and final stdout/stderr draining.'

    $sentinelDirectory = Join-Path $runDirectory 'sentinel'
    $null = New-Item -ItemType Directory -Path $sentinelDirectory
    $sentinel = Start-Owned @('sentinel', $sentinelDirectory)
    Wait-File (Join-Path $sentinelDirectory 'sentinel.identity') $sentinel
    foreach ($mode in @('stop', 'exit', 'kill')) {
        $directory = Join-Path $runDirectory $mode
        $null = New-Item -ItemType Directory -Path $directory
        $guardian = Start-Owned @('guardian', $directory, $mode)
        Wait-File (Join-Path $directory 'ready') $guardian
        $child = Open-OwnedIdentity (Join-Path $directory 'child.identity')
        $grandchild = Open-OwnedIdentity (Join-Path $directory 'grandchild.identity')
        Assert-True (-not $child.HasExited -and -not $grandchild.HasExited) 'Owned descendants exited before the cleanup test.'
        if ($mode -eq 'kill') { $guardian.Kill() }
        else { [IO.File]::WriteAllText((Join-Path $directory 'action'), 'go') }
        if ($mode -eq 'stop') {
            Wait-File (Join-Path $directory 'children-stopped') $guardian
            Assert-True (-not $guardian.HasExited) 'StopChildren unexpectedly terminated its guardian.'
        } else { Assert-True ($guardian.WaitForExit(8000)) 'Owned guardian did not exit.' }
        Assert-True ($child.WaitForExit(8000)) "Child survived $mode cleanup."
        Assert-True ($grandchild.WaitForExit(8000)) "Grandchild survived $mode cleanup."
        Assert-True (-not $sentinel.HasExited) "Unrelated sentinel was terminated by $mode cleanup."
        if ($mode -eq 'stop') {
            [IO.File]::WriteAllText((Join-Path $directory 'release'), 'release')
            Assert-True ($guardian.WaitForExit(8000)) 'Stopped guardian did not finish.'
        }
        if ($mode -ne 'kill') { Assert-True ($guardian.ExitCode -eq 0) 'Guardian helper reported a failure.' }
        Write-Host "PASS: $mode cleanup removed child and grandchild while preserving the unrelated sentinel."
    }
    [IO.File]::WriteAllText((Join-Path $sentinelDirectory 'release'), 'release')
    Assert-True ($sentinel.WaitForExit(8000) -and $sentinel.ExitCode -eq 0) 'Sentinel could not exit normally.'
    Write-Host 'PASS: all four ProcessHost regression cases.'
} finally {
    if ($wrapped) { $wrapped.Dispose() }
    # Captured handles and verified creation times prevent PID reuse from
    # turning failed-test cleanup into termination of an unrelated process.
    $cleanupErrors = New-Object 'Collections.Generic.List[string]'
    foreach ($process in $owned) {
        try {
            if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(5000) }
        } catch { $cleanupErrors.Add('Could not stop an owned regression helper.') }
        finally { $process.Dispose() }
    }
    # Verify the exact temporary subtree again before recursive removal.
    $resolved = [IO.Path]::GetFullPath($runDirectory)
    if ([IO.Path]::GetDirectoryName($resolved) -ne [IO.Path]::GetFullPath($testRoot) -or
        ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Refusing to remove an unexpected regression test directory.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
    if ($cleanupErrors.Count) { throw ($cleanupErrors -join ' ') }
}
