// Il calendario CONTINUO (stile Zero to Apex): date reali, griglia affollata,
// cap di 3 scelte per giornata, impegni e conflitti, gate di reputazione severo
// (GT4 e superiori al riparo CADAUNO a rep basse). Tutto su carriere temporanee.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const LADDER = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));

const { createCareer, loadState, saveState, nodeById, gateStatus, applyRaceResult } = await import('../src/state.mjs');
const {
  agendaDay, gareDelGiorno, prossimoGiornoConGara, avanzaGiorno,
  elencoCompleto, racesOnDay, calendarStrip, dateLabel, realDate,
  choicesOf, canChoose, recordChoice, MAX_SCELTE_PER_GIORNO, CADENZA_GIORNI,
  impegni, shiftSeat, seriesStatus, hasSeat,
} = await import('../src/agenda.mjs');

const DATA = mkdtempSync(join(tmpdir(), 'evo-agenda2-'));
const SAVE = join(DATA, 'evo-career.save.json');
const ladder = JSON.parse(JSON.stringify(LADDER));

const state = createCareer(ladder, { name: 'Test Agenda', first: 'Test', last: 'Agenda' });

test('date reali: 13 Apr 2025 = giorno 1, e il giorno N corrisponde a N-1 giorni dopo', () => {
  const d1 = realDate(1);
  assert.equal(d1.getUTCFullYear(), 2025);
  assert.equal(d1.getUTCMonth(), 3);
  assert.equal(d1.getUTCDate(), 13);
  assert.match(dateLabel(1), /Dom 13 Apr 2025/);
  assert.match(dateLabel(2), /Lun 14 Apr 2025/);
});

test('carriera nuova: sedile registrato, R1 evidenziata oggi', () => {
  assert.ok(hasSeat(state, state.node));
  const today = gareDelGiorno(ladder, state);
  assert.equal(today.gare.length, 1);
  assert.ok(today.gare[0].onSchedule);
});

test('la griglia è affollata: le gare di TUTTE le serie cadono sui giorni della strip', () => {
  const strip = calendarStrip(ladder, state, { days: 14 });
  const affollati = strip.filter((s) => s.total >= 10).length;
  assert.ok(affollati >= 2, `attese giornate con ≥10 gare di serie non iscritte, trovati ${affollati}`);
  // e la strip conta anche le FATTIBILI separatamente
  assert.ok(strip.every((s) => s.available <= s.total));
});

test('il giorno avanza di 1 a ogni gara e la cadenza pone la R2 a +CADENZA_GIORNI', () => {
  const node = nodeById(ladder, state.node);
  applyRaceResult(ladder, state, node, { position: 3, gridSize: node.gridSize, track: node.calendar[0].track });
  assert.equal(agendaDay(state), 2);
  const today = gareDelGiorno(ladder, state);
  assert.equal(today.gare.length, 0);
  assert.equal(prossimoGiornoConGara(ladder, state), 1 + CADENZA_GIORNI);
});

test('cap scelte: al massimo MAX_SCELTE_PER_GIORNO per giornata, riscegliere è libero', () => {
  const d = agendaDay(state);
  choicesOf(state, d).length = 0;   // ripulisci
  for (let i = 0; i < MAX_SCELTE_PER_GIORNO; i++) {
    assert.ok(canChoose(state, d, 'serie_finta_' + i));
    recordChoice(state, d, 'serie_finta_' + i);
  }
  assert.ok(!canChoose(state, d, 'serie_nuova'));
  assert.ok(canChoose(state, d, 'serie_finta_0'));   // riscelta la stessa: sempre ok
  assert.equal(choicesOf(state, d).length, MAX_SCELTE_PER_GIORNO);
});

test('impegni e conflitti: due serie lo stesso giorno = 1 conflitto, che lo spostamento risolve', () => {
  const node1 = nodeById(ladder, state.node);
  const node2 = ladder.nodes.find((n) => n.level === 1 && n.nodeId !== state.node && n.discipline !== node1.discipline);
  assert.ok(node2, 'esiste una seconda L1');
  // ancoriamo node2 ESATTAMENTE sul giorno della prossima gara di node1: collidono
  const day1 = impegni(ladder, state).lista.find((x) => x.nodeId === node1.nodeId).day;
  state.seats[node2.nodeId] = { day: day1, season: state.season };
  let inf = impegni(ladder, state);
  assert.equal(inf.iscritte, 2);                  // node1 + node2: due serie iscritte
  assert.ok(inf.conflitti.length >= 1);           // due serie cadute lo stesso giorno
  const target = inf.conflitti[0].gare.find((g) => g.nodeId !== node1.nodeId);
  // lo spostamento di una delle due: il suo prossimo giorno slitta oltre il conflitto
  const before = impegni(ladder, state).lista.find((x) => x.nodeId === target.nodeId).day;
  shiftSeat(state, target.nodeId, CADENZA_GIORNI);
  const after = impegni(ladder, state).lista.find((x) => x.nodeId === target.nodeId).day;
  assert.equal(after, before + CADENZA_GIORNI);
  inf = impegni(ladder, state);
  assert.ok(!inf.conflitti.some((c) => c.day === before));   // il giorno del conflitto è risolto
});

test('gate severo: a rep appena sufficiente la L1 apre, le GT4 restano chiuse sotto 450', () => {
  const l1 = ladder.nodes.find((n) => n.level === 1 && n.discipline === 'entry');
  const gt4 = ladder.nodes.find((n) => (n.cars ?? []).includes('ks_porsche_718_cayman_gt4_rs'));
  const fake = { rep: 379, bestFinish: {}, results: {} };
  assert.equal(gateStatus(ladder, fake, l1).ok, true);
  assert.equal(gateStatus(ladder, fake, gt4).ok, false);
  const fake450 = { rep: 450, bestFinish: {}, results: {} };
  assert.equal(gateStatus(ladder, fake450, gt4).ok, true);
});

test('salvataggio e ricaricamento: agenda, sedili e date reali sopravvivono', () => {
  saveState(SAVE, state);
  const reloaded = loadState(SAVE);
  assert.equal(agendaDay(reloaded), agendaDay(state));
  assert.equal(Object.keys(reloaded.seats).length, Object.keys(state.seats).length);
  const before = gareDelGiorno(ladder, state).gare.map((g) => [g.node.nodeId, g.index, g.scheduledDay]);
  const after = gareDelGiorno(ladder, reloaded).gare.map((g) => [g.node.nodeId, g.index, g.scheduledDay]);
  assert.deepEqual(after, before);
});
