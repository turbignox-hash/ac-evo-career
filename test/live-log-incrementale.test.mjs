// live-log-incrementale.test.mjs — IL LETTORE INCREMENTALE DEL LOG LIVE (6/11).
//
// Il difetto custodito: la rotta `live-riepilogo` rileggeva e riparsava TUTTO
// il log a ogni scrittura del monitor (365 ms su 10 MB, 1.160 ms su 35 MB, sul
// thread che serve anche la GUI). Il lettore consuma solo i byte aggiunti.
//
// La legge: il risultato del lettore deve essere SEMPRE identico al riepilogo
// dell'intero file (`riepiloghiMonitor` sul testo completo). Si sfonda in tre
// modi, e ognuno ha il suo test:
//   • si perde una riga perché il file cresce in due pezzi (una riga a metà
//     scrittura non deve entrare e non deve nemmeno sparire);
//   • dopo un troncamento o una sostituzione del file si continua a leggere dal
//     vecchio offset, mescolando contenuti di file diversi;
//   • una rilettura non richiesta (nessun byte nuovo) ricalcola o cambia stato.
// Si prova anche il caso «file assente», che la scheda del Cruscotto usa per
// dire «in attesa» invece di mostrare un riepilogo vuoto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lettoreLogLive } from '../src/live-log-incrementale.mjs';
import { parseLog, riepiloghiMonitor } from '../src/live-monitor-riepilogo.mjs';

const riga = (at, { done = 0, last = null, best = null, live = true, pos = 3 } = {}) => JSON.stringify({
  at, live, session: 'Race', track: 'Laguna Seca', pos, speed: 120,
  lapsDone: done, lastLapMs: last, bestLapMs: best,
  load: [4000, 4000, 3000, 3000], susp: [0.04, 0.04, 0.05, 0.05],
  slipDeg: [5.73, -5.73, 2.86, -2.86], slipRatio: [0.2, -0.2, 0.1, -0.1],
  brakeC: [300, 310, 200, 210], vibRoad: 0.02, vibKerb: 0.01, vibSlip: 0.03, vibAbs: 0, ffb: 0.4,
});

/** La verità di riferimento: riepilogo dell'INTERO testo del file. */
const atteso = (testo) => riepiloghiMonitor(parseLog(testo));
const soloEsito = ({ totale, sessioni, testo }) => ({ totale, sessioni, testo });

/** Due sessioni: la prima chiusa (una riga non-live), la seconda ancora aperta. */
const DUE_SESSIONI = [
  riga('2026-11-06T10:00:00.000Z'),
  riga('2026-11-06T10:00:05.000Z', { done: 1, last: 91_000, best: 91_000 }),
  riga('2026-11-06T10:00:10.000Z', { done: 2, last: 92_500, best: 91_000 }),
  riga('2026-11-06T10:00:15.000Z', { live: false }),
  riga('2026-11-06T11:00:00.000Z', { pos: 7 }),
  riga('2026-11-06T11:00:05.000Z', { pos: 5, done: 1, last: 88_000, best: 88_000 }),
].join('\n') + '\n';

const conFile = (t, contenuto) => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-log-inc-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'live.log');
  writeFileSync(file, contenuto, 'utf8');
  return file;
};

test('prima lettura: identica al riepilogo dell\'intero file', (t) => {
  const file = conFile(t, DUE_SESSIONI);
  const lettore = lettoreLogLive(file);
  const r = lettore.aggiorna();
  assert.equal(r.assente, false);
  assert.equal(r.cambiato, true);
  assert.deepEqual(soloEsito(r), atteso(DUE_SESSIONI));
  assert.equal(r.totale, 2);
  assert.equal(r.sessioni[1].chiusa, false, 'l\'ultima sessione è aperta: il log finisce lì');
  assert.equal(r.sessioni[0].chiusa, true, 'la prima si chiude quando il log torna non-live');
});

test('solo le righe nuove: il file cresce e il riepilogo resta identico al completo', (t) => {
  const file = conFile(t, DUE_SESSIONI);
  const lettore = lettoreLogLive(file);
  lettore.aggiorna();
  const prima = lettore.stato();
  const giro = riga('2026-11-06T11:00:10.000Z', { pos: 4, done: 2, last: 87_250, best: 87_250 });
  appendFileSync(file, `${giro}\n`, 'utf8');
  const r = lettore.aggiorna();
  const nuovo = lettore.stato();
  assert.equal(r.cambiato, true);
  assert.equal(nuovo.righe, prima.righe + 1, 'una riga nuova, una sola riga consumata');
  assert.ok(nuovo.offset > prima.offset);
  assert.deepEqual(soloEsito(r), atteso(DUE_SESSIONI + giro + '\n'));
  assert.equal(r.sessioni[1].giriFatti, 2);
});

test('una riga a metà scrittura non entra, e non si perde quando arriva il resto', (t) => {
  const file = conFile(t, DUE_SESSIONI);
  const lettore = lettoreLogLive(file);
  lettore.aggiorna();
  const giro = riga('2026-11-06T11:00:10.000Z', { pos: 4, done: 2, last: 87_250, best: 87_250 });
  appendFileSync(file, giro.slice(0, 40), 'utf8');          // scrittura interrotta
  const meta = lettore.aggiorna();
  assert.equal(meta.cambiato, false, 'nessuna riga completa: niente da riepilogare');
  assert.deepEqual(soloEsito(meta), atteso(DUE_SESSIONI), 'il riepilogo resta quello di prima');
  appendFileSync(file, `${giro.slice(40)}\n`, 'utf8');        // arriva il resto
  const fine = lettore.aggiorna();
  assert.deepEqual(soloEsito(fine), atteso(DUE_SESSIONI + giro + '\n'), 'la riga spezzata si ricompone');
  assert.equal(fine.sessioni[1].giriFatti, 2);
});

test('nessun byte nuovo: cambiato false e nessun lavoro rifatto', (t) => {
  const file = conFile(t, DUE_SESSIONI);
  const lettore = lettoreLogLive(file);
  const primo = lettore.aggiorna();
  const stato = lettore.stato();
  const secondo = lettore.aggiorna();
  assert.equal(secondo.cambiato, false);
  assert.deepEqual(lettore.stato(), stato, 'offset, righe e resto non si muovono');
  assert.deepEqual(soloEsito(secondo), soloEsito(primo));
});

test('file troncato: si riparte da zero, senza mescolare il vecchio contenuto', (t) => {
  const file = conFile(t, DUE_SESSIONI);
  const lettore = lettoreLogLive(file);
  assert.equal(lettore.aggiorna().totale, 2);
  const nuovo = `${riga('2026-11-06T12:00:00.000Z', { pos: 9 })}\n`;
  writeFileSync(file, nuovo, 'utf8');                        // più corto del vecchio
  const r = lettore.aggiorna();
  assert.equal(r.cambiato, true);
  assert.equal(r.totale, 1, 'una sola sessione: quella del file nuovo');
  assert.deepEqual(soloEsito(r), atteso(nuovo));
});

test('file sostituito (cancellato e ricreato): riepilogo del file nuovo', (t) => {
  const file = conFile(t, DUE_SESSIONI);
  const lettore = lettoreLogLive(file);
  lettore.aggiorna();
  unlinkSync(file);
  const nuovo = `${riga('2026-11-06T12:00:00.000Z', { pos: 2, done: 1, last: 90_000 })}\n`;
  writeFileSync(file, nuovo, 'utf8');
  const r = lettore.aggiorna();
  assert.deepEqual(soloEsito(r), atteso(nuovo));
});

test('log assente: riepilogo vuoto e «assente: true», senza eccezioni', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-log-inc-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lettore = lettoreLogLive(join(dir, 'non-esiste.log'));
  const r = lettore.aggiorna();
  assert.equal(r.assente, true);
  assert.equal(r.totale, 0);
  assert.equal(r.testo, null);
  assert.deepEqual(r.sessioni, []);
});

test('il log può contenere righe rotte: si saltano come nel percorso completo', (t) => {
  const contenuto = `{non-json\n${DUE_SESSIONI}`;
  const file = conFile(t, contenuto);
  const r = lettoreLogLive(file).aggiorna();
  assert.deepEqual(soloEsito(r), atteso(contenuto));
});
