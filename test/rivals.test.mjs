// L'archivio rivali: griglia registrata una volta sola per stagione/ronda/serie
// e recupero pulito se il file si corrompe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'evo-rivals-'));
process.env.EVO_DATA_DIR = DATA;
const { recordRaceGrid, rivalKey } = await import('../src/rivals.mjs');

const result = {
  session: 'race', track: 'Monza',
  drivers: [
    { driver_name: 'Mauro', driver_surname: 'Rossi', position: 0, laps: 10, total_time: '10:00.000', car_brand: 'Fiat', car_name: 'Panda' },
    { driver_name: 'Luca', driver_surname: 'Bianchi', position: 1, laps: 10, total_time: '10:05.000', car_brand: 'Fiat', car_name: 'Panda' },
    { driver_name: 'Paolo', driver_surname: 'Verdi', position: 2, laps: 10, total_time: '10:10.000', car_brand: 'Fiat', car_name: 'Panda' },
  ],
};
const payload = { driverFirst: 'Mauro', driverLast: 'Rossi', position: 1, dnf: false };
const opts = { season: 1, round: 0, nodeId: 'coppa_citta', nodeDisplay: 'Coppa Città', trackDisplay: 'Monza' };

test('rivalKey normalizza nomi e cognomi (accenti, spazi, maiuscole)', () => {
  assert.equal(rivalKey('Mauro', 'Rossi'), rivalKey('mauro', 'rossi'));
  assert.equal(rivalKey('José', 'María'), rivalKey('Jose', 'Maria'));
});

test('recordRaceGrid registra la griglia e blocca il doppio record stessa stagione/ronda/serie', () => {
  const row = recordRaceGrid(result, payload, opts);
  assert.ok(row);
  assert.equal(row.grid.length, 3);
  // stesso season+round+nodeId: bloccato (RETE anti-doppione dell'archivio)
  assert.equal(recordRaceGrid(result, payload, opts), null);
  // ronda diversa: passa
  assert.ok(recordRaceGrid(result, payload, { ...opts, round: 1 }));
  // l'archivio su file ha 2 gare e il testa a testa coerente (P2 e P3 battuti da me in ENTRAMBE)
  const store = JSON.parse(readFileSync(join(DATA, 'rivals.json'), 'utf8'));
  assert.equal(store.races.length, 2);
  assert.equal(store.rivals[rivalKey('Luca', 'Bianchi')].h2h.losses, 2);
  assert.equal(store.rivals[rivalKey('Paolo', 'Verdi')].h2h.losses, 2);
});

test('archivio rivals.json corrotto: copia .corrupt + warning, riparte e registra', () => {
  writeFileSync(join(DATA, 'rivals.json'), '{ corrotto');
  const row = recordRaceGrid(result, payload, { ...opts, round: 2 });
  assert.ok(row);
  const corrupted = readdirSync(DATA).filter((f) => f.startsWith('rivals.json.corrupt-'));
  assert.equal(corrupted.length, 1);
  const warns = readFileSync(join(DATA, 'errors.jsonl'), 'utf8').trim().split('\n');
  assert.ok(warns.some((l) => l.includes('rivals')));
  const store = JSON.parse(readFileSync(join(DATA, 'rivals.json'), 'utf8'));
  assert.equal(store.races.length, 1);
});
