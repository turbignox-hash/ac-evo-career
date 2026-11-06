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

test('contatto: deriva e slip ratio per ruota come li scrive il gioco', () => {
  // valori reali del collaudo del 4/11 a Laguna Seca (fisica, non zeri di comodo)
  const c = contattoDaPhysics({
    slipAngle: [-0.04436084, 0.02571643, -0.0116547, 0.00944042],
    slipRatio: [-0.00806162, 0.00292257, -0.00000353, -0.00000091],
  });
  assert.deepEqual(c.slipAngleRad, [-0.0444, 0.0257, -0.0117, 0.0094], 'la deriva resta in RADIANTI: la GUI la mostra in gradi');
  assert.deepEqual(c.slipRatio, [-0.008, 0.003, -0, -0], 'lo slip ratio resta un rapporto puro');
  // la conversione in gradi la fa solo la GUI: 0,0444 rad ≈ 2,5°
  assert.equal(Number((Math.abs(c.slipAngleRad[0]) * 180 / Math.PI).toFixed(1)), 2.5);
});

test('contatto: deriva e slip mancanti restano null, non zero', () => {
  const c = contattoDaPhysics({ slipAngle: [null, Number.NaN], slipRatio: 'x' });
  assert.deepEqual(c.slipAngleRad, [null, null]);
  assert.equal(c.slipRatio, null);
});

test('contatto: campi assenti o sporchi restano null, non zero', () => {
  const c = contattoDaPhysics({ finalFF: null, roadVibrations: 'x', wheelLoad: [null, Number.NaN] });
  assert.equal(c.ffb, null);
  assert.equal(c.vibration.road, null);
  assert.deepEqual(c.wheelLoadN, [null, null]);
  assert.equal(c.waterTempC, null);
  assert.equal(c.vibration.abs, null);
});
