// diffesa-sonda.test.mjs — regressione della difesa anti-colpo (31/10/2026).
// La lezione dei DUE colpi (SESSION_REPORT §Incidente): una rotta di scrittura
// sopra GET doveva stare nel set SOLO_POST — e una sonda NON isolata toccava il
// save vero del PC. Due rinforzi qui:
//   1) statico: ogni rotta nel set SOLO_POST deve essere un `case` VERO del
//      dispatcher (webui o un modulo webui-actions-*; un refuso nel set sarebbe
//      un 405 mai dato, invisibile) e 'life' deve restare nel set (era la GET
//      che persisteva il save).
//   2) banco vivo: la sonda completa tools/_difesa-probe.mjs deve uscire 0 —
//      sweep GET su TUTTE le rotte con sandbox composta e carriera di MARCA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = readFileSync(join(ROOT, 'src', 'webui.mjs'), 'utf8');
const MODULI_AZIONI = readdirSync(join(ROOT, 'src'))
  .filter((f) => /^webui-actions-.*\.mjs$/.test(f))
  .map((file) => {
    const src = readFileSync(join(ROOT, 'src', file), 'utf8');
    const m = src.match(/const ([A-Z][A-Z0-9_]*_ACTIONS) = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(m, `${file}: set *_ACTIONS non trovato`);
    return {
      file,
      azioni: new Set([...m[2].matchAll(/'([\w-]+)'/g)].map((x) => x[1])),
      casi: new Set([...src.matchAll(/case '([\w-]+)':/g)].map((x) => x[1])),
    };
  });

/** Le rotte dichiarate scrivere dal source: solo ciò che sta tra
 *  `const SOLO_POST = new Set([` e `]);`. */
function soloPostDaFonte(src) {
  const m = src.match(/const SOLO_POST = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(m, 'set SOLO_POST non trovato in src/webui.mjs');
  return [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]);
}

test('statico: ogni rotta del set SOLO_POST è un case vero del dispatcher (webui o moduli azioni)', () => {
  const casiWebui = new Set([...fonte.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]));
  const casi = new Set([...casiWebui, ...MODULI_AZIONI.flatMap((m) => [...m.casi])]);
  assert.ok(casi.size >= 100, `dispatcher: ${casi.size} case — la lettura dei fonti non ha degradato`);
  assert.ok(MODULI_AZIONI.length >= 2, `moduli azioni: ${MODULI_AZIONI.length} — agenda ed eventi devono esserci`);
  const azioniTotali = MODULI_AZIONI.reduce((n, m) => n + m.azioni.size, 0);
  assert.ok(azioniTotali >= 11, `azioni esterne: ${azioniTotali} — i set dei moduli sono degradati`);
  const set = soloPostDaFonte(fonte);
  assert.ok(set.length >= 44, `set: ${set.length} rotte — il set nel fonte lette male o si è accorciato`);
  const fantasma = set.filter((r) => !casiWebui.has(r) && !MODULI_AZIONI.some((m) => m.azioni.has(r) && m.casi.has(r)));
  assert.deepEqual(fantasma, [], `rotte nel set senza case (405 mai dati): ${fantasma.join(', ')}`);
});

test('statico: life resta nel set (la GET mutava il save: persist su ensure/check)', () => {
  assert.ok(soloPostDaFonte(fonte).includes('life'),
    "il save-persist via GET /api/life è tornato: 'life' DEVE restare in SOLO_POST");
});

test('statico: nessun String(...).toFixed in GUI e uiapp (pattern del bug del 1/11)', () => {
  //Il bug curato in gui/js/viste-a.js (metodo di formattazione del giro): String()
  //avvolgeva NUMBER e la .toFixed cadeva (le stringhe non ce l'hanno) → crash
  //«String(...).toFixed is not a function» nella scheda al primo giro formattabile.
  //Il guardia spazza i .js/.html di gui/ E di uiapp/ (le viste dentro il gioco:
  //cruscotto e pitwall, allargata 1/11 a richiesta Mauro) a caccia del pattern
  //String(<fino a 1 livello di parentesi annidate>) .toFixed.
  const PATTERN = /String\((?:[^()]|\([^()]*\))*\)\s*\.toFixed/;
  const fileGui = [];
  const passa = (dir) => {
    for (const nome of readdirSync(dir, { withFileTypes: true })) {
      const via = join(dir, nome.name);
      if (nome.isDirectory()) passa(via);
      else if (/\.(js|html|htm)$/i.test(nome.name)) fileGui.push(via);
    }
  };
  passa(join(ROOT, 'gui'));
  passa(join(ROOT, 'uiapp'));
  assert.ok(fileGui.length >= 5, `${fileGui.length} file — la camminata non ha visto nulla`);
  const contanoGui = fileGui.filter((v) => v.startsWith(join(ROOT, 'gui'))).length;
  const contanoUiapp = fileGui.filter((v) => v.startsWith(join(ROOT, 'uiapp'))).length;
  assert.ok(contanoGui >= 5, `gui/: ${contanoGui} file — la camminata non ha visto nulla`);
  assert.ok(contanoUiapp >= 2, `uiapp/ deve avere almeno cruscotto+pitwall: visti ${contanoUiapp} — la cartella è sparita o la camminata è muta (le viste DEL GIOCO resterebbero scoperte)`);
  const colpiti = [];
  for (const via of fileGui) {
    const testo = readFileSync(via, 'utf8');
    const m = testo.match(PATTERN);
    if (m) {
      const riga = testo.slice(0, m.index).split('\n').length;
      colpiti.push(`${via.slice(ROOT.length + 1)}:${riga} → ${m[0]}`);
    }
  }
  assert.deepEqual(colpiti, [],
    `String(...).toFixed in GUI/uiapp (ricalca del bug: String() NON ha .toFixed):\n  ${colpiti.join('\n  ')}`);
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
