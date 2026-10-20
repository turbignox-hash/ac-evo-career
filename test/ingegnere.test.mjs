// ingegnere.test.mjs — l'ingegnere di gara LIVE: benzina, gomme, gap, pit
// dal modulo engineer.mjs (funzione pura: la snapshot la costruiamo a mano).
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineerLive } from '../src/engineer.mjs';

const snapRace = ({
  fuel = 15, lapsDone = 3, lapsTotal = 10, lapsPossible = null,
  tyreWear = [0.9, 0.82, 0.95, 0.78], gapAhead = 4, gapBehind = 6, inPit = false,
} = {}) => ({
  live: true,
  session: { type: 'Race' },
  player: { fuel, lapsDone, lapsTotal, lapsPossible, tyreWear, tyreCoreTemp: [80, 82, 85, 79], gapAhead, gapBehind, inPit, position: 4, drivers: 18, timeLeft: null },
});

test('fuori gara o menu: nessun consiglio, niente gauges', () => {
  assert.equal(engineerLive({ live: false, session: { type: 'Race' }, player: null }, {}).live, false);
  assert.equal(engineerLive(snapRace(), { fuelPerLap: 2.4, raceLaps: 10 }).live, true);
  const pratica = engineerLive({ live: true, session: { type: 'HotStint' }, player: snapRace().player }, {});
  assert.equal(pratica.live, false);
});

test('benzina insufficiente: consiglio prio 1 con giri possibili vs rimasti', () => {
  // consumo 2.4 L/giro × 10 giri = 24 L, in motore ne restano 15 → deficit ~2.75 giri
  const m = engineerLive(snapRace({ fuel: 15 }), { fuelPerLap: 2.4, raceLaps: 10 });
  const benzo = m.tips.find((t) => t.icon === '⛽');
  assert.ok(benzo, 'manca il consiglio benzina');
  assert.equal(benzo.prio, 1);
  assert.match(benzo.title, /Benzina per 6.3 giri, ne restano 7/);
});

test('benzina margine comodo: consiglio informativo non urgente', () => {
  const m = engineerLive(snapRace({ fuel: 30 }), { fuelPerLap: 2.4, raceLaps: 10 });
  const benzo = m.tips.find((t) => t.icon === '⛽');
  assert.ok(benzo);
  assert.equal(benzo.prio, 3);
  assert.match(m.tips.find((t) => t.icon === '⛽').title, /Benzina per 12.5 giri/);
});

test('senza telemetria benzina: niente consiglio fuel se non c\'è una fonte valida', () => {
  const m = engineerLive(snapRace({ fuel: 15, lapsPossible: null }), { fuelPerLap: null, raceLaps: 10 });
  assert.equal(m.tips.find((t) => t.icon === '⛽'), undefined);
});

test('lapsPossibleFuel del gioco: ha la precedenza sulla stima dal consumo', () => {
  const m = engineerLive(snapRace({ fuel: 15, lapsPossible: 5 }), { fuelPerLap: 2.4, raceLaps: 10 });
  const benzo = m.tips.find((t) => t.icon === '⛽');
  assert.match(benzo.title, /^Benzina per 5 giri/);
});

test('usura gomme: scale 0-1 normalizzate, peggio wheel con priorità critica a ≥80%', () => {
  const critica = engineerLive(snapRace({ tyreWear: [0.9, 0.82, 0.95, 0.78] }), {});
  const gomma = critica.tips.find((t) => t.icon === '🛞');
  assert.ok(gomma);
  assert.match(gomma.title, /LR al limite: 95%/);
  assert.deepEqual(critica.gauges.wear, [90, 82, 95, 78]); // gauges: scala normalizzata 0-100
  assert.deepEqual(critica.gauges.temp?.length, 4);
});

test('usura media: consiglio di gestione', () => {
  const m = engineerLive(snapRace({ tyreWear: [0.6, 0.58, 0.31, 0.35] }), {});
  const gomma = m.tips.find((t) => t.icon === '🛞');
  assert.match(gomma.title, /LF/);
  assert.equal(gomma.prio, 2);
});

test('usura bassa (0-100 scale): tutto sano, spingi', () => {
  const m = engineerLive(snapRace({ tyreWear: [30, 25, 18, 20] }), {});
  const gomma = m.tips.find((t) => t.icon === '🛞');
  assert.match(gomma.title, /Gomme sane/);
});

test('gap stretti: attacco davanti, difesa dietro', () => {
  const m = engineerLive(snapRace({ gapAhead: 0.8, gapBehind: 0.9 }), {});
  const avanti = m.tips.find((t) => t.icon === '🏁');
  const dietro = m.tips.find((t) => t.icon === '🛡️');
  assert.ok(avanti && dietro);
  assert.match(avanti.title, /A 0.8s/);
  assert.match(dietro.title, /da 0.9s/);
});

test('in pitlane: consiglio limitatore in cima alla radio', () => {
  const m = engineerLive(snapRace({ inPit: true }), {});
  const pit = m.tips.find((t) => t.icon === '🔧');
  assert.ok(pit);
  assert.equal(pit.prio, 1);
});

test('gara a tempo: timer nel titolo quando non ci sono giri totali', () => {
  const snap = snapRace({ lapsTotal: null });
  snap.player.timeLeft = '12:34';
  const m = engineerLive(snap, {});
  const timer = m.tips.find((t) => t.icon === '⏱️');
  assert.ok(timer);
  assert.match(timer.title, /12:34/);
});
