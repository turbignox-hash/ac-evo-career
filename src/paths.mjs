// paths.mjs — dove vivono i dati di Assetto Corsa EVO e come si avvia il gioco.
//
// Assetto Corsa EVO scrive i suoi dati in due posti, a seconda della versione:
//   %USERPROFILE%\Saved Games\ACE   (dalla 0.5 in poi)
//   %USERPROFILE%\Documents\ACE     (versioni precedenti)
// Leggiamo entrambe: i risultati possono essere in una, nell'altra, o in tutte e due.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const STEAM_APP_ID = '3058630';
export const GAME_FOLDER = 'Assetto Corsa EVO';
export const GAME_EXE = 'AssettoCorsaEVO.exe';

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

/**
 * La cartella "Saved Games" di Windows, ANCHE SE viene ricollocata:
 * Steam permette la libreria di gioco su un altro disco, ma il SAVE segue
 * la cartella di sistema "Saved Games" che l'utente può reindirizzare
 * (26/10, PC vergine di Mauro: gioco installato su D:, profilo non standard).
 * Cerca in ordine:
 *   1. override esplicito ACE_SAVEDIR (comanda, anche se non esiste: è scelta vera);
 *   2. la cartella nota del registro (HKCU\...\User Shell Folders, GUID 4C5C32FF
 *      = Saved Games): è il posto che il GIOCO consulta davvero;
 *   3. il default classico %USERPROFILE%\Saved Games.
 * Restituisce SOLO le esistenti (il default resta sempre in fondo: se il
 * profilo sta su D:, anche %USERPROFILE% punta là).
 */
export function savedGamesRoots(env = process.env) {
  if (env.ACE_SAVEDIR) return [env.ACE_SAVEDIR];   // override esplicito: comanda anche se non esiste ancora
  const list = [];
  if (platform() === 'win32') {
    try {
      const out = execFileSync('reg',
        ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
         '/v', '{4C5C32FF-BB9D-43B0-B5B4-2D72E54EAAA4}'],
        { windowsHide: true, timeout: 8000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const riga = out.split(/\r?\n/).find((l) => /REG_(EXPAND_)?SZ/i.test(l));
      const val = riga?.split(/\s{2,}/).pop()?.trim() ?? '';
      if (val) list.push(val.replace(/%([^%]+)%/g, (_, k) => env[k] ?? env[k.toLowerCase()] ?? ''));
    } catch { /* chiave assente o reg non disponibile: resta il default */ }
  }
  list.push(join(homedir(), 'Saved Games'));
  return [...new Set(list.filter((p) => p && isDir(p)))];
}

/**
 * Cartelle dati candidate, in ordine di priorità.
 * ACE_DATA è un override esplicito: se lo imposti, si usa SOLO quella cartella
 * (serve per la demo e per installazioni spostate a mano).
 */
export function dataDirCandidates(env = process.env) {
  if (env.ACE_DATA) return [env.ACE_DATA];
  const list = [];
  for (const s of savedGamesRoots(env)) list.push(join(s, 'ACE'));
  list.push(join(homedir(), 'Documents', 'ACE'));
  if (env.ACE_DOCS) list.push(env.ACE_DOCS);
  return list;
}

/** Legge steamappid + path di tutte le librerie Steam note. */
function steamLibraries() {
  const out = [];
  const roots = [];
  if (process.env.STEAM_ROOT) roots.push(process.env.STEAM_ROOT);
  if (platform() === 'win32') {
    roots.push('C:/Program Files (x86)/Steam');
    roots.push('C:/Program Files/Steam');
    for (const drive of ['D', 'E', 'F', 'G', 'H']) roots.push(`${drive}:/SteamLibrary`);
    // librerie extra dichiarate nel vdf di ogni installazione Steam
    const vdfRoots = roots.slice(0, 2).map((r) => join(r, 'steamapps', 'libraryfolders.vdf'));
    for (const vdf of vdfRoots) {
      if (!isFile(vdf)) continue;
      const text = readFileSync(vdf, 'latin1');
      for (const m of text.matchAll(/"path"\s*"([^"]+)"/g)) roots.push(m[1].replace(/\\\\/g, '/'));
      for (const m of text.matchAll(/"(\d+)"\s*"([^"]+)"/g)) roots.push(m[2].replace(/\\\\/g, '/'));
    }
    roots.push(join(homedir(), 'SteamLibrary'));
  }
  for (const r of roots) {
    const normalized = r.replace(/\\/g, '/');
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

/** Trova AssettoCorsaEVO.exe fra le librerie Steam. */
export function findGameExe(env = process.env) {
  if (env.ACE_ROOT) {
    const direct = join(env.ACE_ROOT, GAME_EXE);
    if (isFile(direct)) return direct;
    const nested = join(env.ACE_ROOT, GAME_FOLDER, GAME_EXE);
    if (isFile(nested)) return nested;
  }
  for (const lib of steamLibraries()) {
    for (const candidate of [
      join(lib, 'steamapps', 'common', GAME_FOLDER, GAME_EXE),
      join(lib, 'common', GAME_FOLDER, GAME_EXE),
    ]) {
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** Tutto quello che serve per leggere risultati e contenuti. */
export function resolvePaths(env = process.env) {
  const candidates = dataDirCandidates(env);
  const existing = candidates.filter((d) => isDir(d));
  if (!existing.length) {
    throw new Error(
      'Cartella dati di Assetto Corsa EVO non trovata.\n' +
      'Cercata in:\n' + candidates.map((c) => '  ' + c).join('\n') + '\n' +
      'Avvia il gioco una volta, oppure indica il percorso con ACE_DATA="<cartella ACE>".'
    );
  }
  const resultsDirs = [];
  const logsDirs = [];
  for (const d of existing) {
    const r = join(d, 'Results');
    const l = join(d, 'Logs');
    if (isDir(r)) resultsDirs.push(r);
    if (isDir(l)) logsDirs.push(l);
  }
  return {
    dataDirs: existing,
    primary: existing[0],
    resultsDirs,
    logsDirs,
    legacyDataDirs: existing.slice(1),
    gameExe: findGameExe(env),
  };
}

/** Elenca i file di una cartella (non ricorsivo), senza eccezioni. */
export function listFiles(dir) {
  try {
    return readdirSync(dir).map((name) => join(dir, name)).filter(isFile);
  } catch {
    return [];
  }
}

/** Il gioco è già in esecuzione? (avviare una seconda istanza fa comparire un errore del gioco) */
export async function isGameRunning() {
  if (platform() !== 'win32') return false;
  try {
    // timeout (24/10): tasklist assediato (antivirus, gioco che parte) non deve
    // tenere in mezzo il server — il verdetto «non appena» resta conservativo
    const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${GAME_EXE}`, '/NH'], { windowsHide: true, timeout: 10000 });
    return stdout.toLowerCase().includes(GAME_EXE.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Apre il gioco. Su Windows lo fa Steam (URI ufficiale), così funziona anche senza exe trovato.
 * Se il gioco è già aperto non avvia una seconda istanza: torna { via: 'already-running' }.
 */
export async function launchGame(paths, { exe = true, force = false } = {}) {
  if (platform() !== 'win32') {
    throw new Error(`Avvio automatico non supportato su ${platform()}. Apri Assetto Corsa EVO a mano.`);
  }
  if (!force && await isGameRunning()) return { via: 'already-running', target: GAME_EXE };
  if (exe && paths.gameExe) {
    // titolo esplicito al posto di "": cmd.exe lo perderebbe e start leggerebbe 'EVO Pitwall...'
    // come file (24/10: errore "Impossibile trovare il file 'EVO Pitwall Slot 3'"); con spazi nel
    // percorso del gioco il bug era anche peggio.
    // il titolo esplicito (con spazi → Node lo quotà) protegge i percorsi con spazi:
    // "" vuoto si perde e start legge il titolo come file (bug 'EVO Pitwall Slot 3', 24/10).
    // MA il titolo deve PER FORZA contenere uno spazio: 'EVO' nudo non viene quotato da
    // Node e start lo interpretava come PROGRAMMA da cercare (24/10: «Command failed:
    // cmd /c start EVO E:\...AssettoCorsaEVO.exe» = cercava un file «EVO»). Titolo con
    // spazio → Node lo mette tra virgolette → start lo legge come titolo. Prova innocua
    // (cmd /c exit come bersaglio): 'EVO' → Command failed, 'EVO Pitwall' → exit 0.
    await execFileAsync('cmd', ['/c', 'start', 'EVO Pitwall', paths.gameExe], { windowsHide: true, timeout: 10000 });
    return { via: 'exe', target: paths.gameExe };
  }
  // gli URL non hanno spazi: NIENTE titolo, altrimenti start prenderebbe 'EVO' come programma
  await execFileAsync('cmd', ['/c', 'start', `steam://rungameid/${STEAM_APP_ID}`], { windowsHide: true });
  return { via: 'steam', target: `steam://rungameid/${STEAM_APP_ID}` };
}

export { existsSync, isFile, isDir };
