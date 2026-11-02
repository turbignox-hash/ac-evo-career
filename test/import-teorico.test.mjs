// test/import-teorico.test.mjs — la legge del teorico VERO sull'IMPORT GARA
// (3/11, notte — stessa forgia sintetica di test/rapporto-gara.test.mjs).
// La scheda dell'import (r.entry.sectors, persistita nel save e mostrata da
// gui/js/viste-c.js) DEVE portare il teorico dai log del gioco quando un log
// abina la tripla del best, e DEVE uscire NULL quando non abina: mai la somma
// dei splits del file (quella è il best per costruzione).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync as rf } from 'node:fs';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const TMP = mkdtempSync(join(tmpdir(), 'import-teorico-'));
const RESULTS = join(TMP, 'Results');
const LOGS = join(TMP, 'Logs');
mkdirSync(RESULTS, { recursive: true });
mkdirSync(LOGS, { recursive: true });
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'import-teorico-data-'));

const { runImport } = await import('../src/import.mjs');
const { createCareer } = await import('../src/state.mjs');
const ladder = JSON.parse(rf(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));

/** una riga come la scrive EVO (splits in 00:xx.xxx) */
const ai = (over = {}) => ({
  driver_name: '• AI', driver_surname: 'X', position: 0, laps: 3,
  car_name: 'GT3 Evo', car_brand: 'Silver',
  best_lap: '2:34.900', has_best_lap: true, total_time: '7:58.900', splits: [],
  ...over,
});

const FILE = '260416-2108_Race.sessionresults.json';
const gara = {
  season: '2026', event: 'week-3', session: 'race',
  track: 'Misano World Circuit', layout: 'Full',
  hour: 15, min: 30, weather_type: 'GameModeSelectionWeatherType_Sun',
  drivers: [
    ai({ driver_name: '• AI', driver_surname: 'A1', position: 0, best_lap: '2:34.900', total_time: '7:58.900' }),
    ai({ driver_name: 'Pietro', driver_surname: 'Pitwall', position: 1, is_current_driver: true, has_best_lap: false, best_lap: '2:35.100', total_time: '7:59.300', splits: ['00:44.310', '00:47.328', '01:07.017'] }),
    ai({ driver_name: '• AI', driver_surname: 'B2', position: 2, best_lap: '2:36.400', total_time: '8:01.000' }),
  ],
};
writeFileSync(join(RESULTS, FILE), JSON.stringify(gara), 'utf8');

// il log gemello di quello del test del rapporto: la tripla del best al giro 1,
// al giro 2 S1 più veloce → teorico = 43900+47328+67017 = 158245 = 2:38.245,
// margine = best accreditato (158655) − 158245 = 410, su 2 giri segnati.
const CAR = '8f8e1f77-d6a7-4ef3-a856-4eb06fa51fe8';
const righeLog = [
  '[2026-04-16 21:09:00.000] [general] [info] Game Started! Assetto Corsa EVO | Misano World Circuit Full Race | track: misano',
  ...[
    ['(44310 ms, splitindex 0) lap:1', '21:10:01.000'],
    ['(47328 ms, splitindex 1) lap:1', '21:10:41.000'],
    ['(67017 ms, splitindex 2) lap:1', '21:11:21.000'],
    ['(43900 ms, splitindex 0) lap:2', '21:12:01.000'],
    ['(47900 ms, splitindex 1) lap:2', '21:12:41.000'],
    ['(67500 ms, splitindex 2) lap:2', '21:13:21.000'],
  ].map(([s, ts]) => `[2026-04-16 ${ts}] [gameplay] [info] Split completed for car ${CAR}: ${s}`),
];
writeFileSync(join(LOGS, 'log-260416-2115.txt'), righeLog.join('\n') + '\n', 'latin1');

const NOOP = () => { /* persist iniettata: la carriera su disco non ci tocca */ };

test('l\u2019import gara porta il teorico VERO del log nella scheda', () => {
  const state = createCareer(ladder, { name: 'Pietro Pitwall', nation: 'ITA', discipline: 'entry' });
  const out = runImport(ladder, { resultsDirs: [RESULTS], logsDirs: [LOGS] }, state, {
    allowAny: true, force: true, persist: NOOP,
  });
  assert.equal(out.ok, true, `niente errore: ${JSON.stringify(out.error ?? '?')}`);
  const sec = out.entry?.sectors;
  assert.ok(sec, 'la scheda porta il blocco sectors');
  assert.equal(sec.theoreticalMs, 158245, `theoreticalMs = minimo per settore dal log: ${sec.theoreticalMs}`);
  assert.equal(sec.theoreticalText, '2:38.245', `theoreticalText dal log: ${sec.theoreticalText}`);
  assert.ok(sec.veroLog, 'il log del vero viaggia con la scheda');
  assert.equal(sec.veroLog.margineMs, 410, `il margine vero: ${sec.veroLog?.margineMs}`);
  assert.equal(sec.veroLog.giri, 2, 'i giri segnati che reggono il numero');
});

test('senza log abbinati la scheda del teorico esce NULL (niente numero finto)', () => {
  // stesso file, nessun log: la somma dei splits (= il best per costruzione)
  // NON deve riapparire come teorico
  const state = createCareer(ladder, { name: 'Pietro Pitwall 2', nation: 'ITA', discipline: 'entry' });
  writeFileSync(join(RESULTS, '260416-2109_Race.sessionresults.json'), JSON.stringify({ ...gara, track: 'Brands Hatch' }), 'utf8');
  const out = runImport(ladder, { resultsDirs: [RESULTS], logsDirs: [LOGS] }, state, {
    allowAny: true, force: true, persist: NOOP,
  });
  assert.equal(out.ok, true, `niente errore: ${JSON.stringify(out.error ?? '?')}`);
  // Brands Hatch non ha log: teorico NULL, la scheda mostra «—»
  assert.equal(out.entry?.sectors?.theoreticalText, null, 'niente teorico senza log abbinati');
  assert.equal(out.entry?.sectors?.theoreticalMs, null, 'niente ms finti');
});
