// live-contatto.test.mjs — i campi di contatto e volante (6/11).
// Il physics di EVO scrive vibrazioni e FFB: questi test fissano che vengano
// estratti grezzi (nessuna conversione, nessuna soglia) e che i buchi restino
// null invece di diventare zeri inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contattoDaPhysics } from '../src/shmem.mjs';

test('contatto: nessun physics = nessun dato (mai un oggetto di zeri)', () => {
  assert.equal(contattoDaPhysics(null), null);
  assert.equal(contattoDaPhysics(undefined), null);
});

test('contatto: vibrazioni e FFB come li scrive il gioco, arrotondati a 3 decimali', () => {
  // valori presi dal collaudo reale del 4/11 a Laguna Seca
  const c = contattoDaPhysics({
    finalFF: -0.03412345,
    roadVibrations: 0.14554,
    kerbVibration: -0.1642,
    slipVibrations: 0.97261,
    absVibrations: 1,
  });
  assert.equal(c.ffb, -0.034);
  assert.deepEqual(c.vibration, { road: 0.146, kerb: -0.164, slip: 0.973, abs: 1 });
});

test('contatto: carico, sospensioni e acqua senza conversioni nascoste', () => {
  const c = contattoDaPhysics({
    wheelLoad: [290.291, 4014.292, 17201.984, 0],
    suspensionTravel: [0.018, 0.122, 0.0555, 0.09],
    waterTemp: 79.87,
  });
  assert.deepEqual(c.wheelLoadN, [290, 4014, 17202, 0], 'il carico resta in N, arrotondato all’unità');
  assert.deepEqual(c.suspensionM, [0.018, 0.122, 0.056, 0.09], 'la sospensione resta in METRI: la GUI la mostra in cm');
  assert.equal(c.waterTempC, 79.9);
});

test('contatto: campi assenti o sporchi restano null, non zero', () => {
  const c = contattoDaPhysics({ finalFF: null, roadVibrations: 'x', wheelLoad: [null, Number.NaN] });
  assert.equal(c.ffb, null);
  assert.equal(c.vibration.road, null);
  assert.deepEqual(c.wheelLoadN, [null, null]);
  assert.equal(c.waterTempC, null);
  assert.equal(c.vibration.abs, null);
});
