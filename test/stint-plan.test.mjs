// stint-plan.test.mjs — DA-9 prima fetta: il piano STINT calcolato PRIMA del
// via dai numeri VERI del sedile. Tutto puro (fuzioni senza I/O): qui le
//「uscite MoTeC」 sono ARRAY di sessioni scritte a mano — l'aggregatore
// seatStintInputs consuma la stesse shape di collectSessions() (fuelPerLap,
// bestLapSec, laps[] con fuelStart/fuelEnd), il contratto è quello.
// Regola guida: i dati che mancano → ok:false con la SEGGNALAZIONE, mai una
// finestra che i giri non buttano fuori.
import test from 'node:test';
import assert from 'node:assert/strict';

const { seatStintInputs, stintPlanOf } = await import('../src/stint-plan.mjs');

const say = (t) => typeof t === 'string' ? t : (t?.it || t?.en || '');

// 3 sessioni del sedile: consumo 3.5 l/giri pesato, tank 60 l osservato una volta
const SEAT = [
  { fuelPerLap: 3.5, bestLapSec: 90.0, validLaps: 12, laps: [{ fuelStart: 60, fuelEnd: 56.5 }, { fuelStart: 56.5, fuelEnd: 53 }] },
  { fuelPerLap: 3.4, bestLapSec: 89.0, validLaps: 8, laps: [{ fuelStart: 55, fuelEnd: 51.6 }] },
  { fuelPerLap: null, bestLapSec: 88, validLaps: 5, laps: [] },   // sessione muta, non parlano
];

test('seatStintInputs: media PESATA dei giri, tankMax dal vivo, sessioni mute fuori', () => {
  const i = seatStintInputs(SEAT);
  // pesa per GIRI REGISTRATI (laps[]), non da validLaps: (3.5·2 + 3.4·1)/3 = 3.47
  assert.equal(i.fuelPerLap, 3.47);
  assert.equal(i.lapSec, 89.5);           // media dei migliori (90 + 89) / 2
  assert.equal(i.tankMax, 60);            // il massimo a inizio giro osservato
  assert.equal(i.n, 2);                   // la sessione muta non conta
});

test('seatStintInputs: senza sedimenti validi → null, e non si finge un serbatoio', () => {
  assert.equal(seatStintInputs([]), null);
  assert.equal(seatStintInputs(null), null);
  assert.equal(seatStintInputs([{ fuelPerLap: 3.5, bestLapSec: 90, laps: [] }]), null);
});

// la gara da 60′ a ritmo 90″ → 40 giri; consumo 3.5 → 140 + 5% = 147; serbatoio
// 60 → stint utile 55 → 15 giri per stint → 3 stint, 2 soste.
const P = () => stintPlanOf({ raceMin: 60, lapSec: 90, fuelPerLap: 3.5, tankMax: 60 });

test('stintPlanOf: 60′ a 90″ da 3.5 l → 3 stint, 2 soste, finestre coerenti', () => {
  const p = P();
  assert.equal(p.ok, true);
  assert.equal(p.estLaps, 40);
  assert.equal(p.totalFuel, 147);
  assert.equal(p.stintLaps, 15);
  assert.equal(p.nStints, 3);
  assert.equal(p.stops, 2);
  // la sosta 1 sta tra il giro 10 (40 - 2·15) e il 15 (1·15): entrambe le proposte
  assert.deepEqual([p.windows[0].earliest, p.windows[0].latest], [10, 15]);
  assert.deepEqual([p.windows[1].earliest, p.windows[1].latest], [25, 30]);
  // il piano parla: la nota dice stint e litri
  assert.ok(p.notes.some((t) => say(t).includes('soste')), p.notes.map(say).join(' | '));
  assert.ok(p.windows.every((w) => w.mid >= w.earliest && w.mid <= w.latest));
});

test('stintPlanOf: serbatoio ampio → ZERO soste e litri sufficienti', () => {
  const p = stintPlanOf({ raceMin: 30, lapSec: 100, fuelPerLap: 2.0, tankMax: 120 });
  assert.equal(p.ok, true);
  assert.equal(p.estLaps, 18);
  assert.equal(p.totalFuel, 38);      // 36 + 5% = 37.8 → ceil 38
  assert.equal(p.stops, 0);
  assert.equal(p.windows.length, 0);
  assert.ok(say(p.notes[1]).toLowerCase().includes('nessuna'));
});

test('stintPlanOf: i dati mancanti ESCONO CON IL NOME, mai una finestra ghost', () => {
  assert.equal(stintPlanOf({ lapSec: 90, fuelPerLap: 3.5, tankMax: 60 }).reason, 'durata');
  assert.equal(stintPlanOf({ raceMin: 60, fuelPerLap: 3.5, tankMax: 60 }).reason, 'ritmo');
  assert.equal(stintPlanOf({ raceMin: 60, lapSec: 90, tankMax: 60 }).reason, 'consumo');
  assert.equal(stintPlanOf({ raceMin: 60, lapSec: 90, fuelPerLap: 3.5 }).reason, 'serbatoio');
});

test('stintPlanOf: il margine è VISIBILE nel piano (chi lo vede sa che lo c\u0027è)', () => {
  const p = P();
  assert.equal(p.marginPct, 0.05);
  assert.ok(p.totalFuel >= p.estLaps * p.fuelPerLap, 'il netto è sotto il margine');
});
