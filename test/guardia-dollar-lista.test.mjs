// guardia-dollar-lista.test.mjs — LA GUARDIA DEL DIFETTO SILENZIOSO (4/11,
// richiesta Mauro: «una guardia da 20 righe sul difetto di oggi. Il bug era
// $('...') usato come lista (forEach su un nodo)… un test statico che
// scansiona gui/js/*.js e fallisce su $( seguito da .forEach/.map/.filter
// (escludendo $$)»).
//
// Il difetto: `$` restituisce UN nodo (o null), `$$` restituisce la lista.
// Scrivere `$('.cella').forEach(...)` non è un errore di sintassi e non lo
// vede nessun typechecker: a schermo la vista muore con
// «$(...).forEach is not a function» — è così che la tab Griglia è arrivata
// rotta fino in release. Qui la classe intera di errori muore in un test
// statico: nessun browser, nessun server, millisecondi.
//
// La prova di rottura è IN QUESTO FILE: il rilevatore deve trovare il difetto
// sul testo finto e deve tacere su `$$`. Se smette di riconoscerlo, il test
// cade prima ancora di guardare il codice vero.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUI = join(ROOT, 'gui', 'js');

/* Il rilevatore: `$(` NON preceduto da un altro `$` (quindi `$$(` è escluso),
 * argomento su una riga, poi `.forEach/.map/.filter(`. Restituisce riga e
 * testo per un messaggio che dice dove guardare. */
export function usiSbagliati(src) {
  const out = [];
  const re = /(?<!\$)\$\([^)\n]*\)\s*\.(forEach|map|filter)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const riga = src.slice(0, m.index).split(/\r?\n/).length;
    out.push({ riga, metodo: m[1], testo: m[0].replace(/\s+/g, ' ').slice(0, 90) });
  }
  return out;
}

test('il rilevatore riconosce $(...).forEach e NON accusa $$(...).forEach', () => {
  assert.equal(usiSbagliati("$('#x').forEach((n) => n)").length, 1);
  assert.equal(usiSbagliati("$('#x').map((n) => n)").length, 1);
  assert.equal(usiSbagliati("$('#x').filter(Boolean)").length, 1);
  assert.equal(usiSbagliati("$$('.x').forEach((n) => n)").length, 0);
  assert.equal(usiSbagliati("$('#x')").length, 0);
  // e dice la riga giusta
  assert.equal(usiSbagliati("uno\ndue\n$('#x').forEach(f)")[0].riga, 3);
});

test('nessun file di gui/js usa $ come lista', () => {
  const trovati = [];
  for (const nome of readdirSync(GUI).filter((f) => f.endsWith('.js'))) {
    for (const u of usiSbagliati(readFileSync(join(GUI, nome), 'utf8'))) {
      trovati.push(`${nome}:${u.riga} — ${u.testo}`);
    }
  }
  assert.deepEqual(trovati, [],
    `$ è UN nodo, non una lista: usa $$ per forEach/map/filter.\n${trovati.join('\n')}`);
});
