// eredita-cruscotto.test.mjs — IL BOTTONE IN GIOCO (2/11): «Punta la ronda
// in Agenda» esiste anche nel cruscotto dentro EVO. L'app non chiama HTTP:
// scrive la richiesta nel persist del loader (`cruscotto.richieste`) e il
// publisher la gira col NUCLEO ufficiale della scelta (scegliRonda,
// agenda.mjs — la stessa «scegli per oggi» della webui). Qui si prova:
//  1) ereditaFascia porta il nodeId della serie (la chiave del puntamento);
//  2) giraRichiesteEredità iscrive davvero la serie e firma l'esito — e qui
//     gli si guardano gli EFFETTI OSSERVABILI (sedile, ronda, scelte del
//     giorno, messaggi, save su disco), non sé stesso;
//  3) la stessa richiesta NON si rigira (richiesteFatti, niente doppioni);
//  4) senza impresa attiva l'esito è un NO con il messaggio, non un crash;
//  5) il tick del publisher legge lo store e fa tutto il giro (vetrina sì).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
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
const { createCareer } = await import('../src/state.mjs');
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

test('giraRichiesteEredità: la richiesta iscrive DAVVERO la serie (effetti osservabili, non un assert su sé stesso)', async () => {
  richiesteTestReset();
  const { racesOnDay, choicesForDay, agendaDay } = await import('../src/agenda.mjs');
  const { SAVE_FILE } = await import('../src/webui-env.mjs');
  const state = createCareer(ladder, { name: 'Test Eredità gira', first: 'Test', last: 'Gira' });
  const oggi = agendaDay(state);
  const partenza = state.node;
  // La serie dell'impresa DEVE essere un'ALTRA da quella del sedile: se sono
  // la stessa, scegliRonda prende la scorciatoia «già scelto» e il puntamento
  // non si vede — era esattamente il difetto del vecchio assert, che
  // confrontava `state.node` con `state.node` (sempre vero, qualunque cosa
  // facesse giraRichiesteEredità). La candidata si cerca come la cerca il
  // nucleo: giorni da oggi a +7, nell'ordine di racesOnDay — così l'attesa è
  // esatta e non un «basta che qualcosa cambi».
  let target = null;
  for (let d = oggi; d <= oggi + 7 && !target; d++) {
    for (const g of racesOnDay(ladder, state, d)) {
      if (g.node.nodeId !== partenza && g.fattibile) { target = { ...g, day: d }; break; }
    }
  }
  assert.ok(target, 'la ladder deve offrire una seconda serie fattibile nella settimana: senza, il test non proverebbe niente');
  impresaSu(state, target.node.nodeId);
  const messaggiPrima = state.messages.length;

  const esito = giraRichiesteEredità(ladder, state, costr({ id: 'eredita:123', tipo: 'eredita-punta', at: Date.now() }));

  // 1) la risposta al bottone dice cosa è successo, con la ronda giusta
  assert.ok(esito, 'l\'esito esce');
  assert.equal(esito.id, 'eredita:123');
  assert.ok(esito.ok, `la scelta è riuscita: ${esito.msg}`);
  assert.match(esito.msg, /Le Origini/);
  assert.match(esito.msg, new RegExp(`R${target.index + 1}\\b`), `la ronda nel messaggio: ${esito.msg}`);
  assert.equal(esitoEreditàTest(), esito);
  // 2) il SEDILE si è spostato sulla serie dell'impresa, sulla ronda di quel giorno
  assert.notEqual(state.node, partenza, 'il sedile lascia la serie di prima');
  assert.equal(state.node, target.node.nodeId, 'il sedile punta la serie dell\'impresa');
  assert.equal(state.round, target.index, 'la ronda è quella che il calendario assegna a quella serie quel giorno');
  assert.equal(state.seats?.[target.node.nodeId]?.day, target.day, 'la cadenza del sedile nuovo parte dal giorno della gara');
  // 3) la scelta resta A REGISTRO nel giorno (è il conto del cap giornaliero)
  assert.ok(choicesForDay(state, target.day).includes(target.node.nodeId),
    `la scelta del giorno ${target.day} è a registro: ${JSON.stringify(choicesForDay(state, target.day))}`);
  // 4) i messaggi che l'utente legge davvero: la serie e la sua ronda
  const nuovi = state.messages.slice(messaggiPrima).map((m) => m.text);
  assert.ok(nuovi.some((t) => t.includes(target.node.display) && new RegExp(`R${target.index + 1}\\b`).test(t)),
    `la scelta della gara è annunciata: ${JSON.stringify(nuovi)}`);
  // 5) il tick ha PERSISTITO: la scelta è anche nel save su disco, non solo in memoria
  const salvato = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
  assert.equal(salvato.node, target.node.nodeId, 'il save su disco porta il sedile nuovo');
  assert.equal(salvato.round, target.index);
  assert.ok((salvato.agenda?.choices?.[target.day] ?? []).includes(target.node.nodeId), 'il save porta la scelta del giorno');
});

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

// 3/11 — OTTAVO GIRO: la fascia porta anche la guardia (battito + lezione):
// stessa riga del CLI `status`, adesso anche nel cruscotto dentro il gioco.
test('VEDRINA (5-bis): la fascia porta la guardia — viva o ferma, con l\'ultima lezione del battito', async () => {
  richiesteTestReset();
  const st6 = createCareer(ladder, { name: 'Test Eredità guardia', first: 'Test', last: 'Guardia' });
  const fascia = vetrina(ladder, st6);
  assert.ok(fascia, 'la fascia costruisce');
  // (3/11, ottavo giro) senza battito: la voce esiste SEMPRE e il pannello
  // la disegna solo se c'è — le fasce vecchie non rompono niente.
  assert.ok('alive' in fascia.guardia, 'la voce guardia esiste nella fascia');
  const { heartbeat } = await import('../src/watch.mjs');
  heartbeat(15, { dizionario: { msg: '1 auto nuova dal menu', at: new Date().toISOString() } });
  const g = vetrina(ladder, st6).guardia;
  assert.equal(g.alive, true, 'con battito fresco la guardia risulta viva');
  assert.equal(g.diz, '1 auto nuova dal menu', 'la lezione del battito arriva in fascia');
  assert.ok(g.ageMs >= 0, 'il tempo dal battito è storicizzato');
});
