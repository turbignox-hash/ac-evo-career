import "./_flows-sandbox.mjs"; // sandbox flussi
// test per choosePrize e refreshActivePrize: la scelta del premio
// non deve mai riproporre un'auto già posseduta (vetrina + garage).
// Casi: (1) tema con riserva — la Countach è già tua, passa alle riserve;
// (2) posseduta solo nel garage conta pure; (3) tema senza riserve e premio
// già tuo — duplicateCash; (4) refreshActivePrize sostituisce il premio
// dell'invito attivo, con cassa al tema pieno.
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, choosePrize, refreshActivePrize, ensureEvents } from '../src/events.mjs?v=prize';

const finale = THEMES.find((t) => t.id === 'legend_finale');
const mkState = ({ showCase = [], garage = [] } = {}) => ({
  season: 6, money: 10000, rep: 0, results: {}, messages: [],
  events: { active: null, history: [], showCase, lastRoundChecked: null },
  garage: { cars: garage },
});

test('choosePrize: premio già in vetrina → passa alla riserva non posseduta', () => {
  const state = mkState({ showCase: [{ carId: 'peugeot_205_t16' }, { carId: 'lamborghini_countach_lp5000_qv' }] });
  const chosen = choosePrize({}, state, finale, { seed: 1 });
  assert.equal(chosen.duplicateCash, false, 'non deve trasformare il premio in liquidità');
  assert.notEqual(chosen.carId, 'lamborghini_countach_lp5000_qv', 'la Countach (già tua) non torna in palio');
  assert.ok(finale.altPrizes.some((p) => p.id === chosen.carId), 'la scelta arriva dalle riserve del tema');
});

test('choosePrize: posseduta nel garage conta pure (non solo vetrina)', () => {
  const state = mkState({ garage: [{ carId: 'lamborghini_countach_lp5000_qv' }] });
  const chosen = choosePrize({}, state, finale, { seed: 1 });
  assert.notEqual(chosen.carId, 'lamborghini_countach_lp5000_qv');
  assert.equal(chosen.duplicateCash, false);
});

test('choosePrize: tema senza riserve e premio già tuo → duplicateCash (comportamento storico)', () => {
  const theme = { prizeCar: { id: 'auto_unica', name: 'Auto Unica' } };
  const state = mkState({ showCase: [{ carId: 'auto_unica' }] });
  const chosen = choosePrize({}, state, theme, { seed: 1 });
  assert.equal(chosen.duplicateCash, true);
  assert.equal(chosen.carId, 'auto_unica');
});

test("refreshActivePrize: sostituisce il premio dell'invito attivo e scrive nel registro", () => {
  const state = mkState({
    showCase: [{ carId: 'lamborghini_countach_lp5000_qv' }],
  });
  const active = {
    id: 'ev_6_1', kind: 'special-race', tier: 'finale', season: 6, afterRound: 0,
    theme: { id: 'legend_finale', name: 'Il Gran Finale dei Campioni', nameEn: 'The Champions’ Grand Finale', intro: 'i', introEn: 'i' },
    trackId: 'monza', trackDisplay: 'Monza', weather: 0, laps: 10, hour: 17, timeScale: 1,
    guests: ['Hans Stuck'],deadlineRounds: 99, acceptedAt: new Date().toISOString(),
    prize: { carId: 'lamborghini_countach_lp5000_qv', carName: 'Lamborghini Countach LP5000 QV', money: 15000, rep: 15, duplicateCash: false },
  };
  ensureEvents(state).active = active;
  const out = refreshActivePrize({}, state);
  assert.equal(out.changed, true, 'deve sostituire il premio');
  assert.notEqual(state.events.active.prize.carId, 'lamborghini_countach_lp5000_qv');
  assert.equal(state.events.active.prize.duplicateCash, false);
  assert.equal(state.events.active.prize.money, finale.money, 'cassa torna al premio pieno del tema (non duplicateCash)');
  assert.ok(state.messages.some((m) => /Premio aggiornato/.test(m.text ?? '')), 'messaggio in bacheca');
});

