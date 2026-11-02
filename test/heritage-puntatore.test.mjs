// heritage-puntatore.test.mjs — IL PUNTEGGIO DELL'IMPRESA (2/11, richiesta Mauro:
// «nessun pulsante per partecipare»). Il pannello Eredità ora ha il bottone
// "Punta la ronda in Agenda", che chiama agenda-choose col nodeId della SERIE
// dell'impresa: qui si prova che la vista server porti QUEL dato (senza nodeId
// la GUI mostra solo il messaggio di riserva e la porta resta chiusa).
import test from 'node:test';
import assert from 'node:assert/strict';
import { heritageOverview } from '../src/memories.mjs';
import { ensureHeritage } from '../src/memories.mjs';

const mkState = () => ({
  season: 3,
  heritage: {
    completed: [],
    offers: [],
    active: {
      id: 'lorigine', nodeId: 'endurance_gt4', title: 'Le Origini', era: '1968',
      series: 'Endurance GT4', relation: 'bisnonno', seat: 41,
      carName: 'Audi R8 LMS GT4 Evo', relic: "Auto storica #41",
      inherit: 60000, repeat: 14000, assignedSeason: 3,
      objective: { text: 'termina la gara tra i primi 5', kind: 'positionTop', value: 5 },
      rounds: ['circuit_of_the_americas', 'imola'],
      tracksDisplay: ['Circuit Of The Americas', 'Imola'],
      legends: ['J. Ickx (BE)'],
      progress: [], done: false, claimed: false,
    },
  },
});

test('heritageOverview: il capitolo attivo porta il nodeId della serie (il bottone "Punta la ronda in Agenda" ne ha bisogno)', () => {
  const v = heritageOverview({ contentNames: { tracks: {}, cars: {} } }, mkState());
  assert.ok(v.active, 'c\'è un capitolo attivo');
  assert.equal(v.active.nodeId, 'endurance_gt4');
});

test('heritageOverview: senza capitolo attivo il campo resta null (la GUI mostra la saga chiusa)', () => {
  const st = mkState();
  ensureHeritage(st).active = null;
  const v = heritageOverview({ contentNames: { tracks: {}, cars: {} } }, st);
  assert.equal(v.active, null);
});
