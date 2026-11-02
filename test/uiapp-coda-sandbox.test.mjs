// uiapp-coda-sandbox.test.mjs — LA PROVA RUNTIME DELLA CODA (1/11, richiesta
// Mauro: «prova runtime al sandbox: fascia con validaFino passata e un
// comando in coda non deve partire»).
//
// La legge è già scritta in test/uiapp-periodo.test.mjs, ma alla FORMA:
// guarda che `applicaComando` APRIRE con `if (fasciaScaduta())`. Qui invece
// si prova ALLA STRINGA: il file costruito VERO (uiapp/cruscotto/cruscotto.js,
// quello che legge l'ACEUIAppLoader) gira dentro una sandbox Node (vm) con
// l'ambiente che la pagina del loader gli dà — window, document, XHR, engine,
// console, timer — e riceve dal XHR finto una fascia costruita dal test.
//
//   SONDA SCADUTA: la fascia porta validaFino NEL PASSATO e in coda c'è un
//     comando `setcar`. Aspettativa: il comando NON parte — ZERO chiamate a
//     window.engine.trigger, NESSUN ack sul persist, e il pannello dichiara
//     in console perché («fascia scaduta: comando … non parte — il publisher
//     lo ripropone in fascia viva»).
//
//   CONTROPROVA VIVA: stesso identico contesto, ma validaFino nel futuro.
//     Aspettativa INVERSA: lo stesso comando ARRIVA a window.engine.trigger
//     (OnUICommand) — altrimenti la sonda scaduta non proverebbe nulla:
//     un ambiente in cui nessun comando parte per qualunque motivo è una
//     prova che non prova.
//
// 2/11, estensione richiesta Mauro («anche ai comandi tipo evento e avvia
// sessione, non solo setcar»): SONDA scaduta + CONTROPROVA viva sono nate UNA
// sola (setcar) e ora sono TRE, una per sentiero di applicaComando:
//
//   • evento  — sonda scaduta (zero trigger, zero ack) e controprova viva col
//     SENTIERO VERO EVENTO: solo CarSelection (Models), NIENTE GameModeSelection
//     — la ronda di carriera si imposta sola, lezione 23/10 (cruscotto.corriEvento).
//   • avvia  — sonda scaduta (zero trigger, zero ack) e controprova viva con
//     RequestStart sul sentiero vero E QUESTA VOLTA L'ACK PIENO: la strada è
//     una richiesta sola, l'OK finto la chiude e il persist deve accogliere
//     «avvia sessione premuto» (il che prova anche che ackComando gira).
//
// L'ambiente finto riporta il flusso VERO del gioco: leggiJson (XHR a
// BASE+'ui-<fascia>.json') → adotta (validaFino+ts) → applicaComando
// (guardia) → giocoComando (engine.on/trigger). Niente file di gioco toccati,
// niente server: ogni sondaggio riparte da una sandbox pulita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PERIODO_MS } from '../src/uiapp-pub.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
// IL COSTRUITO VERO, non la sagoma: se qualcuno mette la legge solo nel
// sorgente e la build la perde, QUESTO test la becca (il gioco legge il
// costruito). Tra l'altro forza che il file sia rigenerato: un vecchio .js
// senza la legge fallisce qui — la forma testata già in uiapp-periodo.
const COSTRUITO = join(RADICE, 'uiapp', 'cruscotto', 'cruscotto.js');
const CODE = readFileSync(COSTRUITO, 'utf8');

const OK_RISPOSTA = 'ClientCommandsResponse_OK';

/* ---------------------------------------------------------------- ambiente */

/** L'elemento finto: lo script non leggi oltre innerHTML/textContent/style e
 *  due addEventListener — il menu di EVO intorno resta fuori scope. */
function elementoFinto(tag) {
  const e = {
    tagName: String(tag).toUpperCase(),
    figli: [],
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    textContent: '',
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 800,
    appendChild(c) { e.figli.push(c); return c; },
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return elementoFinto('div'); },
    querySelectorAll() { return []; },
  };
  e.firstChild = null;
  return e;
}

/** XHR finto: risponde a OGNI BASE+'ui-<fascia>.json' con la fascia fornita
 *  (dopo un tick, come la lettura vera); `null` = 404 (e lo script riprova la
 *  fascia precedente, che pur finisce per la STESSA fascia). */
function xhrFinto(fascia) {
  return class {
    constructor() { this.readyState = 0; this.status = 0; this.responseText = ''; }
    open(_m, url) { this.__url = String(url); }
    setRequestHeader() {}
    send() {
      setTimeout(() => {
        this.readyState = 4;
        this.status = fascia == null ? 404 : 200;
        this.responseText = fascia == null ? '' : JSON.stringify(fascia);
        try { this.onreadystatechange(); } catch (_e) { /* come in gioco */ }
      }, 0);
    }
  };
}

/** Manda SU l'app costruita in una sandbox pulita e ritorna le maniglie:
 *  { log, triggerCalls, store } con il pannello già partito (il codice è un
 *  IIFE: vm.runInContext lo esegue IMMEDIATAMENTE, come la pagina del loader). */
function avviaApp(fascia) {
  const log = [];
  const consoleFinto = {
    log: (t) => log.push(String(t)),
    warn: () => {},
    error: () => {},
  };
  const triggerCalls = [];       // (tipo, corpo) OGNI chiamata a engine.trigger
  const store = [];              // ogni writeStore del persist del loader
  const intervalli = new Set();  // per DRENARE alla fine: la sandbox non può tenere la suite

  // L'ENGINE finto del menu di EVO: registra le risposte come il vero
  // (giocoComando fa on(respName) PRIMA del trigger, noi consegniamo l'OK
  // dopo un tick — le risposte si scambiano le mani come in realtà).
  const engine = {
    on(nome, f) { engine.__ascolto.push({ nome, f }); },
    off(nome, f) { engine.__ascolto = engine.__ascolto.filter((x) => x.nome !== nome || x.f !== f); },
    __ascolto: [],
    trigger(...args) {
      const [evento] = args;
      triggerCalls.push(args);
      if (evento !== 'OnUICommand') return;
      // risposta generica OK: la legge del comando non dipende da cosa il
      // menu dice (la CONTROPROVA accetta qualunque esito downstream).
      // 2/11: consegna SINCRONA dentro il trigger — il menu vero risponde
      // sullo stesso callback, e nella sandbox le cappe ai tempi (60 ms)
      // facevano vincere il timer «nessuna risposta» del giocoComando sulla
      // consegna posticciata di un tick: la promessa si chiudeva in errore e
      // nessun sentiero poteva arrivare all'ack (visto sul sentiero avvia).
      for (const { f } of engine.__ascolto.slice()) {
        try { f({ response: OK_RISPOSTA }); } catch (_e) { /* in gioco anche qui */ }
      }
    },
  };

  const windowFinto = {
    ACEUIAppLoader: {
      app: () => ({ base: '/ACEUIAppLoader/cruscotto/' }),
      // scroll.attach: ABSENT (come pagine senza loader che scorre) — lo
      // script deve sorbirsi il catch e portare il track a display:none
      persist: { storeLoaded: () => false, writeStore: (key, val) => store.push({ key, val }) },
    },
    engine,
    __cruscottoNota: '',
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(Number(ms ?? 0), 60)), // i tempi veri del menu non ritardano la suite
    clearTimeout,
    open: () => {},
    external: undefined,
  };

  const documentFinto = {
    head: elementoFinto('head'),
    body: elementoFinto('body'),
    readyState: 'complete',
    createElement: (tag) => elementoFinto(tag),
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };

  const ctx = vm.createContext({
    window: windowFinto,
    document: documentFinto,
    console: consoleFinto,
    XMLHttpRequest: xhrFinto(fascia),
    // i bare setTimeout/setInterval/clearInterval dell'IIFE — tutti presi in
    // carico con la STESSA infrastruttura che draineremo dopo gli assert
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(Number(ms ?? 0), 60)),
    clearTimeout,
    setInterval: (fn, ms) => {
      const id = setInterval(fn, Math.max(Number(ms ?? 0), 50));
      intervalli.add(id);
      return id;
    },
    clearInterval: (id) => { clearInterval(id); intervalli.delete(id); },
  });

  let erroreBoot = null;
  const t0 = Date.now();
  try { vm.runInContext(CODE, ctx, { filename: 'uiapp/cruscotto/cruscotto.js' }); }
  catch (e) { erroreBoot = e; }
  const maniglie = {
    log, triggerCalls, store, engine,
    errore: erroreBoot,
    ms: () => Date.now() - t0,
    // drena i timer di polling (30s, 1s, PERIODO_MS/2): la sandbox chiusa a
    // fondo, la suite non resta appesa a un interval di un pannello finto
    drena() {
      for (const id of [...intervalli]) { clearInterval(id); intervalli.delete(id); }
    },
  };
  return maniglie;
}

/** Attende finché la condizione diventa vera (poll da 10 ms, tetto 3 s). */
async function finoA(condizione, tettoMs = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < tettoMs) {
    if (condizione()) return true;
    await new Promise((fatto) => setTimeout(fatto, 10));
  }
  return condizione();
}

/** La FASCIA del sondaggio: solo ciò che la legge tocca (validaFino, coda)
 *  e il minimo che il pannello sente a schermo (pilota/gare opzionali). */
function fasciaDi(validaFinoMs, comando) {
  return {
    validaFino: new Date(validaFinoMs).toISOString(),
    comando: comando ?? null,
    pilota: { nome: 'Sonda della sandbox', saldo: 0, rep: 0 },
    gare: [],
  };
}

const COMANDO_IN_CODA = { id: 'sonda-coda-1', nome: 'MX-5 Cup', tipo: 'setcar' };
const COMANDO_EVENTO = { id: 'sonda-coda-evento', nome: 'F40 Competizione', tipo: 'evento' };
const COMANDO_AVVIA = { id: 'sonda-coda-avvia', nome: 'Avvia sessione', tipo: 'avvia' };

/** Il CUORE comune delle sonde scadute: fascia nel passato + comando in coda.
 *  Stessa legge, tre sentieri: nessun trigger, nessun ack, e il pannello
 *  dichiara perché in console. */
async function sondaScaduta(nomeSonda, comando) {
  const validaPassata = Date.now() - 60_000;
  const app = avviaApp(fasciaDi(validaPassata, comando));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const detto = await finoA(() => app.log.some((t) =>
      t.includes('fascia scaduta') && t.includes(comando.id) && t.includes('non parte')));
    assert.ok(detto, `${nomeSonda}: il pannello non ha dichiarato il rifiuto in ${app.ms()} ms — ${app.log.join(' | ')}`);
    assert.equal(app.triggerCalls.length, 0,
      `${nomeSonda}: il comando di una fascia scaduta è PARTITO: ${app.triggerCalls.length} chiamate a engine.trigger (deve essere zero — in fascia viva il publisher lo ripropone)`);
    assert.equal(app.store.length, 0,
      `${nomeSonda}: un rifiuto non produce ACK: il persist non tocca — il comando resta in coda per le fasce vive`);
    const testo = app.log.find((t) => t.includes('non parte')) ?? '';
    assert.ok(testo.includes('il publisher lo ripropone in fascia viva'),
      `${nomeSonda}: il rifiuto non spiega il perché: loga("fascia scaduta: … non parte — il publisher lo ripropone in fascia viva")`);
  } finally { app.drena(); }
}

test('RUNTIME: fascia scaduta con comando in coda — il comando NON parte (zero trigger, zero ack, e il pannello lo dice)', async () => {
  await sondaScaduta('setcar', COMANDO_IN_CODA);
});

test('RUNTIME evento: fascia scaduta con comando «evento» — NON parte (zero trigger, zero ack, e il pannello lo dice)', async () => {
  // Stessa guardia, sentiero evento: prima della ModelList il comando deve
  // morire sulla guardia della fascia, non davanti al menu.
  await sondaScaduta('evento', COMANDO_EVENTO);
});

test('RUNTIME avvia: fascia scaduta con comando «avvia» — NON parte (zero trigger, zero ack, e il pannello lo dice)', async () => {
  // «Avvia sessione» premuto da una fascia morta sarebbe il peggior falso:
  // una gara che parte con le impostazioni di nessuno. Stessa guardia.
  await sondaScaduta('avvia', COMANDO_AVVIA);
});

test('RUNTIME (controprova): stessa sandbox, fascia VIVA — lo stesso comando parte davvero', async () => {
  // Altrimenti la sonda scaduta contiene nulla: un ambiente dove niente parte
  // per qualunque motivo è verde a saccatura. Qui validaFino nel FUTURO.
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const app = avviaApp(fasciaDi(validaViva, COMANDO_IN_CODA));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const partito = await finoA(() => app.triggerCalls.length > 0);
    assert.ok(partito, `in fascia viva il comando doveva partire, zero trigger in ${app.ms()} ms`);
    const primi = JSON.stringify(app.triggerCalls[0] ?? []);
    assert.ok(primi.includes('OnUICommand') && primi.includes('SetGameType'),
      `il comando parte con il SENTIERO VERO (giocoComando→OnUICommand/setcar): visto ${primi}`);
  } finally { app.drena(); }
});

test('RUNTIME (controprova) evento: fascia VIVA — parte col SENTIERO VERO EVENTO (solo CarSelection, niente ronda)', async () => {
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const app = avviaApp(fasciaDi(validaViva, COMANDO_EVENTO));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const partito = await finoA(() => app.triggerCalls.length > 0);
    assert.ok(partito, `in fascia viva il comando evento doveva partire, zero trigger in ${app.ms()} ms`);
    const primo = app.triggerCalls[0] ?? [];
    assert.ok(primo.includes('OnUICommand') && primo.includes('CarSelectionClientRequestModels'),
      `l'evento parte col sentiero VERO (Models, poi SetCurrentCar — guardato ${JSON.stringify(primo)})`);
    const ronda = app.triggerCalls.filter((a) => (String(a[0]) + String(a[1])).includes('GameModeSelection'));
    assert.equal(ronda.length, 0,
      `l'evento NON deve toccare la ronda di carriera (lezione 23/10): trovati ${JSON.stringify(ronda)}`);
  } finally { app.drena(); }
});

test('RUNTIME (controprova) avvia: fascia VIVA — RequestStart sul sentiero vero E l\'ack pieno «avvia sessione premuto»', async () => {
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const app = avviaApp(fasciaDi(validaViva, COMANDO_AVVIA));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const partito = await finoA(() => app.triggerCalls.some((a) =>
      String(a[0]) === 'OnUICommand' && String(a[1]).includes('GameModeSelectionClientRequestStart')));
    assert.ok(partito, `l'«avvia» doveva partire con RequestStart, mai visto in ${app.ms()} ms — ${app.triggerCalls.length} trigger: ${JSON.stringify(app.triggerCalls).slice(0, 400)}`);
    const startInvio = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestStart')).length;
    assert.equal(startInvio, 1,
      `RequestStart sparato ${startInvio} volte: l'OK finto deve chiuderla in una`);
    const ackOk = await finoA(() => app.store.length > 0);
    assert.ok(ackOk, `l'ack dell'avvio non è uscito sul persist in ${app.ms()} ms`);
    assert.equal(app.store[0]?.key, 'cruscotto.acks', `l'ack va alla chiave del publisher: ${app.store[0]?.key}`);
    const voce = (app.store[0]?.val?.commands ?? []).find((v) => v?.id === COMANDO_AVVIA.id);
    assert.ok(voce, `nessuna voce per il comando: ${JSON.stringify(app.store[0]?.val)}`);
    assert.equal(voce.ok, 1, 'un avvio Ok deve ackare ok:1');
    assert.ok(/avvia sessione premuto/i.test(voce.msg), `il messaggio dell'ack è quello del sentiero avvia: «${voce.msg}»`);
  } finally { app.drena(); }
});
