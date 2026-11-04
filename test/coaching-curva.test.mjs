// coaching-curva.test.mjs — il consiglio curva per curva (4/11) su due giri
// sintetici allineati per distanza: stacco, apex e uscita si confrontano
// numero per numero, senza telemetria reale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingOfSamples, findCorners } from '../src/telemetria-curve.mjs';

// Giro a 2 km con due frenate: la velocità scende dal rettilineo all'apex e
// risale. `start` controlla quanto dura la staccata (start più avanti = più corta).
function lap(startA, apexA, startB, apexB, n = 201) {
  const vs = Array.from({ length: n }, () => 200);
  const brake = (start, apex) => {
    for (let i = start; i <= apex; i++) vs[i] = 200 - ((200 - 60) * (i - start)) / (apex - start);
    for (let i = apex; i < Math.min(n, apex + 20); i++) vs[i] = 60 + ((200 - 60) * (i - apex)) / 20;
  };
  brake(startA, apexA);
  brake(startB, apexB);
  return { vs, distKm: 2, lap: 1, durationSec: 100 };
}

test('coaching: staccata più corta = meno metri di frenata', () => {
  const a = lap(40, 60, 120, 140);   // frena da 40 a 60 (20 campioni)
  const b = lap(50, 60, 130, 140);   // frena da 50 a 60 (10 campioni)
  const c = coachingOfSamples(a, b);
  assert.ok(c, 'con due tracce valide il coaching esiste');
  assert.equal(c.corners.length, findCorners(a.vs).length);
  const first = c.corners[0];
  assert.equal(first.apexKmh, 60);
  assert.ok(first.entryM > 0, 'la staccata ha una lunghezza in metri');
  assert.ok(first.dEntryM > 0, 'A frena prima di B: delta positivo');
  assert.equal(first.dApexKmh, 0, 'stesso apex');
});

test('coaching: dati insufficienti → null', () => {
  assert.equal(coachingOfSamples(null, null), null);
  assert.equal(coachingOfSamples({ vs: [1, 2, 3], distKm: 1 }, { vs: [1, 2, 3], distKm: 1 }), null);
  assert.equal(coachingOfSamples({ vs: Array(50).fill(200) }, { vs: Array(50).fill(200) }), null);
});
