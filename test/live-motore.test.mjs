// live-motore.test.mjs — motore ed elettronica dal loader (6/11).
// Il blocco graphics di EVO porta livelli TC/ABS, bias freni, differenziale e
// le pressioni del motore: il tool ne mostrava solo tcActive. Questi test
// fissano che i valori arrivino grezzi, con i buchi a null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motoreDaGraphics } from '../src/shmem.mjs';

test('motore: nessun graphics = nessun dato', () => {
  assert.equal(motoreDaGraphics(null), null);
  assert.equal(motoreDaGraphics(undefined), null);
});

test('motore: elettronica come la scrive il gioco (valori del collaudo 4/11)', () => {
  const m = motoreDaGraphics({
    tcActive: true, absActive: true,
    electronics: { tcLevel: 1, absLevel: 1, brakeBias: 0.6949999928474426, diffPowerLevel: 14, diffCoastLevel: 14 },
    currentTorque: 48.50839614868164, currentBhp: 36,
    oilTempC: 92.54782104492188, oilPressureBar: 4.575026988983154,
    waterPressureBar: 1.149999976158142, fuelPressureBar: 3.8062703609466553,
    batteryVoltage: 13.600000381469727,
  });
  assert.equal(m.tcLevel, 1);
  assert.equal(m.absLevel, 1);
  assert.equal(m.tcOn, true);
  assert.equal(m.absOn, true);
  assert.equal(m.brakeBias, 0.695, 'frazione 0–1, non percentuale');
  assert.equal(m.diffPower, 14);
  assert.equal(m.diffCoast, 14);
  assert.equal(m.torqueNm, 48.5);
  assert.equal(m.powerCv, 36);
  assert.equal(m.oilTempC, 92.5);
  assert.equal(m.oilPressureBar, 4.58);
  assert.equal(m.waterPressureBar, 1.15);
  assert.equal(m.fuelPressureBar, 3.81);
  assert.equal(m.batteryV, 13.6);
});

test('motore: aiuti attivi come li scrive il gioco (assistsState del collaudo 4/11)', () => {
  const m = motoreDaGraphics({
    assists: { autoGear: 1, autoBlip: 1, autoClutch: 0, autoClutchOnStart: 0, autoPitLimiter: 1 },
    electronics: { pitLimiterOn: true },
  });
  assert.deepEqual(m.assists, { autoGear: true, autoClutch: false, autoPitLimiter: true });
  assert.equal(m.pitLimiterOn, true, 'il limitatore ha anche lo stato vero, non solo il flag di aiuto');
});

test('motore: aiuti assenti restano null, non «tutti spenti»', () => {
  const m = motoreDaGraphics({ currentBhp: 0 });
  assert.equal(m.assists, null);
  assert.equal(m.pitLimiterOn, null);
});

test('motore: elettronica assente = campi null, nessuno zero inventato', () => {
  const m = motoreDaGraphics({ currentBhp: 0 });
  assert.equal(m.tcLevel, null);
  assert.equal(m.brakeBias, null);
  assert.equal(m.diffPower, null);
  assert.equal(m.powerCv, 0, 'lo zero del gioco resta zero: è un dato, non un buco');
  assert.equal(m.tcOn, false);
  assert.equal(m.oilTempC, null);
  assert.equal(m.batteryV, null);
});
