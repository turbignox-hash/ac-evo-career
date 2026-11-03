// nav-bottoni.test.mjs — LA GUARDIA PICCOLA DELLA SIDEBAR (3/11, richiesta
// Mauro: «aggiungi una piccola guardia test che fallisce se #nav non contiene
// un bottone per ogni tab di TABS, così una futura edit di drawNav non può più
// svuotare la sidebar»).
//
// La guardia GRANDE esiste già ([guardia-nav.test.mjs](guardia-nav.test.mjs)):
// server vero + Chromium, il DOM vero dentro aside#side > nav#nav. Ma quella
// si SALTA dove manca playwright-core o il chromium in cache, e ci mette fino
// a 90 s: nel giro normale (`npm test`) la sidebar restava senza sentinella.
// Questa è la sentinella veloce e SENZA BROWSER: prende il VERO corpo di
// drawNav da gui/js/core.js, lo esegue con un $ minimale che cattura
// l'innerHTML scritto su #nav, e conta i bottoni veri che ne escono.
//
// La legge: per OGNI tab dell'elenco TABS deve uscire UN bottone
// `<button data-tab="…">`, né uno in più né uno in meno. Si sfonda in tre
// modi — e ognuno ha il suo messaggio, non un timeout bianco:
//   • la riga `$('#nav').innerHTML = …` sparisce da drawNav → nessun bottone;
//   • un tab esce da NAV_GROUPS (drawNav filtra TABS dentro i gruppi: un tab
//     senza gruppo NON ha bottone, anche se sta in TABS — buco silenzioso);
//   • un bottone perde il data-tab (la tab diventa muta al click).
// L'elenco resta UNA sola verità (TABS nel sorgente): se domani entra o esce
// un tab, la guardia lo segue da sola, senza liste a fotocopia.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..', 'gui', 'js', 'core.js');
const core = readFileSync(CORE, 'utf8');

/** Il testo di un array letterale a partire da `const NOME = [` — con le
 *  parentesi contate a mano (le stringhe dentro non ne portano: se un domani
 *  ne portassero, il conto si rompe e la guardia dice di aggiornare la legge). */
function letterale(nome) {
  const da = core.indexOf(`const ${nome} = [`);
  assert.ok(da >= 0, `in gui/js/core.js non c'è più \`const ${nome} = [\`: l'estrazione della guardia va aggiornata, non saltata.`);
  const i = core.indexOf('[', da);
  let prof = 0;
  for (let j = i; j < core.length; j++) {
    if (core[j] === '[') prof++;
    else if (core[j] === ']' && --prof === 0) return { i, testo: core.slice(i, j + 1) };
  }
  assert.fail(`l'array ${nome} in gui/js/core.js non si chiude: la guardia non riesce a leggerlo.`);
}

/** Il corpo VERO di drawNav: dalla `{` della dichiarazione alla `}` pari. */
function corpoDrawNav() {
  const da = core.indexOf('function drawNav(){');
  assert.ok(da >= 0, 'drawNav non è più dichiarata così in gui/js/core.js — aggiorna l\'estrazione della guardia (la sidebar non può restare senza sentinella).');
  let prof = 0;
  for (let j = core.indexOf('{', da); j < core.length; j++) {
    if (core[j] === '{') prof++;
    else if (core[j] === '}' && --prof === 0) return core.slice(core.indexOf('{', da) + 1, j);
  }
  assert.fail('il corpo di drawNav non si chiude: la guardia non riesce a leggerlo.');
}

const tr = (o) => (typeof o === 'string' ? o : (o?.it ?? o?.en ?? ''));
const TABS = new Function('tr', `return ${letterale('TABS').testo};`)(tr);
const NAV_GROUPS = new Function(`return ${letterale('NAV_GROUPS').testo};`)();
const ID_TABS = TABS.map(([id]) => id);

/** Esegue il VERO drawNav contro un $ finto: l'unica cosa che conta è
 *  l'HTML scritto su #nav (il resto non deve rompersi per il test). */
function navHtml() {
  let html = null;
  const nav = {
    set innerHTML(v) { html = v; },
    get innerHTML() { return html; },
  };
  const $ = (sel) => (sel === '#nav' ? nav : null);
  const $$ = () => [];
  const draw = new Function(
    'TABS', 'NAV_GROUPS', 'ICONS', 'TAB_COLORS', 'boot', 'tab', 'tr', 'esc', '$', '$$', 'drawAiuto',
    corpoDrawNav(),
  );
  draw(TABS, NAV_GROUPS, {}, {}, null, 'dashboard', tr, (s) => String(s), $, $$, () => {});
  return html;
}

test('la sidebar: il vero drawNav disegna un bottone per OGNI tab di TABS', () => {
  assert.ok(ID_TABS.length > 15, `TABS letto male: ${ID_TABS.length} tab (ne attendevamo più di 15) — l'estrazione è cambiata.`);

  const html = navHtml();
  assert.ok(html, 'drawNav non scrive più niente su #nav: la sidebar nasce VUOTA (la riga `$(\'#nav\').innerHTML = …` è sparita?).');

  const nelDom = [...html.matchAll(/data-tab="([a-z0-9_]+)"/g)].map((m) => m[1]);
  const mancanti = ID_TABS.filter((id) => !nelDom.includes(id));
  const diTroppo = nelDom.filter((id) => !ID_TABS.includes(id));
  const inDoppio = nelDom.filter((x, i) => nelDom.indexOf(x) !== i);

  assert.equal(mancanti.length, 0,
    `SIDEBAR INCOMPLETA: #nav non ha il bottone di ${mancanti.length} tab su ${ID_TABS.length} — mancanti: ${mancanti.join(', ') || '(—)'}.\n` +
    `Se il tab è nuovo, manca l'ingresso nel suo NAV_GROUPS: drawNav filtra TABS dentro i gruppi, un tab senza gruppo non ha bottone.`);
  assert.equal(diTroppo.length, 0,
    `#nav porta bottoni che NON sono in TABS: ${diTroppo.join(', ')} — o il bottone è spurio, o l'estrazione della guardia ha perso un tab (si aggiorna la legge, non si salta).`);
  assert.equal(inDoppio.length, 0,
    `#nav ha bottoni DOPPI: ${inDoppio.join(', ')} — un tab, un bottone.`);
});

test('la sidebar: i gruppi coprono TABS per intero e i bottoni restano cliccabili', () => {
  const neiGruppi = NAV_GROUPS.flatMap((g) => g.ids);
  const orfani = ID_TABS.filter((id) => !neiGruppi.includes(id));
  assert.deepEqual(orfani, [],
    `tab fuori da ogni NAV_GROUPS: ${orfani.join(', ')} — stanno in TABS ma non usciranno MAI dalla sidebar (drawNav li scarta col filtro).`);

  // un bottone senza data-tab è muto: il click non porta da nessuna parte
  // (l'Aiuto è l'unico bottone legittimo senza data-tab: non è una vista)
  const bottoni = [...navHtml().matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  const senzaTab = bottoni.filter((b) => !b.includes('data-tab=') && !b.includes('id="b-aiuto"'));
  assert.equal(senzaTab.length, 0,
    `bottoni senza data-tab: ${senzaTab.join(' · ') || '(—)'} — il click non porta a nessuna vista.`);
});
