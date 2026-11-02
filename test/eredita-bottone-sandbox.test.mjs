// eredita-bottone-sandbox.test.mjs — LA PROVA RUNTIME DEL BOTTONE (2/11,
// richiesta Mauro: «una sandbox simuli il click e verifichi che il canale
// agenda-choose sia chiamato col nodeId giusto»).
//
// La legge è già provata ALLA FORMA in test/eredita-cruscotto.test.mjs
// (richiesta iscritta, niente doppi, esito firmato). Qui si prova ALLA
// STRINGA con lo stesso metro di uiapp-coda-sandbox: il file costruito VERO
// (uiapp/cruscotto/cruscotto.js, quello che legge l'ACEUIAppLoader) gira
// dentro una sandbox Node (vm) con l'ambiente della pagina del loader, la
// fascia arriva dal XHR finto CON il pannello eredità e il click sul bottone
// viene SIMULATO col vivo gesto dell'utente (evento click sui listener del
// document, target = il bottone). Catena provata IN DUE METÀ:
//
//   1) L'APP (vm): il click scrive UNA richiesta
//      `cruscotto.richieste → { richieste: [{ id: 'eredita:<ts>',
//      tipo: 'eredita-punta' }] }` nel persist del loader e il bottone
//      passa in attesa («Punto in corsa») — un secondo click in attesa NON
//      scrive un'altra richiesta. CONTROPROVA: stessa sandbox, fascia senza
//      il pannello eredità — il click NON scrive niente e nota il perché.
//   2) IL PUBLISHER (Node): il valore scritto dalla sandbox entra in
//      giraRichiesteEredità; per DIRE che l'agenda-choose riceve il nodeId
//      GIUSTO (quello della serie dell'impresa, non quello corrente del
//      pilota) la carriera parte su una serie A e l'impresa punta un CLONE
//      della stessa serie con nodeId B diverso: dopo la girota
//      `state.node === B`, il sedile di B esiste e il messaggio
//      «Iscritto a …» cita il display DEL CLONE. Se il canale chiamasse
//      A o un nodeId a caso, la carriera resterebbe su A e la prova bazza.
//
// Niente file di gioco toccati, niente server: ogni sondaggio riparte da
// una sandbox pulita e il save VERO resta al suo posto (EVO_DATA_DIR
// della casa punta alla cartella temporanea).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

process.env.EVO_SENZA_VINCOLI = '0';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DATA = mkdtempSync(join(tmpdir(), 'evo-bottone-'));
// regola EVO_DATA_DIR della casa: il persist del publisher qui in test
// passa dalla cartella temporanea — il save VERO non si tocca.
process.env.EVO_DATA_DIR = DATA;
mkdirSync(DATA, { recursive: true });

const LADDER = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));

// IL COSTRUITO VERO, non la sagoma: se la legge sta solo nel sorgente e la
// build la perde, QUESTO test la becca (il gioco legge il costruito).
const COSTRUITO = join(ROOT, 'uiapp', 'cruscotto', 'cruscotto.js');
const CODE = readFileSync(COSTRUITO, 'utf8');

/* ---------------------------------------------------------------- ambiente */

/** L'elemento finto: lo script tocca innerHTML/textContent/style/classList e
 *  un pugno di append — `contains` sale i FIGLI reali (appendChild), che è
 *  il mimo del vivo; il bottone del click (innerHTML) lo dichiara col
 *  marche `__dentro` che avviaApp legge nel pannello. */
function elementoFinto(tag) {
  const e = {
    tagName: String(tag).toUpperCase(),
    className: '',
    figli: [],
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    textContent: '',
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 800,
    appendChild(c) { e.figli.push(c); e.firstChild = e.figli[0] ?? null; return c; },
    removeChild(c) { const i = e.figli.indexOf(c); if (i >= 0) e.figli.splice(i, 1); e.firstChild = e.figli[0] ?? null; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains(o) { return o === e || e.figli.includes(o); },
  };
  return e;
}

/** XHR finto: risponde a OGNI BASE+'ui-<fascia>.json' con la fascia fornita
 *  (dopo un tick, come la lettura vera); `null` = 404. */
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

/** Il BOTTONE del click: `closest` risponde SOLO al selettore del bottone
 *  eredità (stringa-piena, come nearest al vivo) — per gli altri selettori
 *  (ronda/avvia/evento/verdetto) null, che è la verità del click fuori presa. */
function bottoneEredita() {
  const b = {
    tagName: 'BUTTON',
    className: 'crd-btn',
    getAttribute: (n) => (n === 'data-eredita' ? '1' : null),
    closest(sel) { return String(sel) === 'button.crd-btn[data-eredita]' ? b : null; },
  };
  return b;
}

/** Manda SU l'app costruita in una sandbox pulita e ritorna le maniglie:
 *  { log, store, clicca, pannello(), innerHtml(), nota(), errore, drena }.
 *  I listener 'click' del document finto restano VIVI e il click li chiama
 *  nel loro ordine di registrazione — il gesto vivo raggiunge il gestore
 *  reale del bottone (quello che la pagina ha registrato), non un richiamo. */
function avviaApp(fascia) {
  const log = [];
  const consoleFinto = { log: (t) => log.push(String(t)), warn: () => {}, error: () => {} };
  const store = [];              // ogni writeStore del persist del loader
  const clickHandlers = [];      // i listener 'click' del document catturati VIVI
  const intervalli = new Set();  // per DRENARE alla fine: la sandbox non può tenere la suite

  const windowFinto = {
    ACEUIAppLoader: {
      app: () => ({ base: '/ACEUIAppLoader/cruscotto/' }),
      // scroll.attach: ABSENT (pagine senza loader che scorre) — come le
      // prove della coda: lo script sorbisce il catch e nasconde il track
      persist: { storeLoaded: () => false, writeStore: (key, val) => store.push({ key, val }) },
    },
    __cruscottoNota: '',
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(Number(ms ?? 0), 60)),
    clearTimeout,
    open: () => {},
    external: undefined,
  };

  const documentFinto = {
    head: elementoFinto('head'),
    body: elementoFinto('body'),
    readyState: 'complete',
    createElement: (tag) => elementoFinto(tag),
    addEventListener(tipo, f) { if (tipo === 'click') clickHandlers.push(f); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };

  const ctx = vm.createContext({
    window: windowFinto,
    document: documentFinto,
    console: consoleFinto,
    XMLHttpRequest: xhrFinto(fascia),
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(Number(ms ?? 0), 60)),
    clearTimeout,
    setInterval: (fn, ms) => {
      const id = setInterval(() => { try { fn(); } catch (_e) { /* in gioco anche qui */ } }, Math.max(Number(ms ?? 0), 50));
      intervalli.add(id);
      return id;
    },
    clearInterval: (id) => { clearInterval(id); intervalli.delete(id); },
  });

  let erroreBoot = null;
  try { vm.runInContext(CODE, ctx, { filename: 'uiapp/cruscotto/cruscotto.js' }); }
  catch (e) { erroreBoot = e; }

  // IL CLICK SIMULATO: evento col target dai `closest` vivi e ogni gestore
  // 'click' del document chiamato NEL SUO ordine di registrazione.
  const clicca = (target) => {
    const ev = { target, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
    for (const f of clickHandlers.slice()) {
      try { f(ev); } catch (e) { log.push('click: ' + (e?.stack ?? e)); }
    }
    return ev;
  };

  const pannello = () => documentFinto.body.figli.find((c) => c.className === 'crd-panel') ?? null;
  // Il bottone del click nasce DENTRO innerHTML (stringa) e il gestore chiede
  // `panel.contains(eb)`: il rapporto di filiazione si dichiara col marchio
  // `__dentro` e SOLO il pannello di quest'app accetta i figli originali.
  const p = pannello();
  if (p) p.contains = (o) => o?.__dentro === p;

  const maniglie = {
    log, store, clicca, pannello: () => pannello(), errore: erroreBoot,
    innerHtml: () => {
      const pp = pannello();
      const body = pp?.figli.find((c) => c.className === 'crd-body') ?? null;
      const inner = body?.figli.find((c) =>
        c.className === 'crd-inner' || String(c.innerHTML ?? '').length > 0) ?? body;
      return String(inner?.innerHTML ?? '');
    },
    nota: () => String(windowFinto.__cruscottoNota ?? ''),
    drena() { for (const id of [...intervalli]) { clearInterval(id); intervalli.delete(id); } },
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

/** La FASCIA della sonda: validaFino viva (nessuna guardia del comando, qui
 *  non si tocca) e il pannello eredità con nodeId della serie dell'impresa,
 *  pronta=false: il bottone DEVE essere cliccabile. azioni {} e storia [] =
 *  senza i bottoni del ponte e senza righe di memoria. */
function fasciaDi(validaFinoMs, eredita) {
  return {
    validaFino: new Date(validaFinoMs).toISOString(),
    comando: null,
    azioni: {},
    storia: [],
    eredita: eredita ?? null,
    pilota: { nome: 'Sonda del bottone', saldo: 0, rep: 0 },
    gare: [],
  };
}

/* ---------------------------------------------------------- 1) L'APP (vm) */

const IMPRESA = {
  nodeId: 'serie-giusta-della-sonda',
  titolo: 'Le Origini', antenato: 'Sagace uno', relazione: 'bisnonno', era: '1968',
  auto: "Auto d'epoca", obiettivo: 'termina la gara tra i primi 5',
  ronde: '0/2', prossima: '', pronta: false, incassata: false,
  rank: 'R1 · Origine', capitoli: '0/3',
};

test('RUNTIME bottone: il click scrive UNA richiesta tipo eredita-punta nel persist e il bottone va in attesa', async () => {
  const app = avviaApp(fasciaDi(Date.now() + 60_000, IMPRESA));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    // la fascia arriva e il pannello eredità si disegna col SUO bottone
    const disegnata = await finoA(() => app.innerHtml().includes('Punta la ronda in Agenda'));
    assert.ok(disegnata, `il bottone non si è disegnato in 3 s — coda: ${app.innerHtml().slice(0, 300)}`);
    assert.ok(app.innerHtml().includes('Le Origini'), "il pannello porta il titolo dell'impresa");

    // IL CLICK col vivo gesto: target bottone, gestori del document in ordine
    const b = bottoneEredita();
    b.__dentro = app.pannello();
    app.clicca(b);

    const scritta = await finoA(() => app.store.some((s) => s.key === 'cruscotto.richieste'));
    assert.ok(scritta, `il click non ha scritto la richiesta in 3 s — store: ${JSON.stringify(app.store)}`);
    assert.ok(app.store.every((s) => s.key === 'cruscotto.richieste'),
      `scrive SOLO la richiesta, non ack: ${JSON.stringify(app.store.map((s) => s.key))}`);
    const rich = app.store[app.store.length - 1].val;
    assert.ok(rich?.richieste?.length === 1, `una richiesta sola al click: ${JSON.stringify(rich)}`);
    const r = rich.richieste[0];
    assert.ok(String(r.id).startsWith('eredita:'), `l'id firma il bottone eredità: ${r.id}`);
    assert.equal(r.tipo, 'eredita-punta'); // il canale che giraRichiesteEredità riconosce
    assert.ok(Number.isFinite(Number(r.at)), 'il tempo di richiesta è un numero');

    // IL BOTTONE va in attesa: disegnato di nuovo (disegna() post-click),
    // la punta in corsa lo disattiva — un secondo gesto non lo riscatta
    assert.ok(app.innerHtml().includes('Punto in corsa'),
      `dopo il click il bottone non mostra l'attesa: ${app.innerHtml().slice(-400)}`);

    // CONTROPROVA DEL CLICK DOPPIO: mentre in attesa nessuna seconda
    // scrimizione sul persist — una richiesta a fascia è un giro giusto
    app.clicca(b);
    await new Promise((fatto) => setTimeout(fatto, 50));
    const richiesteScritte = app.store.filter((s) => s.key === 'cruscotto.richieste').length;
    assert.equal(richiesteScritte, 1,
      `al secondo click in attesa NON parte un'altra writeStore: attesa 1, viste ${richiesteScritte} — ${JSON.stringify(app.store)}`);
    const resta = app.store[0]?.val;
    assert.ok(resta?.richieste?.length === 1,
      `la sessione resta a UNA richiesta: ${JSON.stringify(resta)}`);
  } finally { app.drena(); }
});

test('RUNTIME bottone (controprova): senza il pannello eredità nella fascia il click NOTA il perché e non scrive niente', async () => {
  // Altrimenti la sonda del click contiene niente: un ambiente che scrive per
  // qualunque motivo è verde a saccatura. Qui la fascia non porta `eredita`:
  // il gestore si ferma dopo il closest (bottone vivo nel pannello) con il NO
  // di chiarezza e ZERO scritture sul persist.
  const app = avviaApp(fasciaDi(Date.now() + 60_000, null));
  try {
    assert.equal(app.errore, null, `l'app costruita non parte in sandbox: ${app.errore?.stack ?? app.errore}`);
    const disegnata = await finoA(() => app.innerHtml().length > 0);
    assert.ok(disegnata, 'la fascia non si disegna: ambiente morto');
    const b = bottoneEredita();
    b.__dentro = app.pannello();
    app.clicca(b);
    await new Promise((fatto) => setTimeout(fatto, 50));
    assert.equal(app.store.length, 0,
      `senza eredità il click NON scrive niente: ${JSON.stringify(app.store)}`);
    assert.match(app.nota(), /[Nn]essuna impresa attiva da puntare/,
      `la nota del click schiarito: «${app.nota()}»`);
  } finally { app.drena(); }
});

/* ———————————————————— 2) IL PUBLISHER: il canale agenda-choose col girato —— */

test('PUBLISHER: la richiesta scritta dalla sandbox gira l\u2019agenda-choose COL NODEID DELL\u2019IMPRESA (non quello corrente)', async () => {
  const { createCareer, nodeById } = await import('../src/state.mjs');
  const { giraRichiesteEredità } = await import('../src/uiapp-pub.mjs');
  const { ensureHeritage } = await import('../src/memories.mjs');

  const ladder = JSON.parse(JSON.stringify(LADDER));
  const state = createCareer(ladder, { name: 'Test Bottone', first: 'Test', last: 'Bottone' });
  const parte = nodeById(ladder, state.node);
  assert.ok(parte, 'la carriera parte su una serie (il nodo di partenza vive)');
  assert.ok(!state.messages.some((m) => /Iscritto a/.test(m?.text ?? '')),
    'nessuna iscrizione di serie prima della prova');

  // IL CLONE della serie di partenza con nodeId DIVERSO: è la serie
  // dell'impresa (fattibile per costruzione: stessa griglia/giornate/level
  // dell'apertura — il cancello la vede come la serie di partenza).
  const NODE_FEAT = 'origine-sonda-agenda-choose';
  const clone = JSON.parse(JSON.stringify(parte));
  clone.nodeId = NODE_FEAT;
  clone.display = 'Serie della sonda eredità';
  ladder.nodes.push(clone);

  // l'impresa attiva che punta il CLONE (il nodeId che il canale DEVE usare)
  ensureHeritage(state).active = {
    id: 'lorigine', nodeId: NODE_FEAT, title: 'Le Origini', titleEn: 'The Origin', era: '1968',
    series: 'serie sonda', relation: 'bisnonno', relationEn: 'great-grandfather',
    seat: 41, carId: null, carName: "Auto d'epoca", legends: ['J. Ickx (BE)'],
    rounds: [], tracksDisplay: [], progress: [], done: false, claimed: false,
    assignedSeason: state.season, objective: { text: 'termina la gara tra i primi 5', kind: 'positionTop', value: 5 },
    inherit: 60000, repeat: 14000, relic: 'Auto storica #41', relicEn: 'Historic car #41',
  };

  // LA STESSA FORMA scritta dall'app in sandbox (test sopra): un oggetto con
  // richieste, id a firma bottone e tipo eredita-punta — niente nodeId NEL
  // pacchetto: è IL PUBLISHER a calcolarlo dal capitolo attivo. Se il canale
  // sbaglia il nodeId (usa A, o un a caso), l'iscrizione va altrove e le tre
  // asserzioni qui sotto bazzerano.
  // IL SEDILE DEL CLONE sul giorno odierno: altrimenti (nessun sedile) il
  // calendario continua dal PRIMO giorno e la sua prima gara va oltre oggi —
  // la ronda c'è, ma da altra giornata. Un sedile legacy è la veste reale
  // (serie già seguita in stagioni passate): la prova NON perde lo spigolo,
  // il canale resta quello che iscrive CHI là e come.
  const { agendaDay } = await import('../src/agenda.mjs');
  state.seats ??= {};
  state.seats[NODE_FEAT] = { day: agendaDay(state), season: state.season };

  const richiesta = { id: 'eredita:' + Date.now(), tipo: 'eredita-punta', at: Date.now() };
  let esito;
  try { esito = giraRichiesteEredità(ladder, state, { richieste: [richiesta] }); }
  finally { /* niente da drenare: giraRichiesteEredità è sincrono */ }
  assert.ok(esito?.ok, `la punta è riuscita: ${esito?.msg}`);
  assert.equal(state.node, NODE_FEAT,
    `l'agenda-choose ha iscritto la serie GIUSTA: state.node ora ${state.node} — atteso ${NODE_FEAT}`);
  assert.ok(state.seats?.[NODE_FEAT], "il sedile della serie dell'impresa esiste dopo la scelta");
  assert.ok(state.messages.some((m) => /Scelta la gara del giorno: Serie della sonda eredità/.test(m?.text ?? '')),
    `il messaggio di scelta cita il display DEL CLONE: ${JSON.stringify(state.messages.slice(-3).map((m) => m?.text))}`);
});
