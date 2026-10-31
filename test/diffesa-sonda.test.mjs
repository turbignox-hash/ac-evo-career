// diffesa-sonda.test.mjs — regressione della difesa anti-colpo (31/10/2026).
// La lezione dei DUE colpi (SESSION_REPORT §Incidente): una rotta di scrittura
// sopra GET doveva stare nel set SOLO_POST — e una sonda NON isolata toccava il
// save vero del PC. Due rinforzi qui:
//   1) statico: ogni rotta nel set SOLO_POST deve essere un `case` VERO del
//      dispatcher (un refuso nel set sarebbe un 405 mai dato, invisibile) e
//      'life' deve restare nel set (era la GET che persisteva il save).
//   2) banco vivo: la sonda completa tools/_difesa-probe.mjs deve uscire 0 —
//      sweep GET su TUTTE le rotte con sandbox composta e carriera di MARCA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(join(ROOT, 'src', 'webui.mjs'), 'utf8');

/** Le rotte dichiarate scrivere dal source: solo ciò che sta tra
 *  `const SOLO_POST = new Set([` e `]);`. */
function soloPostDaFonte(src) {
  const m = src.match(/const SOLO_POST = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, 'set SOLO_POST non trovato in src/webui.mjs');
  return [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]);
}

test('statico: ogni rotta del set SOLO_POST è un case vero del dispatcher', () => {
  const casi = new Set([...fonte.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]));
  assert.ok(casi.size >= 100, `dispatcher: ${casi.size} case — la lettura del fonte non ha degradato`);
  const set = soloPostDaFonte(fonte);
  assert.ok(set.length >= 44, `set: ${set.length} rotte — il set nel fonte lette male o si è accorciato`);
  const fantasma = set.filter((r) => !casi.has(r));
  assert.deepEqual(fantasma, [], `rotte nel set senza case (405 mai dati): ${fantasma.join(', ')}`);
});

test('statico: life resta nel set (la GET mutava il save: persist su ensure/check)', () => {
  assert.ok(soloPostDaFonte(fonte).includes('life'),
    "il save-persist via GET /api/life è tornato: 'life' DEVE restare in SOLO_POST");
});

test('regressione: la sonda anti-colpo esce a zero (sweep GET su tutte le rotte, sandbox completa)',
  { timeout: 120000 }, () => {
  // La sonda costruisce da SOLO la sua sandbox (carriera di MARCA + flussi +
  // file di gioco + root Saved Games false) e smaschera PER NOME qualsiasi
  // GET che muti i file del banco; esce 0 solo se anche il set SOLO_POST
  // risponde tutto 405 e la POST regolare raggiunge l'handler.
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', '_difesa-probe.mjs'), '--quiet'], {
    cwd: ROOT, encoding: 'utf8', timeout: 100000,
  });
  assert.equal(r.status, 0, `sonda exit ${r.status}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);
});
