// watch.mjs — il portiere della cartella Results.
//
// Lezione del 2026-10-14: la gara di Red Bull era finita ma l'import non era
// stato lanciato e la carriera non avanza da sola. Il watcher toglie il passaggio
// manuale: guarda le cartelle Results e, quando EVO scrive un risultato di gara
// NUOVO (scritto dopo l'avvio del watcher), chiama la stessa strada dell'import
// (src/import.mjs): le tre reti di sicurezza — registro anti-doppioni, backup
// automatico, log append-only — valgono identiche.
//
// Garanzie:
//  - NON incassa mai file scritti prima del suo avvio (baseline): niente gare
//    vecchie recuperate per sbaglio al lancio.
//  - NON incassa qualifiche, prove libere o file illeggibili nella carriera:
//    le registra però nel quaderno dei GIRI LIBERI (24/10, hotlaps.mjs), così
//    le sessioni di prove alimentano il libro PB per auto+pista senza toccare
//    soldi, punti o rep.
//  - Un errore non uccide il watcher: viene mostrato una volta per file e annotato
//    nel registro errori (warnings.mjs); il ciclo riparte al tick successivo.
//  - Se nessun file combacia con la ronda attesa NON succede nulla: la pista si
//    sbaglia anche quando il file è una gara fra amici — il messaggio resta
//    visibile in console, senza sporcare la carriera.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runImport, SAVE_FILE } from './import.mjs';
import { loadState } from './state.mjs';
import { recordHotlaps } from './hotlaps.mjs';
import { recordWarning } from './warnings.mjs';
import { listResultFiles, readSessionResult, isRaceSession } from './results.mjs';
import { writeJsonAtomic } from './atomic.mjs';

const HEARTBEAT_FILE = join(dirname(SAVE_FILE), 'watcher.json');

/**
 * Battito: il CLI lo riscrive a ogni giro di scansione. Il cruscotto lo legge
 * per dire se la guardia è viva: un file fresco entro ~3 cicli (minimo 60s).
 */
export function heartbeat(everySec) {
  try {
    writeJsonAtomic(HEARTBEAT_FILE, { at: new Date().toISOString(), pid: process.pid, every: everySec });
  } catch { /* un battito perso non deve rompere il ciclo */ }
}

/** Letto da `status`: la guardia è attiva adesso? */
export function watcherStatus() {
  try {
    const hb = JSON.parse(readFileSync(HEARTBEAT_FILE, 'utf8'));
    const atMs = Date.parse(hb.at);
    const every = Number.isFinite(Number(hb.every)) ? Number(hb.every) : 15;
    const ageMs = Date.now() - atMs;
    const alive = Number.isFinite(atMs) && ageMs >= 0 && ageMs <= Math.max(60000, every * 3 * 1000);
    return { alive, ageMs, at: hb.at, every };
  } catch {
    return { alive: false, ageMs: null, at: null, every: null };
  }
}

export const WATCH_INTERVAL_MS = 15000;

/**
 * Un singolo giro di scansione. Non contiene loop né timer: è chiamato dal CLI
 * (cli.mjs, comando watch) e dai test. Ritorna sempre un oggetto riepilogo:
 * { scanned, imported, ignored: [{name, reason}], error }
 * `getBaseline`/`getState` sono intercettabili nei test.
 */
export function watchOnce(ladder, paths, { baselineMs = 0, stateLoader = () => loadState(SAVE_FILE), persist = undefined } = {}) {
  const outcome = { scanned: 0, imported: null, ignored: [], error: null };

  if (!paths?.resultsDirs?.length) {
    outcome.ignored.push({ name: '(nessuna cartella)' , reason: 'cartella Results non trovata: avvia il gioco almeno una volta' });
    return outcome;
  }

  // Solo file scritti DOPO il via del watcher: ciò che c'era prima appartiene
  // al passato (e ha già la sua storia nel registro import).
  const fresh = listResultFiles(paths).filter((f) => f.mtime > baselineMs);
  outcome.scanned = fresh.length;
  if (!fresh.length) return outcome;

  // Prima cosa a ogni tick: i NON-gari nel quaderno giri liberi (dedup interno
  // per nome file, MAI carriera): il quaderno è autosufficiente anche se il
  // gioco scrive prove SENZA che una gara sia mai in vista. Un errore qui non
  // bagna la scansione delle gare che segue.
  try {
    const st = stateLoader();
    const hl = recordHotlaps(ladder, paths, st, { since: baselineMs - 60 * 1000 });
    outcome.hotlaps = hl.registered;
    outcome.hotLapsSkipped = hl.skipped.length;
  } catch (e) {
    outcome.hotlaps = [];
    recordWarning('watch', 'quaderno giri liberi', e.message);
  }

  for (const f of fresh) {
    let result;
    try {
      result = readSessionResult(f.file);
    } catch {
      outcome.ignored.push({ name: f.name, reason: 'file illeggibile' });
      continue;
    }
    if (!isRaceSession(result)) {
      // le sessioni di prove non sparano nel nulla: il quaderno le cattura
      // (in cima al tick il registro è già capitato bacatamente)
      outcome.ignored.push({ name: f.name, reason: 'non è una gara (nel quaderno giri liberi)' });
      continue;
    }

    let state = null;
    try {
      state = stateLoader();
    } catch (e) {
      outcome.error = new Error(`Salvataggio non leggibile dal watcher: ${e.message}`);
      return outcome;
    }

    try {
      const out = runImport(ladder, paths, state, { force: false, allowAny: false, persist });
      if (out.duplicate) {
        outcome.ignored.push({ name: f.name, reason: 'già incassata (registro anti-doppioni)' });
        continue;
      }
      outcome.imported = out;
      return outcome; // una gara per tick: al prossimo giro si riparte da qui
    } catch (e) {
      // Nessuna ronda combaciante ecc.: non è un guasto del watcher, è la realtà
      // dei file di gara. Una sola voce per file, e il ciclo continua.
      if (e.code !== 'NO_CANDIDATE' && e.code !== 'PLAYER_NOT_FOUND' && e.code !== 'TRACK_MISMATCH') {
        outcome.error = e;
        recordWarning('watch', 'import dal watcher fallito', e.message);
      }
      outcome.ignored.push({ name: f.name, reason: (e.message ?? String(e)).split('\n')[0] });
    }
  }
  return outcome;
}
