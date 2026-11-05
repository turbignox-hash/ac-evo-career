// crea-scorciatoia.mjs — la scorciatoia «Carriera EVO» su Desktop e menu Start, da solo.
//
// Perché: l'amico che installa lo zip trova `avvia.cmd` dentro la cartella
// estratta, non sul Desktop (GUIDA-AMICO.md a 24/10). Questo strumento, ogni
// volta che il launcher parte, se ne accerta: se manca la crea con l'icona
// Pitwall (gui/pitwall.ico, tracciata nel repo), se esiste con l'icona
// sbagliata la aggiorna, e ne tiene una anche nel menu Start. Se ci sono
// già entrambe a posto, non tocca NIENTE (zero scritture, un solo spawn
// PowerShell per la verifica: ogni avvio deve volare).
//
// 6/11/2026, il lancio senza finestre: la scorciatoia non punta più a
// `avvia.cmd` (un .cmd al doppio click apre sempre una console), ma a
// `wscript` con `tools\avvia-gui.vbs`, che fa tutto nascosto. Le vecchie
// scorciatoie nostre che puntano a `avvia.cmd` vengono portate su, una volta.
//
// Regola importante: una scorciatoia con lo stesso nome ma puntata a UN'ALTRA
// installazione non si tocca (né target né icona): l'ultima installazione non
// deve rubare il collegamento alla prima.
//
// Regole del launcher: mai un blocco, mai un errore spinoso — falla o zittisci.
//
// uso:  node tools/crea-scorciatoia.mjs [--desktop <dir>] [--startmenu <dir>]
//       (le dir servono solo ai test; con almeno un flag si toccano SOLO quelle,
//        mai il Desktop o il menu Start veri)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RADICE = join(HERE, '..');
const NOME = 'Carriera EVO.lnk';
const ICO = join(RADICE, 'gui', 'pitwall.ico');
const TARGET = join(RADICE, 'avvia.cmd'); // vecchio bersaglio: serve a riconoscerlo e portarlo su
const VBS = join(RADICE, 'tools', 'avvia-gui.vbs');
const WINROOT = process.env.SystemRoot || join('C:', 'Windows');
const WSCRIPT = join(WINROOT, 'System32', 'wscript.exe');

function argDir(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function desktopDir() {
  // il classico: sempre presente anche quando il Desktop vero vive su OneDrive
  const semplice = join(process.env.USERPROFILE ?? '', 'Desktop');
  if (process.env.USERPROFILE && existsSync(semplice)) return semplice;
  // desktop reindirizzato (OneDrive): chiedo a Windows, una sola chiamata
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' });
  const d = (r.stdout ?? '').trim();
  return d || semplice;
}

function startMenuDir() {
  const appData = process.env.APPDATA || join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming');
  return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
}

/** Letterale PowerShell fra apici singoli: raddoppia gli apici interni. */
function psq(value) {
  return String(value).replaceAll("'", "''");
}

/**
 * Un solo script per tutti i collegamenti: crea quelli mancanti, aggiorna
 * i nostri vecchi (che partivano da avvia.cmd) al nuovo avvio nascosto,
 * ripara l'icona di quelli nostri già attuali, lascia stare quello di altre
 * installazioni. Restituisce per ognuno: created / updated / fixed / ok / other.
 */
function psCommand(links) {
  const elenco = links.map((x) => `'${psq(x)}'`).join(',');
  const ps = `
$shell = New-Object -ComObject WScript.Shell
$esiti = @()
foreach ($x in @(${elenco})) {
  if (Test-Path -LiteralPath $x) {
    $s = $shell.CreateShortcut($x)
    if ("$($s.TargetPath)" -ieq '${psq(WSCRIPT)}' -and "$($s.Arguments)" -like '*avvia-gui.vbs*') {
      if ("$($s.IconLocation)" -notlike '*pitwall.ico*') {
        $s.IconLocation = '${psq(ICO)},0'
        $s.Save()
        $esiti += 'fixed'
      } else { $esiti += 'ok' }
    } elseif ("$($s.TargetPath)" -ieq '${psq(TARGET)}') {
      $s.TargetPath = '${psq(WSCRIPT)}'
      $s.Arguments = '//nologo "' + '${psq(VBS)}' + '"'
      $s.IconLocation = '${psq(ICO)},0'
      $s.Save()
      $esiti += 'updated'
    } else { $esiti += 'other' }
  } else {
    $s = $shell.CreateShortcut($x)
    $s.TargetPath = '${psq(WSCRIPT)}'
    $s.Arguments = '//nologo "' + '${psq(VBS)}' + '"'
    $s.WorkingDirectory = '${psq(RADICE)}'
    $s.IconLocation = '${psq(ICO)},0'
    $s.Save()
    $esiti += 'created'
  }
}
Write-Output ($esiti -join ',')
`;
  return Buffer.from(ps, 'utf16le').toString('base64');
}

if (process.platform !== 'win32') process.exit(0); // fuori da Windows: silenzioso

const testDesktop = argDir('--desktop');
const testStart = argDir('--startmenu');
const testMode = testDesktop !== null || testStart !== null;
const dirs = testMode ? [testDesktop, testStart].filter(Boolean) : [desktopDir(), startMenuDir()];

const links = [];
for (const dir of [...new Set(dirs)]) {
  if (dir && existsSync(dir)) links.push(join(dir, NOME));
}
if (links.length === 0) process.exit(0); // nessuna cartella: pazienza, l'app parte lo stesso

const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', psCommand(links)], { encoding: 'utf8', timeout: 20_000 });
if (r.status !== 0) process.exit(0); // fallimento: doppio click manuale è la via di scorta, l'app non deve bloccarsi

const esiti = (r.stdout ?? '').trim().split(',').map((x) => x.trim());
if (esiti.includes('created') || esiti.includes('updated') || esiti.includes('fixed')) {
  console.log('Scorciatoia "Carriera EVO" pronta (Desktop e menu Start): apre la GUI senza finestre nere.');
}
