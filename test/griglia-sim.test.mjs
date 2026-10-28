import './_flows-sandbox.mjs'; // sandbox flussi
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// AMPLIAMENTO DELLA GRIGLIA SIM (30/10): la stima del ladder resta sotto la
// griglia che EVO corre davvero (Alfa 75: ladder 7, reali 17). La classifica
// simulata e il duello girano su una griglia larga quanto il massimo visto
// nei risultati reali della serie; senza history nulla cambia.

const HERE = dirname(fileURLToPath(import.meta.url));
const LADDER = JSON.parse(readFileSync(join(dirname(HERE), 'config', 'career.evo.ladder.json'), 'utf8'));

const { createCareer, standingsFor, playerStanding, grigliaSimEstesa } = await import('../src/state.mjs');

const mkState = () => {
  const ladder = JSON.parse(JSON.stringify(LADDER));
  const state = createCareer(ladder, { name: 'Test Griglia', first: 'Test', last: 'Griglia' });
  return { ladder, state };
};

test('grigliaSimEstesa: senza risultati la stima del ladder resta (niente cambi su carriere vergini)', () => {
  const { ladder, state } = mkState();
  const node = ladder.nodes.find((n) => n.nodeId === state.node);
  const prima = node.gridSize;
  const dentro = grigliaSimEstesa(ladder, state, node);
  assert.equal(dentro.gridSize, prima, 'stima invariata senza history');
  assert.equal(node.gridSize, prima, 'il ladder NON si muove');
});

test('grigliaSimEstesa: la sim si allarga al MASSIMO visto nelle griglie reali e il ladder resta intatto', () => {
  const { ladder, state } = mkState();
  const node = ladder.nodes.find((n) => n.nodeId === state.node);
  const stima = node.gridSize;
  state.results[node.nodeId] = [
    { season: state.season, round: 0, position: 4, gridSize: 17, dnf: false, points: 12, prize: 1000, rep: 5 },
    { season: state.season, round: 1, position: 2, gridSize: 14, dnf: false, points: 18, prize: 2000, rep: 8 },
  ];
  const dentro = grigliaSimEstesa(ladder, state, node);
  assert.equal(dentro.gridSize, 17, `atteso 17, trovato ${dentro.gridSize}`);
  assert.equal(ladder.nodes.find((n) => n.nodeId === state.node).gridSize, stima, 'il ladder su disco NON toccato');
});

test('grigliaSimEstesa: una griglia corrotta CORTA non blocca e non sminuisce - vince il massimo buono', () => {
  const { ladder, state } = mkState();
  const node = ladder.nodes.find((n) => n.nodeId === state.node);
  const stima = node.gridSize;
  state.results[node.nodeId] = [
    { season: state.season, round: 0, position: 1, gridSize: 2, dnf: false, points: 25, prize: 100, rep: 1 },
  ];
  assert.equal(grigliaSimEstesa(ladder, state, node).gridSize, stima, 'solo la 2 corrotta: la stima resta');
  state.results[node.nodeId].push({ season: state.season, round: 1, position: 3, gridSize: 16, dnf: false, points: 15, prize: 500, rep: 3 });
  assert.equal(grigliaSimEstesa(ladder, state, node).gridSize, 16, 'massimo buono 16 sopra la 2 corrotta');
});

test('standingsFor: col campo largo la classifica conta TUTTI i sedili (non spreca più le posizioni vere)', () => {
  const { ladder, state } = mkState();
  const node = ladder.nodes.find((n) => n.nodeId === state.node);
  state.results[node.nodeId] = [
    { season: state.season, round: 0, position: 10, gridSize: 17, dnf: false, points: 6, prize: 300, rep: 2 },
  ];
  const rows = standingsFor(ladder, state, node);
  assert.equal(rows.length, 17, `righe attese 17 (16 rivali + TU), trovate ${rows.length}`);
  const me = playerStanding(ladder, state, node);
  assert.equal(me.isPlayer, true);
  assert.ok(me.position <= 17, `posizione del giocatore dentro il campo largo: P${me.position}`);
});

test('standingsFor: il campo largo è DETERMINISTICO fra letture (le classifiche salvate restano)', () => {
  const { ladder, state } = mkState();
  const node = ladder.nodes.find((n) => n.nodeId === state.node);
  state.results[node.nodeId] = [
    { season: state.season, round: 0, position: 5, gridSize: 17, dnf: false, points: 10, prize: 400, rep: 3 },
  ];
  const a = JSON.stringify(standingsFor(ladder, state, node));
  const b = JSON.stringify(standingsFor(ladder, state, node));
  assert.equal(a, b, 'due letture, stessa classifica');
});
