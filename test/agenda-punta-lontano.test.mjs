// agenda-punta-lontano.test.mjs — LA GUARDIA DEL «PUNTA LA RONDA» NEL CICLO (5/11)
// Il bug del 5/11: il bottone «Punta la ronda in Agenda» del pannello Eredità
// moriva col 400 «Nessuna gara programmata di questa serie nei prossimi 30
// giorni» mentre la serie HA ronde in programma — il raggio di ricerca era
// fisso a 7 giorni (e l'avviso a 30) e le serie a cadenza lunga (Endurance
// GT4: 8 ronde × cadenza 3..10, ciclo fino a 80 giorni) cadevano fuoriora.
// Ora la finestra si allinea al CICLO REALE della serie e il sedile parte
// sul VERO giorno di gara. Questo test pesa: (1) la proiezione esiste nel
// ciclo e sta nel raggio; (2) scegliRonda arriva al giorno vero (o, se la
// serie è bloccata dal gate, dice la DATA VERA e non più il vecchio 400);
// (3) il vecchio messaggio "nei prossimi 30 giorni" non torna.
import './_flows-sandbox.mjs';
process.env.EVO_SENZA_VINCOLI = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const LADDER = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
const { createCareer } = await import('../src/state.mjs');
const { scegliRonda, racesOnDay, cadenzaSerie, agendaDay } = await import('../src/agenda.mjs');

const ladder = JSON.parse(JSON.stringify(LADDER));
const id = 'endurance_gt4';
const counter = ladder.nodes.findIndex((n) => n.nodeId === id) + 1;
const ronde = ladder.nodes[counter - 1].calendar.length;
const ciclo = ronde * cadenzaSerie(counter);

test('la ronda della serie cade nel ciclo e il ciclo sta nel raggio', () => {
  const state = createCareer(ladder, { name: 'Puntatore A', first: 'Test', last: 'A' });
  const oggi = agendaDay(state);
  let giorno = null;
  for (let d = oggi + 1; d <= oggi + ciclo + 2 && !giorno; d++) {
    if (racesOnDay(ladder, state, d).some((x) => x.node.nodeId === id)) giorno = d;
  }
  assert.ok(giorno != null, `nessuna proiezione della serie entro il ciclo (${ciclo + 2} giorni)`);
  assert.ok(giorno - oggi <= Math.min(Math.max(7, ciclo + 2), 94), 'il trovato deve stare nel raggio installato');
});

test('scegliRonda iscrive sul VERO giorno di gara — o dice la data vera (gate chiuso)', () => {
  const state = createCareer(ladder, { name: 'Puntatore B', first: 'Test', last: 'B' });
  const oggi = agendaDay(state);
  let proiettata = null;
  for (let d = oggi + 1; d <= oggi + 94 && !proiettata; d++) {
    const p = racesOnDay(ladder, state, d).find((x) => x.node.nodeId === id);
    if (p) { proiettata = { d, ...p }; break; }
  }
  assert.ok(proiettata, 'la proiezione della ronda deve esistere entro il ciclo');
  const r = scegliRonda(ladder, state, id);
  if (proiettata.fattibile) {
    assert.equal(r.ok, true, `atteso ok, arrivato: ${JSON.stringify(r)}`);
    assert.equal(state.seats[id].day, proiettata.d, 'il sedile deve cadere sul giorno VERO della ronda');
    assert.equal(state.node, id);
    assert.equal(state.round, proiettata.index);
  } else {
    assert.equal(r.ok, false, `atteso il ripiego, arrivato ok: ${JSON.stringify(r)}`);
    assert.equal(r.status, 400);
    assert.match(String(r.error), /La prossima gara di questa serie va il/, 'deve dire la data vera');
    assert.ok(!String(r.error).includes('nei prossimi 30 giorni'), 'il vecchio 400 bugliardo non deve tornare');
  }
});

test('serie con calendario mancante: 400 col messaggio nuovo, senza «30 giorni»', () => {
  const ladder2 = JSON.parse(JSON.stringify(ladder));
  ladder2.nodes.find((x) => x.nodeId === id).calendar = [];
  const state2 = createCareer(ladder2, { name: 'Puntatore C', first: 'Test', last: 'C' });
  const r = scegliRonda(ladder2, state2, id);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(String(r.error), /Nessuna gara programmata di questa serie/);
  assert.ok(!String(r.error).includes('30 giorni'), 'il vecchio messaggio non deve tornare');
});
