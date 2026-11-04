// classifica-sedile.test.mjs — la classifica conta le ronde del SEDILE
// (audit 4/11: dtm_legends 9 ronde a cavallo di stagione 9 e 14; la classifica
// filtrava per stagione e simulava per i rivali le 3 ronde vecchie).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rondeDellaSerie } from '../src/state.mjs';

const node = { nodeId: 'serie_x', calendar: Array.from({ length: 9 }, (_, i) => ({ track: 'T' + i })) };
const r = (round, season) => ({ round, season, position: 1, dnf: false, points: 25 });

test('ronde a cavallo di due stagioni: si prendono tutte e nove', () => {
  const state = { season: 14, results: { serie_x: [...[0, 1, 2].map((n) => r(n, 9)), ...[3, 4, 5, 6, 7, 8].map((n) => r(n, 14))] } };
  const mine = rondeDellaSerie(state, node);
  assert.equal(mine.length, 9);
  assert.deepEqual(mine.map((x) => x.round).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('stagione nuova appena aperta: nessuna ronda vecchia riempita', () => {
  const state = { season: 15, results: { serie_x: Array.from({ length: 9 }, (_, n) => r(n, 9)) } };
  assert.deepEqual(rondeDellaSerie(state, node), []);
});

test('stagione viva che riparte da zero: le vecchie ronde non si sovrappongono', () => {
  const state = { season: 15, results: { serie_x: [r(0, 15), r(1, 15), ...[0, 1, 2].map((n) => r(n, 9))] } };
  const mine = rondeDellaSerie(state, node);
  assert.equal(mine.length, 2, 'le ronde 0-1 della stagione nuova non vengono doppiate');
});

test('ronda vecchia ripetuta su più stagioni: vale la più recente', () => {
  const state = { season: 15, results: { serie_x: [r(3, 15), r(0, 9), r(0, 12), r(0, 14)] } };
  const mine = rondeDellaSerie(state, node);
  const zero = mine.filter((x) => x.round === 0);
  assert.equal(zero.length, 1);
  assert.equal(zero[0].season, 14);
});
