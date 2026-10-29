# _voce-debug.ps1 - diagnostic vocal engine one shot: times the startup,
# lists installed voices, selects the MALE it voice and speaks a phrase.
# All traces go to $env:TEMP\voce-debug.log (ASCII only: PS 5.1 reads ANSI).
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'voce-debug.log'
$t0 = [Diagnostics.Stopwatch]::StartNew()
$ms = { '$t0.ElapsedMilliseconds' }
"TSTART age:" | Out-File $log -Encoding ascii -Force 2>$null
Remove-Item -ErrorAction SilentlyContinue $log
"START" | Out-File $log -Encoding ascii
try {
  Add-Type -AssemblyName System.Speech
  "ASSEMBLY OK $($t0.ElapsedMilliseconds)ms" | Out-File $log -Append -Encoding ascii
} catch {
  "ASSEMBLY FAIL: $($_.Exception.Message)" | Out-File $log -Append -Encoding ascii
  exit 1
}
$sp = New-Object System.Speech.Synthesis.SpeechSynthesizer
"VOICES INSTALLATE:" | Out-File $log -Append -Encoding ascii
$sp.GetInstalledVoices() | ForEach-Object {
  "  $($_.VoiceInfo.Name) | $($_.VoiceInfo.Culture.Name) | $($_.VoiceInfo.Gender)" | Out-File $log -Append -Encoding ascii
}
$it = $sp.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' -and $_.VoiceInfo.Gender -eq 'Male' } | Select-Object -First 1
if (-not $it) { $it = $sp.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' } | Select-Object -First 1 }
if ($it) { $sp.SelectVoice($it.VoiceInfo.Name); "SELEZIONATA: $($it.VoiceInfo.Name)" | Out-File $log -Append -Encoding ascii }
else { "NESSUNA VOCE IT, uso il DEFAULT: $($sp.Voice.Name)" | Out-File $log -Append -Encoding ascii }
"PARLO..." | Out-File $log -Append -Encoding ascii
$sp.Speak('Prova di debug, uno, due, tre. La copilota ascolta.')
"FINE $($t0.ElapsedMilliseconds)ms" | Out-File $log -Append -Encoding ascii
