// 30/10 — La potatura dei log unbounded entra in suite: logMatch (match-auto.log)
// e il watchdog del registro flussi (flows-debug.jsonl) appendevano SENZA freno
// (compte 19,9 MB e 1,4 MB a fine ottobre). Il test copre: append normale sotto
// soglia, taglio oltre soglia con le ultime 600 righe conservate, vin cereus
// appendito DOPO il taglio (MAI throw's: un log non deve bloccare mai).
import './_flows-sandbox.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.EVO_FLOW_DEBUG = join(process.env.EVO_FLOWS_DIR, 'flows-debug.jsonl');

const { logMatch } = await import('../src/car-match.mjs');
const flows = await import('../src/flows.mjs');

const righeVecchie = Array.from({ length: 4000 }, (_, i) => `vecchia-riga-${i} ${'x'.repeat(120)}`);
const LOG = join(process.env.EVO_FLOWS_DIR, 'match-auto.log');
const DBG = process.env.EVO_FLOW_DEBUG;

test('logMatch: append sotto soglia, il file non viene toccato dalla potatura', () => {
  writeFileSync(LOG, 'una-riga-vecchia\n', 'utf8');
  const st = statSync(LOG).size;
  assert.equal(logMatch(process.env.EVO_FLOWS_DIR, ['riga-nuova-1']), true);
  const testo = readFileSync(LOG, 'utf8');
  assert.ok(testo.includes('una-riga-vecchia'), 'append normale: la vecchia resta');
  assert.ok(testo.includes('riga-nuova-1'));
  assert.ok(statSync(LOG).size > st, 'sotto soglia cresce senza taglio');
});

test('logMatch: oltre soglia le vecchie dell\'inizio VANO, le ultime e le nuove restano', () => {
  writeFileSync(LOG, righeVecchie.join('\n') + '\n', 'utf8');
  const prima = statSync(LOG).size;
  assert.ok(prima > 512 * 1024, 'fixture oltre la soglia reale di 512 KB: prima della potatura');
  assert.equal(logMatch(process.env.EVO_FLOWS_DIR, ['riga-verde-1', 'riga-verde-2']), true);
  const peso = statSync(LOG).size;
  const testo = readFileSync(LOG, 'utf8');
  assert.ok(peso < 700 * 1024, `dopo il taglio il log resta piccolo (assistito: ${peso})`);
  assert.ok(!testo.includes('vecchia-riga-0'), 'le righe vecchie dell\'inizio spariscono');
  assert.ok(testo.includes('vecchia-riga-3999'), 'le ultime sopra soglia restano');
  assert.ok(testo.includes('riga-verde-2'), 'l\'append DOPO la potatura arriva');
});

test('flussi: il watchdog si taglia pure lui quando il debug supera la soglia', () => {
  writeFileSync(DBG, righeVecchie.map((r) => JSON.stringify({ x: r })).join('\n') + '\n', 'utf8');
  flows.recordFlows({ season: 0, node: null }, { kind: 'prize', money: 10, reason: 'prova potatura watchdog' });
  const testo = readFileSync(DBG, 'utf8');
  const riga = testo.split('\n').filter(Boolean).at(-1);
  assert.ok(statSync(DBG).size < 700 * 1024, 'il watchdog resta piccolo');
  assert.ok(!testo.includes('vecchia-riga-0'), 'le vecchie dell\'inizio vanno');
  assert.ok(riga.includes('prova potatura watchdog'), 'la riga fresca col pid resta');
  assert.ok(riga.includes('pid'), 'la riga del watchdog porta il pid');
  assert.deepEqual(flows.expectedTotals(), { money: 6010, rep: 0 }, 'i totali registrati sono giusti');
});
