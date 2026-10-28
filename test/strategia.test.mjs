import test from 'node:test';
import assert from 'node:assert/strict';
import { fuelPlan, pitWindow, weatherScenarios, DEFAULT_FUEL_MARGIN } from '../src/strategia.mjs';

test('fuelPlan applica il margine di default sul consumo', () => {
  const p = fuelPlan({ lapsLeft: 10, fuelPerLap: 2 });
  assert.equal(p.base, 20);
  assert.equal(p.withMargin, Math.round(20 * (1 + DEFAULT_FUEL_MARGIN) * 100) / 100);
});

test('fuelPlan rifiuta dati non validi', () => {
  assert.equal(fuelPlan({ lapsLeft: 10, fuelPerLap: 0 }), null);
  assert.equal(fuelPlan({ lapsLeft: -1, fuelPerLap: 2 }), null);
  assert.equal(fuelPlan({}), null);
});

test('pitWindow non prevede sosta se la gara entra nel serbatoio', () => {
  const w = pitWindow({ totalLaps: 10, tankLaps: 12 });
  assert.equal(w.needed, false);
  assert.equal(w.feasible, true);
});

test('pitWindow calcola la finestra per una sosta singola', () => {
  // 30 giri, serbatoio per 20: sosta fra il giro 10 e il giro 19
  const w = pitWindow({ totalLaps: 30, tankLaps: 20 });
  assert.deepEqual(w, { needed: true, feasible: true, earliest: 10, latest: 19 });
});

test('pitWindow segnala quando serve più di una sosta', () => {
  // 50 giri, serbatoio per 10: non basta una sosta
  const w = pitWindow({ totalLaps: 50, tankLaps: 10 });
  assert.equal(w.feasible, false);
});

test('weatherScenarios ordina per costo crescente', () => {
  const s = weatherScenarios({ lapsLeft: 10, changeLap: 5, slickPenaltySecPerLap: 3, pitLossSec: 25 });
  assert.equal(s.length, 2);
  assert.ok(s[0].extraSec <= s[1].extraSec);
  // 5 giri bagnati in slick a 3 s/giro = 15 s; rientro = 25 s
  assert.equal(s[0].name, 'resta in slick');
  assert.equal(s[0].extraSec, 15);
});

test('weatherScenarios con input non validi restituisce lista vuota', () => {
  assert.deepEqual(weatherScenarios({ lapsLeft: 0, changeLap: 1 }), []);
});
