// viste-guard.test.mjs — LA GUARDIA DELLE VISTE GUI (26/10):
// core.js fa da smistatore di tab fra i file gui/js/ senza import (le viste
// sono globali dei <script> di index.html): se una draw* si sposta o si
// cancella a mano, Biome NON lo vede (ogni file .js viene valutato isolato)
// ma la GUI muore al click sulla tab. Questo test parcheggia il vuoto:
//   1) ogni draw* INVOCATA da core.js deve essere DICHIARATA in gui/js/*;
//   2) ogni draw* DICHIARATA in gui/js/* deve essere richiamata in almeno
//      un file della GUI — niente viste morte che si accumulano di nascosto;
//   3) (3/11) ogni id="…" renderizzato nel gui deve avere un aggancio
//      $('#id') o querySelector('#id') in qualche file — niente bottoni
//      morti da click (dietro la richiesta Mauro:“Soprannomi in blocco non
//      funziona”: bottone e funzione c'erano, il BINDING era sparito).
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

// 3/11 — ogni BOTTONE id="b-…" renderizzato nel gui DEVE avere un aggancio:
// $('#b-…'), querySelector('#b-…') oppure l'id come argomento di un helper
// (manutenzione('b-…', …)). Pannelli e contenitori HTML no: si pescano via
// innerHTML con altri canali, e qui non è la classe del bug visto (il
// «Soprannomi in blocco»: bottone e funzione c'erano, il binding era sparito).
test('ogni bottone id="b-…" del gui è agganciato a un selettore o a un helper', () => {
  for (const f of files) {
    const ids = [...src[f].matchAll(/\bid=["']?(b-[\w-]+)/g)].map((m) => m[1]);
    for (const id of new Set(ids)) {
      const aggancio = files.some((g) =>
        src[g].includes(`'#${id}'`) || src[g].includes(`"#${id}"`
        ) || src[g].includes(`'${id}'`) || src[g].includes(`"${id}"`),
      );
      assert.ok(aggancio,
        `il bottone id="${id}" (${f}) non è mai agganciato — niente $('#${id}') né '${id}' da helper: il click non fa nada`);
    }
  }
});

// 1/11 — I COMMENTI HTML del markup (analogia con le app in gioco:
// test/uiapp-installata.test.mjs). Ogni <!-- … --> rimasto nel markup della
// GUI (index.html o i template delle viste) è o MEMORIA con la firma della
// casa — una data «(30/10)» come i commenti JS — o dubbia spazzatura da
// cancellare. E NESSUN markup commentato (un tag dentro il commento è un
// blocco HTML sepolto che il browser NON usa ma lo spediamo lo stesso:
// si cancella o lo si racconta nel diario). Anche multi-riga: il corpo va
// cercato con /\s, non confermato a riga fissa.
test('ogni commento HTML del markup della GUI porta la firma della casa (data) e non nasconde tag', () => {
  const daGuardare = { 'index.html': readFileSync(join(DIR, '..', 'index.html'), 'utf8'), ...src };
  const fuorilegge = [];
  for (const [f, t] of Object.entries(daGuardare)) {
    for (const m of t.matchAll(/<!--([\s\S]*?)-->/g)) {
      const corpo = m[1].replace(/\s+/g, ' ').trim();
      if (!/\b\d{1,2}\/\d{1,2}\b/.test(corpo)) {
        fuorilegge.push(`${f}: commento HTML senza data — «${corpo.slice(0, 60)}» — mettici la firma (data) o cancellalo`);
        continue;
      }
      if (/<[a-zA-Z/]/.test(corpo)) {
        fuorilegge.push(`${f}: markup commentato (tag dentro il commento) — «${corpo.slice(0, 60)}» — cancellalo: il browser non lo usa e noi lo spediamo lo stesso`);
      }
    }
  }
  assert.deepEqual(fuorilegge, [], `commenti HTML fuorilegge nel markup:\n${fuorilegge.join('\n')}`);
});
