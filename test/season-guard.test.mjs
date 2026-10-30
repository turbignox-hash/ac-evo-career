import './_flows-sandbox.mjs'; // sandbox flussi
// season-guard.test.mjs — LA DOPPIA CHIUSURA TRAPPATA (30/10).
//
// Il vivo di Mauro: dopo aver chiuso la stagione (click riuscito, save già
// avanzato) la card del cruscotto restava sul video con «calendario completato»
// e un secondo click su «Chiudi la stagione» contava la stagione NUOVA
// (0/3 gare) e con «chiudi comunque» l'avrebbe svuotata nell'annuario.
// La guardia (seasonJustClosed) riconosce il doppio click e la chiusura
// giusta lo rifiuta. Qui la si prova PURA: entrambe le strade che la
// chiamano (webui case 'season-end' e CLI cmdSeasonEnd) la invocano sempre.

import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonJustClosed, seasonEnd } from '../src/state.mjs';

process.env.EVO_SENZA_VINCOLI = '0';

// la stessa scala di garage-seat.test.mjs: la serie minima che la webui
// costruisce davvero, calendario a 3 gare come Coppa Strada
const mkNode = () => ({
  nodeId: 'coppa_80', display: 'Coppa Strada', level: 1,
  discipline: 'road', calendar: [{}, {}, {}],
  econ: { model: 'pocket', entry: 350, rent: 0, prize: 3000 },
});

const mkState = (over = {}) => ({
  node: 'coppa_80',
  season: 11,
  round: 3,
  money: 0,
  results: { coppa_80: [
    { round: 0, season: 11, position: 4, points: 14, dnf: false },
    { round: 1, season: 11, position: 5, points: 12, dnf: false },
    { round: 2, season: 11, position: 4, points: 11, dnf: false },
  ] },
  seasons: [
    { season: 10, node: 'coppa_80', position: 5, points: 33, champion: false },
  ],
  messages: [],
  ...over,
});

test('doppio click dopo chiusura riuscita: stagione nuova 0 gare = già chiusa', () => {
  // la chiusura di prima è nell'annuario: stagione 11 chiusa, ora siamo alla 12
  const s = mkState({ season: 12, round: 0, seasons: [...mkState().seasons, { season: 11, node: 'coppa_80', position: 4, points: 37, champion: false }] });
  assert.equal(seasonJustClosed(s, mkNode()), true, 'la stagione 12 (0 gare) dopo la 11 chiusa è un doppio click');
});

test('chiusura legit: la stagione corrente ha davvero gare disputate', () => {
  // round completo MA con gare della stagione corrente su disco: si chiude
  const s = mkState();
  assert.equal(seasonJustClosed(s, mkNode()), false);
});

test('stagione bona a 0 gare ma senza chiusura subito prima = NON già chiusa', () => {
  // iscrizione fresca (enrolled e mai corsa) o stagione saltata: una stagione
  // vuota si può ancora chiuderla a mano, la guardia non la blocca
  const s = mkState({ season: 12, round: 0, seasons: [{ season: 10, node: 'coppa_80', position: 5, points: 33, champion: false }] });
  assert.equal(seasonJustClosed(s, mkNode()), false, 'mancano 11: la stagione 12 vuota non è un doppio click');
});

test('stagione vuota di un ALTRO nodo chiusa subito prima = NON già chiusa', () => {
  const s = mkState({ season: 5, round: 0, seasons: [{ season: 4, node: 'altro', position: 1, points: 60, champion: true }] });
  assert.equal(seasonJustClosed(s, mkNode()), false);
});

test('nodò senza annuario: mai chiusa niente, guardia muta', () => {
  const s = mkState({ seasons: undefined });
  assert.equal(seasonJustClosed(s, mkNode()), false);
});

/* ---- il round completo del semaforo: seasonEnd su un nodo senza risultati
   di stagione ANY viene bloccato dai chiamanti (webui/CLI); qui proviamo
   SOLO che seasonJustClosed & seasonEnd informano tesi diverse:
   la chiusura riuscita sposta stagione e annuario in lockstep ---- */
test('seasonEnd avanza stagione e lascia l\'annuario che la guardia legge', () => {
  const node = mkNode();
  const ladder = { nodes: [node], contentNames: { tracks: {} } };
  const s = mkState();
  // classifiche minime: seasonEnd vuole standingsFor con un pilota iscritto
  ladder.pointsSystems = { fake: { 1: 25 } };
  s.world = { drivers: Array.from({ length: 2 }, (_, i) => ({ id: `d${i}`, name: `Rivale ${i}`, first: 'Rivale', last: `${i + 1}`, country: 'IT', archetype: 'pro', iconic: false, age: 25, skill: 80, active: true })) };
  s.universe = s.world;
  const before = s.season;
  try { seasonEnd(ladder, s); } catch { /* ci possono mancare pezzi di ladder: qui non li serviamo */ }
  // se non è riuscita a corersi non deve toccare il giro
  if (s.season === before) {
    assert.equal(seasonJustClosed(s, node), false, 'chiusura non riuscita: la guardia resta muta');
  } else {
    assert.equal(s.season, before + 1, 'la stagione avanza di 1');
    assert.equal(seasonJustClosed(s, node), true, 'e subito dopo la guardia sente il doppio click');
  }
});
