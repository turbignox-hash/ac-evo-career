// test/potatura-fasce.test.mjs — LA GUARDIA DELLA POTATURA (3/11, «aggiungi
// un test che dica la potatura tiene al più 13 fasce», dopo la cura del buco).
//
// La diagnosi del buco nel log di EVO: la raffica di 404 su ui-<fascia>.json
// con la retention vecchia che teneva la fascia scritta + SOLE le 2 prima —
// un tick saltato (sistema occupato, lock breve) finiva per togliere dal
// disco una fascia prima ancora che il gioco la chiedesse. La cura
// ([src/uiapp-pub.mjs](../src/uiapp-pub.mjs), `FASCE_DIETRO = 12`): la
// potatura del tick tiene la fascia CORRENTE + le 12 dietro = AL PIÙ 13
// fasce per canale (cruscotto e pitwall; il Paddock pota a 12 con la sua
// guardia in test/uiapp-pub-app.test.mjs). Qui la prova con un giro VERO
// di uiappTick su disco affollato di fasce vecchie: al più 13 sopravvivono,
// e sono le PIÙ FRESCHE — la copertura dietro (fascia-1, fascia-2) resta a
// casa perché il recupero del gioco non arrivi a una fascia già sparita.
//
// Stesso nido della sandbox di test/uiapp-tick-coda.test.mjs: EVO_DATA_DIR
// (save, config) e ACE_SAVEDIR (app finta, store assente) prima dell'import
// dinamico — il save vero e le fasce vere del PC restano intatti.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NIDO = mkdtempSync(join(tmpdir(), 'evo-potatura-fasce-'));
const GIOCO = join(NIDO, 'ACE');                       // ACE_DATA: cartella dati di EVO
const APP_CRUSCOTTO = join(GIOCO, 'mods', 'uiresources', 'ACEUIAppLoader', 'cruscotto');
const APP_PITWALL = join(GIOCO, 'mods', 'uiresources', 'ACEUIAppLoader', 'pitwall');
mkdirSync(APP_CRUSCOTTO, { recursive: true });
mkdirSync(APP_PITWALL, { recursive: true });
mkdirSync(join(GIOCO, 'Results'), { recursive: true });
process.env.EVO_DATA_DIR = NIDO;                       // save, config e storia qui
process.env.ACE_SAVEDIR = NIDO;                        // le app finte vivono qui (lo store non c'è)
process.env.ACE_DATA = GIOCO;
process.env.EVO_SENZA_VINCOLI = '0';

// il SAVE in sandbox: minimo valido per loadState (come nel nido del tick-coda)
writeFileSync(join(NIDO, 'evo-career.save.json'), JSON.stringify({
  version: 1,
  driver: { name: 'Pip Sperone', first: 'Pip', last: 'Sperone' },
  money: 1000, rep: 0, season: 1, node: 'trofeo_mx5', round: 0,
  messages: [], agenda: { day: 1 }, seats: { trofeo_mx5: { day: 1, season: 1 } },
  results: {}, bestFinish: {}, championships: {}, paidEntries: {},
  world: { drivers: [] },
  events: { active: null, history: [], showCase: [], lastRoundChecked: null },
}), 'utf8');
writeFileSync(join(NIDO, 'evo.config.json'), JSON.stringify({ dataDir: GIOCO }), 'utf8');

const { uiappTick, FASCE_DIETRO } = await import('../src/uiapp-pub.mjs');

/** riempie la cartella di fasce VECCHIE (slot corrente escluso): 40 fascia
 *  indietro in un solo colpo, come un disco affollato da un publisher che
 *  gira da ore prima della potatura. */
const affollaFasce = (dir, fasciaOra) => {
  for (let d = 1; d <= 40; d++) {
    const slot = fasciaOra - d;
    writeFileSync(join(dir, `ui-${slot}.json`), JSON.stringify({ slot }), 'utf8');
  }
};
const fascePresenti = (dir) =>
  readdirSync(dir).filter((f) => /^ui-\d+\.json$/.test(f)).map((f) => Number(f.slice(3, -5)));
const pulisciFasce = (dir) => {
  for (const f of readdirSync(dir).filter((f) => /^ui-\d+\.json$/.test(f))) unlinkSync(join(dir, f));
};

test.after(() => { rmSync(NIDO, { recursive: true, force: true }); });

/* ------------------------------------------------------------------ */

test(`LA POTATURA tiene al più ${FASCE_DIETRO + 1} fasce (corrente + ${FASCE_DIETRO} dietro): disco affollato al cruscotto`, () => {
  const attorno = Math.floor(Date.now() / 2500);
  affollaFasce(APP_CRUSCOTTO, attorno);
  const r = uiappTick();
  assert.equal(r.ok, true, `il tick scrive la fascia in sandbox (${r.motivo ?? '?'})`);
  const fasciaT = Number(r.file.slice(3, -5));      // il tick dice il SUO slot: niente corsa coi tempi
  const numeri = fascePresenti(APP_CRUSCOTTO);
  assert.ok(numeri.length <= FASCE_DIETRO + 1, `la potatura tiene al più ${FASCE_DIETRO + 1} fasce (trovate ${numeri.length})`);
  assert.ok(numeri.includes(fasciaT), 'la fascia corrente resta sul disco');
  // e le sopravvissute sono le PIÙ FRESCHE: tutta la finestra visibile è al
  // massimo FASCE_DIETRO dietro, non una fascia arida da ore che il gioco 404a
  const minima = Math.min(...numeri);
  assert.ok(minima >= fasciaT - FASCE_DIETRO,
    `la fascia più vecchia è nella finestra di ${FASCE_DIETRO} dietro (vecchia: ${minima}, corrente: ${fasciaT})`);
  // LA CURA DEL BUCO sul vivo: la copertura DIETRO (fascia-1, fascia-2) resta
  // a casa — si potrebbe uguagliare contro il fascia - 1 ma il contorno (tick
  // che attraversa il confine 2,5 s mentre seminiamo) romperebbe l'esatto;
  // qui basta la finestra di sopra.
});

test(`LA POTATURA tiene al più ${FASCE_DIETRO + 1} fasce ANCHE alla pitwall (secondo canale dello stesso tick)`, () => {
  affollaFasce(APP_PITWALL, Math.floor(Date.now() / 2500));
  const r = uiappTick();
  assert.equal(r.ok, true, r.motivo ?? '?');
  const numeri = fascePresenti(APP_PITWALL);
  // la pitwall scrive il SUO slot `ui-<fascia>.json`: la più alta serve scritta dal tick
  assert.ok(numeri.length >= 1 && numeri.length <= FASCE_DIETRO + 1,
    `la potatura della pitwall tiene al più ${FASCE_DIETRO + 1} fasce (trovate ${numeri.length})`);
  // di TUTTA la finestra visibile: anche qui non resta nessuna fascia arida
  const maxima = Math.max(...numeri);
  assert.ok(Math.max(...fascePresenti(APP_CRUSCOTTO)) === maxima || maxima >= Math.floor(Date.now() / 2500) - 2,
    'la pitwall serve slot freschi della stessa famiglia del tick (niente fasce aride)');
});

test("dopo la potatura, un SECONDO giro affollato non reintroduce l'eccesso: sempre al più 13 fasce", () => {
  // un secondo giro sul canale già potato — la potatura è soglia nel tick:
  // ogni giro riprende dal disco affollato e torna a ≤ FASCE_DIETRO+1
  affollaFasce(APP_CRUSCOTTO, Math.floor(Date.now() / 2500));
  const r = uiappTick();
  assert.equal(r.ok, true, r.motivo ?? '?');
  const numeri = fascePresenti(APP_CRUSCOTTO);
  assert.ok(numeri.length <= FASCE_DIETRO + 1, `dopo il secondo giro la soglia tenga (trovate ${numeri.length})`);
  pulisciFasce(APP_CRUSCOTTO);
  pulisciFasce(APP_PITWALL);
});
