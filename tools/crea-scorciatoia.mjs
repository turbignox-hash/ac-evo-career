// crea-scorciatoia.mjs — la scorciatoia «Carriera EVO» sul Desktop, da solo.
//
// Perché: l'amico che installa lo zip trova `avvia.cmd` dentro la cartella
// estratta, non sul Desktop (GUIDA-AMICO.md a 24/10). Questo strumento, ogni
// volta che il launcher parte, se ne accerta: se manca la crea con l'icona
// Pitwall (gui/pitwall.ico, tracciata nel repo), se esiste con l'icona
// sbagliata la aggiorna. Se C'È GIÀ la scorciatoia con l'icona giusta, non
// tocca NIENTE (zero scritture, spawn PowerShell solo per la verifica: ogni
// avvio deve volare).
//
// Regole del launcher: mai un blocco, mai un errore spinoso — falla o zittisci.
//
// uso:  node tools/crea-scorciatoia.mjs [--desktop <dir>]   (dir: solo test)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RADICE = join(HERE, '..');
const NOME = 'Carriera EVO.lnk';
const ICO = join(RADICE, 'gui', 'pitwall.ico');
const TARGET = join(RADICE, 'avvia.cmd');

function desktopDir() {
  // il test passa la dir a mano
  const flag = process.argv.indexOf('--desktop');
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1];
  // il classico: sempre presente anche quando il Desktop vero vive su OneDrive
  const semplice = join(process.env.USERPROFILE ?? '', 'Desktop');
  if (process.env.USERPROFILE && existsSync(semplice)) return semplice;
  // desktop reindirizzato (OneDrive): chiedo a Windows, una sola chiamata
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' });
  const d = (r.stdout ?? '').trim();
  return d || semplice;
}

/** Lo script PowerShell, base64-UTF16LE encoded: niente inferno di virgolette. */
function psCommand(lnk) {
  const ps = `
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath '${lnk}') {
  $s = $shell.CreateShortcut('${lnk}')
  if ("$($s.IconLocation)" -notlike '*pitwall.ico*') {
    $s.IconLocation = '${ICO},0'
    $s.Save()
    Write-Output 'fixed'
  } else { Write-Output 'ok' }
} else {
  $s = $shell.CreateShortcut('${lnk}')
  $s.TargetPath = '${TARGET}'
  $s.WorkingDirectory = '${RADICE}'
  $s.IconLocation = '${ICO},0'
  $s.Save()
  Write-Output 'created'
}
`;
  return Buffer.from(ps, 'utf16le').toString('base64');
}

if (process.platform !== 'win32') process.exit(0); // fuori da Windows: silenzioso

const dir = desktopDir();
if (!dir || !existsSync(dir)) process.exit(0);  // desktop non trovato: pazienza, l'app parte lo stesso
const lnk = join(dir, NOME);

// korto circuito: già a posto → uscita silenziosa
if (existsSync(lnk)) {
  const s = spawnSync('powershell', ['-NoProfile', '-Command',
    "(New-Object -ComObject WScript.Shell).CreateShortcut('" + lnk + "').IconLocation"],
    { encoding: 'utf8' });
  if ((s.stdout ?? '').includes('pitwall.ico')) process.exit(0);
}

const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-EncodedCommand', psCommand(lnk)], { encoding: 'utf8', timeout: 20_000 });
if (r.status !== 0 || (r.stdout ?? '').trim() === '') process.exit(0); // fallimento: doppio click manuale è la via di scorta, l'app non deve bloccarsi

const esito = (r.stdout ?? '').trim().split('\n').pop();
if (esito === 'created' || esito === 'fixed') {
  console.log('Scorciatoia "Carriera EVO" sul desktop: creata con l\'icona del programma.');
}
