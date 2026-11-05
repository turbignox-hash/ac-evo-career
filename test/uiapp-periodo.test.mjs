// uiapp-periodo.test.mjs — LA LEGGE DEL RITMO fra publisher e app (8/11/2026;
// riletta 1/11 quando PERIODO_MS ha smesso di vivere a mano in TRE file).
//
// Il ritmo delle fasce si dichiara in UN SOLO punto: `export const PERIODO_MS`
// nel publisher src/uiapp-pub.mjs. Le due app in gioco (Cruscotto, Pitwall)
// sono script isolati dentro EVO (il loader non fa moduli), quindi l'import
// lo fa la BUILD: tools/genera-uiapp.mjs legge il valore dal publisher e lo
// scrive al segnaposto __PERIODO_MS_DAL_PUBLISHER__ delle sagome
// uiapp/<app>/<app>.src.js, producendo uiapp/<app>/<app>.js — la STESSA cosa
// poi copiata in gioco dagli installatori. Prima era fiducia orale («se lo
// cambi, cambia là» col numero riscritto a mano in tre posti): oggi il
// numero è uno e il test verifica i CONSUMATORI. Quattro fili li legano:
//
//   1) il NUMERO: le copie costruite dichiarano la STESSA costante del
//      publisher (una cifra cambiata sola = le app chiedono slot
//      che non esistono e muoiono in silenzio);
//   2) la SAGOMA: nessun numero a mano nelle sagome — solo il segnaposto,
//      uno per app, così la dichiarazione duplicata è impossibile;
//   3) il NOME dello slot: publisher e app nascono la fascia con la STESSA
//      formula (Math.floor(now / PERIODO_MS)) e il file si chiama
//      ui-<slot>.json da ENTRAMBE le parti — un nome o una formula scelta a
//      mano = una fascia mai trovata;  //   4) il SONDAGGIO a metà: le app leggono ogni PERIODO_MS/2, il publisher
//      scrive ogni PERIODO_MS — mai una fascia persa perché chi leggeva era
//      più lento del periodo che scandisce. Due vigilanze: la FORMA della riga
//      (sotto) e il VALORE_MOUNTATO (1/11): l'espressione del ritmo nel
//      costruito, VALUTATA col numero che la build ci ha cucito, vale
//      PERIODO_MS/2 — così una formula rimessa a mano non passa dall'incollo;
//   5) la VALIDITÀ: il publisher marca ogni fascia con `validaFino`
//      ((slot+1)·PERIODO_MS) e le app lo rispettano — la fascia scaduta si
//      mostra DICHIRATA come passata (mai venduta per fresca) e, per il
//      Cruscotto, i comandi che vi viaggiano NON partono (il publisher li
//      ripropone in ogni fascia viva; niente setcar da dati morti).
//
// Solo i sorgenti del WORKSPACE sono la verità qui dentro: le copie
// installate in Saved Games le sorvegliano i test degli installatori
// (installa-gioco, installatore-sandbox) con la LORO sandbox, non questo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// il valore del publisher, importato VERO (stesso gesto della build)
import { PERIODO_MS } from '../src/uiapp-pub.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP = [
  { chiave: 'cruscotto', sagoma: 'cruscotto.src.js', costruito: 'cruscotto.js' },
  { chiave: 'pitwall', sagoma: 'pitwall.src.js', costruito: 'pitwall.js' },
];
const testoApp = Object.fromEntries(APP.map((a) => {
  const via = join(ROOT, 'uiapp', a.chiave);
  return [a.chiave, {
    sagoma: readFileSync(join(via, a.sagoma), 'utf8'),
    costruito: readFileSync(join(via, a.costruito), 'utf8'),
  }];
}));
const testoPublisher = readFileSync(join(ROOT, 'src', 'uiapp-pub.mjs'), 'utf8');

/** La costante `PERIODO_MS = N` di UN file (la dichiarazione, non i commenti
 *  che parlano del ritmo: /se lo cambi, cambia là/ non è un valore). */
function periodoDi(src, nome) {
  const m = src.match(/(?<!\w)(?:export\s+)?const\s+PERIODO_MS\s*=\s*(\d+)/);
  assert.ok(m, `PERIODO_MS non dichiarato in ${nome}: il ritmo è vitale, non ingoiarlo`);
  return Number(m[1]);
}

/** Il RITMO del sondaggio dei costruiti, come NUMERO (1/11): individua la
 *  riga `setInterval(…prendiSlot(Date.now());…, <ritmo>)` nel file, estrae il
 *  testo del SECONDO argomento (separatore alla prima virgola al livello 0:
 *  scanner a parentesi bilanciate, non una regex sulla forma) e lo valuta
 *  solo aritmeticamente — cifre, spazi e la costante montata dalla build.
 *  Così la legge vale anche se la riga cambia forma (freccia, a capi),
 *  mentre il test della FORMA qui sotto sorveglia che non spariscano i pezzi. */
function ritmoSondaggio(src, nome) {
  // la prima chiamata d'avvio che vive INSIDE un setInterval: attraversa le
  // occorrenze `prendiSlot(Date.now());` e usa la prima incorniciata da una
  // `setInterval(` che la precede (la chiamata fuori-interval di avvio è
  // normale e non è un sondaggio)
  let trovata = null;
  for (let p = src.indexOf('prendiSlot(Date.now());'); p !== -1 && !trovata;
    p = src.indexOf('prendiSlot(Date.now());', p + 1)) {
    const via = src.lastIndexOf('setInterval(', p);
    if (via === -1 || src.slice(via + 'setInterval('.length, p).includes('}')) continue;
    trovata = via;
  }
  assert.ok(trovata !== null, `${nome}: nessun sondaggio ` + 'prendiSlot dentro un setInterval — le fasce scadono senza che l\'app le chieda');
  let i = trovata + 'setInterval'.length;
  while (src[i] !== '(') i += 1;
  // primo argomento: fino alla virgola a profondità 1 (quella separatrice)
  let prof = 0, sep = -1;
  for (let j = i; j < src.length; j += 1) {
    const c = src[j];
    if (c === '(') prof += 1;
    else if (c === ')') prof -= 1;
    else if (c === ',' && prof === 1) { sep = j; break; }
  }
  assert.notEqual(sep, -1, `${nome}: il sondaggio non ha il secondo argomento — il ritmo non vive più da nessuna parte`);
  // secondo argomento: fino alla chiusura a profondità 0
  let fine = sep;
  prof = 0;
  for (fine = sep + 1; fine < src.length; fine += 1) {
    const c = src[fine];
    if (c === '(') prof += 1;
    else if (c === ')') { if (prof === 0) break; prof -= 1; }
  }
  const espr = src.slice(sep + 1, fine).trim();
  const montato = periodoDi(src, nome);
  const cifre = espr.replace(/\bPERIODO_MS\b/g, String(montato));
  assert.match(cifre, /^[\d\s+\-*/.()]+$/,
    `${nome}: il ritmo "${espr}" non è una formula aritmetica nota — la legge del ritmo si VALUTA, non si indovina`);
  return { espr, ritmo: Function(`"use strict"; return (${cifre});`)() };
}

test('LEGALE DEL RITMO: il PERIODO_MS del publisher è lo stesso delle due app in gioco', () => {
  assert.equal(periodoDi(testoPublisher, 'src/uiapp-pub.mjs'), PERIODO_MS,
    'la dichiarazione nel sorgente del publisher è la costante esportata: due numeri = un doppione');
  assert.equal(PERIODO_MS, 2500, 'il publisher scandisce 2.5s: cambiando LUI, cambiano le app (seguono via build)');
  for (const { chiave, costruito } of APP) {
    const periodo = periodoDi(testoApp[chiave].costruito, `uiapp/${chiave}/${costruito}`);
    assert.equal(periodo, PERIODO_MS, `PERIODO_MS costruito di ${chiave} (${periodo}) ≠ publisher (${PERIODO_MS})`);
    assert.ok(periodo >= 500, `PERIODO_MS di ${chiave} sotto i 500ms: il gioco non regge quel ritmo`);
  }
});

test('SAGOME SENZA NUMERO: le dichiarazioni duplicate non possono più nascere', () => {
  const segnaposto = '__PERIODO_MS_DAL_PUBLISHER__';
  for (const { chiave, sagoma } of APP) {
    const t = testoApp[chiave].sagoma;
    assert.equal((t.match(/(?<!\w)(?:export\s+)?const\s+PERIODO_MS\s*=/g) ?? []).length, 0,
      `${chiave}: la sagoma ${sagoma} NON dichiara PERIODO_MS — la cifra vive solo nel publisher`);
    assert.equal(t.split(segnaposto).length - 1, 1,
      `${chiave}: la sagoma porta il segnaposto UNA volta sola (due = una ha già il numero)`);
    assert.ok(t.includes('genera-uiapp.mjs'), `${chiave}: la sagoma rimanda al generatore, chi la legge sa dove va`);
  }
  const via = join(ROOT, 'tools', 'genera-uiapp.mjs');
  assert.ok(existsSync(via), 'la build esiste: tools/genera-uiapp.mjs è la via sola app→publisher');
  const genera = readFileSync(via, 'utf8');
  assert.ok(genera.includes('import { PERIODO_MS }'), 'la build importa il valore dal publisher (import vero, non una regex)');
  assert.ok(genera.includes("__PERIODO_MS_DAL_PUBLISHER__"), 'la build cerca il segnaposto delle sagome');
});

test('NOME DELLO SLOT: fascia calcolata uguale e file ui-<slot>.json lo stesso nome', () => {
  assert.ok(testoPublisher.includes('const fascia = Math.floor(Date.now() / PERIODO_MS);'),
    'publisher: la fascia nasce da Math.floor(Date.now() / PERIODO_MS)');
  assert.ok(/ui-\$\{fascia\}\.json/.test(testoPublisher),
    'publisher: scrive il file ui-<fascia>.json (le app NON possono chiamarlo diverso)');
  for (const { chiave } of APP) {
    const costruito = testoApp[chiave].costruito;
    assert.ok(costruito.includes('const slot = Math.floor(now / PERIODO_MS);'),
      `${chiave}: il suo slot nasce da Math.floor(now / PERIODO_MS), la stessa formula del publisher`);
    assert.ok(/'ui-'\s*\+\s*slot/.test(costruito),
      `${chiave}: chiede 'ui-' + slot, il nome esatto che il publisher scrive`);
  }
});

// LA FASCIA MAI A METÀ (3/11): il gioco legge ui-<slot>.json mentre il
// publisher lo scrive; con la scrittura in place un tick interrotto lasciava
// sul disco un JSON mozzo (pannello vuoto con la fascia fresca). La regola:
// ogni fascia passa da writeJsonAtomic (tmp + rename); nessuna writeFileSync
// diretta sui file ui-*.json. Testo dei sorgenti, come il resto di questo test.
test('FASCIA ATOMICA: tutte le ui-<slot>.json passano da writeJsonAtomic', () => {
  const dirette = (testoPublisher.match(/writeFileSync\(\s*join\([^)]*ui-\$\{/g) ?? []);
  assert.equal(dirette.length, 0, `publisher: scrittura diretta di una fascia (${dirette.join(' · ')}) — si scrive col tmp e il rename`);
  const atomiche = (testoPublisher.match(/writeJsonAtomic\(\s*join\([^)]*ui-\$\{/g) ?? []);
  assert.equal(atomiche.length, 2, `publisher: le DUE fasce (cruscotto, pitwall) devono passare da writeJsonAtomic — trovate ${atomiche.length}`);
  assert.ok(/writeJsonAtomic\(join\(dir, `ui-\$\{fascia\}\.json`\), dati, \{ pretty: false \}\)/.test(testoPublisher),
    'publisher: la fascia principale resta COMPATTA ({ pretty: false }) — il gioco la rilegge ogni slot');
});

test('SONDAGGIO A METÀ: le app leggono ogni PERIODO_MS/2, il publisher scrive ogni PERIODO_MS', () => {
  for (const { chiave } of APP) {
    const costruito = testoApp[chiave].costruito;
    assert.ok(/setInterval\s*\(\s*function\s*\(\)\s*\{\s*prendiSlot\(Date\.now\(\)\);\s*\}\s*,\s*PERIODO_MS\s*\/\s*2\s*\)/.test(costruito),
      `${chiave}: il sondaggio prendiSlot deve girare a PERIODO_MS/2 (due letture per fascia)`);
  }
  assert.ok(/setInterval\s*\(\s*\(?\s*\)?\s*=>\s*\{\s*try\s*\{\s*uiappTick\(\);\s*\}\s*catch/.test(testoPublisher),
    'publisher: uiappTick deve girare a PERIODO_MS esatto (una scrittura per fascia)');
});

test('RITMO MONTATO: il polling dei costruiti vale PERIODO_MS/2 a NUMERO, non solo a forma', () => {
  // 1/11: la forma della riga può cambiare (freccia, a capi, avvio diverso);
  // la LEGGE è sul valore — l'espressione del ritmo VALUTATA con il numero
  // che la build ha cucito nel costruito fa la metà esatta del periodo del
  // publisher. Un ritmo rimesso a mano (1250 fisso? PERIODO_MS/3?) non passa.
  for (const { chiave, costruito } of APP) {
    const { espr, ritmo } = ritmoSondaggio(testoApp[chiave].costruito, `uiapp/${chiave}/${costruito}`);
    assert.equal(ritmo, PERIODO_MS / 2,
      `${chiave}: il sondaggio gira ogni "${espr}" = ${ritmo}ms, ma la legge vuole ${PERIODO_MS / 2}ms (due letture per fascia)`);
  }
});

test('VALIDITÀ DELLA FASCIA: validaFino scritto dal publisher e rispettato dalle app', () => {
  // la promessa del publisher: ogni fascia porta la SUA scadenza
  assert.ok(testoPublisher.includes('dati.validaFino = new Date((fascia + 1) * PERIODO_MS + VALIDITA_EXTRA_MS).toISOString();'),
    'publisher: la fascia porta validaFino = (slot+1)·PERIODO_MS + tolleranza — la scadenza è scritta, non una convenzione');
  assert.ok(/export const VALIDITA_EXTRA_MS = \d+;/.test(testoPublisher),
    'publisher: la tolleranza oltre lo slot è una costante dichiarata (5/11: undici «fascia scaduta» di fila con comando mai applicato)');
  for (const { chiave } of APP) {
    assert.ok(/fasciaValidaFino\s*=\s*Date\.parse\(dati\.validaFino\)/.test(testoApp[chiave].costruito),
      `${chiave}: adotta cattura la scadenza della fascia adottata (il momento d'arrivo non vale come freschezza)`);
  }
  // CRUSCOTTO: nessun comando da una fascia morta — la guardia sta PRIMA
  // di ogni effetto (dopo il disco di c.sconosciuta, prima del lock inCorso)
  // La guardia «comando della preparazione corrente» sta in mezzo (5/11): è
  // anch'essa un ritorno senza effetti, quindi la scadenza resta PRIMA di
  // ogni effetto. Il test pesa l'ordine, non l'adiacenza delle righe.
  assert.ok(/function applicaComando\(c\) \{\s*if \(!c \|\| !c\.id \|\| !c\.nome\) return;[\s\S]{0,400}?if \(fasciaScaduta\(\)\)/.test(testoApp.cruscotto.costruito),
    'cruscotto: applicaComando rifiuta il comando di una fascia scaduta (riprovengono in fascia viva)');
  // ENTAMBE: la scadenza si VISTE a schermo (dati passati mai venduti per freschi)
  assert.ok(testoApp.cruscotto.costruito.includes('Fascia scaduta'),
    'cruscotto: la fascia scaduta arriva a schermo (avviso ben visibile)');
  assert.ok(testoApp.pitwall.costruito.includes('Fascia scaduta'),
    'pitwall: la fascia scaduta arriva a schermo (avviso ben visibile)');
});
