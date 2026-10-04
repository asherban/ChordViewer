# Development endpoints are explicit private IPv4 addresses. Never infer one from a VPN adapter.
function Assert-DevelopmentHost([string]$DevHost, [switch]$RequireLocalAddress) {
    if (-not $DevHost) { return }
    $address = $null
    if (-not [Net.IPAddress]::TryParse($DevHost, [ref]$address) -or
        $address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $address.ToString() -ne $DevHost) {
        throw '-DevHost must be a canonical private IPv4 address, for example 192.168.1.50.'
    }
    $bytes = $address.GetAddressBytes()
    if (-not ($bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168))) {
        throw '-DevHost must be in a private LAN range (10/8, 172.16/12 or 192.168/16).'
    }
    if ($RequireLocalAddress) {
        $addresses = @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | ForEach-Object { $_.GetIPProperties().UnicastAddresses } | ForEach-Object { $_.Address.ToString() })
        if ($DevHost -notin $addresses) { throw "The development host $DevHost is not assigned to this computer." }
    }
}

function Get-DevelopmentApiOrigin([string]$DevHost, [int]$BackendPort = 3000) {
    Assert-DevelopmentHost $DevHost
    if ($DevHost) { return "http://${DevHost}:$BackendPort" }
    # Compatibility transport: device port 3000 is reversed to the selected host port.
    return 'http://127.0.0.1:3000'
}

function Assert-DebugApkOrigin([string]$Apk, [string]$ExpectedOrigin) {
    if (-not (Test-Path -LiteralPath $Apk -PathType Leaf)) { throw 'Debug APK is missing. Rebuild and install it.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($Apk)
    try {
        $entry = $archive.GetEntry('assets/api-origin.txt')
        if (-not $entry) { throw 'This APK predates endpoint configuration. Rebuild without -SkipBuild.' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $actual = $reader.ReadToEnd().Trim() } finally { $reader.Dispose() }
        if ($actual -cne $ExpectedOrigin) { throw "APK API origin is $actual; requested $ExpectedOrigin. Rebuild without -SkipBuild and install the matching APK." }
    } finally { $archive.Dispose() }
}
