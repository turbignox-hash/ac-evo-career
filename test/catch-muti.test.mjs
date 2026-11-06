// test/catch-muti.test.mjs — nessun catch MUTO in src/.
//
// 6/11 (audit del progetto): su 929 catch, 300 erano «vuoti» e 18 non avevano
// nemmeno un commento. Molti vuoti sono legittimi («questo non deve fermare il
// pannello»), ma un catch senza NIENTE è un guasto che non si saprà mai: è la
// categoria che ha prodotto le serate di copilota muta («nessun errore» e il
// pannello zitto).
//
// La legge qui: vuoto SÌ, quando è una decisione — ma il silenzio va FIRMATO,
// con `taci(...)` (registro degli errori, una riga per firma) o con un
// commento che dice perché si può tacere. Il test scandisce i sorgenti: se un
// catch torna muto, si rompe qui e non in pista.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** I catch con corpo VUOTO (solo spazi). `catch { /* … *\/ }` non è vuoto:
 *  ha già la sua firma. */
function catchMuti(fonte) {
  const out = [];
  const re = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  for (const m of fonte.matchAll(re)) {
    const dopo = fonte.slice(m.index + m[0].length, fonte.indexOf('\n', m.index + m[0].length));
    const firma = /^[^\n]*?(\/\/|\/\*|#)/.test(dopo) && dopo.trim().length > 0;
    if (firma) continue;
    const riga = fonte.slice(0, m.index).split('\n').length;
    out.push(riga);
  }
  return out;
}

test('src/: nessun catch muto — o firma il registro (taci) o dice perché tace', () => {
  const colpevoli = [];
  for (const file of readdirSync(SRC).filter((f) => f.endsWith('.mjs'))) {
    const fonte = readFileSync(join(SRC, file), 'utf8');
    for (const riga of catchMuti(fonte)) colpevoli.push(`${file}:${riga}`);
  }
  assert.deepEqual(colpevoli, [],
    `catch senza una parola (usa taci(...) o un commento): ${colpevoli.join(', ')}`);
});

test('il custode esiste e finisce nel registro: taci() accanto a recordWarning', () => {
  const fonte = readFileSync(join(SRC, 'warnings.mjs'), 'utf8');
  assert.match(fonte, /export function taci\(etichetta, e\)/,
    'warnings.mjs deve esportare taci(etichetta, e)');
  assert.match(fonte, /recordWarning\(`taci:\$\{etichetta\}`/,
    'taci deve scrivere nel registro con la sua etichetta');
});

test('i silenzi che erano guasti veri ora firmano (voce, griglia, rimonte)', () => {
  const casi = [
    ['gridbuilder.mjs', "taci('gridbuilder:preset'"],
    ['gridbuilder.mjs', "taci('gridbuilder:celle'"],
    ['grid-calib.mjs', "taci('grid-calib:reset'"],
    ['state.mjs', "taci('state:rivals'"],
  ];
  for (const [file, atteso] of casi) {
    const fonte = readFileSync(join(SRC, file), 'utf8');
    assert.ok(fonte.includes(atteso), `${file} deve firmare: ${atteso}`);
  }
});
