// test-mode.mjs — la MODALITÀ TEST: tutte le gare della scala a N giri (default 3)
// finché non la spegni. Nata dalla richiesta di Mauro (19/10/2026): mentre si testa
// la carriera (griglia, calibrazione, import) le gare lunghe bruciano serate;
// 3 giri bastano a generare TUTTI i dati (risultati, calibrazione, rivali).
//
// Come funziona:
//   • ON: salva OGNI giro originale per ogni ronda di ogni serie in
//     data/mode-test-3giri.json (con backup del ladder in data/backups) e
//     riscrive i calendari della scala a `giri`.
//   • OFF: ripristina ESATTAMENTE i giri originali dal registro e toglie il
//     banner. Se il ladder è cambiato nel frattempo (nuove serie), le rond
//     fuori dal registro restano come sono (mai inventare dati).
//   • il registro resta sul disco finché non si spegne: il banner in
//     status/next/agenda lo riporta a ogni avvio dei comandi.
//
// Il ladder è condiviso fra gli slot di carriera: la modalità è di macchina,
// non di singola carriera (giusto: sono i calendari di serie, non lo stato).

import { readFileSync, copyFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';
import { tr } from './lang.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);
export const TEST_FILE = () => join(PROJECT, 'data', 'mode-test-3giri.json');
const LADDER_FILE = join(PROJECT, 'config', 'career.evo.ladder.json');
const BACKUP_DIR = join(PROJECT, 'data', 'backups');

/** Stato della modalità: { attivo, dal, giri, salva: {nodeId: {roundIdx: laps}}} o null. */
export function testMode() {
  try {
    const j = JSON.parse(readFileSync(TEST_FILE(), 'utf8'));
    if (j?.attivo) return j;
  } catch { /* assente: modalità spenta */ }
  return null;
}

let _ladderCache = null;
function caricaLadder() {
  if (!_ladderCache) _ladderCache = JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
  return _ladderCache;
}

/**
 * Attiva (o RINNOVA) la modalità: riscrive i calendari a N giri, salva gli
 * originali. Rilanciata mentre è attiva NON fa l'early-return cieco di una
 * volta (lezione 27/10: le serie nate DOPO l'attivazione restavano coi giri
 * veri — coppa_strada_80 a 7/8 invece di 3, e la gara è partita lunga):
 * adotta i giri DIVERSI da N che non ha già registrato, così anche le serie
 * nuove finiscono a N e un rilancio non inventa un ripristino.
 */
export function testModeOn({ giri = 3 } = {}) {
  const attuale = testMode();
  const n = Math.max(1, Math.min(50, Math.floor(Number(giri) || attuale?.giri || 3)));
  const ladder = caricaLadder();
  const salva = attuale?.salva ?? {};
  let rond = 0;
  for (const node of ladder.nodes ?? []) {
    if (!Array.isArray(node.calendar)) continue;
    for (const [i, r] of node.calendar.entries()) {
      if (r?.laps == null) continue;
      if (Number(r.laps) === n) continue;          // già a N: nulla da ricordare/ripristinare
      // già registrato in un'attivazione precedente: NON sovrascrivo il valore
      // originale (è l'unico riferimento per il ripristino a --off)
      if (attuale && salva[node.nodeId]?.[i] != null) {
        r.laps = n;
        rond++;
        continue;
      }
      (salva[node.nodeId] ??= {})[i] = Number(r.laps);
      r.laps = n;
      rond++;
    }
  }
  if (attuale && rond === 0) return { already: true, giri: n };
  if (rond) {
    try { mkdirSync(BACKUP_DIR, { recursive: true }); copyFileSync(LADDER_FILE, join(BACKUP_DIR, `career.evo.ladder.bak-testmode-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}.json`)); } catch { /* il backup non deve bloccare */ }
    writeJsonAtomic(LADDER_FILE, ladder);
  }
  writeJsonAtomic(TEST_FILE(), {
    attivo: true, dal: new Date().toISOString(), giri: n,
    rond, salva,
    _readme: 'Modalità test: gare a N giri. Riattiva le distanze vere con: node ac-evo-career.mjs test-mode --off',
  });
  _ladderCache = ladder;
  return { attivato: true, giri: n, rond, rinnovato: !!attuale };
}

/** Disattiva: ripristina i giri originali dal registro di attivazione. */
export function testModeOff() {
  const m = testMode();
  if (!m) return { already: true };
  const ladder = caricaLadder();
  let ripristinate = 0, mancanti = 0;
  for (const node of ladder.nodes ?? []) {
    const orig = m.salva?.[node.nodeId];
    if (!orig || !Array.isArray(node.calendar)) continue;
    for (const [i, laps] of Object.entries(orig)) {
      const r = node.calendar[Number(i)];
      if (!r) { mancanti++; continue; }
      r.laps = Number(laps);
      ripristinate++;
    }
  }
  if (ripristinate) writeJsonAtomic(LADDER_FILE, ladder);
  try { unlinkSync(TEST_FILE()); } catch { /* già assente */ }
  _ladderCache = ladder;
  return { spento: true, ripristinate, mancanti };
}

/** Il messaggio da mostrare in CLI finché la modalità è attiva (o null). */
export function testModeBanner() {
  const m = testMode();
  if (!m) return null;
  const dal = String(m.dal ?? '').slice(0, 16).replace('T', ' ');
  return [
    tr({ it: `⚠  MODALITÀ TEST ATTIVA: tutte le gare della scala a ${m.giri} giri (da ${dal}, ${m.rond} rond toccate).`, en: `⚠  TEST MODE ON: every ladder race at ${m.giri} laps (since ${dal}, ${m.rond} rounds touched).` }),
    tr({ it: '   Per riattivare le distanze vere: node ac-evo-career.mjs test-mode --off', en: '   To restore the real distances: node ac-evo-career.mjs test-mode --off' }),
  ].join('\n');
}
