import './_flows-sandbox.mjs'; // sandbox flussi
// test per gameOwnedCarIds (lettura disco, 26/10) + la LEZIONE 28/10:
// i .carfinalstatewithconsumable NON sono il garage — restano su disco anche
// per auto VENDUTE (la F40 LM di Mauro) e per i NOLEGGI del car-pool, e il
// garage vero della carriera manca lì (la Countach di Mauro non ha file).
// Dunque: la lettura resta una funzione informativa, ma NON entra più nella
// scelta dei premi (niente ownedExtra): posseduti = garage del tool + vetrina.
// Nessuna scrittura: la scansione è solo lettura, tutto in una tmp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { THEMES, choosePrize, refreshActivePrize, ensureEvents } from '../src/events.mjs?v=game-owned';
import { gameOwnedCarIds, normOwnedId } from '../src/garage.mjs?v=game-owned';

const UUID = '43502bc3-1ccd-ad8d-d2f7-33ca8d009983';

// ladder minimo: SOLO due auto note (la sconosciuta al gioco va scartata)
const LADDER = { contentNames: { cars: { ks_ferrari_288_gto: 'Ferrari 288 GTO', ks_porsche_935: 'Porsche 935' } } };

const mkState = ({ showCase = [], garage = [] } = {}) => ({
  season: 6, money: 10000, rep: 0, results: {}, messages: [],
  events: { active: null, history: [], showCase, lastRoundChecked: null },
  garage: { cars: garage },
});

function mkSavedDir() {
  const root = mkdtempSync(join(tmpdir(), 'game-owned-'));
  const dir = join(root, 'ACE', 'ProfileData', 'guid-di-prova', 'OpenData', 'SavedCars');
  mkdirSync(dir, { recursive: true });
  // auto posseduta nota al ladder: DEVE essere rilevata
  writeFileSync(join(dir, `ks_ferrari_288_gto_${UUID}.carfinalstatewithconsumable`), 'x');
  // auto nel gioco ma nota al ladder COL prefisso: la Porsche 935
  writeFileSync(join(dir, `ks_porsche_935_aaaaaaaa-1ccd-ad8d-d2f7-33ca8d009983.carfinalstatewithconsumable`), 'x');
  // auto non nel ladder (mod locale): DEVE essere scartata
  writeFileSync(join(dir, `mod_locale_rara_${UUID}.carfinalstatewithconsumable`), 'x');
  // file non-auto: DEVE essere ignorato
  writeFileSync(join(dir, 'readme.txt'), 'x');
  return { root, dir };
}

test('gameOwnedCarIds: legge il parco reale, filtra su auto note al ladder', () => {
  const { root } = mkSavedDir();
  try {
    const out = gameOwnedCarIds({ env: { ACE_SAVEDIR: root }, ladder: LADDER });
    assert.deepEqual(out.sort(), ['ks_ferrari_288_gto', 'ks_porsche_935'],
      'solo le auto note al ladder, il file estraneo e la mod non entrano');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('gameOwnedCarIds: profilo assente → lista vuota, mai errore', () => {
  const root = mkdtempSync(join(tmpdir(), 'game-owned-vuoto-'));
  try {
    assert.deepEqual(gameOwnedCarIds({ env: { ACE_SAVEDIR: root }, ladder: LADDER }), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('normOwnedId: con e senza prefisso ks_ le due forme colla e non ho «posseduta» nuova', () => {
  assert.equal(normOwnedId('ks_ferrari_288_gto'), normOwnedId('ferrari_288_gto'));
  assert.equal(normOwnedId('ferrari_288_gto'), 'ferrari_288_gto');
});

test('choosePrize: auto nota Solo SU DISCO (no garage, no vetrina) torna come premio', () => {
  // la lezione: il disku contiene noleggi e vendute — se filtrasse
  // «già posseduta» spingerebbe via un premio che l'amico non ha
  const classic = THEMES.find((t) => t.id === 'classic_gt');
  const state = mkState();
  const chosen = choosePrize({}, state, classic, { seed: 0 });
  assert.equal(chosen.carId, 'ferrari_288_gto', 'la 288 GTO su disco senza garage è in palio');
  assert.equal(chosen.duplicateCash, false, 'riserve disponibili: niente liquidità extra');
});

test('choosePrize: senza segnali resta il comportamento di prima', () => {
  const classic = THEMES.find((t) => t.id === 'classic_gt');
  const state = mkState();
  const chosen = choosePrize({}, state, classic, { seed: 0 });
  assert.equal(chosen.carId, 'ferrari_288_gto');
});

test('refreshActivePrize: auto nel SOLO disco di gioco NON sposta il premio (28/10)', () => {
  // un tempo con ownedExtra lo sostituiva: ora il possesso è garage + vetrina
  const state = mkState();
  const active = {
    id: 'ev_6_1', kind: 'special-race', tier: 'stagione', season: 6, afterRound: 0,
    theme: { id: 'classic_gt', name: 'Leggende GT', nameEn: 'GT Legends', intro: 'i', introEn: 'i' },
    trackId: 'imola', trackDisplay: 'Imola', weather: 0, laps: 8, hour: 18, timeScale: 1,
    guests: ['Jochen Mass'], deadlineRounds: 99, acceptedAt: new Date().toISOString(),
    prize: { carId: 'ferrari_288_gto', carName: 'Ferrari 288 GTO', money: 9000, rep: 10, duplicateCash: false },
  };
  ensureEvents(state).active = active;
  const out = refreshActivePrize({}, state, { ownedExtra: ['ks_ferrari_288_gto'] });
  assert.equal(out.changed, false, 'il disco non può togliere un premio: solo garage e vetrina contano');
  assert.equal(out.reason, 'already-ok');
  assert.equal(state.events.active.prize.carId, 'ferrari_288_gto');
});

test('refreshActivePrize: premio nel GARAGE del tool → sostituito (tasto «refresh premio»)', () => {
  const state = mkState({ garage: [{ carId: 'ks_ferrari_288_gto', carName: 'Ferrari 288 GTO', how: 'bought', since: '2026-10-01' }] });
  const active = {
    id: 'ev_6_1', kind: 'special-race', tier: 'stagione', season: 6, afterRound: 0,
    theme: { id: 'classic_gt', name: 'Leggende GT', nameEn: 'GT Legends', intro: 'i', introEn: 'i' },
    trackId: 'imola', trackDisplay: 'Imola', weather: 0, laps: 8, hour: 18, timeScale: 1,
    guests: ['Jochen Mass'], deadlineRounds: 99, acceptedAt: new Date().toISOString(),
    prize: { carId: 'ferrari_288_gto', carName: 'Ferrari 288 GTO', money: 9000, rep: 10, duplicateCash: false },
  };
  ensureEvents(state).active = active;
  const out = refreshActivePrize({}, state);
  assert.equal(out.changed, true, 'deve sostituire il premio');
  assert.notEqual(state.events.active.prize.carId, 'ferrari_288_gto');
  assert.ok(state.messages.some((m) => /Premio aggiornato/.test(m.text ?? '')), 'messaggio in bacheca');
});
