// test/uiapp-tick-coda.test.mjs — GLI INVII IN CODA del publisher (4/11,
// «aggiungi ai test del publisher gli invii in coda di evento e avvia —
// src/uiapp-pub.mjs non solo li riconosce l'app»).
//
// Le sonde del coda-sandbox (test/uiapp-coda-sandbox.test.mjs) provano l'APP
// in gioco: un comando già messo in fascia viene riconosciuto e girato (o
// rifiutato se la fascia è morta). Qui si prova l'ALTRO capo del canale, il
// PUBLISHER: un giro VERO di uiappTick — con il SAVE e l'installazione
// dell'app entrambi finti — deve METTERE IN CODA i comandi «evento» e
// «avvia» nella fascia che l'app leggerà (ui-<fascia>.json, campo comando,
// col nome e l'id STABILE che l'app usa per l'ack) e registrarli UNA volta
// sola nella storia del comando (stato «inviato», tooltip del pallino).
//
// Tutto su percorsi DA SANDBOX: EVO_DATA_DIR (save, config, storia) e
// ACE_SAVEDIR (app finta, store assente) sono impostati PRIMA dell'import
// dinamico — le costanti SAVE_FILE e fileStoria si fissano al boot, come
// già fanno gli altri test di import dinamico della casa (storia-comando).
// Il save vero, lo store vivo e le fasce vere del PC restano intatti.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------- nido della sandbox (prima di ogni import) ----------------
const NIDO = mkdtempSync(join(tmpdir(), 'evo-tick-coda-'));
const GIOCO = join(NIDO, 'ACE');                       // ACE_DATA: cartella dati di EVO
const APP_DIR = join(GIOCO, 'mods', 'uiresources', 'ACEUIAppLoader', 'cruscotto');
mkdirSync(APP_DIR, { recursive: true });
mkdirSync(join(GIOCO, 'Results'), { recursive: true });
process.env.EVO_DATA_DIR = NIDO;                       // save, config e storia qui
process.env.ACE_SAVEDIR = NIDO;                        // l'app finta vive qui (e lo store non c'è)
process.env.ACE_DATA = GIOCO;                          // resolvePaths trova solo questo
process.env.EVO_SENZA_VINCOLI = '0';                   // comportamento canonico

// il SAVE in sandbox: minimo valido per loadState (driver + money + messages),
// serie reale del ladder e auto nota nel libro contentNames
const NODE = 'trofeo_mx5';
const CAR = 'ks_mazda_mx5_na';                         // contentNames: «Mazda MX-5 NA»
const statoBase = () => ({
  version: 1,
  driver: { name: 'Pip Sperone', first: 'Pip', last: 'Sperone' },
  money: 1000, rep: 0, season: 1, node: NODE, round: 0,
  messages: [], agenda: { day: 1 }, seats: { [NODE]: { day: 1, season: 1 } },
  results: {}, bestFinish: {}, championships: {}, paidEntries: {},
  world: { drivers: [] },
  events: { active: null, history: [], showCase: [], lastRoundChecked: null },
});
const scriviStato = (extra = {}) =>
  writeFileSync(join(NIDO, 'evo-career.save.json'), JSON.stringify({ ...statoBase(), ...extra }), 'utf8');

// il config: la «cartella dati» finta diventa quella ufficiale (appEnv la legge)
writeFileSync(join(NIDO, 'evo.config.json'), JSON.stringify({ dataDir: GIOCO }), 'utf8');

const { uiappTick, storiaReset } = await import('../src/uiapp-pub.mjs');

// l'EVENTO attivo e accettato (stesso patto delle fixture di uiapp-pub-
// priorita: un premio-auto nota, tema con id per l'id STABILE del comando)
const EVENTO = {
  id: 'ev_tick', kind: 'special-race', tier: 'finale',
  createdAt: new Date().toISOString(), season: 1, afterRound: 0,
  theme: { id: 'tick_finale', name: 'Il Gran Finale dei Campioni' },
  trackId: 'cota', trackDisplay: 'cota', weather: 0, laps: 10, hour: 17, timeScale: 1,
  guests: ['Hans Stuck'],
  prize: { carId: CAR, carName: 'F40 Leggenda', money: 21000, rep: 15, duplicateCash: false },
  deadlineRounds: 99,
  acceptedAt: new Date().toISOString(),};
const leggiStoria = () => {
  try { return JSON.parse(readFileSync(join(NIDO, 'cruscotto-storia.json'), 'utf8')).righe ?? []; }
  catch { return []; }
};

/** LO STORE FINTO del gioco (ui_storage.uistorage): stesso encoding protobuf
 *  che src/uiapp-store.mjs legge — 0A<len> { 0A<len>chiave · 12<len>valore }.
 *  Serve per l'ABSORBIMENTO dell'ack: `confermaAck` da solo non spegne il
 *  comando, lo spegne assorbiAck leggendo CRUSCOTTO.acks dallo store VERO. */
const varint = (n) => { const b = []; let v = n; do { let x = v & 0x7f; v >>>= 7; if (v) x |= 0x80; b.push(x); } while (v); return Buffer.from(b); };
const campo = (tag, s) => Buffer.concat([Buffer.from([tag]), varint(Buffer.byteLength(s, 'utf8')), Buffer.from(s, 'utf8')]);
const scriviStore = (payload) => {
  const val = JSON.stringify(payload);
  const record = Buffer.concat([Buffer.from([0x0a]), varint(campo(0x0a, 'cruscotto.acks').length + campo(0x12, val).length), campo(0x0a, 'cruscotto.acks'), campo(0x12, val)]);
  writeFileSync(join(NIDO, 'ACE', 'ui_storage.uistorage'), record);
};

test.after(() => { rmSync(NIDO, { recursive: true, force: true }); });

/* ------------------------------------------------------------------ */
/* INVIO «EVENTO» IN CODA                                              */
/* ------------------------------------------------------------------ */

test('INVIO evento: il tick mette il comando «evento» nella fascia e lo registra «inviato» UNA volta', () => {
  storiaReset();
  // finestra ARMATA da «Prepara tutto e divertiti» (event-prep), ronda assente
  scriviStato({ eventoPreparato: Date.now() - 60_000, events: { active: EVENTO, history: [], showCase: [], lastRoundChecked: null } });

  const r = uiappTick();
  assert.equal(r.ok, true, `il tick deve scrivere la fascia in sandbox (${r.motivo ?? '?'})`);
  const fascia = JSON.parse(readFileSync(join(APP_DIR, r.file), 'utf8'));
  assert.ok(Date.parse(fascia.validaFino) > Date.now() - 1000, 'la fascia porta la finestra di validità che l\'app verifica');
  const cmd = fascia.comando;
  assert.equal(cmd?.tipo, 'evento', `il comando in coda è dell'evento (visto: ${JSON.stringify(cmd)})`);
  assert.equal(cmd?.nome, 'F40 Leggenda');
  assert.equal(cmd?.carId, CAR, 'l\'id interno arriva all\'app (riconoscimento per car_model.name)');
  assert.equal(cmd?.id, `evento:tick_finale:F40 Leggenda`, 'id STABILE (tema+auto): più fasce, stesso comando');
  assert.equal(cmd?.pista, null, 'l\'evento non tocca la pista (la gara personalizzata resta quella della scheda)');

  // la STORIA del comando: lo sconfinamento in coda è registrato UNA volta
  const inviati = leggiStoria().filter((x) => x.id === cmd.id);
  assert.equal(inviati.length, 1, `una sola riga «inviato» per l'id (viste: ${JSON.stringify(inviati)})`);
  assert.equal(inviati[0].stato, 'inviato');
  assert.equal(inviati[0].tipo, 'evento');

  // deduzione alla prima fascia: lo stesso comando non si riscrive (il
  // comando vive più fasce finché l'ack non lo spegne — dedotta di storiaInviata)
  const prima = leggiStoria().length;
  uiappTick();
  assert.equal(leggiStoria().length, prima, 'al secondo tick il comando NON torna «inviato»');
  // E L'ACK chiude: l'app ha già selezionato l'auto nel menu di EVO — lo store
  // (ui_storage.uistorage, encoding protobuf di src/uiapp-store.mjs) riceve
  // la coppia `cruscotto.acks` e il TICK DOPO spegne il comando in fascia.
  scriviStore({ commands: [{ id: 'evento:tick_finale:F40 Leggenda', ok: 1, msg: 'F40 in menu' }] });
  const dopo = uiappTick();
  assert.equal(dopo.ok, true, dopo.motivo ?? '?');
  const fasciaDopo = JSON.parse(readFileSync(join(APP_DIR, dopo.file), 'utf8'));
  assert.equal(fasciaDopo.comando, null, 'comando ackato: la fascia è muta, la ripubblicazione finisce');
  const righe = leggiStoria().filter((x) => x.id === 'evento:tick_finale:F40 Leggenda');
  assert.equal(righe[righe.length - 1]?.stato, 'confermato', `l'ack entra nella storia (viste: ${JSON.stringify(righe)})`);
  assert.equal(righe[righe.length - 1]?.msg, 'F40 in menu', 'la riga porta il messaggio dell\'app');
});

/* ------------------------------------------------------------------ */
/* INVIO «AVVIA» IN CODA                                               */
/* ------------------------------------------------------------------ */

test('INVIO avvia: ronda fresca con il setcar già eseguito — il tick mette «avvia» in coda e lo registra «inviato»', () => {
  storiaReset();
  const startedAt = Date.now() - 60_000;
  scriviStato({
    pending: {
      car: CAR, node: NODE, trackNames: ['cota'],
      startedAt, avviaFino: Date.now() + 20 * 60 * 1000,   // finestra del via aperta (race.mjs)
      hour: 17, weather: 'Heavy rain',
    },
  });
  scriviStore({ commands: [{ id: `${startedAt}:${CAR}:${NODE}`, ok: 1, msg: 'auto nel menu' }] });   // il setcar è già stato applicato dall'app
  // Gira reale del modulo (una fascia a tick): il PRIMO tick legge l'ack del
  // setcar e assorbe il suo comando ( fascia muta + `confermati` all'id del
  // setcar ); SOLO il SECONDO tick, vedendo il setcar confermato, mette
  // «avvia» in coda. Senza questo doppio paccolo, l'avvia non esce.
  const prime = uiappTick();
  assert.equal(prime.ok, true, prime.motivo ?? '?');
  const fasciaSetcar = JSON.parse(readFileSync(join(APP_DIR, prime.file), 'utf8'));
  assert.equal(fasciaSetcar.comando, null, 'setcar già ackato: la ronda NON torna in coda (niente ripremute)');
  const r = uiappTick();
  assert.equal(r.ok, true, r.motivo ?? '?');
  const fascia = JSON.parse(readFileSync(join(APP_DIR, r.file), 'utf8'));
  const cmd = fascia.comando;
  assert.equal(cmd?.tipo, 'avvia', `il comando in coda è l'AVVIA (visto: ${JSON.stringify(cmd)})`);
  assert.equal(cmd?.id, `${startedAt}:${CAR}:${NODE}:avvia`, 'id dell\'avvia: il setcar + il suffisso :avvia');
  assert.equal(cmd?.nome, 'Mazda MX-5 NA', 'il nome arriva dal libro contentNames del ladder VERO');
  assert.equal(cmd?.pista, null, 'l\'avvia non ripete la sequenza: solo «Avvia sessione»');

  const inviati = leggiStoria().filter((x) => x.id === cmd?.id);
  assert.equal(inviati.length, 1, `una sola riga «inviato» per l'avvia (viste: ${JSON.stringify(inviati)})`);
  assert.equal(inviati[0].stato, 'inviato');
  assert.equal(inviati[0].tipo, 'avvia');

  // deduzione alla seconda fascia: lo stesso comando non si riscrive
  const prima = leggiStoria().length;
  uiappTick();
  assert.equal(leggiStoria().length, prima, 'al secondo tick l\'avvia NON torna «inviato»');

  // e l'ack dell'avvia chiude la coda (l'app ha già premuto «Avvia sessione»):
  // lo STORE va sostituito (l'ack del setcar resta, aggiungo quello dell'avvia)
  scriviStore({ commands: [
    { id: `${startedAt}:${CAR}:${NODE}`, ok: 1, msg: 'auto nel menu' },
    { id: `${startedAt}:${CAR}:${NODE}:avvia`, ok: 1, msg: 'avvia sessione premuto' },
  ] });
  const dopo = uiappTick();
  assert.equal(dopo.ok, true, dopo.motivo ?? '?');
  const fasciaDopo = JSON.parse(readFileSync(join(APP_DIR, dopo.file), 'utf8'));
  assert.equal(fasciaDopo.comando, null, 'avvia ackato: niente riavvii da solo');
  const conferma = leggiStoria().findLast((x) => x.id === `${startedAt}:${CAR}:${NODE}:avvia`);
  assert.equal(conferma?.stato, 'confermato', 'anche l\'avvia si conferma nella storia');
  assert.ok(/avvia sessione/.test(conferma?.msg ?? ''), `l'ack porta la voce del sentiero avvia (${conferma?.msg})`);
});
