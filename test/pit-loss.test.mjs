import test from 'node:test';
import assert from 'node:assert/strict';
import { pitLossFromLaps, pitBattle } from '../src/strategia.mjs';

const lap = (n, durationSec, endSlowPct = 0, startSlowPct = 0) => ({ lap: n, durationSec, endSlowPct, startSlowPct });

test('pitLossFromLaps: coppia in/out consecutiva → somma degli scarti', () => {
  const r = pitLossFromLaps([lap(1, 90), lap(2, 105, 80), lap(3, 108, 0, 80), lap(4, 90)]);
  assert.equal(r.sec, 33);
  assert.equal(r.samples, 1);
  assert.equal(r.inLap, 2);
  assert.equal(r.outLap, 3);
  assert.equal(r.refSec, 90);
});

test('pitLossFromLaps: un solo lato non basta', () => {
  assert.equal(pitLossFromLaps([lap(1, 90), lap(2, 120, 80), lap(3, 90)]), null);
  assert.equal(pitLossFromLaps([lap(1, 120, 0, 80), lap(2, 90), lap(3, 90)]), null);
});

test('pitLossFromLaps: lento condiviso basso → null', () => {
  assert.equal(pitLossFromLaps([lap(1, 90), lap(2, 105, 40), lap(3, 108, 0, 40), lap(4, 90)]), null);
});

test('pitLossFromLaps: due soste → mediana', () => {
  const r = pitLossFromLaps([
    lap(1, 90), lap(2, 105, 80), lap(3, 108, 0, 80), lap(4, 90),
    lap(5, 106, 80), lap(6, 107, 0, 80), lap(7, 90),
  ]);
  assert.equal(r.samples, 2);
  assert.equal(r.sec, 33);
});

test('pitLossFromLaps: scarto fuori scala → null', () => {
  assert.equal(pitLossFromLaps([lap(1, 90), lap(2, 300, 80), lap(3, 310, 0, 80), lap(4, 90)]), null);
});

test('pitBattle: porta la sorgente del pit loss', () => {
  const b = pitBattle({ gapAheadSec: 1.4, degSecPerLap: 0.1, pitLossSec: 24, pitLossSource: 'measured', lapsLeft: 30 });
  assert.equal(b.pitLossSec, 24);
  assert.equal(b.pitLossSource, 'measured');
});
