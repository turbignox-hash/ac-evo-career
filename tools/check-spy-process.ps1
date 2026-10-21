# check-spy-process.ps1 — trovo i processi della spia (node + powershell figlio)
$procs = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and ($_.CommandLine.Contains('watch-setup-changes') -or $_.CommandLine.Contains('acevo-live.ps1'))
}
if (-not $procs) { Write-Output 'SPIA: nessun processo attivo'; exit 0 }
foreach ($p in $procs) {
  $cmd = $p.CommandLine
  if ($cmd.Length -gt 140) { $cmd = $cmd.Substring(0, 140) }
  Write-Output 'PID' $p.ProcessId $p.Name 'parent' $p.ParentProcessId 'CMD' $cmd
}
