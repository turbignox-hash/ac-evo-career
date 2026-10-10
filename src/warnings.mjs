// warnings.mjs — registro degli errori "silenziosi".
//
// Prima di questo modulo molti catch erano vuoti: un file illeggibile, un JSON
// rotto o un percorso mancante sparivano senza lasciare traccia, e capire
// perché (ad esempio) la telemetria non andava richiedeva indagini a mano.
// Ora ogni catch significativo chiama recordWarning(): le voci finiscono in
// append su data/errors.jsonl e le ultime 50 per modulo si leggono via API
// (pannello Diagnostica in Setup). Il registro non deve MAI rompere chi lo
// chiama: ogni funzione è corazzata, in caso di errore di scrittura si perde
// la voce e basta.

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// EVO_DATA_DIR: solo per i test (il registro di test non tocca quello vero)
const ERRORS_FILE = process.env.EVO_DATA_DIR
  ? join(process.env.EVO_DATA_DIR, 'errors.jsonl')
  : join(HERE, '..', 'data', 'errors.jsonl');

const MAX_TOTAL = 500;   // righe mantenute su file
const MAX_PER_MODULE = 50; // voci restituite per modulo dalla lettura

let lastLine = null; // anti-rumore: la stessa identica voce di fila non si ripete

function appendLine(line) {
  try {
    if (line === lastLine) return;
    mkdirSync(dirname(ERRORS_FILE), { recursive: true });
    appendFileSync(ERRORS_FILE, line + '\n', 'utf8');
    lastLine = line;
    // rotazione semplice: oltre MAX_TOTAL righe si riparte da un file pulito
    // (teniamo solo il conteggio: sono diagnostica, non contabilità)
    if ((count += 1) > MAX_TOTAL) reset();
  } catch { /* pazienza: il registro non deve rompere il chiamante */ }
}

let count = 0;
try { count = readFileSync(ERRORS_FILE, 'utf8').split('\n').filter(Boolean).length; } catch { count = 0; }

function reset() {
  try { appendFileSync(ERRORS_FILE, '', { flag: 'w' }); count = 0; } catch { /* pazienza */ }
}

/** Registra un errore. module: nome breve ('motec', 'shmem', 'webui.setup'...). */
export function recordWarning(module, message, extra = null) {
  const entry = {
    at: new Date().toISOString(),
    module: String(module ?? '?'),
    message: String(message ?? '').slice(0, 300),
  };
  if (extra != null) entry.extra = String(extra).slice(0, 200);
  appendLine(JSON.stringify(entry));
}

/**
 * Ultimi errori raggruppati per modulo, dal più recente.
 * Ritorna: { total, modules: [{ module, count, last: [{at, message, extra}] }] }
 */
export function readWarnings({ perModule = MAX_PER_MODULE } = {}) {
  let rows = [];
  try {
    rows = readFileSync(ERRORS_FILE, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return { total: 0, modules: [] }; }
  const byMod = new Map();
  for (const r of rows) {
    if (!byMod.has(r.module)) byMod.set(r.module, []);
    byMod.get(r.module).push(r);
  }
  const modules = [...byMod.entries()].map(([module, list]) => ({
    module,
    count: list.length,
    last: list.slice(-perModule).reverse(),
  })).sort((a, b) => (b.last[0]?.at ?? '').localeCompare(a.last[0]?.at ?? ''));
  return { total: rows.length, modules };
}
