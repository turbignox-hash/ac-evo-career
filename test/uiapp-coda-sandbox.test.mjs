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
// IL MENU CHE TACE (7/11): il gioco vero, con la personalizzazione griglia
// aperta o una sessione in caricamento, non risponde affatto — non risponde
// «OK senza campi», PROPRIO NON RISPONDE. Solo così si prova il timeout di
// giocoComando sino in fondo.
const NON_RISPOSTA = 'NON_RISPOSTA';

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
/** La memoria del browser finta (7/11): la stessa `localStorage` passata a DUE
 *  sandbox diverse emula la vista che il gioco ricrea — è l'unica cosa che
 *  sopravvive alla morte del vecchio script. */
function storageFinto() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

function avviaApp(fascia, rispondi = null, opzioni = {}) {
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
      // `rispondi` (4/11): il gesto unico setcar+avvia chiede liste vere
      // (piste, modelli, sessioni) — il test fornisce la risposta giusta per
      // comando, il resto resta l'OK generico di sempre.
      // il CORPO del comando va al banco (7/11): il menu finto che ricorda
      // (menuCheRicorda) deve poter restituire proprio ciò che ha applicato.
      const extra = rispondi ? rispondi(String(args[1] ?? ''), args[2]) : null;
      if (extra === NON_RISPOSTA) return;   // silenzio: nessun ascoltatore riceve niente
      for (const { f } of engine.__ascolto.slice()) {
        try { f({ response: OK_RISPOSTA, ...(extra ?? {}) }); } catch (_e) { /* in gioco anche qui */ }
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
    localStorage: opzioni.storage,   // la memoria che sopravvive alla vista (test della doppia esecuzione)
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

/** IL MENU CHE RICORDA (7/11): dopo SetGameModeParameters il gioco vero
 *  rilegge le sessioni che ha appena applicato. Un banco che rimanda sempre
 *  la sessione di PARTENZA descrive un menu che non esiste, e sotto la nuova
 *  conferma obbligatoria quella sessione stantia vale «griglia non
 *  confermata» (niente ack, niente via) — giusto, ma non è il caso in prova.
 *  Questo finto menu tiene l'ultima sessione scritta e la restituisce. */
function menuCheRicorda(sessioniIniziali, extra = {}) {
  let ultime = sessioniIniziali;
  return (tipo, corpo) => {
    if (tipo === 'GameModeSelectionClientRequestSetGameModeParameters') {
      // IL GIOCO MATERIALIZZA LA GRIGLIA DAI MODELLI (la regola scritta nel
      // Cruscotto: «il menu usa models.length per riempire la griglia»): dopo
      // il Set l'elenco avversari ha la lunghezza dei modelli applicati — è
      // quello che il vero GameModeParameters restituisce al giro dopo.
      ultime = (corpo?.sessions ?? []).map((s) => {
        const modelli = Array.isArray(s?.models) ? s.models : [];
        return { ...s, opponents: Array.from({ length: modelli.length }, () => 1), num_opponents: modelli.length };
      });
      return null;
    }
    if (tipo === 'GameModeSelectionClientRequestGameModeParameters') {
      return { sessions: ultime, weather_data: extra.weather_data ?? [{ type: 'CLEAR' }] };
    }
    return extra[tipo] ?? null;
  };
}

/** La FASCIA del sondaggio: solo ciò che la legge tocca (validaFino, coda)
 *  e il minimo che il pannello sente a schermo (pilota/gare opzionali). */
function fasciaDi(validaFinoMs, comando, prepara = null) {
  return {
    validaFino: new Date(validaFinoMs).toISOString(),
    comando: comando ?? null,
    prepara,
    pilota: { nome: 'Sonda della sandbox', saldo: 0, rep: 0 },
    gare: [],
  };
}

const COMANDO_IN_CODA = { id: 'sonda-coda-1', nome: 'MX-5 Cup', tipo: 'setcar' };
const COMANDO_EVENTO = { id: 'sonda-coda-evento', nome: 'F40 Competizione', tipo: 'evento' };
const COMANDO_AVVIA = { id: 'sonda-coda-avvia', nome: 'Avvia sessione', tipo: 'avvia' };

// LA GRIGLIA DI UN POSTO CORTA (5/11, Brands Hatch): 17 modelli → 16 avversari
// è la griglia che il gioco considera giusta (un posto è del giocatore). Non
// deve far riprovare la conferma e non deve bloccare «Prepara tutto e avvia».
function rondaMulticlasse() {
  return {
    id: 'sonda-multiclasse-17', nome: 'Touring Pro', carId: 'ks_a', tipo: 'setcar', avvia: true,
    pista: 'Brands Hatch', layout: 'GP', ora: 13, meteo: 'CLEAR',
    weekend: { singleMake: false, opponents: 17, aiMin: 84, aiMax: 85, laps: 3, gridCars: ['ks_a', 'ks_b'], sessions: { Practice: { hour: 8 }, Race: { hour: 14 } } },
  };
}
function risposteMulticlasse(opponents, modelli = 17) {
  return {
    GameModeSelectionClientRequestTrackList: { track_item: [{ name: 'Brands Hatch', layout: 'GP' }] },
    // LA GRIGLIA RILETTA (7/11): la risposta del menu dopo l'applicazione —
    // una voce per avversario, col modello (qui due modelli alternati).
    GameModeSelectionClientRequestOpponents: {
      opponents: Array.from({ length: opponents }, (_, i) => ({ model: { name: i % 2 ? 'ks_a' : 'ks_b' } })),
    },
    CarSelectionClientRequestModels: { car_model: [{ name: 'ks_a', display_name: 'Auto A' }, { name: 'ks_b', display_name: 'Auto B' }] },
    GameModeSelectionClientRequestGameModeParameters: {
      sessions: [
        { name: 'Practice', opponents: Array.from({ length: opponents }, () => 1), models: Array.from({ length: modelli }, () => ({ name: 'ks_a' })), time_of_day: { hour: 8 } },
        { name: 'Race', opponents: Array.from({ length: opponents }, () => 1), models: Array.from({ length: modelli }, () => ({ name: 'ks_a' })), time_of_day: { hour: 14 } },
      ],
      weather_data: [{ type: 'CLEAR' }],
    },
  };
}
test("RUNTIME griglia riletta: l'ack porta posti e modelli distinti dal gioco", async () => {
  // 7/11, Mauro: «collega Opponents: dopo l'applicazione rileggi la griglia dal
  // gioco e mostrala nel pannello». L'app chiede l'elenco avversari DOPO averlo
  // scritto e lo allega all'ack: il server lo legge ('cruscotto.acks') e
  // statoIstantanea lo espone come `griglia` — la riga del pannello la mostra.
  const { GESTO, fascia } = fasciaMulticlasse();
  const app = avviaApp(fascia, (tipo) => risposteMulticlasse(16, 16)[tipo] ?? null);
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const letto = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.griglia?.posti));
    assert.ok(letto, `nessun ack con la griglia letta: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
    const voce = (app.store.at(-1).val.commands).find((v) => v?.id === GESTO.id);
    assert.equal(voce.griglia.posti, 16, 'i posti sono quelli che il menu ha restituito');
    assert.equal(voce.griglia.modelli, 2, 'modelli DISTINTI, non il numero di posti');
  } finally { app.drena(); }
});

test('RUNTIME gara al volo: legge i preset colore della stessa auto e ne applica uno vero', async () => {
  const { GESTO: base, fascia } = fasciaMulticlasse();
  const GESTO = { ...base, modo: 'instant', tipo: 'setcar', avvia: false };
  fascia.comando = GESTO;
  const config = { name: 'default', display_name: 'Standard' };
  const preset = { name: 'preset_296_red', display_name: 'Rosso corsa' };
  const app = avviaApp(fascia, (tipo) => {
    if (tipo === 'CarSelectionClientRequestModels') return { car_model: [{ name: 'ks_a', display_name: 'Auto A' }, { name: 'ks_b', display_name: 'Auto B' }] };
    if (tipo === 'CarSelectionClientRequestCarConfigurations') return { configurations: [config] };
    if (tipo === 'CarSelectionClientRequestCarColorPresets') return { color_presets: [preset] };
    if (tipo === 'GameModeSelectionClientRequestTrackList') return { track_item: [{ name: 'Brands Hatch', layout: 'GP' }] };
    if (tipo === 'GameModeSelectionClientRequestGameModeParameters') return risposteMulticlasse(16, 16)[tipo];
    if (tipo === 'GameModeSelectionClientRequestOpponents') return { opponents: Array.from({ length: 16 }, (_, i) => ({ model: { name: i % 2 ? 'ks_a' : 'ks_b' } })) };
    return null;
  });
  try {
    assert.equal(app.errore, null, "app sandbox senza errori");
    const applicata = await finoA(() => app.triggerCalls.some((a) => String(a[1]).includes('CarSelectionClientRequestSetCurrentCarColorPreset')));
    assert.ok(applicata, `il setter colore deve essere chiamato; trigger=${JSON.stringify(app.triggerCalls.map((x) => x[1]))}; log=${app.log.join(' | ')}`);
    const richiesta = app.triggerCalls.find((a) => String(a[1]).includes('CarSelectionClientRequestCarColorPresets'));
    assert.equal(richiesta?.[2]?.model?.name, 'ks_a', 'i preset si chiedono per il modello selezionato');
    assert.equal(richiesta?.[2]?.configuration?.name, 'default', 'i preset si chiedono per la configurazione restituita');
    const setter = app.triggerCalls.find((a) => String(a[1]).includes('CarSelectionClientRequestSetCurrentCarColorPreset'));
    assert.equal(setter?.[2]?.color_preset?.name, 'preset_296_red', "al setter passa l'oggetto reale restituito dal gioco");
    assert.equal(setter?.[2]?.mode, 'ClientCommandsMode_SINGLEPLAYER', 'il setter usa la modalità singolo giocatore');
    const ack = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v.ok === 1));
    assert.ok(ack, "la livrea non deve impedire l'ack della gara");
  } finally { app.drena(); }
});

test('RUNTIME gara al volo senza preset colore: il setup e l’ack non si bloccano', async () => {
  const { GESTO: base, fascia } = fasciaMulticlasse();
  const GESTO = { ...base, modo: 'instant', tipo: 'setcar', avvia: false };
  fascia.comando = GESTO;
  const app = avviaApp(fascia, (tipo) => {
    if (tipo === 'CarSelectionClientRequestModels') return { car_model: [{ name: 'ks_a', display_name: 'Auto A' }] };
    if (tipo === 'CarSelectionClientRequestCarConfigurations') return { configurations: [{ name: 'default' }] };
    if (tipo === 'CarSelectionClientRequestCarColorPresets') return { color_presets: [] };
    if (tipo === 'GameModeSelectionClientRequestTrackList') return { track_item: [{ name: 'Brands Hatch', layout: 'GP' }] };
    if (tipo === 'GameModeSelectionClientRequestGameModeParameters') return risposteMulticlasse(16, 16)[tipo];
    if (tipo === 'GameModeSelectionClientRequestOpponents') return { opponents: Array.from({ length: 16 }, (_, i) => ({ model: { name: i % 2 ? 'ks_a' : 'ks_b' } })) };
    return null;
  });
  try {
    assert.equal(app.errore, null, 'app sandbox senza errori');
    const ack = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.ok === 1));
    assert.ok(ack, `nessun ack nonostante il menu senza preset: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
    assert.ok(!app.triggerCalls.some((a) => String(a[1]).includes('SetCurrentCarColorPreset')), 'senza preset non inventa un payload colore');
    assert.ok(app.log.some((r) => r.includes('livrea pilota: nessun preset colore')), 'il log spiega perché non ha cambiato livrea');
  } finally { app.drena(); }
});

function fasciaMulticlasse() {
  const GESTO = rondaMulticlasse();
  const fascia = fasciaDi(Date.now() + PERIODO_MS * 1000, GESTO);
  fascia.azioni = { ronda: { weekend: GESTO.weekend } };
  return { GESTO, fascia };
}

/** La fascia di un «avvia» secco: ronda già armata (weekend 17 avversari),
 *  nessun setcar in coda. Serve a provare la PORTA DELL'AVVIO da sola. */
function fasciaSoloAvvia() {
  const fascia = fasciaDi(Date.now() + PERIODO_MS * 1000, COMANDO_AVVIA);
  fascia.azioni = { ronda: { weekend: rondaMulticlasse().weekend } };
  return fascia;
}

/** Il via deve restare NON premuto: zero RequestStart e nessun ack ok:1. */
function nessunVia(app, id) {
  const start = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestStart')).length;
  assert.equal(start, 0, `RequestStart è partito lo stesso: ${JSON.stringify(app.triggerCalls.slice(-6))}`);
  const ackOk = (app.store.at(-1)?.val?.commands ?? []).filter((v) => v?.id === id && v?.ok === 1);
  assert.equal(ackOk.length, 0, `ack positivo su una griglia non verificata: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
}

test('RUNTIME griglia 17 modelli / 16 avversari: adattata a 16/16 e avvio permesso', async () => {
  // 5/11 — il crash 01:16 di Brands Hatch: una sessione con 17 modelli ma solo
  // 16 avversari ha ucciso EVO alla creazione della griglia (0xC0000005, stesso
  // RVA del 00:22). Il Cruscotto adatta la lista modelli al numero che il
  // gioco accetta, riscrive una volta sola e il via torna permesso: 16/16 su
  // 17 chiesti è la griglia piena (un posto è del giocatore).
  const { GESTO, fascia } = fasciaMulticlasse();
  let letture = 0;
  const app = avviaApp(fascia, (tipo) => {
    if (tipo !== 'GameModeSelectionClientRequestGameModeParameters') return risposteMulticlasse(16)[tipo] ?? null;
    letture++;
    // le prime DUE letture (gp iniziale + prima conferma) sono ancora 17/16:
    // il gioco rimanda il suo elenco finché il Cruscotto non riscrive.
    return risposteMulticlasse(16, letture <= 2 ? 17 : 16).GameModeSelectionClientRequestGameModeParameters;
  });
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const partito = await finoA(() => app.triggerCalls.some((a) =>
      String(a[0]) === 'OnUICommand' && String(a[1]).includes('GameModeSelectionClientRequestStart')));
    assert.ok(partito, `«Prepara tutto e avvia» non ha premuto Start — ${JSON.stringify(app.triggerCalls).slice(0, 700)}`);
    const set = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
    assert.equal(set.length, 2, `la griglia doveva essere riscritta UNA volta solo oltre alla prima: ${set.length} Set`);
    const adattata = set[1];
    const garaAdattata = (adattata?.[2]?.sessions ?? []).find((s) => s?.name === 'Race');
    assert.equal(garaAdattata?.models?.length, 16, `una griglia adattata ha 16 modelli, non ${garaAdattata?.models?.length}`);
    const ackOk = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === `${GESTO.id}:avvia` && v.ok === 1));
    assert.ok(ackOk, `manca l'ack del via: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
  } finally { app.drena(); }
});

test('RUNTIME griglia corta (5/17): NESSUN ack positivo e NESSUN via', async () => {
  // 7/11, crash EVO 17:53: l'ACK OK di SetGameModeParameters non prova che il
  // menu abbia tenuto la griglia. Una lista corta (5 avversari su 17 chiesti)
  // non si dichiara pronta: niente ack (il publisher ripropone la
  // preparazione) e niente Start.
  const { GESTO, fascia } = fasciaMulticlasse();
  const app = avviaApp(fascia, (tipo) => risposteMulticlasse(5)[tipo] ?? null);
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const detto = await finoA(() => app.log.some((t) => t.includes('weekend NON confermato')));
    assert.ok(detto, `il pannello non ha dichiarato la griglia non confermata: ${app.log.join(' | ')}`);
    await new Promise((r) => setTimeout(r, 400));
    const ackOk = (app.store.at(-1)?.val?.commands ?? []).filter((v) => v?.id === GESTO.id && v?.ok === 1);
    assert.equal(ackOk.length, 0,
      `una griglia 5/17 è stata ackata come riuscita: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
    const start = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestStart')).length;
    assert.equal(start, 0, `il via è partito su una griglia 5/17: ${JSON.stringify(app.triggerCalls.slice(-6))}`);
  } finally { app.drena(); }
});

test('RUNTIME menu muto sulle impostazioni: nessun ack e nessun via', async () => {
  // Se il gioco non risponde a GameModeParameters non c'è niente da
  // confermare: il comando resta non ackato (il publisher lo ripropone) e
  // nessun «Avvia sessione» parte alle spalle di una griglia sconosciuta.
  const { GESTO, fascia } = fasciaMulticlasse();
  const app = avviaApp(fascia, (tipo) => (tipo === 'GameModeSelectionClientRequestGameModeParameters'
    ? NON_RISPOSTA
    : (risposteMulticlasse(16)[tipo] ?? null)));
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const detto = await finoA(() => app.log.some((t) => t.includes('GameModeParameters senza sessions')));
    assert.ok(detto, `il pannello non ha dichiarato il menu muto: ${app.log.join(' | ')}`);
    await new Promise((r) => setTimeout(r, 400));
    const ackOk = (app.store.at(-1)?.val?.commands ?? []).filter((v) => v?.id === GESTO.id && v?.ok === 1);
    assert.equal(ackOk.length, 0, `ack positivo senza sessioni lette dal gioco: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
    const start = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestStart')).length;
    assert.equal(start, 0, `il via è partito con la lettura della griglia muta: ${JSON.stringify(app.triggerCalls.slice(-6))}`);
  } finally { app.drena(); }
});

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

test('RUNTIME gesto unico: setcar con avvia:true — auto nel menu e SUBITO RequestStart (due ack)', async () => {
  // «Prepara tutto e avvia deve lanciare la gara, non solo il gioco» (4/11):
  // il publisher manda il setcar con avvia:true e l'app fa la STESSA sequenza
  // del suo bottone — SetCurrentCar, ack del setcar, poi RequestStart e ack
  // del :avvia. Niente attesa del giro ack→comando avvia.
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const GESTO = { id: 'sonda-gesto-1', nome: 'MX-5 Cup', carId: 'ks_mx5_cup', tipo: 'setcar', avvia: true, pista: 'Monza', layout: null, ora: 13, meteo: 'CLEAR' };
  const risposte = {
    GameModeSelectionClientRequestTrackList: { track_item: [{ name: 'Monza', layout: 'GP' }] },
    CarSelectionClientRequestModels: { car_model: [{ name: 'ks_mx5_cup', display_name: 'MX-5 Cup' }] },
    GameModeSelectionClientRequestGameModeParameters: {
      sessions: [{ name: 'Practice', time_of_day: { hour: 10 } }, { name: 'Race', time_of_day: { hour: 13 } }],
      weather_data: [{ type: 'CLEAR' }],
    },
  };
  const app = avviaApp(fasciaDi(validaViva, GESTO), (tipo) => risposte[tipo] ?? null);
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const partito = await finoA(() => app.triggerCalls.some((a) =>
      String(a[0]) === 'OnUICommand' && String(a[1]).includes('GameModeSelectionClientRequestStart')));
    assert.ok(partito, `il gesto unico non ha premuto «Avvia sessione» in ${app.ms()} ms — ${JSON.stringify(app.triggerCalls).slice(0, 500)}`);
    const nStart = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestStart')).length;
    assert.equal(nStart, 1, `RequestStart sparato ${nStart} volte: il gesto unico parte una volta sola`);
    const ackOk = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === `${GESTO.id}:avvia`));
    assert.ok(ackOk, `l'ack del via non è uscito: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
    const tutti = app.store.at(-1)?.val?.commands ?? [];
    assert.equal(tutti.find((v) => v?.id === GESTO.id)?.ok, 1, 'il setcar va ackato ok:1');
    const via = tutti.find((v) => v?.id === `${GESTO.id}:avvia`);
    assert.equal(via?.ok, 1, 'anche il via va ackato ok:1');
    assert.ok(/sessione lanciata/i.test(via?.msg ?? ''), `il messaggio dell'ack del via: «${via?.msg}»`);
  } finally { app.drena(); }
});

test('RUNTIME: un comando della preparazione VECCHIA non scavalca un «Prepara tutto» nuovo', async () => {
  // Il caso del 4/11: il giocatore ripreme Prepara tutto (senza avvio) mentre
  // la sequenza del pending precedente è ancora in corso. Il comando vecchio
  // non deve partire né toccare il menu: la fascia nuova ha gia` un'altra
  // armataAlle. Zero trigger e zero ack.
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const VECCHIO = { id: '111:ks_mx5_cup:coppa_rx7', nome: 'MX-5 Cup', carId: 'ks_mx5_cup', tipo: 'setcar', avvia: true };
  const app = avviaApp(fasciaDi(validaViva, VECCHIO, { tipo: 'ronda', armataAlle: 222, viaFino: 0 }));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    await new Promise((fatto) => setTimeout(fatto, 450));
    assert.equal(app.triggerCalls.length, 0, `il comando vecchio è partito: ${JSON.stringify(app.triggerCalls).slice(0, 400)}`);
    assert.equal(app.store.length, 0, 'un comando vecchio non deve nemmeno ackare');
    assert.ok(app.log.some((t) => t.includes('non è della preparazione corrente')),
      `il pannello non spiega il rifiuto: ${app.log.join(' | ')}`);
  } finally { app.drena(); }
});

test('RUNTIME weekend multiclasse: models pieni per ogni avversario, non solo i modelli del parco', async () => {
  // Il caso di un campionato avanzato (GT Elite): il parco ha tre modelli ma
  // la griglia ha 11 avversari. `models` deve avere 11 voci, non 3: il gioco
  // usa la lunghezza dell'array per decidere quante auto AI creare.
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const WEEKEND = {
    singleMake: false, opponents: 11, aiMin: 82, aiMax: 90, laps: 3,
    gridCars: ['ks_renault_5_gt_turbo', 'ks_abarth_595', 'ks_alfa_romeo_junior'],
    sessions: { Practice: { hour: 10 }, Race: { hour: 14 } },
  };
  const GESTO = {
    id: '7100:ks_renault_5_gt_turbo:gt_elite', nome: 'Renault 5 GT Turbo', carId: 'ks_renault_5_gt_turbo',
    tipo: 'setcar', pista: 'Monza', layout: null, ora: 14, meteo: 'CLEAR', weekend: WEEKEND,
  };
  const risposte = {
    GameModeSelectionClientRequestTrackList: { track_item: [{ name: 'Monza', layout: 'GP' }] },
    CarSelectionClientRequestModels: { car_model: [
      { name: 'ks_renault_5_gt_turbo', display_name: 'Renault 5 GT Turbo' },
      { name: 'ks_abarth_595', display_name: 'Abarth 595' },
      { name: 'ks_alfa_romeo_junior', display_name: 'Alfa Romeo Junior' },
    ] },
  };
  // la sessione di PARTENZA è quella vecchia e corta (1 avversario, nessun
  // modello): dopo il Set il banco restituisce ciò che il Cruscotto ha scritto.
  const sessioniPrima = [
    { name: 'Practice', opponents: ['x'], single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 10, minute: 30 } },
    { name: 'Race', opponents: ['x'], single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 13, minute: 30 }, duration: 5, duration_type: 'GameModeSelectionDuration_LAPS' },
  ];
  const app = avviaApp(fasciaDi(validaViva, GESTO, { tipo: 'ronda', armataAlle: 7100, viaFino: 0 }), menuCheRicorda(sessioniPrima, risposte));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const ack = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.ok === 1));
    assert.ok(ack, `il setcar multiclasse non è stato confermato: ${JSON.stringify(app.store.at(-1)?.val ?? null)} — log: ${app.log.join(' | ')}`);
    const chiamata = app.triggerCalls.find((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
    const sessions = chiamata?.[2]?.sessions ?? [];
    const gara = sessions.find((s) => s?.name === 'Race');
    const prove = sessions.find((s) => s?.name === 'Practice');
    assert.ok(gara && prove, `sessioni mancanti nel comando: ${JSON.stringify(sessions)}`);
    assert.equal(gara.num_opponents, 11);
    assert.equal(gara.models.length, 11, 'una voce per avversario anche in multiclasse');
    assert.equal(prove.models.length, 11, 'la Practice deve avere la stessa griglia piena');
    const nomi = new Set(gara.models.map((m) => m.name));
    assert.ok(nomi.has('ks_renault_5_gt_turbo') && nomi.has('ks_abarth_595') && nomi.has('ks_alfa_romeo_junior'), 'tutti i modelli del parco devono essere presenti');
  } finally { app.drena(); }
});

test('RUNTIME weekend: il setcar applica Single Make, avversari, AI, giri e griglia AL VOLO', async () => {
  // Il caso R5 (4/11): si riprende un campionato, il save cambia, ma EVO aperto
  // tiene la vecchia griglia. Il comando deve portare il weekend al gioco e
  // applicarlo con SetGameModeParameters — non solo scriverlo su disco.
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const WEEKEND = {
    singleMake: true, opponents: 15, aiMin: 85, aiMax: 86, laps: 7,
    gridCars: ['ks_renault_5_gt_turbo'],
    sessions: { Practice: { hour: 9 }, Qualifying: { hour: 12 }, Warmup: { hour: 14 }, Race: { hour: 15 } },
  };
  const GESTO = {
    id: '7001:ks_renault_5_gt_turbo:coppa_r5-turbo', nome: 'Renault 5 GT Turbo', carId: 'ks_renault_5_gt_turbo',
    tipo: 'setcar', pista: 'Oulton Park', layout: null, ora: 15, meteo: 'CLEAR', weekend: WEEKEND,
  };
  const risposte = {
    GameModeSelectionClientRequestTrackList: { track_item: [{ name: 'Oulton Park', layout: 'GP' }] },
    CarSelectionClientRequestModels: { car_model: [
      { name: 'ks_renault_5_gt_turbo', display_name: 'Renault 5 GT Turbo' },
      { name: 'ks_abarth_595', display_name: 'Abarth 595' },
    ] },
  };
  // stessa cosa del test multiclasse: il banco parte dalla sessione stantia e
  // poi rimanda quella applicata (15 avversari, 15 R5).
  const sessioniPrima = [
    { name: 'Practice', opponents: ['x'], single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 10, minute: 30 } },
    { name: 'Race', opponents: ['x'], single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 13, minute: 30 }, duration: 5, duration_type: 'GameModeSelectionDuration_LAPS' },
  ];
  const app = avviaApp(fasciaDi(validaViva, GESTO, { tipo: 'ronda', armataAlle: 7001, viaFino: 0 }), menuCheRicorda(sessioniPrima, risposte));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const arrivato = await finoA(() => app.triggerCalls.some((a) =>
      String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters')));
    assert.ok(arrivato, `il weekend non è mai arrivato a SetGameModeParameters: ${JSON.stringify(app.triggerCalls).slice(0, 500)}`);
    const chiamata = app.triggerCalls.find((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
    const sessions = chiamata?.[2]?.sessions ?? [];
    const gara = sessions.find((s) => s?.name === 'Race');
    const prove = sessions.find((s) => s?.name === 'Practice');
    assert.ok(gara && prove, `sessioni mancanti nel comando: ${JSON.stringify(sessions)}`);
    assert.equal(gara.single_make, true, 'Single Make ON: la R5 deve correre contro le R5');
    assert.equal(gara.num_opponents, 15, '15 avversari, non la griglia vecchia');
    assert.equal(gara.min_strength, 85);
    assert.equal(gara.max_strength, 86);
    assert.equal(gara.duration, 7, 'i giri della card, non quelli vecchi');
    assert.equal(gara.duration_type, 'GameModeSelectionDuration_LAPS');
    assert.equal(gara.models.length, 15, 'una voce per avversario: la griglia monomarca deve avere 15 R5');
    assert.ok(gara.models.every((m) => m.name === 'ks_renault_5_gt_turbo'), 'tutti i modelli della griglia devono essere R5');
    assert.equal(gara.time_of_day.hour, 15);
    assert.equal(prove.single_make, true);
    assert.equal(prove.num_opponents, 15);
    assert.equal(prove.models.length, 15, 'anche la Practice deve avere la griglia monomarca piena');
    assert.equal(prove.time_of_day.hour, 9);
    const ack = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.ok === 1));
    assert.ok(ack, `il setcar weekend non è stato confermato: ${JSON.stringify(app.store.at(-1)?.val ?? null)} — log: ${app.log.join(' | ')}`);
    const voce = (app.store.at(-1)?.val?.commands ?? []).find((v) => v?.id === GESTO.id);
    assert.ok(/weekend e auto applicati/i.test(voce?.msg ?? ''), `l'ack deve dire che è stato applicato: «${voce?.msg}»`);
    // La sequenza si chiude con pista e meteo: qui l'ack è già arrivato, quindi
    // `SetWeather` ha avuto il suo giro dopo la risposta di `SetGameModeParameters`.
    const tipi = app.triggerCalls.map((a) => String(a[1]));
    assert.ok(tipi.some((t) => t.includes('GameModeSelectionClientRequestSetTrack')), 'la pista deve essere applicata al volo');
    assert.ok(tipi.some((t) => t.includes('GameModeSelectionClientRequestSetWeather')), 'il meteo deve essere applicato al volo');
  } finally { app.drena(); }
});

test('RUNTIME livree: la griglia monomarca alterna le skin del modello, non 15 auto identiche', async () => {
  // 5/11: il gioco elenca una voce per ogni skin (stesso `name`, `preset`
  // diverso). Copiando 15 volte lo stesso oggetto la griglia usciva tutta di
  // un colore: le skin disponibili si distribuiscono a giro, senza inventarne.
  const validaViva = Date.now() + PERIODO_MS * 1000;
  const WEEKEND = {
    singleMake: true, opponents: 15, aiMin: 84, aiMax: 85, laps: 3,
    gridCars: ['ks_mazda_mx5_nd_cup'],
    sessions: { Practice: { hour: 10 }, Race: { hour: 16 } },
  };
  const GESTO = {
    id: '7200:ks_mazda_mx5_nd_cup:gt_apex', nome: 'Mazda MX-5 ND Cup', carId: 'ks_mazda_mx5_nd_cup',
    tipo: 'setcar', pista: 'Monza', layout: null, ora: 16, meteo: 'CLEAR', weekend: WEEKEND,
  };
  const base = { name: 'ks_mazda_mx5_nd_cup', display_name: 'Mazda MX-5 ND Cup' };
  const risposte = {
    GameModeSelectionClientRequestTrackList: { track_item: [{ name: 'Monza', layout: 'GP' }] },
    CarSelectionClientRequestModels: { car_model: [
      Object.assign({}, base, { preset: { name: 'preset_mx5ndcup_visual_1' } }),
      Object.assign({}, base, { preset: { name: 'preset_mx5ndcup_visual_2' } }),
      Object.assign({}, base, { preset: { name: 'preset_mx5ndcup_visual_3' } }),
    ] },
    GameModeSelectionClientRequestGameModeParameters: {
      sessions: [
        { name: 'Practice', opponents: ['x'], single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 10, minute: 30 } },
        { name: 'Race', opponents: ['x'], single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 13, minute: 30 }, duration: 5, duration_type: 'GameModeSelectionDuration_LAPS' },
      ],
      weather_data: [{ type: 'CLEAR' }],
    },
  };
  const app = avviaApp(fasciaDi(validaViva, GESTO, { tipo: 'ronda', armataAlle: 7200, viaFino: 0 }), (tipo) => risposte[tipo] ?? null);
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const arrivato = await finoA(() => app.triggerCalls.some((a) =>
      String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters')));
    assert.ok(arrivato, `il weekend non è mai arrivato a SetGameModeParameters: ${JSON.stringify(app.triggerCalls).slice(0, 500)}`);
    const chiamata = app.triggerCalls.find((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
    const gara = (chiamata?.[2]?.sessions ?? []).find((s) => s?.name === 'Race');
    assert.equal(gara.models.length, 15, 'una voce per avversario');
    const livree = new Set(gara.models.map((m) => m.preset?.name));
    assert.equal(livree.size, 3, `la griglia deve alternare le tre skin del modello: ${JSON.stringify([...livree])}`);
    assert.ok(gara.models.every((m) => m.name === 'ks_mazda_mx5_nd_cup'), 'tutte MX-5: cambia solo la livrea');
  } finally { app.drena(); }
});

test('RUNTIME campionato: livrea pilota dal gioco e skin avversari ancora alternate', async () => {
  const { GESTO: base, fascia } = fasciaMulticlasse();
  const GESTO = { ...base, avvia: false };
  fascia.comando = GESTO;
  const config = { name: 'default', display_name: 'Standard' };
  const presetPilota = { name: 'preset_player_green', display_name: 'Verde corsa' };
  const autoA1 = { name: 'ks_a', display_name: 'Auto A', preset: { name: 'a_skin_1' } };
  const autoA2 = { name: 'ks_a', display_name: 'Auto A', preset: { name: 'a_skin_2' } };
  const autoB1 = { name: 'ks_b', display_name: 'Auto B', preset: { name: 'b_skin_1' } };
  const autoB2 = { name: 'ks_b', display_name: 'Auto B', preset: { name: 'b_skin_2' } };
  const app = avviaApp(fascia, (tipo) => {
    if (tipo === 'CarSelectionClientRequestModels') return { car_model: [autoA1, autoA2, autoB1, autoB2] };
    if (tipo === 'CarSelectionClientRequestCarConfigurations') return { configurations: [config] };
    if (tipo === 'CarSelectionClientRequestCarColorPresets') return { color_presets: [presetPilota] };
    if (tipo === 'GameModeSelectionClientRequestTrackList') return { track_item: [{ name: 'Brands Hatch', layout: 'GP' }] };
    if (tipo === 'GameModeSelectionClientRequestGameModeParameters') {
      return {
        sessions: [
          { name: 'Practice', opponents: Array.from({ length: 16 }, () => 1), models: Array.from({ length: 16 }, () => autoA1), time_of_day: { hour: 8 } },
          { name: 'Race', opponents: Array.from({ length: 16 }, () => 1), models: Array.from({ length: 16 }, () => autoA1), time_of_day: { hour: 14 } },
        ],
        weather_data: [{ type: 'CLEAR' }],
      };
    }
    if (tipo === 'GameModeSelectionClientRequestOpponents') return { opponents: Array.from({ length: 16 }, (_, i) => ({ model: { name: i % 2 ? 'ks_a' : 'ks_b' } })) };
    return null;
  });
  try {
    assert.equal(app.errore, null, 'app sandbox senza errori');
    const setterVisto = await finoA(() => app.triggerCalls.some((a) => String(a[1]).includes('CarSelectionClientRequestSetCurrentCarColorPreset')));
    assert.ok(setterVisto, 'anche il setcar di campionato applica una livrea del pilota');
    const setter = app.triggerCalls.find((a) => String(a[1]).includes('CarSelectionClientRequestSetCurrentCarColorPreset'));
    assert.equal(setter?.[2]?.color_preset?.name, 'preset_player_green', 'per il pilota usa il preset reale restituito dal menu');
    const grigliaPronta = await finoA(() => app.triggerCalls.some((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters')));
    assert.ok(grigliaPronta, 'il campionato continua fino all’applicazione della griglia');
    const griglia = app.triggerCalls.find((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
    const race = (griglia?.[2]?.sessions ?? []).find((s) => s?.name === 'Race');
    assert.equal(race?.models?.length, 17, 'la griglia campionato mantiene un modello per rivale');
    assert.deepEqual([...new Set(race.models.map((m) => m.name))].sort(), ['ks_a', 'ks_b'], 'restano tutte le auto multiclass richieste');
    assert.deepEqual([...new Set(race.models.map((m) => m.preset?.name))].sort(), ['a_skin_1', 'a_skin_2', 'b_skin_1', 'b_skin_2'], 'le livree avversarie continuano ad alternarsi, senza essere sovrascritte dal preset del pilota');
    const ack = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.ok === 1));
    assert.ok(ack, 'il campionato completa e ack-a il comando');
  } finally { app.drena(); }
});

test('RUNTIME griglie di tipi diversi: una skin, multiclasse multi-livrea, senza skin, id sconosciuto', async () => {
  // 5/11 — la griglia non è solo la R5: si prova la stessa costruzione su
  // quattro parchi diversi, perché un caso solo non copre i modelli senza
  // skin, il multiclasse con più livree e il fallback quando un id del parco
  // non esiste più nel menu del gioco.
  const sessione = (n) => [
    { name: 'Practice', opponents: Array.from({ length: n }, () => 1), single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 10, minute: 30 } },
    { name: 'Race', opponents: Array.from({ length: n }, () => 1), single_make: false, num_opponents: 0, min_strength: 60, max_strength: 70, time_of_day: { hour: 13, minute: 30 }, duration: 5, duration_type: 'GameModeSelectionDuration_LAPS' },
  ];
  const CASI = [
    {
      nome: 'monomarca con una sola skin',
      weekend: { singleMake: true, opponents: 15, aiMin: 84, aiMax: 85, laps: 3, gridCars: ['ks_a'], sessions: { Practice: { hour: 10 }, Race: { hour: 16 } } },
      cars: [{ name: 'ks_a', display_name: 'Auto A' }],
      carId: 'ks_a', nomeAuto: 'Auto A', attesi: 15,
      verifica: (g) => { assert.equal(g.models.length, 15); assert.ok(g.models.every((m) => m.name === 'ks_a')); },
    },
    {
      nome: 'multiclasse con due livree per modello',
      weekend: { singleMake: false, opponents: 11, aiMin: 82, aiMax: 88, laps: 4, gridCars: ['ks_a', 'ks_b', 'ks_c'], sessions: { Practice: { hour: 10 }, Race: { hour: 14 } } },
      cars: [
        { name: 'ks_a', display_name: 'Auto A', preset: { name: 'a_1' } }, { name: 'ks_a', display_name: 'Auto A', preset: { name: 'a_2' } },
        { name: 'ks_b', display_name: 'Auto B', preset: { name: 'b_1' } }, { name: 'ks_b', display_name: 'Auto B', preset: { name: 'b_2' } },
        { name: 'ks_c', display_name: 'Auto C', preset: { name: 'c_1' } }, { name: 'ks_c', display_name: 'Auto C', preset: { name: 'c_2' } },
      ],
      carId: 'ks_a', nomeAuto: 'Auto A', attesi: 11,
      verifica: (g) => {
        assert.equal(g.models.length, 11);
        assert.deepEqual([...new Set(g.models.map((m) => m.name))].sort(), ['ks_a', 'ks_b', 'ks_c'], 'tutti i modelli del parco in griglia');
        assert.equal(new Set(g.models.map((m) => m.preset?.name)).size, 6, 'due skin per modello = sei livree distinte');
      },
    },
    {
      nome: 'multiclasse senza skin dichiarate',
      weekend: { singleMake: false, opponents: 7, aiMin: 80, aiMax: 84, laps: 3, gridCars: ['ks_a', 'ks_b'], sessions: { Practice: { hour: 10 }, Race: { hour: 15 } } },
      cars: [{ name: 'ks_a', display_name: 'Auto A' }, { name: 'ks_b', display_name: 'Auto B' }],
      carId: 'ks_a', nomeAuto: 'Auto A', attesi: 7,
      verifica: (g) => { assert.equal(g.models.length, 7); assert.deepEqual([...new Set(g.models.map((m) => m.name))].sort(), ['ks_a', 'ks_b']); },
    },
    {
      nome: 'gridCars con id non più nel menu',
      weekend: { singleMake: true, opponents: 5, aiMin: 80, aiMax: 82, laps: 3, gridCars: ['ks_inesistente'], sessions: { Practice: { hour: 10 }, Race: { hour: 12 } } },
      cars: [{ name: 'ks_a', display_name: 'Auto A' }],
      carId: 'ks_a', nomeAuto: 'Auto A', attesi: 5,
      verifica: (g) => { assert.equal(g.models.length, 5); assert.ok(g.models.every((m) => m.name === 'ks_a'), 'fallback: resta l\'auto della ronda'); },
    },
  ];
  let seq = 8100;
  for (const caso of CASI) {
    seq += 1;
    const GESTO = {
      id: `${seq}:${caso.carId}:serie_prova`, nome: caso.nomeAuto, carId: caso.carId, tipo: 'setcar',
      pista: 'Monza', layout: null, ora: 15, meteo: 'CLEAR', weekend: caso.weekend,
    };
    const risposte = {
      GameModeSelectionClientRequestTrackList: { track_item: [{ name: 'Monza', layout: 'GP' }] },
      CarSelectionClientRequestModels: { car_model: caso.cars },
      GameModeSelectionClientRequestGameModeParameters: { sessions: sessione(caso.attesi), weather_data: [{ type: 'CLEAR' }] },
    };
    const app = avviaApp(fasciaDi(Date.now() + PERIODO_MS * 1000, GESTO, { tipo: 'ronda', armataAlle: seq, viaFino: 0 }), (tipo) => risposte[tipo] ?? null);
    try {
      assert.equal(app.errore, null, `${caso.nome}: l'app non parte — ${app.errore?.stack ?? app.errore}`);
      const arrivato = await finoA(() => app.triggerCalls.some((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters')));
      assert.ok(arrivato, `${caso.nome}: il weekend non è mai arrivato al gioco — ${JSON.stringify(app.triggerCalls).slice(0, 400)}`);
      const chiamata = app.triggerCalls.find((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
      const gara = (chiamata?.[2]?.sessions ?? []).find((s) => s?.name === 'Race');
      assert.ok(gara, `${caso.nome}: manca la sessione Race nel comando`);
      caso.verifica(gara);
    } finally { app.drena(); }
  }
});

test('RUNTIME avvia: menu senza sessioni — il via NON si preme', async () => {
  // LA PORTA DELL'AVVIO (7/11): «Avvia sessione» non si preme su una griglia
  // che non si è potuta leggere. Qui il menu risponde ma senza sessioni.
  const app = avviaApp(fasciaSoloAvvia(), (tipo) => (tipo === 'GameModeSelectionClientRequestGameModeParameters'
    ? { weather_data: [] }
    : null));
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const detto = await finoA(() => app.log.some((t) => t.includes('non ha restituito sessioni')));
    assert.ok(detto, `il blocco non è spiegato in console: ${app.log.join(' | ')}`);
    nessunVia(app, COMANDO_AVVIA.id);
  } finally { app.drena(); }
});

test('RUNTIME avvia: conteggi griglia illeggibili — il via NON si preme', async () => {
  // La sessione c'è ma non porta né `opponents` né `models`: prima si leggeva
  // zero e si poteva scivolare oltre, ora il via resta fermo.
  const app = avviaApp(fasciaSoloAvvia(), (tipo) => (tipo === 'GameModeSelectionClientRequestGameModeParameters'
    ? { sessions: [{ name: 'Practice', time_of_day: { hour: 8 } }] }
    : null));
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const detto = await finoA(() => app.log.some((t) => t.includes('conteggi griglia non leggibili')));
    assert.ok(detto, `il blocco non è spiegato in console: ${app.log.join(' | ')}`);
    nessunVia(app, COMANDO_AVVIA.id);
  } finally { app.drena(); }
});

test('RUNTIME avvia: griglia sbilanciata (16 avversari / 15 modelli) — il via NON si preme', async () => {
  const app = avviaApp(fasciaSoloAvvia(), (tipo) => (tipo === 'GameModeSelectionClientRequestGameModeParameters'
    ? {
      sessions: [{
        name: 'Practice',
        opponents: Array.from({ length: 16 }, () => 1),
        models: Array.from({ length: 15 }, () => ({ name: 'ks_a' })),
        time_of_day: { hour: 8 },
      }],
      weather_data: [{ type: 'CLEAR' }],
    }
    : null));
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const detto = await finoA(() => app.log.some((t) => t.includes('richiesti 17, opponents=16, models=15')));
    assert.ok(detto, `il rifiuto non porta i conteggi veri: ${app.log.join(' | ')}`);
    nessunVia(app, COMANDO_AVVIA.id);
  } finally { app.drena(); }
});

test('RUNTIME meteo di ripiego: LIGHT_RAIN assente → RAIN della famiglia (non più cielo invariato)', async () => {
  // 5/11 — Brands Hatch: la lista del gioco non portava LIGHT_RAIN e il
  // weekend restava col cielo della sessione prima. Ora la famiglia vince:
  // LIGHT_RAIN deve atterrare su RAIN (non su HEAVY_RAIN).
  const GESTO = { id: 'sonda-meteo-ripiego', nome: 'MX-5 Cup', carId: 'ks_mx5_cup', tipo: 'setcar', pista: 'Monza', layout: null, ora: 14, meteo: 'LIGHT_RAIN', weekend: { singleMake: true, opponents: 5, aiMin: 80, aiMax: 82, laps: 3, gridCars: ['ks_mx5_cup'], sessions: { Practice: { hour: 9 }, Race: { hour: 15 } } } };
  const risposte = {
    GameModeSelectionClientRequestTrackList: { track_item: [{ name: 'Monza', layout: 'GP' }] },
    CarSelectionClientRequestModels: { car_model: [{ name: 'ks_mx5_cup', display_name: 'MX-5 Cup' }] },
    GameModeSelectionClientRequestGameModeParameters: {
      sessions: [
        { name: 'Practice', opponents: [1, 1, 1, 1, 1], time_of_day: { hour: 9 } },
        { name: 'Race', opponents: [1, 1, 1, 1, 1], time_of_day: { hour: 15 }, duration: 3, duration_type: 'GameModeSelectionDuration_LAPS' },
      ],
      weather_data: [{ type: 'GameModeSelectionWeatherType_CLEAR' }, { type: 'GameModeSelectionWeatherType_RAIN' }],
    },
  };
  const app = avviaApp(fasciaDi(Date.now() + PERIODO_MS * 1000, GESTO), (tipo) => risposte[tipo] ?? null);
  try {
    assert.equal(app.errore, null, `l'app non parte: ${app.errore?.stack ?? app.errore}`);
    const arrivato = await finoA(() => app.triggerCalls.some((a) => String(a[1]) === 'GameModeSelectionClientRequestSetWeather'));
    assert.ok(arrivato, `SetWeather mai chiamato — ${JSON.stringify(app.triggerCalls).slice(-4)}`);
    const sw = app.triggerCalls.find((a) => String(a[1]) === 'GameModeSelectionClientRequestSetWeather');
    const tipo = String(sw?.[2]?.weather_data?.type ?? '');
    assert.ok(tipo.endsWith('_RAIN'), `il ripiego doveva atterrare su RAIN, dato «${tipo}»`);
    assert.ok(!tipo.endsWith('_HEAVY_RAIN'), `il meno modificato deve vincere, non HEAVY_RAIN: «${tipo}»`);
  } finally { app.drena(); }
});

test('RUNTIME 18 posti del menu su 17 chiesti: NESSUN riempimento, models restano 17 e il via passa', async () => {
  // 7/11, crash EVO 18:16: il menu dichiarava 13 avversari su un weekend che
  // ne chiedeva 12 e una griglia di 13 celle — contava anche il POSTO DEL
  // GIOCATORE. Riempire i modelli fino a `opponents` (la strada del 5/11)
  // metteva in pista 14 auto su 13 celle: Start e crash. Qui la stessa forma
  // su 17 chiesti: la griglia resta 17 e il via si preme.
  const GESTO = rondaMulticlasse();
  const fascia = fasciaDi(Date.now() + PERIODO_MS * 1000, GESTO);
  fascia.azioni = { ronda: { weekend: GESTO.weekend } };
  const app = avviaApp(fascia, (tipo) => risposteMulticlasse(18, 17)[tipo] ?? null);
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const partito = await finoA(() => app.triggerCalls.some((a) =>
      String(a[0]) === 'OnUICommand' && String(a[1]).includes('GameModeSelectionClientRequestStart')));
    assert.ok(partito, `Start mai premuto — ${JSON.stringify(app.triggerCalls).slice(0, 700)}`);
    const set = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
    assert.equal(set.length, 1, `nessuna riscrittura: i modelli sono già quelli chiesti (Set: ${set.length})`);
    const gara = (set[0]?.[2]?.sessions ?? []).find((s) => s?.name === 'Race');
    assert.equal(gara?.models?.length, 17, `models devono restare 17 (chiesti), non ${gara?.models?.length}`);
    assert.ok(!app.log.some((t) => t.includes('griglia riempita')), `il riempimento non deve nemmeno tentarlo: ${app.log.join(' | ')}`);
    const ack = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.ok === 1));
    assert.ok(ack, `il weekend va confermato: ${JSON.stringify(app.store.at(-1)?.val ?? null)}`);
  } finally { app.drena(); }
});

test('RUNTIME vista ricreata: il comando già confermato NON si riesegue (e uno nuovo sì)', async () => {
  // 7/11, visto vivo: 18:15:50 e 18:15:56, due giri completi dello STESSO
  // comando. Il gioco aveva ricreato la pagina della UI e la copia nuova, senza
  // memoria, ha rifatto auto, pista, griglia e meteo mentre il publisher non
  // aveva ancora letto l'ack. Qui due sandbox condividono la `localStorage`:
  // la seconda deve tacere, e un comando DIVERSO deve invece partire.
  const GESTO = { ...rondaMulticlasse(), avvia: false };
  const fascia = fasciaDi(Date.now() + PERIODO_MS * 1000, GESTO);
  fascia.azioni = { ronda: { weekend: GESTO.weekend } };
  const storage = storageFinto();
  const risposte = (tipo) => risposteMulticlasse(16, 16)[tipo] ?? null;

  const prima = avviaApp(fascia, risposte, { storage });
  try {
    assert.equal(prima.errore, null, `la prima vista non parte: ${prima.errore?.stack ?? prima.errore}`);
    const ack = await finoA(() => (prima.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.ok === 1));
    assert.ok(ack, `la prima vista non ha confermato: ${JSON.stringify(prima.store.at(-1)?.val ?? null)}`);
    assert.ok(prima.triggerCalls.length > 0, 'la prima vista deve aver lavorato davvero');
    prima.drena();   // il gioco butta la vista vecchia

    const dopo = avviaApp(fascia, risposte, { storage });   // stessa fascia, stesso comando
    try {
      assert.equal(dopo.errore, null, `la vista ricreata non parte: ${dopo.errore?.stack ?? dopo.errore}`);
      await new Promise((r) => setTimeout(r, 700));
      assert.equal(dopo.triggerCalls.length, 0,
        `la vista ricreata ha rieseguito il comando: ${JSON.stringify(dopo.triggerCalls.slice(0, 4))}`);
      assert.ok(dopo.log.some((t) => t.includes('già confermato')), `il pannello non spiega il silenzio: ${dopo.log.join(' | ')}`);

      // CONTROPROVA: un comando NUOVO deve partire anche con la memoria piena
      const nuovo = { ...GESTO, id: 'sonda-vista-nuova-1' };
      const fasciaNuova = fasciaDi(Date.now() + PERIODO_MS * 1000, nuovo);
      fasciaNuova.azioni = { ronda: { weekend: nuovo.weekend } };
      const terza = avviaApp(fasciaNuova, risposte, { storage });
      try {
        const partito = await finoA(() => terza.triggerCalls.length > 0);
        assert.ok(partito, `un comando nuovo deve partire: la memoria non deve spegnere tutto — ${terza.log.join(' | ')}`);
      } finally { terza.drena(); }
    } finally { dopo.drena(); }
  } finally { prima.drena(); }
});

test('RUNTIME il caso del 18:16 (13 posti del menu, 12 chiesti): 12 modelli e NESSUN riempimento', async () => {
  // La riproduzione esatta del crash di oggi, in piccolo: weekend da 12
  // avversari (13 celle, una è tua), menu che risponde opponents=[13] con
  // models=[12]. Prima si "riempiva" a 13; ora la griglia resta 12.
  const base = rondaMulticlasse();
  const GESTO = { ...base, id: '1794071712716:ks_a:endurance_gt4', weekend: { ...base.weekend, opponents: 12 } };
  const fascia = fasciaDi(Date.now() + PERIODO_MS * 1000, GESTO);
  fascia.azioni = { ronda: { weekend: GESTO.weekend } };
  const app = avviaApp(fascia, (tipo) => risposteMulticlasse(13, 12)[tipo] ?? null);
  try {
    assert.equal(app.errore, null, `l'app non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const ack = await finoA(() => (app.store.at(-1)?.val?.commands ?? []).some((v) => v?.id === GESTO.id && v?.ok === 1));
    assert.ok(ack, `il weekend doveva essere confermato: ${JSON.stringify(app.store.at(-1)?.val ?? null)} — log: ${app.log.join(' | ')}`);
    const set = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestSetGameModeParameters'));
    assert.equal(set.length, 1, `una sola scrittura: la griglia era già quella giusta (Set: ${set.length})`);
    const gara = (set[0]?.[2]?.sessions ?? []).find((s) => s?.name === 'Race');
    assert.equal(gara?.models?.length, 12, `12 auto AI su 13 celle (una è del giocatore), non ${gara?.models?.length}`);
    assert.ok(app.log.some((t) => t.includes('griglia verificata: 13 avversari / 12 modelli')), `la conferma deve dire 13/12: ${app.log.join(' | ')}`);
    const partito = await finoA(() => app.triggerCalls.some((a) => String(a[1]).includes('GameModeSelectionClientRequestStart')));
    assert.ok(partito, `con 12 modelli su 13 posti il via deve partire — ${app.log.join(' | ')}`);
    const start = app.triggerCalls.filter((a) => String(a[1]).includes('GameModeSelectionClientRequestStart')).length;
    assert.equal(start, 1, `il via si preme una volta: ${start}`);
  } finally { app.drena(); }
});
