# acevo-live.ps1 — legge i tre blocchi di memoria condivisa di Assetto Corsa EVO
# (Local\acevo_pmf_static / _graphics / _physics) e scrive su stdout righe JSON
# con i byte in base64. Il parsing dei campi avviene in Node (src/shmem.mjs).
#
# Sola lettura: qui non si scrive mai nulla nel gioco.
# Se il gioco non è aperto emette {"ev":"nogame"}.

param([int]$IntervalMs = 1000)

$ErrorActionPreference = 'SilentlyContinue'

# OpenFileMappingW / MapViewOfFile / UnmapViewOfFile via P/Invoke
$sig = @'
using System;
using System.Runtime.InteropServices;
public class AcevoMap {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern IntPtr OpenFileMapping(uint dwDesiredAccess, bool bInheritHandle, string lpName);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern IntPtr MapViewOfFile(IntPtr hFileMappingObject, uint dwDesiredAccess, uint dwFileOffsetHigh, uint dwFileOffsetLow, UIntPtr dwNumberOfBytesToMap);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr hObject);
}
'@
Add-Type -TypeDefinition $sig -Language CSharp

# FILE_MAP_READ = 0x0004, MAP_READ = 0x0004

function Read-Block([string]$Name, [int]$Size) {
    $h = [AcevoMap]::OpenFileMapping(0x0004, $false, $Name)
    if ($h -eq [IntPtr]::Zero) { return $null }
    try {
        $p = [AcevoMap]::MapViewOfFile($h, 0x0004, 0, 0, [UIntPtr][uint64]$Size)
        if ($p -eq [IntPtr]::Zero) { return $null }
        try {
            $buf = New-Object byte[] $Size
            [System.Runtime.InteropServices.Marshal]::Copy($p, $buf, 0, $Size)
            return [Convert]::ToBase64String($buf)
        } finally { [void][AcevoMap]::UnmapViewOfFile($p) }
    } finally { [void][AcevoMap]::CloseHandle($h) }
}

# Le sezioni Windows sono a granularità di pagina (4 KB): coprire fino a 4096 byte
# è sicuro per tutti e tre i blocchi (struct reali: static ~208 B, physics ~804 B,
# graphics 4900 B ma i campi che leggiamo in Node finiscono a gap_behind ≈ 3852 B).
$blocks = [ordered]@{
    static   = @{ name = 'Local\acevo_pmf_static';   size = 512 }
    graphics = @{ name = 'Local\acevo_pmf_graphics'; size = 4096 }
    physics  = @{ name = 'Local\acevo_pmf_physics';  size = 1024 }
}

# handshake: la prima riga dice al consumatore che il flusso è partito
$obj = [ordered]@{ ev = 'hello' }
($obj | ConvertTo-Json -Compress)

while ($true) {
    $out = [ordered]@{}
    $any = $false
    foreach ($k in $blocks.Keys) {
        $b = Read-Block -Name $blocks[$k].name -Size $blocks[$k].size
        if ($null -ne $b) { $out[$k] = $b; $any = $true } else { $out[$k] = $null }
    }
    $out['ev'] = if ($any) { 'data' } else { 'nogame' }
    ($out | ConvertTo-Json -Compress)
    Start-Sleep -Milliseconds $IntervalMs
}
