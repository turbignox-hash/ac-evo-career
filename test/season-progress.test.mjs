// season-progress.test.mjs — la stagione si chiude quando il calendario è finito
// (richiesta Mauro 4/11: «Stagione completata ma chiudi stagione dice incompleta»).
//
// Il caso vero: dtm_legends ha 9 ronde, ma il sedile le ha corse a cavallo di due
// stagioni globali (0-2 in stagione 9, 3-8 in stagione 14). Il vecchio controllo
// filtrava `r.season === state.season` e contava 6/9: chiedeva conferma a stagione
// FINITA. `seasonProgress` chiude il calendario anche quando è stata corsa la RONDA
// FINALE, senza contare le gare di una stagione nuova appena aperta (0 risultati).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seasonProgress } from '../src/state.mjs';

const node = { nodeId: 'serie_x', display: 'Serie X', calendar: Array.from({ length: 9 }, (_, i) => ({ track: 'T' + i })) };
const st = (results, season = 14) => ({ season, results });
const r = (round, season) => ({ round, season, position: 1, dnf: false, points: 25 });

test('serie a cavallo di due stagioni: la ronda finale corsa chiude il calendario', () => {
  const s = st({ serie_x: [...[0, 1, 2].map((n) => r(n, 9)), ...[3, 4, 5, 6, 7, 8].map((n) => r(n, 14))] });
  const p = seasonProgress(s, node);
  assert.equal(p.played, 6, 'le ronde della stagione viva sono 6');
  assert.equal(p.total, 9);
  assert.equal(p.lastRound, 8);
  assert.equal(p.complete, true, "la stagione è completa: l'ultima ronda è stata corsa");
});

test('stagione intera: 9 ronde su 9', () => {
  const p = seasonProgress(st({ serie_x: Array.from({ length: 9 }, (_, n) => r(n, 14)) }), node);
  assert.equal(p.played, 9);
  assert.equal(p.complete, true);
});

test('stagione appena aperta: nessun risultato, non è completa', () => {
  const p = seasonProgress(st({ serie_x: Array.from({ length: 9 }, (_, n) => r(n, 9)) }, 15), node);
  assert.equal(p.played, 0);
  assert.equal(p.complete, false, 'le gare della stagione vecchia non chiudono la nuova');
});

test('stagione a metà: ronde 0-2 su 9, non è completa', () => {
  const p = seasonProgress(st({ serie_x: [0, 1, 2].map((n) => r(n, 14)) }), node);
  assert.equal(p.played, 3);
  assert.equal(p.complete, false);
});

test('ronde doppie contate una volta sola', () => {
  const p = seasonProgress(st({ serie_x: [r(0, 14), r(0, 14), r(1, 14)] }), node);
  assert.equal(p.played, 2);
});

test('webui e CLI usano seasonProgress, non il vecchio conteggio per stagione', () => {
  const w = readFileSync(new URL('../src/webui.mjs', import.meta.url), 'utf8');
  const c = readFileSync(new URL('../src/cli.mjs', import.meta.url), 'utf8');
  assert.ok(w.includes('const prog = seasonProgress(state, node);'), 'webui: conteggio non migrato');
  assert.ok(c.includes('const prog = seasonProgress(state, node);'), 'cli: conteggio non migrato');
  assert.ok(!w.includes('if (played < node.calendar.length'), 'webui: vecchio gate ancora presente');
  assert.ok(!c.includes('if (played < node.calendar.length'), 'cli: vecchio gate ancora presente');
});
