# probe-mmf.ps1 — chiede direttamente a kernel32 se i tre blocchi condivisi di EVO
# esistono (Local\ e Global\), e elenca i processi Assetto/EVO attivi.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ProbeMmf {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern IntPtr OpenFileMapping(uint desired, bool inherit, string name);
}
'@

$names    = @('acevo_pmf_static', 'acevo_pmf_graphics', 'acevo_pmf_physics')
$prefixes = @('Local\', 'Global\')
foreach ($pfx in $prefixes) {
  foreach ($n in $names) {
    $h = [ProbeMmf]::OpenFileMapping(4, $false, "$pfx$n")
    if ($h -eq [IntPtr]::Zero) {
      $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      Write-Host "$pfx$n : ASSENTE (GetLastWin32Error=$err)"
    } else {
      Write-Host "$pfx$n : PRESENTE"
    }
  }
}

Get-Process | Where-Object { $_.Name -match 'EVO|Assetto' } |
  Select-Object Name, Id, MainWindowTitle | Format-Table | Out-String -Width 120 | Write-Host
