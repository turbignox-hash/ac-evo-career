// trim-passo-uno.test.mjs — il passo del trim adattivo è UN punto (richiesta Mauro 4/11:
// «ora ha proposto trim ++5 e non capivo se alzava la difficoltà di 1 punto o 5,
// poi ho visto 1... direi di lasciare solo +1 così a lungo andare si calibra più
// precisamente»). Il motore già faceva ±1 (Math.sign); qui si fissa il passo sia
// nel motore (proposeDifficulty) sia nelle schermate che lo raccontano: card,
// pannello Difficoltà, CLI e scheda risultati devono dire «passo +1», non lasciare
// il solo «trim +5 → +6» che si legge come un salto di cinque.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proposeDifficulty } from '../src/state.mjs';

const ladder = { nodes: [], contentNames: {} };
const mkNode = () => ({ nodeId: 'serie_x', display: 'Serie X', calendar: [{ track: 'Imola' }] });
const mkState = (trim) => ({
  round: 0,
  difficulty: { mode: 'adaptive', trim: { serie_x: trim }, locked: [], base: {}, offClass: {}, offTrack: {} },
});

test('proposeDifficulty muove il trim di ESATTAMENTE un punto, in ogni fascia', () => {
  const casi = [[1, 15, 5], [1, 15, 0], [3, 15, -5], [15, 15, 0], [14, 15, 2], [8, 15, 4], [12, 15, 1]];
  let mossi = 0;
  for (const [pos, grid, trim] of casi) {
    const p = proposeDifficulty(ladder, mkState(trim), mkNode(), pos, grid);
    if (!p) continue;
    mossi += 1;
    assert.equal(Math.abs(p.to - p.from), 1, 'P' + pos + '/' + grid + ' con trim ' + trim + ': salto ' + p.from + '→' + p.to);
    assert.equal(p.to, trim + Math.sign(p.to - p.from), 'il trim parte dal valore vivo e si muove di un punto');
  }
  assert.ok(mossi >= 4, 'servono almeno quattro casi che propongono davvero, mossi=' + mossi);
});

test('le schermate restanti dicono il PASSO accanto ai due valori', () => {
  const a = readFileSync(new URL('../gui/js/viste-a.js', import.meta.url), 'utf8');
  const d = readFileSync(new URL('../gui/js/viste-d.js', import.meta.url), 'utf8');
  const c = readFileSync(new URL('../gui/js/viste-c.js', import.meta.url), 'utf8');
  const cli = readFileSync(new URL('../src/cli.mjs', import.meta.url), 'utf8');
  assert.ok(!a.includes('b-prop-accept') && !a.includes('Il tool suggerisce il trim'), 'la scheda mostra ancora il riquadro del suggerimento trim');
  assert.ok(d.includes("passo', en: 'step' })} ${v.pending.to - v.pending.from"), 'pannello senza passo');
  assert.ok(c.includes('passo ${r.proposal.to - r.proposal.from'), 'risultati senza passo');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: e il testo della CLI, non un template da valutare
  assert.ok(cli.includes('(passo ${signed(out.proposal.to - out.proposal.from)})'), 'CLI senza passo (prepara)');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: e il testo della CLI, non un template da valutare
  assert.ok(cli.includes('(passo ${signed(out.imported.proposal.to - out.imported.proposal.from)})'), 'CLI senza passo (import)');
});
