// 25/10 — installazione pulita: il dizionario personale delle auto (map.json)
// era stato azzerato e il Prepara non scriveva più l'auto. L'apprendimento a
// fine gara (learnCar) lo ricostruisce da solo; qui lo proviamo come vengono
// usati: non tocca MAI il data/ reale (mapFile e garage sono file di test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { garageBuf } from '../tools/set-driver-car.mjs';
import { decodeGarage, learnCar, learnCarFromLogs } from '../tools/set-car-sample.mjs';

function casa() {
  const dir = mkdtempSync(join(tmpdir(), 'learn-car-'));
  return {
    garage: join(dir, 'garage.drivergarage'),
    map: join(dir, 'map.json'),
  };
}

test('learnCar: coppio del garage riconosciuta col nome dal file risultati', () => {
  const { garage, map } = casa();
  writeFileSync(garage, garageBuf('0x1234', '0x5678'));
  const out = learnCar('Abarth 695 Biposto', { garage, mapFile: map });
  assert.equal(out?.learned, true);
  // la chiave è quella di decodeGarage: hash e guid2 sistimati su 16 cifre hex
  const { carHash, guid2 } = decodeGarage(readFileSync(garage));
  assert.equal(out.key, `${carHash}|${guid2}`);
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.equal(entries[`${carHash}|${guid2}`], 'Abarth 695 Biposto');
});

test('learnCar: NON riscrive una coppia già mappata (idempotente)', () => {
  const { garage, map } = casa();
  writeFileSync(garage, garageBuf('0xdead', '0xbeef'));
  assert.equal(learnCar('Opel Corsa', { garage, mapFile: map })?.learned, true);
  assert.equal(learnCar('Opel Corsa', { garage, mapFile: map }), null);
  const { carHash, guid2 } = decodeGarage(readFileSync(garage));
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.deepEqual(entries[`${carHash}|${guid2}`], 'Opel Corsa');
});

test('learnCar: garage vergine o assente → non impara niente, non esplode', () => {
  const { garage, map } = casa();
  assert.equal(learnCar('Fiat 500', { garage, mapFile: map }), null);   // file assente
  assert.equal(learnCar('Fiat 500', { garage, mapFile: map }), null);   // e di nuovo senza ingorghi
});

test('learnCar: nome mancante → nulla da mappare', () => {
  const { garage, map } = casa();
  writeFileSync(garage, garageBuf('0x1', '0x2'));
  assert.equal(learnCar(null, { garage, mapFile: map }), null);
  assert.equal(learnCar('', { garage, mapFile: map }), null);
  assert.equal(learnCar('', { garage, mapFile: map }), null);
});

// 31/10 — formato 3: lo spawn del player dichiara la coppia del garage
// ("[ServerVehicleSystem][coppia] Creating Car (Mauro …") e la stessa coppia
// sale su "Loaded car <coppia> (ks_…)": deve impararla anche se la coppia NON
// è in data/car-guids.json (le uniche Mini/911 del gioco non ci sono mai state).
test('learnCarFromLogs: spawn player viene dimenticata anche se fuori tabella ufficiale', () => {
  const { map } = casa();
  const dir = mkdtempSync(join(tmpdir(), 'learn-logs-'));
  writeFileSync(join(dir, 'log-prova.txt'),
    '[2026-10-31 16:00:00.000] [server] [info] [C:1|G:0] [ServerVehicleSystem][deadbeefcafe0001-feedface12340001] Creating Car (Mauro Turbigno\t76561198040513102)\r\n' +
    '[2026-10-31 16:00:01.000] [dataUtils] [info] Loaded car deadbeefcafe0001-feedface12340001 (ks_mini_jcs_1990)\r\n');
  const out = learnCarFromLogs({ logsDir: dir, mapFile: map });
  assert.equal(out.added, 1);
  assert.deepEqual(out.voci, [{ label: 'Mini Jcs 1990', key: '0xDEADBEEFCAFE0001|0xFEEDFACE12340001' }]);
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.equal(entries['0xDEADBEEFCAFE0001|0xFEEDFACE12340001'], 'Mini Jcs 1990');
  // idempotente: secondo giro non aggiunge nulla
  assert.equal(learnCarFromLogs({ logsDir: dir, mapFile: map }).added, 0);
});
