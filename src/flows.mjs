// flows.mjs — il registro dei flussi: ogni euro e ogni punto reputazione che
// entra o esce dalla carriera è scritto qui, in append-only, insieme al motivo.
// È la fonte verità del dottore (integrity.mjs): cassa e rep attese si ricostruiscono
// sommando questi flussi al capitale iniziale, invece di fare regex sulla bacheca.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// EVO_DATA_DIR: solo per i test (il registro di test non tocca quello vero)
const FLOWS_FILE = process.env.EVO_DATA_DIR
  ? join(process.env.EVO_DATA_DIR, 'flows.jsonl')
  : join(HERE, '..', 'data', 'flows.jsonl');
export const START_MONEY = 6000; // reso allineato a state.mjs (fuori allineato: 22/10/2026)

let log = null; // buffer in memoria, svuotato a ogni lettura completa

function append(entries) {
  try {
    mkdirSync(dirname(FLOWS_FILE), { recursive: true });
    appendFileSync(FLOWS_FILE, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
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
  append(rows);
  // la cache dei totali (se già calcolata) va aggiornata subito, altrimenti
  // il dottore vedrebbe anomalie fantasma
  if (log) {
    for (const r of rows) { log.money += Number(r.money ?? 0); log.rep += Number(r.rep ?? 0); }
  }
}

function loadAll() {
  try {
    return readFileSync(FLOWS_FILE, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/** { money, rep } attesi: capitale iniziale + tutti i flussi registrati. */
export function expectedTotals() {
  if (log) return log;
  let money = START_MONEY;
  let rep = 0;
  for (const f of loadAll()) {
    money += Number(f.money ?? 0);
    rep += Number(f.rep ?? 0);
  }
  log = { money, rep };
  return log;
}

/** Lista dei flussi (per CLI/GUI, i più recenti per primi). */
export function recentFlows(n = 30) {
  return loadAll().slice(-n).reverse();
}

/** Azzera il registro (nuova carriera) e invalida la cache. */
export function resetFlows() {
  try { writeFileSync(FLOWS_FILE, '', 'utf8'); } catch { /* pazienza */ }
  log = null;
}

/** Invalida la cache dopo una correzione manuale del dottore. */
export function invalidateFlowsCache() { log = null; }

/** Riparte dai valori attuali del salvataggio (dopo un fix del dottore). */
export function seedFlowsFrom(state) {
  resetFlows();
  const seed = [];
  const extraMoney = state.money - START_MONEY;
  if (extraMoney !== 0) seed.push({ at: new Date().toISOString(), kind: 'seed', money: extraMoney, rep: state.rep, reason: 'stato ereditato dalla carriera precedente al registro flussi' });
  else if (state.rep > 0) seed.push({ at: new Date().toISOString(), kind: 'seed', money: 0, rep: state.rep, reason: 'stato ereditato dalla carriera precedente al registro flussi' });
  if (seed.length) append(seed);
  log = { money: state.money, rep: state.rep };
}

/**
 * Una-tantum per carriere nate prima del registro flussi: se il file non c'è,
 * si parte dai valori attuali del salvataggio (che il dottore ha già validato).
 */
export function ensureFlowsSeeded(state) {
  if (existsSync(FLOWS_FILE)) return false;
  seedFlowsFrom(state);
  return true;
}
