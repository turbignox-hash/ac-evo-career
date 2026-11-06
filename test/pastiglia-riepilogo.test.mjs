// pastiglia-riepilogo.test.mjs — LA GUARDIA DELLA PASTIGLIA (6/11, richiesta
// Mauro: «avvisami anche quando il monitor rileva una sessione nuova mentre
// sono su un altro tab, con una pastiglia sul Cruscotto»).
//
// Il difetto custodito: la scheda del riepilogo vive nel Cruscotto e fa polling
// solo finché è in pagina; da un altro tab il monitor poteva chiudere una
// sessione e nessuno lo diceva. Ora un ciclo globale (10 s) guarda
// /api/live-riepilogo e, se sei altrove, accende una pastiglia sulla voce
// Cruscotto; aprire il Cruscotto la spegne.
//
// Qui si prova la LEGGE, senza browser: la funzione `novitaRiepilogo` si
// estrae dal VERO sorgente di gui/js/core.js (come fa nav-bottoni con
// drawNav) e si interroga sui casi che contano. Le tre maglie che rendono la
// pastiglia utile e non rumorosa:
//   • primo giro (visto == null): nessuna pastiglia per i riepiloghi già in
//     archivio — all'apertura della GUI non deve comparire un numero a caso;
//   • sessione APERTA: non è ancora una novità (il riepilogo si legge a fine
//     sessione, la stessa che mostra la scheda);
//   • sessione CHIUSA con firma diversa da quella vista: novità, una sola
//     volta (la stessa firma non riaccende niente).
// E si controlla il filo nel sorgente: la pastiglia sta SOLO sulla voce
// Cruscotto (non sui Messaggi, che ha la sua), e render() la spegne quando
// il tab aperto è il Cruscotto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..', 'gui', 'js', 'core.js');
const core = readFileSync(CORE, 'utf8');

/** Il corpo di una funzione di primo livello: da `function nome(` fino alla
 *  prima `}` in colonna zero (dentro il corpo tutto è indentato). */
function funzione(nome) {
  const da = core.indexOf(`function ${nome}(`);
  assert.ok(da >= 0, `in gui/js/core.js non c'è più \`function ${nome}(\`: la guardia della pastiglia va aggiornata, non saltata.`);
  const fine = core.indexOf('\n}', da);
  assert.ok(fine > da, `la funzione ${nome} non si chiude più con una graffa in colonna zero: estrazione da rivedere.`);
  return core.slice(da, fine + 2);
}

const sorgente = `${funzione('novitaRiepilogo')}\nreturn novitaRiepilogo;`;
const novitaRiepilogo = new Function(sorgente)();

const sessione = (fine, chiusa = true) => ({ totale: 1, chiusa, sessioni: [{ fine }] });

test('primo giro: i riepiloghi già in archivio non sono una novità', () => {
  const r = novitaRiepilogo(sessione('18:42'), null);
  assert.equal(r.nuova, false, 'al primo giro non si accende niente: si prende solo la base');
  assert.equal(r.firma, '1|18:42');
});

test('sessione aperta: nessuna novità finché non si chiude', () => {
  assert.equal(novitaRiepilogo(sessione('19:10', false), '1|18:42').nuova, false);
});

test('sessione chiusa mai vista: è una novità (una volta sola)', () => {
  const r = novitaRiepilogo(sessione('19:10'), '1|18:42');
  assert.equal(r.nuova, true);
  assert.equal(novitaRiepilogo(sessione('19:10'), r.firma).nuova, false, 'la stessa firma non riaccende la pastiglia');
});

test('la stessa sessione chiusa non è nuova se il conteggio non cambia', () => {
  assert.equal(novitaRiepilogo({ totale: 1, chiusa: true, sessioni: [{ fine: '19:10' }] }, '1|19:10').nuova, false);
});

test('server senza sessioni o senza risposta: firma stabile, mai novità', () => {
  assert.deepEqual(novitaRiepilogo({ totale: 0, chiusa: false, sessioni: [] }, '0|'), { firma: '0|', nuova: false });
  assert.deepEqual(novitaRiepilogo(null, '0|'), { firma: '0|', nuova: false });
});

test('il filo nel sorgente: pastiglia solo sul Cruscotto, spenta da render()', () => {
  const nav = funzione('drawNav');
  assert.match(nav, /id==='dashboard'\?novita/, 'drawNav deve mettere la pastiglia sulla voce dashboard');
  assert.match(nav, /rlNovita\s*\?/, 'la pastiglia deve esistere solo quando c\'è una novità');
  const render = funzione('render');
  assert.match(render, /tab === 'dashboard' && rlNovita[\s\S]*rlNovita = 0/, 'render() sul Cruscotto deve spegnere la pastiglia');
  assert.match(core, /setInterval\(pollRiepilogoNav, 10000\)/, 'il ciclo globale deve esistere anche fuori dal Cruscotto');
});
