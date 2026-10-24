// flows.mjs — il registro dei flussi: ogni euro e ogni punto reputazione che
// entra o esce dalla carriera è scritto qui, in append-only, insieme al motivo.
// È la fonte verità del dottore (integrity.mjs): cassa e rep attese si ricostruiscono
// sommando questi flussi al capitale iniziale, invece di fare regex sulla bacheca.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// EVO_DATA_DIR: solo per i test (il registro di test non tocca quello vero).
// La cartella si RISOLVE A OGNI CHIAMATA, non all'import: alcuni test (agenda,
// webui-smoke…) importano i moduli prima di settare la variabile, e se il
// percorso fosse congelato qui andrebbero a scrivere nel registro VERO del PC,
// inquinando la carriera reale con flussi di prova (bug fissato il 23/10/2026).
// nido per-slot (24/10): il registro dei flussi è VITA della carriera → vive
// nel nido di slot (slot 1 = data/ com'è sempre stato, slot 2-3 = data/slot-N/).
// Lo spiego INLINE senza importare state.mjs: state importa flows (giro già
// circolare — non aggiungiamo il secondo arco, flows chiama slotDataDir solo
// a runtime quindi andrebbe, ma il flusso è troppo centrale per rischiare).
function slotDataDirHere() {
  const base = process.env.EVO_FLOWS_DIR || process.env.EVO_DATA_DIR || join(HERE, '..', 'data');
  const s = Math.max(1, Math.min(3, Math.floor(Number(process.env.ACE_SLOT) || 1)));
  return s === 1 ? base : join(base, `slot-${s}`);
}

function flowsFile() {
  return join(slotDataDirHere(), 'flows.jsonl');
}
function debugFile() {
  const env = process.env.EVO_FLOW_DEBUG ? String(process.env.EVO_FLOW_DEBUG) : null;
  return env && /[\\/]/.test(env) ? env : join(HERE, '..', 'data', 'flows-debug.jsonl');
}

let logFile = null; // il percorso a cui si riferisce la cache `log`

function ensureCache(file) {
  if (log && logFile === file) return;
  let money = START_MONEY;
  let rep = 0;
  for (const f of loadAll(file)) {
    money += Number(f.money ?? 0);
    rep += Number(f.rep ?? 0);
  }
  log = { money, rep };
  logFile = file;
}
export const START_MONEY = 6000; // reso allineato a state.mjs (fuori allineato: 22/10/2026)

let log = null; // buffer in memoria, svuotato a ogni lettura completa

function append(file, entries) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  } catch { /* il registro non deve mai rompere la carriera */ }
}

/** Registra uno o più flussi. kind: prize|sponsor|bonus|entry|rent|buy|contract|penalty|rep */
export function recordFlows(state, entries) {
  const list = (Array.isArray(entries) ? entries : [entries]).filter((e) => e && (e.money || e.rep));
  if (!list.length) return;
  const rows = list.map((e) => ({
    at: new Date().toISOString(),
    season: state.season ?? null,
    node: state.node ?? null,
    ...e,
  }));
  // watchdog (23/10/2026): i ritiratori fantasma "Coppa 500 S1" scrivevano qui
  // senza che l'import avesse visto un file nuovo. Ogni scrittura lascia una
  // riga laterale con pid/argv di chi ha scritto — così il colpevole non scappa.
  try {
    appendFileSync(debugFile(), JSON.stringify({ at: rows[0].at, pid: process.pid, cmd: process.argv.slice(0, 4).join(' '), ppid: process.ppid, first: rows[0] }) + '\n', 'utf8');
  } catch { /* il watchdog non deve mai fermare l'import */ }
  const file = flowsFile();
  append(file, rows);
  // la cache dei totali (se già calcolata) va aggiornata subito, altrimenti
  // il dottore vedrebbe anomalie fantasma
  if (log && logFile === file) {
    for (const r of rows) { log.money += Number(r.money ?? 0); log.rep += Number(r.rep ?? 0); }
  }
}

function loadAll(file) {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/** { money, rep } attesi: capitale iniziale + tutti i flussi registrati. */
export function expectedTotals() {
  ensureCache(flowsFile());
  return log;
}

/** Lista dei flussi (per CLI/GUI, i più recenti per primi). */
export function recentFlows(n = 30) {
  return loadAll(flowsFile()).slice(-n).reverse();
}

/** Azzera il registro (nuova carriera) e invalida la cache. */
export function resetFlows() {
  const file = flowsFile();
  try { writeFileSync(file, '', 'utf8'); } catch { /* pazienza */ }
  log = null;
  logFile = file;
}

/** Invalida la cache dopo una correzione manuale del dottore. */
export function invalidateFlowsCache() { log = null; logFile = null; }

/**
 * Pulizia del registro: rimuove le righe IDENTICHE (stesso istante, stesso nodo,
 * stessa stagione, stesso tipo, stessi valori e stesso motivo: il doppio vero
 * — per esempio un import eseguito due volte nello stesso secondo). Ritorna
 * quante righe tolte: la pulizia manuale del dottore, non magia discriminante
 * tra flussi legitimi simili.
 */
export function dedupFlows() {
  const file = flowsFile();
  const rows = loadAll(file);
  if (!rows.length) return { kept: 0, removed: 0 };
  const key = (f) => JSON.stringify([f.at, f.node ?? null, f.season ?? null, f.kind ?? null, f.money ?? 0, f.rep ?? 0, f.reason ?? '']);
  const seen = new Set();
  const kept = rows.filter((f) => { const k = key(f); if (seen.has(k)) return false; seen.add(k); return true; });
  const removed = rows.length - kept.length;
  if (removed > 0) {
    try { writeFileSync(file, kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''), 'utf8'); } catch { /* il registro non deve mai rompere la carriera */ }
    invalidateFlowsCache();
  }
  return { kept: kept.length, removed };
}

/** Riparte dai valori attuali del salvataggio (dopo un fix del dottore). */
export function seedFlowsFrom(state) {
  resetFlows();
  const seed = [];
  const extraMoney = state.money - START_MONEY;
  if (extraMoney !== 0) seed.push({ at: new Date().toISOString(), kind: 'seed', money: extraMoney, rep: state.rep, reason: 'stato ereditato dalla carriera precedente al registro flussi' });
  else if (state.rep > 0) seed.push({ at: new Date().toISOString(), kind: 'seed', money: 0, rep: state.rep, reason: 'stato ereditato dalla carriera precedente al registro flussi' });
  if (seed.length) append(flowsFile(), seed);
  log = { money: state.money, rep: state.rep };
  logFile = flowsFile();
}

/**
 * Una-tantum per carriere nate prima del registro flussi: se il file non c'è,
 * si parte dai valori attuali del salvataggio (che il dottore ha già validato).
 */
export function ensureFlowsSeeded(state) {
  if (existsSync(flowsFile())) return false;
  seedFlowsFrom(state);
  return true;
}
