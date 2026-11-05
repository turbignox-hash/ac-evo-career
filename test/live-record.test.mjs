// live-record.test.mjs — il registratore non deve perdere il raw (4/11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiveRecorder, COLONNE_CSV, flattenLive } from '../src/live-record.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'evo-live-record-'));

const snap = {
  game: true,
  live: true,
  session: { id: 'e:1:Race', type: 'Race', track: 'Imola', layout: 'GP' },
  player: { car: 'ks_ferrari_488', position: 3, drivers: 12, lapNo: 4, lapsDone: 3, lapsTotal: 10, fuel: 31.2 },
  timing: { deltaCurrentP: 120 },
  map: { cars: [[10, 20, 30]] },
  raw: {
    graphics: {
      speedKmh: 212, gear: 4, rpm: 7800, gasPercent: 0.9, brakePercent: 0, steeringPercent: -0.1,
      fuelLiters: 31.2, fuelPerLap: 2.4, lapsPossibleFuel: 13,
      currentLapMs: 81234, lastLapMs: 80456, bestLapMs: 80100, deltaMs: -120,
      carIds: Array.from({ length: 60 }, (_, i) => [String(1000 + i), String(2000 + i)]),
      tyres: {
        lf: { temperatureC: 90, temperatureInnerC: 92, pressurePsi: 2.1, brakeTempC: 410 },
        rf: { temperatureC: 91, temperatureInnerC: 93, pressurePsi: 2.2, brakeTempC: 420 },
        lr: { temperatureC: 80, temperatureInnerC: 82, pressurePsi: 2.0, brakeTempC: 300 },
        rr: { temperatureC: 81, temperatureInnerC: 83, pressurePsi: 2.1, brakeTempC: 310 },
      },
    },
    physics: { gas: 0.9 },
  },
};

test('NDJSON: una riga per tick e il raw completo', async () => {
  const file = join(TMP, 'tick.ndjson');
  const rec = new LiveRecorder({ source: async () => snap, file });
  await rec.tick(1000);
  await rec.tick(1900);
  const righe = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(righe.length, 2);
  assert.equal(righe[0].ts, 1000);
  assert.equal(righe[0].snapshot.raw.graphics.carIds.length, 60);
  assert.equal(righe[1].snapshot.raw.graphics.tyres.rf.brakeTempC, 420);
  assert.equal(rec.count, 2);
});

test('CSV: header una volta, colonne stabili e valori chiave', async () => {
  const file = join(TMP, 'tick.csv');
  const rec = new LiveRecorder({ source: async () => snap, file, format: 'csv' });
  await rec.tick(1000);
  await rec.tick(2000);
  const righe = readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(righe[0], COLONNE_CSV.join(','));
  assert.equal(righe.length, 3);
  const valori = righe[1].split(',');
  const indice = (k) => COLONNE_CSV.indexOf(k);
  assert.equal(valori[indice('speed_kmh')], '212');
  assert.equal(valori[indice('brake_temp_fr')], '420');
  assert.equal(valori[indice('car_ids_count')], '60');
});

test('fonte rotta: il tick viene registrato con errore, senza crash', async () => {
  const file = join(TMP, 'errore.ndjson');
  const rec = new LiveRecorder({ source: async () => { throw new Error('server giù'); }, file });
  const out = await rec.tick(1000);
  assert.equal(out.error, 'server giù');
  const riga = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(riga.snapshot.error, 'server giù');
  assert.equal(flattenLive(out).errore, 'server giù');
});
