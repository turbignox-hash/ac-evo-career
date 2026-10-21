try {
  $f = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('Local\acevo_pmf_static')
  Write-Output 'MMF-OK'
} catch {
  Write-Output ('MMF-FAIL: ' + $_.Exception.Message)
}
try {
  $g = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('Local\acevo_pmf_graphics')
  Write-Output 'GFX-OK'
} catch {
  Write-Output ('GFX-FAIL: ' + $_.Exception.Message)
}
try {
  $p = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('Local\acevo_pmf_physics')
  Write-Output 'PHYS-OK'
} catch {
  Write-Output ('PHYS-FAIL: ' + $_.Exception.Message)
}
