// viste-guard.test.mjs — LA GUARDIA DELLE VISTE GUI (26/10):
// core.js fa da smistatore di tab fra i file gui/js/ senza import (le viste
// sono globali dei <script> di index.html): se una draw* si sposta o si
// cancella a mano, Biome NON lo vede (ogni file .js viene valutato isolato)
// ma la GUI muore al click sulla tab. Questo test parcheggia il vuoto:
//   1) ogni draw* INVOCATA da core.js deve essere DICHIARATA in gui/js/*;
//   2) ogni draw* DICHIARATA in gui/js/* deve essere richiamata in almeno
//      un file della GUI — niente viste morte che si accumulano di nascosto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'gui', 'js');
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));
const core = src['core.js'] ?? '';

const chiamate = [...new Set(core.match(/\bdraw[A-Z]\w*/g) ?? [])];
const dichiarazioni = [...new Set(
  files.flatMap((f) => src[f].match(/\b(?:async\s+)?function\s+draw[A-Z]\w*/g) ?? [])
    .map((d) => d.replace(/\b(?:async\s+)?function\s+/, '')),
)];

test('le draw* del gui sono un insieme non vuoto (smistatore vivo)', () => {
  assert.ok(chiamate.length > 15, `core.js richiede troppe poche draw*: ${chiamate.length}`);
  assert.ok(dichiarazioni.length > 15, `le viste dichiarano troppe poche draw*: ${dichiarazioni.length}`);
});

test('ogni draw* invocata da core.js è dichiarata in gui/js/*', () => {
  for (const n of chiamate) {
    const ok = files.some((f) => new RegExp(`\\b(?:async\\s+)?function\\s+${n}\\b`).test(src[f]));
    assert.ok(ok, `"${n}" è richiamata in core.js ma non dichiarata in nessun file di gui/js — la tab muore al click`);
  }
});

test('ogni draw* dichiarata in gui/js/* è richiamata in almeno un file della GUI', () => {
  for (const n of dichiarazioni) {
    const usi = files.reduce((tot, f) => tot + (src[f].match(new RegExp(`\\b${n}\\b`, 'g'))?.length ?? 0), 0);
    // >= 2: la dichiarazione conta da sola, serve almeno una chiamata vera
    assert.ok(usi >= 2, `"${n}" è dichiarata ma mai richiamata (usi: ${usi}) — codice morto: cancellarla o colarla`);
  }
});

test('ogni draw* di core.js è una dichiarazione di funzione vera, non un nome preso in prestito', () => {
  // test 2 trova match `\b${n}\b` anche in commenti o stringhe: qui esigiamo
  // che il nome figuri fra le DECLARAZIONI `function draw…` — la vista esiste
  // davvero come funzione invocabile, non come parola scomparsa nel testo
  for (const n of chiamate) {
    assert.ok(dichiarazioni.includes(n),
      `"${n}" è richiamata in core.js ma in gui/js c'è solo il nome, non la function`);
  }
});
