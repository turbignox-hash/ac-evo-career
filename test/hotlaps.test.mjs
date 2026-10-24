// hotlaps.test.mjs — il quaderno dei GIRI LIBERI (24/10, Mauro: «modalità free:
// scegli pista e auto e gira a piacimento, i giri registrati e analizzati»).
//
// Garanzie provate qui:
//   1. le GARE restano affari del watcher: il quaderno non le tocca MAI;
//   2. una sessione di prove si registra una volta sola (dedup per nome file);
//   3. il libro PB segue il pilota: battuto, il PB vecchio perde la bandierina;
//   4. i risultati altrui (server, amici, flag generico) restano fuori;
//   5. il watcher CLI a ogni giro alimenta il quaderno senza incassare carriera.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LADDER = readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8');

// isolato PRIMA degli import: il quaderno nasce nel nido della cartella finta
const DATA = mkdtempSync(join(tmpdir(), 'evo-hotlaps-'));
process.env.EVO_DATA_DIR = DATA;
process.env.ACE_DATA = DATA; // resolvePaths: solo questa cartella Results

const { recordHotlaps, hotlapsLog, hotlapSweep } = await import('../src/hotlaps.mjs');
const { resolvePaths } = await import('../src/paths.mjs');
const { watchOnce } = await import('../src/watch.mjs');
const ladder = JSON.parse(LADDER);
// il pilota finto della carriera (recordHotlaps non tocca altro dello state)
const FAKE_STATE = { driver: { first: 'Test', last: 'Driver' } };

const Results = join(DATA, 'Results');
mkdirSync(Results, { recursive: true });
// resolvePaths DOPO la creazione: le cartelle inesistenti non entrano nei resultsDirs
const paths = resolvePaths();

const PRATICA = {
  session: 'practice',
  track: 'imola',
  layout: 'GP',
  hour: 10, min: 45,
  weather_type: 'Clear',
  drivers: [{
    driver_name: 'Test', driver_surname: 'Driver', driver_nation: 'ITA',
    is_current_driver: true,
    position: 0, laps: 3,
    lap_times: ['1:45.000', '1:42.500', '1:43.120'],
    best_lap: '1:42.500',
    splits: ['0:32.000', '0:31.500', '0:35.000'],
    car_brand: 'Abarth', car_name: 'Abarth 695 Biposto',
    car_number: 65,
    total_time: '5:10.620',
  }, {
    driver_name: '\u2022', driver_surname: 'AI Omega', driver_nation: 'DEU',
    is_current_driver: false, position: 1, laps: 3,
    car_brand: 'Abarth', car_name: 'Abarth 695 Biposto', splits: ['0:30.000', '0:30.500', '0:31.000'],
  }],
};

function writeResult(name, obj, mtimeMs = Date.now() - 30_000) {
  const file = join(Results, name);
  writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  // utimesSync lavora a SECONDI: sotto il secondo la freschezza del watcher è
  // lotteria ⇒ di default i file sono «vecchi» di 30 s; i test che vogliono un
  // file DAVVERO fresco passano un mtime esplicito (in futuro di 2 s)
  utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
}

test('una sessione di prove si registra una volta sola (dedup per nome file)', () => {
  writeResult('261024-104500_SP_Practice.sessionresults.json', PRATICA);
  const out = recordHotlaps(ladder, paths, FAKE_STATE, { since: 0 });
  assert.equal(out.registered.length, 1, JSON.stringify(out.skipped));
  const e = out.registered[0];
  assert.equal(e.session, 'practice');
  assert.equal(e.trackPretty ?? e.track, 'Imola'); // nome bello dal ladder
  assert.equal(e.carPretty ?? e.car, 'Abarth 695 Biposto');
  assert.equal(e.bestLap, '1:42.500');
  assert.ok(e.isPB, 'prima sessione: PB per forza');
  // il quaderno non dupplica: di nuovo lo stesso file = zero nuove righe
  const again = recordHotlaps(ladder, paths, FAKE_STATE, { since: 0 });
  assert.equal(again.registered.length, 0);
  assert.equal(hotlapsLog().total, 1);
});

test('le gare restano fuori: il quaderno non tocca il territorio del watcher', () => {
  writeResult('261024-150000_SP_Race.sessionresults.json', { ...PRATICA, session: 'race' });
  const out = recordHotlaps(ladder, paths, FAKE_STATE, { since: 0 });
  assert.equal(out.registered.length, 0);
  assert.ok(out.skipped.some((s) => /gara/.test(s.why)), `atteso scarto per gara: ${JSON.stringify(out.skipped)}`);
  assert.equal(hotlapsLog().total, 1); // ancora solo la pratica
});

test('result altrui / schermata senza pilota della carriera resta fuori', () => {
  // DUE nomi non della carriera: nessun match per nome e nessun fallback
  // «unico pilota» (con un pilota solo EVO SP è ragionevole considerarlo tuo)
  writeResult('261024-110000_SP_Practice.sessionresults.json', {
    ...PRATICA,
    drivers: [
      { ...PRATICA.drivers[0], driver_name: 'Mario', driver_surname: 'Rossi', is_current_driver: false },
      { ...PRATICA.drivers[0], driver_name: 'Luca', driver_surname: 'Bianchi', is_current_driver: false },
    ],
  });
  const out = recordHotlaps(ladder, paths, FAKE_STATE, { since: 0 });
  assert.equal(out.registered.length, 0);
  assert.ok(out.skipped.some((s) => /pilota/.test(s.why)));
});

test('battuto il PB: il vecchio perde la bandierina e il libro punta al nuovo', () => {
  writeResult('261024-120000_SP_Practice.sessionresults.json', {
    ...PRATICA,
    drivers: [{ ...PRATICA.drivers[0], best_lap: '1:40.000', lap_times: ['1:45.000', '1:40.000', '1:41.000'] }],
  });
  const out = recordHotlaps(ladder, paths, FAKE_STATE, { since: 0 });
  assert.equal(out.registered.length, 1);
  const book = hotlapsLog();
  assert.equal(book.total, 2);
  const pbs = book.sessions.filter((s) => s.isPB);
  assert.equal(pbs.length, 1, 'per auto+pista UN solo PB');
  assert.equal(pbs[0].bestLap, '1:40.000', 'il PB è il giro appena registrato');
  // il libro PB dice la stessa cosa col giro perfetto dai settoriali
  const rec = book.records[0];
  assert.equal(rec.car, 'Abarth 695 Biposto');
  assert.equal(rec.lap, '1:40.000');
  assert.ok(rec.idealLapMs > 0 && rec.idealLapMs < rec.lapMs, `giro ideale dai settoriali: ${rec.idealLapMs}`);
});

test('watchOnce alimenta il quaderno da solo (nessun incasso di carriera)', () => {
  // con mtime FUTURO (2 s oltre adesso) il file è fresco al 100% qualunque sia
  // la quantizzazione a secondi di utimesSync
  writeResult('261024-130000_SP_HotStint.sessionresults.json', PRATICA, Date.now() + 2000);
  const out = watchOnce(ladder, paths, {
    baselineMs: Date.now(),
    stateLoader: () => FAKE_STATE,
  });
  assert.equal(out.error, null, `watcher in errore: ${out.error?.message ?? ''}`);
  assert.equal(out.imported, null, 'una pratica non incassa carriera');
  assert.ok(out.ignored.some((i) => i.name.includes('HotStint')), 'la pratica resta un non-gara per il watcher');
  assert.equal(out.hotlaps.length, 1, `la spazzata giri liberi registra: ${JSON.stringify(out.hotlaps)}`);
  assert.equal(out.hotlaps[0].bestLap, '1:42.500');
});

test('hotlapSweep coi mtime già visti: zero letture, zero registrazioni doppie', () => {
  const before = hotlapsLog().total;
  const out = hotlapSweep(ladder, paths, FAKE_STATE, { since: Date.now() + 60 * 1000 });
  assert.equal(out.registered.length, 0);
  assert.equal(hotlapsLog().total, before);
});

test('record-file a mano: un vecchio risultato entra nel quaderno per nome', () => {
  const old = '261020-090000_SP_Practice.sessionresults.json';
  writeResult(old, { ...PRATICA, hour: 9 }, Date.parse('2026-10-20T09:00:00Z'));
  const out = recordHotlaps(ladder, paths, FAKE_STATE, { file: old });
  assert.equal(out.registered.length, 1, JSON.stringify(out.registered));
  assert.equal(hotlapsLog().total, 4);
});
