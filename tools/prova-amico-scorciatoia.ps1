# prova-amico-scorciatoia.ps1 — simulazione friend-install (26/10)
# 1) estrae l'ultimo pacchetto-amico in %TEMP%
# 2) verifica build-id.txt, gui/pitwall.ico, tools/crea-scorciatoia.mjs dentro
# 3) lancia il tool scorciatoia DELLA COPIA con --desktop di prova (mai il vero)
# 4) stampa il contenuto estratto del .lnk in chiaro: target e icona
$ErrorActionPreference = 'Stop'
$zip = Get-ChildItem "pacchetti\ac-evo-career-amico-*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "ZIP: $($zip.Name)"

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("amico-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'   # il tar di Git Bash in PATH interpret “C:” come host remoto: bouncing
& $tar -xf $zip.FullName -C $tmp
$app = Join-Path $tmp 'ac-evo-career'

Write-Host "estratto in: $tmp"
Write-Host "build-id: $(Get-Content (Join-Path $app 'build-id.txt') -Raw)"
foreach ($f in @('gui\pitwall.ico','tools\crea-scorciatoia.mjs','avvia.cmd')) {
  $p = Join-Path $app $f
  Write-Host "$f -> $(if (Test-Path $p) { "OK ($((Get-Item $p).Length) byte)" } else { 'MANCANTE!' })"
}

# desktop-vacanze: cartella di prova, non il desktop vero
$fakedesk = Join-Path $tmp 'desktop-di-prova'
New-Item -ItemType Directory -Path $fakedesk | Out-Null

Write-Host "`n--- primo avvio del tool scorciatoia (copia dell'amico) ---"
node (Join-Path $app 'tools\crea-scorciatoia.mjs') --desktop $fakedesk

$lnk = Join-Path $fakedesk 'Carriera EVO.lnk'
if (Test-Path $lnk) {
  Write-Host "--- contenuto del .lnk (UTF-16 in chiaro) ---"
  $bytes = [System.IO.File]::ReadAllBytes($lnk)
  $text = [System.Text.Encoding]::Unicode.GetString($bytes)
  $text -split "`0" | Where-Object { $_ -match 'avvia|pitwall|ac-evo' } | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "SCORCIATOIA NON CREATA: problema!"
}

# secondo giro: idempotente, silenzioso
Write-Host "`n--- secondo avvio (deve stare zitto) ---"
$out = node (Join-Path $app 'tools\crea-scorciatoia.mjs') --desktop $fakedesk
Write-Host "stdout: '$out' (vuoto = OK)"

Remove-Item -Recurse -Force $tmp
Write-Host "`nprovato e ripulito: $tmp"
