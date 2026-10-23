import "./_flows-sandbox.mjs"; // sandbox flussi
// events-card.test.mjs — la scheda evento speciale in stile raceCard.
// Le attese usano i NOMI VERI del libro TRACK_INFO ('cota' era l'id grezzo che
// non combinaciava col live-check), l'auto è quella in vetrina o il premio, e la
// card porta trackName/layout/carName/carChoices per event-prep e la verifica live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCard, eventTrackReal, ensureEvents } from '../src/events.mjs';

const mkEvent = (trackId, trackDisplay = trackId) => ({
  id: 'ev_test', kind: 'special-race', tier: 'finale',
  createdAt: new Date().toISOString(), season: 5, afterRound: 0,
  theme: { id: 'legend_finale', name: 'Il Gran Finale dei Campioni', nameEn: 'The Champions\u2019 Grand Finale', intro: 'Invito', introEn: 'Invite' },
  trackId, trackDisplay, weather: 0, laps: 10, hour: 17, timeScale: 1,
  guests: ['Hans Stuck'],
  prize: { carId: 'lamborghini_countach_lp5000_qv', carName: 'Lamborghini Countach LP5000 QV', money: 21000, rep: 15, duplicateCash: false },
  deadlineRounds: 99,
  acceptedAt: new Date().toISOString(),
});
const mkState = (active) => ({ season: 5, money: 10000, rep: 0, results: {}, events: { active, history: [], showCase: [], lastRoundChecked: null } });
const mkLadder = () => ({ nodes: [], contentNames: { cars: {}, tracks: {} } });

test('eventTrackReal: l\'id \'cota\' risolve nel nome vero del libro via alias', () => {
  assert.equal(eventTrackReal({ trackId: 'cota', trackDisplay: 'cota' }), 'Circuit Of The Americas');
});

test('eventTrackReal: gli id che coincidono con le chiavi TRACK_INFO risolvono da soli', () => {
  assert.equal(eventTrackReal({ trackId: 'kyalami', trackDisplay: 'Kyalami' }), 'Kyalami');
  assert.equal(eventTrackReal({ trackId: 'redbull_ring', trackDisplay: 'Red Bull Ring' }), 'Red Bull Ring');
});

test('eventTrackReal: pista fuori dal libro resta il display', () => {
  assert.equal(eventTrackReal({ trackId: 'pista_inesistente', trackDisplay: 'Pista Ignota' }), 'Pista Ignota');
});

test('eventCard: Pista col nome vero + layout, e i campi stile raceCard per event-prep', () => {
  const state = mkState(mkEvent('cota'));
  const card = eventCard(mkLadder(), state);
  assert.ok(card, 'la card esiste con l\'evento attivo');
  const pista = card.settings.find(([k]) => k === 'Pista')?.[1] ?? '';
  assert.equal(pista, 'Circuit Of The Americas — layout GP');
  assert.equal(card.trackName, 'Circuit Of The Americas');
  assert.equal(card.carName, 'Lamborghini Countach LP5000 QV');
  assert.deepEqual(card.carChoices, ['Lamborghini Countach LP5000 QV']);
  assert.ok(card.acceptedAt, 'invito accettato: il preparo è permesso');
});

test('eventCard: l\'auto portata in vetrina è quella selezionata per l\'evento', () => {
  const ev = mkEvent('cota');
  const state = mkState(ev);
  ensureEvents(state).showCase.push({ carId: ev.prize.carId, carName: ev.prize.carName, theme: 'Il Gran Finale dei Campioni', season: 4, at: new Date().toISOString() });
  const card = eventCard(mkLadder(), state);
  assert.equal(card.carName, 'Lamborghini Countach LP5000 QV');
  const auto = card.settings.find(([k]) => k === 'Auto')?.[1] ?? '';
  assert.match(auto, /la tua, vinta/);
});

test('eventCard senza evento attivo: null (la GUI mostra la lista vuota e il server risponde 409)', () => {
  assert.equal(eventCard(mkLadder(), mkState(null)), null);
});

test('eventCard: la card porta gli ID AUTO degli ospiti per la griglia evento (event-prep)', () => {
  // richiesta Mauro 23/10: ora/giri/avversari degli eventi scritti dal tasto
  // Prepara. La griglia ospiti filtra le CELLE dal template customgrid per id
  // auto (carIdOf), quindi la card deve esporre gli id del tema, non solo i nomi.
  const state = mkState(mkEvent('cota'));
  const card = eventCard({ nodes: [], contentNames: { cars: { porsche_911_gt3_rs_992: 'Porsche 911 GT3 RS (992)' } }, themeGuests: null }, state);
  // il tema è letto da events.mjs (legend_finale): gli id esperti sono quelli del tema
  assert.ok(Array.isArray(card.guestCarIds) && card.guestCarIds.length >= 2, 'gli id ospiti sono nella card');
  assert.ok(card.guestCarIds.every((x) => typeof x === 'string' && x.length > 1));
});

test('eventCard: la difficoltà AI è la banda fissa 88-93 (richiesta Mauro, NON la banda della serie)', () => {
  // indipendente dalla serie in corso: anche con la Coppa RX-7 a 94-95, gli
  // eventi restano 88-93
  const state = mkState(mkEvent('cota'));
  state.node = 'coppa_mazda-rx7-fd';
  state.raceSettings = { 'coppa_mazda-rx7-fd': { sliderMin: 94, sliderMax: 95 } };
  const card = eventCard(mkLadder(), state);
  const diff = card.settings.find(([k]) => k === 'Difficoltà AI')?.[1] ?? '';
  assert.equal(diff, '88–93 %');
  assert.equal(card.diffMin, 88);
  assert.equal(card.diffMax, 93);
});
