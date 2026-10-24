// webui-env.mjs — cosa condividono webui.mjs e webui-views.mjs:
// le costanti di sessione (slot, percorsi, files del progetto) e i lettori che
// assemblano il contesto (ladder + paths) via appEnv()/context().
// E' SUPPORTO, non server: qui dentro niente http, niente switch API.
// (estrazione dal monolite webui.mjs del 2026-10-18: prima dello split 1845 righe)

import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths } from './paths.mjs';
import { loadState, saveState, savePath, activeSlot, slotDataDir } from './state.mjs';
import { writeJsonAtomic } from './atomic.mjs';
import { localizeLadder, setLang, hasEnvOverride } from './lang.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT = dirname(HERE);
export const LADDER_FILE = join(PROJECT, 'config', 'career.evo.ladder.json');
// Stessa regola di import.mjs: EVO_DATA_DIR (solo per i test) ridirige la cartella
// dati del TOOL — save, config, backup — così il server di prova non tocca il
// salvataggio vero del PC (il vecchio data dir fisso leggeva il save reale anche
// nei test: bug del 23/10).
export const DATA_DIR = process.env.EVO_DATA_DIR ?? join(PROJECT, 'data');
// SLOT di carriera (1..3): lo slot si cambia SOLO riavviando il server con ACE_SLOT=n
// (così watcher e import non mischiano due carriere nella stessa sessione).
export const SLOT = activeSlot();
export const SAVE_FILE = join(DATA_DIR, savePath(SLOT));
export const CONFIG_FILE = join(DATA_DIR, 'evo.config.json');
export const GUI_DIR = join(PROJECT, 'gui');
// nido per-slot (24/10): i backup del save vivono con la SUA carriera (slot 1 =
// data/backups com'è sempre stato, slot 2-3 = data/slot-N/backups vergini):
// dall'Impostazioni dello slot 3 si vedono e si ripristinano SOLO i backup di slot 3
export const BACKUP_DIR = join(slotDataDir(), 'backups');

// Il ladder è il file più grande del progetto (7000+ righe di JSON) ed è
// riletto a OGNI richiesta del launcher (context → loadLadder): si ri-parsa
// solo quando il mtime cambia. localizeLadder resta fuori dalla memo: è
// idempotente e segue la lingua corrente a ogni chiamata.
let _ladderMemo = null; // { mtime, ladder }
export function loadLadder() {
  const mtime = (existsSync(LADDER_FILE) ? statSync(LADDER_FILE).mtimeMs : 0);
  if (!_ladderMemo || _ladderMemo.mtime !== mtime) {
    _ladderMemo = { mtime, ladder: JSON.parse(readFileSync(LADDER_FILE, 'utf8')) };
  }
  return localizeLadder(_ladderMemo.ladder);
}

export function appEnv() {
  const env = { ...process.env };
  if (existsSync(CONFIG_FILE)) {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    if (cfg.dataDir) env.ACE_DATA = cfg.dataDir;
    if (cfg.gameExe) env.ACE_ROOT = dirname(cfg.gameExe);
    if (!hasEnvOverride() && cfg.lang) setLang(cfg.lang); // UNA lingua per GUI, CLI e server
  }
  return env;
}

export function context() {
  const ladder = loadLadder();
  const paths = resolvePaths(appEnv());
  return { ladder, paths };
}

export function writeConfig(patch) {
  mkdirSync(DATA_DIR, { recursive: true });
  const current = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
  const next = { ...current, ...patch };
  writeJsonAtomic(CONFIG_FILE, next); // atomico: da qui dipendono i percorsi di gioco e dati
  return next;
}

export const requireState = () => loadState(SAVE_FILE);
export const persist = (state) => saveState(SAVE_FILE, state);
