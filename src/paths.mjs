// paths.mjs — dove vivono i dati di Assetto Corsa EVO e come si avvia il gioco.
//
// Assetto Corsa EVO scrive i suoi dati in due posti, a seconda della versione:
//   %USERPROFILE%\Saved Games\ACE   (dalla 0.5 in poi)
//   %USERPROFILE%\Documents\ACE     (versioni precedenti)
// Leggiamo entrambe: i risultati possono essere in una, nell'altra, o in tutte e due.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
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
 * Cartelle dati candidate, in ordine di priorità.
 * ACE_DATA è un override esplicito: se lo imposti, si usa SOLO quella cartella
 * (serve per la demo e per installazioni spostate a mano).
 */
export function dataDirCandidates(env = process.env) {
  if (env.ACE_DATA) return [env.ACE_DATA];
  const home = homedir();
  const list = [];
  list.push(join(home, 'Saved Games', 'ACE'));
  list.push(join(home, 'Documents', 'ACE'));
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
    const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${GAME_EXE}`, '/NH'], { windowsHide: true });
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
    await execFileAsync('cmd', ['/c', 'start', '', paths.gameExe], { windowsHide: true });
    return { via: 'exe', target: paths.gameExe };
  }
  await execFileAsync('cmd', ['/c', 'start', '', `steam://rungameid/${STEAM_APP_ID}`], { windowsHide: true });
  return { via: 'steam', target: `steam://rungameid/${STEAM_APP_ID}` };
}

export { existsSync, isFile, isDir };
