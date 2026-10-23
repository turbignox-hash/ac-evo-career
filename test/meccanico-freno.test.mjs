// test/meccanico-freno.test.mjs — "Segna al meccanico" (Mauro 23/10):
// la scheda freno dell'auto scelta. Test delle PARTI PURE (nome riconosciuto,
// zona dal bias) e dei casi d'errore di brakePlanOf (senza disco, senza cartella).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { normalizeNameMaybe, brakeZoneOf, brakePlanOf } from '../src/carsetup.mjs';

const ladder = { contentNames: { cars: { 'cars/ferrari/296_gt3': 'Ferrari 296 GT3', id_f2004: 'Ferrari F2004' } } };
const state = { cars: [{ carId: 'id_f2004', carName: 'Ferrari F2004' }] };

test('normalizeNameMaybe riconosce il modello scritto liberamente', () => {
  assert.equal(normalizeNameMaybe('Ferrari 296 GT3', ladder, state), 'Ferrari 296 GT3');
  assert.equal(normalizeNameMaybe('ferrari  296   gt3', ladder, state), 'Ferrari 296 GT3');
  assert.equal(normalizeNameMaybe('id_f2004', ladder, state), 'id_f2004');
  assert.equal(normalizeNameMaybe('296 gt3', ladder, state), 'Ferrari 296 GT3');
  assert.equal(normalizeNameMaybe(' Fiat Punto ', ladder, state), null);
  assert.equal(normalizeNameMaybe('', ladder, state), null);
});

test('brakeZoneOf: la zona viene dal bias del file di carriera', () => {
  assert.equal(brakeZoneOf({ brakes: { bias: 60 } }).zona, 'anteriore');
  assert.equal(brakeZoneOf({ brakes: { bias: 45 } }).zona, 'posteriore');
  assert.equal(brakeZoneOf({ brakes: { bias: 52 } }).zona, 'equilibrata');
  assert.equal(brakeZoneOf({}).zona, null);
  assert.deepEqual(brakeZoneOf({ brakes: { bias: 55.5 } }).labels, { bias: 55.5 });
});

test('brakePlanOf dichiara gli errori invece di inventarsi schede', () => {
  // disco inesistente: il messaggio è chiaro, ok è falso, niente eccezioni
  const noDisk = brakePlanOf('Ferrari 296 GT3', ladder, state, { paths: { dataDirs: [join('Z:', 'non-esiste')] } });
  assert.equal(noDisk.ok, false);
  assert.ok(noDisk.error);
  // il messaggio di errore riporta il NOME dell'auto (da un nome carino in una lista vuota)
  assert.equal(noDisk.carName, 'Ferrari 296 GT3');
});