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
import { decodeGarage, learnCar } from '../tools/set-car-sample.mjs';

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
