// 2/11 — IL JOURNAL NOSTRO: il CALENDARIO che non dipende da nessuna app.
// Prima il modulo del calendario (src/app-carriera.mjs), SENZA ponte, dava
// «niente calendario» e la GUI nascondeva la card del calendario a chi NON
// ha l'app del gioco.
// Il contratto del journal nostro (src/journal.mjs + hook in state.mjs):
//   • journalPathForSave  → `evo-calendar[-N].json` accanto al save, per slot;
//   • calendarioDaLadder  → le ronde del ladder col flag `mirror: true`, i
//     track a PAROLE («Oulton Park»), il meteo a parole del GIOCO
//     («Pioggia leggera»), done/next/todo ricavati dai results del save;
//   • mirrorJournal       → RISPECCHIA accanto al save a OGNI saveState
//     (save `evo-career.save[-N].json` → mirror `evo-calendar[-N].json`);
// Isolazione: EVO_DATA_DIR su tmpdir (niente letture della macchina reale) e
// L'unica cosa che tocca del progetto reale è il ladder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// --- sandbox PRIMA di ogni lettura (lezione del 2/11: env PRIMA dell'import) ---
const TREE = mkdtempSync(join(tmpdir(), 'journal-nostro-'));
const DATA = join(TREE, 'dati');
mkdirSync(DATA, { recursive: true });
process.env.EVO_DATA_DIR = DATA;
// App del gioco NON installata: il nido è un percorso che NON esiste (per
// progetto del modulo root=null, nessuna caduta sui journal veri di QUESTA macchina).
const { journalPathForSave, meteoParole,
  calendarioDaLadder, loadLadder } = await import('../src/journal.mjs');
const { appCalendar, appNextRace,
  journalNostroCacheClear, appCacheClear, rondaDelCalendario } =
  await import('../src/app-carriera.mjs');
const { saveState } = await import('../src/state.mjs');

// il ladder NOSTRO (uno per progetto, lo stesso che usano anche gli altri test):
// coppa_citta → Coppa Città, 3 ronde, monomarca Abarth.
const LADDER = JSON.parse(readFileSync('config/career.evo.ladder.json', 'utf8'));
assert.ok(LADDER?.nodes?.length, 'il ladder del progetto è leggibile');

// il save file della sandbox: evo-career.save.json
const SAVE_FILE = join(DATA, 'evo-career.save.json');
const MIRROR_FILE = journalPathForSave(SAVE_FILE);

/* ------------------------------------------------------------------ */
/* il NOMI: il mirror ha il nome del save da cui arriva                */
/* ------------------------------------------------------------------ */

test('journalPathForSave: evo-calendar accanto al save, un nome per slot', () => {
  assert.equal(journalPathForSave(join(DATA, 'evo-career.save.json')), join(DATA, 'evo-calendar.json'));
  assert.equal(journalPathForSave(join(DATA, 'evo-career.save-2.json')), join(DATA, 'evo-calendar-2.json'));
  assert.equal(journalPathForSave(join(DATA, 'evo-career.save-3.json')), join(DATA, 'evo-calendar-3.json'));
  assert.equal(journalPathForSave(''), 'evo-calendar.json');    // niente path → nome di base
});

/* ------------------------------------------------------------------ */
/* la ronda ladder → la ronda alla forma del calendario                    */
/* ------------------------------------------------------------------ */

test('calendarioDaLadder: le ronde del ladder col flag mirror:true', () => {
  const state = { node: 'coppa_citta', season: 1, results: { coppa_citta: [] } };
  const cal = calendarioDaLadder(LADDER, state);
  assert.equal(cal.mirror, true);
  assert.equal(cal.series, 'Coppa Città');
  assert.equal(cal.summary.total, 3);
  assert.equal(cal.summary.done, 0);
  assert.equal(cal.rounds[0].state, 'next');
  assert.equal(cal.rounds[0].track, 'Brands Hatch');
  assert.equal(cal.rounds[0].car, 'abarth 695 biposto');
  assert.equal(cal.rounds[1].track, 'Donington Park');
  assert.equal(cal.rounds[1].weather, 'Nuvole sparse');
  assert.equal(cal.rounds[2].weather, 'Pioggia leggera');
  assert.equal(cal.rounds[0].time, '11:00');     // hour del ladder → «HH:MM»
  assert.equal(cal.rounds[1].time, '14:00');
});

test('meteoParole: le 7 voci dei PRESETS di weather.mjs, custom → Sereno', () => {
  assert.equal(meteoParole(0), 'Sereno');
  assert.equal(meteoParole(1), 'Nuvole sparse');
  assert.equal(meteoParole(3), 'Coperto');
  assert.equal(meteoParole(4), 'Pioggia leggera');
  assert.equal(meteoParole(5), 'Pioggia');
  assert.equal(meteoParole(6), 'Pioggia intensa');
  assert.equal(meteoParole(7), 'Sereno');       // custom l'ha scelto l'utente a mano
  assert.equal(meteoParole(99), 'Sereno');
  assert.equal(meteoParole(null), 'Sereno');
});

test('calendarioDaLadder: i results del save delimitano done/next/todo', () => {
  const state = { node: 'coppa_citta', season: 2, results: { coppa_citta: [
    { season: 2, round: 1, position: 2, points: 20 },
    { season: 2, round: 2, position: 1, points: 25 },
  ] } };
  const cal = calendarioDaLadder(LADDER, state);
  assert.equal(cal.season, 2);
  assert.equal(cal.summary.done, 2);
  assert.equal(cal.rounds[0].state, 'done');
  assert.equal(cal.rounds[1].state, 'done');
  assert.equal(cal.rounds[2].state, 'next');
});

/* ------------------------------------------------------------------ */
/* la scrittura: hook di saveState alla forma del mirror               */
/* ------------------------------------------------------------------ */

test('saveState: il hook al rename scrive evo-calendar accanto al save', () => {
  const state = {
    node: 'coppa_citta', season: 1, driver: 'Coppa Città Prova',
    results: { coppa_citta: [{ season: 1, round: 1, position: 1, points: 25 }] },
  };
  saveState(SAVE_FILE, state);
  assert.ok(existsSync(SAVE_FILE));
  assert.ok(existsSync(MIRROR_FILE));
  const saw = JSON.parse(readFileSync(MIRROR_FILE, 'utf8'));
  assert.equal(saw.mirror, true);
  assert.equal(saw.summary.done, 1);
  assert.equal(saw.rounds[1].state, 'next');
  // Slot 2: mirror proprio sul proprio save, stessa cartella dati
  saveState(join(DATA, 'evo-career.save-2.json'), state);
  assert.ok(existsSync(join(DATA, 'evo-calendar-2.json')));
});

test('saveState: stato senza nodo ladder → niente mirror, nessun throw', () => {
  // il nodo di prova NON esiste: il calendario da ladder non c'è; il hook NON
  // sovrascrive il mirror GIA scritt (il nodo attivo può tornare in futuro).
  const file = join(DATA, 'evo-career.save.json');      // lo slot 1, già salvato sopra
  saveState(file, { node: 'nodo_che_non_esiste', season: 1, results: {} });
  assert.ok(existsSync(MIRROR_FILE));
  // nemmeno un crash da metriche null
  saveState(file, { node: null, results: {} });
  saveState(file, { results: {} });
  assert.ok(existsSync(MIRROR_FILE));
});

/* ------------------------------------------------------------------ */
/* il fall-back del ponte: le viste SI accendono dal mirror            */
/* ------------------------------------------------------------------ */

test('appCalendar: senza ponte e COL mirror → ok:true col mirror:true', () => {
  // Il mirror fresco con DUE gare fatte: la prossima è la 3ª (Oulton Park).
  saveState(SAVE_FILE, {
    node: 'coppa_citta', season: 1, driver: 'Coppa Città Prova',
    results: { coppa_citta: [
      { season: 1, round: 1, position: 1, points: 25 },
      { season: 1, round: 2, position: 2, points: 20 },
    ] },
  });
  appCacheClear();
  journalNostroCacheClear();
  const cal = appCalendar();
  assert.equal(cal.ok, true);
  assert.equal(cal.mirror, true);
  assert.equal(cal.series, 'Coppa Città');
  assert.equal(cal.season, 1);
  assert.ok(Array.isArray(cal.rounds) && cal.rounds.length === 3);
  assert.equal(cal.rounds[1].state, 'done');
});

test('appNextRace: il fall-back porta la scheda della prossima', () => {
  appCacheClear(); journalNostroCacheClear();
  const n = appNextRace();
  assert.equal(n?.ok, true);
  assert.equal(n.track, 'Oulton Park');
  assert.equal(n.laps, 8);            // 3/11: il ladder del progetto porta Oulton a 8 giri (7/7/8) — il test seguiva la foto vecchia
  assert.equal(n.time, '15:00');
  assert.equal(n.weather, 'Pioggia leggera');
  assert.equal(n.round, 3);
  assert.equal(n.done, 2);
});

/* ------------------------------------------------------------------ */
/* IL CERCHIO col MIRROR (2/11): rondaDelCalendario senza app di gioco   */
/* ------------------------------------------------------------------ */

// Il preparatutto e la webui chiedono al calendario NOSTRO (mirror) la stessa
// cosa che chiedevano al calendario: la ronda «next» con pista id,
// meteo e orari già tradotti. Senza app, la ronda DEVE arrivare dal mirror —
// con le DUE scale del meteo distinte (weather → ladder, idPreset → preset).
test('rondaDelCalendario: col MIRROR (senza app) la ronda «next» è quella del journal nostro', () => {
  const ladder = loadLadder();
  const node = (ladder?.nodes ?? []).find((nd) => nd?.nodeId === 'coppa_citta');
  assert.ok(node, 'il ladder del progetto ha il nodo coppa_citta');
  appCacheClear(); journalNostroCacheClear();
  const pd = rondaDelCalendario(node);
  assert.ok(pd, 'senza app il fall-back mirror porta comunque la ronda attiva');
  // la TERZA ronda (2 risultati fatti nella stagione 1) è Oulton Park
  assert.equal(pd.trackId, 'oulton_park');
  assert.equal(pd.pistaParola, 'Oulton Park');       // la parola che il mirror portava
  assert.equal(pd.n, 3);
  assert.equal(pd.laps, 8);            // 3/11: Oulton 8 giri nel ladder (7/7/8) — allineato alla verità del disco
  assert.equal(pd.meteoParola, 'Pioggia leggera');
  assert.equal(pd.hour, 15);
  assert.equal(pd.minute, 0);
  // «Pioggia leggera»: id scala LADDER 3 (per round.weather), preset 4 (per setWeatherPreset)
  assert.equal(pd.weather, 3);
  assert.equal(pd.idPreset, 4);
  assert.equal(pd.meteoParola, 'Pioggia leggera');
  assert.equal(pd.spia, 'wet');                      // la pioggia ha la spia bagnata
  assert.equal(pd.statoRonda, 'next');
  assert.equal(pd.serie, 'Coppa Città');
  assert.equal(pd.stagione, 1);
});
test('rondaDelCalendario: SENZA mirror E senza app → null (nessuna ronda inventata)', () => {
  const vuota = mkdtempSync(join(tmpdir(), 'ronda-cal-vuoto-'));
  process.env.EVO_DATA_DIR = vuota;
  appCacheClear(); journalNostroCacheClear();
  const ladder = loadLadder();
  const node = (ladder?.nodes ?? []).find((nd) => nd?.nodeId === 'coppa_citta');
  assert.equal(rondaDelCalendario(node), null);
  process.env.EVO_DATA_DIR = DATA;
  journalNostroCacheClear();
  appCacheClear();
});
