// psi-live.test.mjs — la correzione dai DATI LIVE (4/11).
// Quando sei ai box i numeri veri sono quelli del gioco (pressioni a caldo dal
// physics), non il .ld di ieri: qui si verifica che la partenza a freddo esca
// dalla stessa regola dei 4 PSI del pannello, e che senza dati non inventi nulla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startPsiFromLive } from '../src/setup.mjs';

test('correzione live: 4 pressioni a caldo + target → partenza a freddo (4 PSI)', () => {
  const r = startPsiFromLive({ livePsi: [28.4, 28.8, 28.5, 28.7], target: 27, coldNow: 24 });
  assert.ok(r, 'con 4 gomme valide e target il consiglio esiste');
  assert.equal(r.hotAvg, 28.6);
  assert.equal(r.delta, -1.6);
  assert.equal(r.coldNow, 24);
  assert.equal(r.startPsi, 22.4);   // 24 + (27 − 28.6)
  assert.deepEqual(r.hot, [28.4, 28.8, 28.5, 28.7]);
});

test('correzione live: senza pressione nel file stima termica a −4 PSI', () => {
  const r = startPsiFromLive({ livePsi: [30.5, 29.6, 30.4, 29.5], target: 30, coldNow: null });
  assert.equal(r.hotAvg, 30);
  assert.equal(r.coldNow, 26);
  assert.equal(r.delta, 0);
  assert.equal(r.startPsi, 26);
});

test('correzione live: scarta i valori fuori scala e usa i buoni', () => {
  const r = startPsiFromLive({ livePsi: [0, 28.2, 28.4, 99, 28.3], target: 27, coldNow: 24 });
  assert.deepEqual(r.hot, [28.2, 28.4, 28.3]);
  assert.equal(r.hotAvg, 28.3);
  assert.equal(r.startPsi, 22.7);   // 24 + (27 − 28.3)
});

test('correzione live: dati incompleti o target assente → null', () => {
  assert.equal(startPsiFromLive({ livePsi: [28.0, 28.2], target: 27, coldNow: 24 }), null);
  assert.equal(startPsiFromLive({ livePsi: [28.0, 28.2, 28.4], target: 0, coldNow: 24 }), null);
  assert.equal(startPsiFromLive({ livePsi: [28.0, 28.2, 28.4], target: null, coldNow: 24 }), null);
  assert.equal(startPsiFromLive({}), null);
});

test('correzione live: una partenza fuori scala (es. 4 PSI) non viene scritta', () => {
  assert.equal(startPsiFromLive({ livePsi: [45, 45, 45], target: 25, coldNow: 24 }), null);
});
