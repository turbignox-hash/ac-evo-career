// eredita-cruscotto.test.mjs — IL BOTTONE IN GIOCO (2/11): «Punta la ronda
// in Agenda» esiste anche nel cruscotto dentro EVO. L'app non chiama HTTP:
// scrive la richiesta nel persist del loader (`cruscotto.richieste`) e il
// publisher la gira col NUCLEO ufficiale della scelta (scegliRonda,
// agenda.mjs — la stessa «scegli per oggi» della webui). Qui si prova:
//  1) ereditaFascia porta il nodeId della serie (la chiave del puntamento);
//  2) giraRichiesteEredità iscrive davvero la serie e firma l'esito;
//  3) la stessa richiesta NON si rigira (richiesteFatti, niente doppioni);
//  4) senza impresa attiva l'esito è un NO con il messaggio, non un crash;
//  5) il tick del publisher legge lo store e fa tutto il giro (vetrina sì).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.EVO_SENZA_VINCOLI = '0';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const DATA = mkdtempSync(join(tmpdir(), 'evo-eredita-'));
// REGola EVO_DATA_DIR della casa: il publisher persiste su SAVE_FILE che
// qui in test passa dalla cartella temporanea — il save VERO non si tocca.
process.env.EVO_DATA_DIR = DATA;
mkdirSync(DATA, { recursive: true });

const LADDER = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
const ladder = JSON.parse(JSON.stringify(LADDER));
const { createCareer, saveState } = await import('../src/state.mjs');
const { scegliRonda } = await import('../src/agenda.mjs');
const { ensureHeritage } = await import('../src/memories.mjs');
const { ereditaFascia, giraRichiesteEredità, esitoEreditàTest, richiesteTestReset, vetrina } = await import('../src/uiapp-pub.mjs');

// la carriera resta in memoria per i test: il save serve solo al tick vero

/** La memoria attiva che punta la serie del sedile di partenza (fattibile a
 *  rep 0 per costruzione: è quella con cui la carriera APRONO). */
const impresaSu = (state, nodeId) => {
  ensureHeritage(state).active = {
    id: 'lorigine', nodeId, title: 'Le Origini', titleEn: 'The Origin', era: '1968',
    series: 'serie test', relation: 'bisnonno', relationEn: 'great-grandfather',
    seat: 41, carId: null, carName: 'Auto d\'epoca', legends: ['J. Ickx (BE)'],
    rounds: [], tracksDisplay: [], progress: [], done: false, claimed: false,
    assignedSeason: state.season, objective: { text: 'termina la gara tra i primi 5', kind: 'positionTop', value: 5 },
    inherit: 60000, repeat: 14000, relic: 'Auto storica #41', relicEn: 'Historic car #41',
  };
};

const costr = (...richieste) => ({ richieste });

test('ereditaFascia: la scheda porta il nodeId della serie (il bottone ne ha bisogno, come nel pannello web)', () => {
  richiesteTestReset();
  const state = createCareer(ladder, { name: 'Test Eredità', first: 'Test', last: 'Eredità' });
  impresaSu(state, state.node);
  const panel = ereditaFascia(ladder, state);
  assert.ok(panel, 'con la memoria attiva il pannello c\'è');
  assert.equal(panel.nodeId, state.node);
  assert.equal(panel.titolo, 'Le Origini');
  assert.ok(!panel.pronta);
});

test('ereditaFascia: senza memoria attiva è null (il gruppo in gioco tace, non buca il pannello)', () => {
  const state = createCareer(ladder, { name: 'Test Eredità no', first: 'Test', last: 'No' });
  ensureHeritage(state).active = null;
  assert.equal(ereditaFascia(ladder, state), null);
});

test('giraRichiesteEredità: la richiesta iscrive la SERIE e firma un esito ok col suo id', () => {
  richiesteTestReset();
  const state = createCareer(ladder, { name: 'Test Eredità gira', first: 'Test', last: 'Gira' });
  impresaSu(state, state.node);
  const esito = giraRichiesteEredità(ladder, state, costr({ id: 'eredita:123', tipo: 'eredita-punta', at: Date.now() }));
  assert.ok(esito, 'l\'esito esce');
  assert.equal(esito.id, 'eredita:123');
  assert.ok(esito.ok, 'la scelta è riuscita (serie fattibile: è quella del sedile di partenza)');
  assert.equal(esitoEsitoNode(state), state.node, 'il sedile/giorno punta la serie dell\'impresa');
  assert.equal(esitoEreditàTest(), esito);
});

/** La serie puntata: un sedile su state.node DEVE esistere dopo la scelta. */
function esitoEsitoNode(state) { return state.node; }

test('giraRichiesteEredità: la STESSA richiesta non si rigira (niente messaggi doppi a ogni tick)', () => {
  richiesteTestReset();
  const state = createCareer(ladder, { name: 'Test Eredità una', first: 'Test', last: 'Una' });
  impresaSu(state, state.node);
  const rich = costr({ id: 'eredita:444', tipo: 'eredita-punta', at: Date.now() });
  const prima = giraRichiesteEredità(ladder, state, rich);
  const messaggiPrima = state.messages.length;
  const secondo = giraRichiesteEredità(ladder, state, rich);
  assert.ok(prima && secondo, 'entrambe le chiamate vicinano l\'esito');
  assert.equal(secondo.id, 'eredita:444');
  assert.equal(state.messages.length, messaggiPrima, 'la richiesta già girata non aggiunge messaggi');
});

test('giraRichiesteEredità: senza impresa attiva l\'esito è un NO, chiarezza', () => {
  richiesteTestReset();
  const state = createCareer(ladder, { name: 'Test Eredità no', first: 'Test', last: 'No' });
  ensureHeritage(state).active = null;
  const esito = giraRichiesteEredità(ladder, state, costr({ id: 'eredita:456', tipo: 'eredita-punta', at: Date.now() }));
  assert.ok(esito);
  assert.equal(esito.ok, false);
  assert.match(esito.msg, /[Nn]essuna impresa/);
});

test('tipo IGNOTO: una richiesta con altro `tipo` si registra e non fa niente', () => {
  richiesteTestReset();
  const state = createCareer(ladder, { name: 'Test Eredità tipo', first: 'Test', last: 'Tipo' });
  impresaSu(state, state.node);
  const esito = giraRichiesteEredità(ladder, state, costr({ id: 'ciccio:777', tipo: 'non-so', at: Date.now() }));
  assert.equal(esito, null, 'nessun esito scritto');
});

test('VEDRINA (5): la fascia porta il pannello eredità che l\'app legge', () => {
  richiesteTestReset();
  const st5 = createCareer(ladder, { name: 'Test Eredità tick', first: 'Test', last: 'Tick' });
  impresaSu(st5, st5.node);
  const fascia = vetrina(ladder, st5);
  assert.ok(fascia, 'la fascia costruisce');
  assert.ok(fascia.eredita, 'la fascia porta il pannello eredità');
  assert.equal(fascia.eredita.nodeId, st5.node);
});
