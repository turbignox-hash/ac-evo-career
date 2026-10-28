// 2/11 — LA STAMPA DEL PADDOCK senza strumento: review.mjs (la rassegna di fine
// stagione, nido per-slot) e gazzetta.mjs (titoli e citazioni deterministici)
// avevano ZERO test unit. Entrambi leggono/scrivono SOLO dentro EVO_DATA_DIR
// (impostata qui PRIMA dell'import, come fa rivals.test): i dati veri del
// progetto non vengono mai toccati. La gazzetta è dichiarata «deterministica:
// stesso risultato, stessa pagina» — qui lo si prova.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'evo-stampa-'));
process.env.EVO_DATA_DIR = DATA;
const { seasonReview } = await import('../src/review.mjs');
const { publishRaceNews, publishNotice, newsFeed, resetNews, seasonPress } = await import('../src/gazzetta.mjs');

const ladder = {
  disciplines: [],
  nodes: [{ nodeId: 'coppa', display: 'Coppa Città', calendar: [{}, {}, {}, {}], econ: {} }],
  contentNames: { tracks: { monza_a: 'Monza', imola: 'Imola' }, cars: {} },
};
const g1 = { season: 1, round: 0, nodeId: 'coppa', track: 'monza_a', position: 1, points: 25, prize: 3000, dnf: false, pole: true, fl: true, bestLap: '01:32.1' };
const g2 = { season: 1, round: 1, nodeId: 'coppa', track: 'imola', position: 3, points: 14, prize: 1200, dnf: false, gapMs: 1200 };
const g3 = { season: 1, round: 2, nodeId: 'coppa', track: 'monza_a', position: 0, points: 0, prize: 0, dnf: true };
const g4 = { season: 2, round: 0, nodeId: 'coppa', track: 'monza_a', position: 2, points: 18, prize: 2000, dnf: false };
const mkState = (results) => ({
  node: 'coppa', season: 2, results: { coppa: results },
  seasons: [{ season: 1, node: 'coppa', champion: true, position: 1, points: 39 }, { season: 2, node: 'coppa', position: 2, points: 18 }],
});

/* il registro dei rivali: due gare in stagione 1, con il duello deciso */
const store = {
  races: [
    { season: 1, grid: [
      { key: 'k-me', full: 'Mauro Turbigno', isPlayer: true, position: 1, dnf: false },
      { key: 'k-r1', full: 'Antoine Laisne', team: 'BK', position: 2, dnf: false },
      { key: 'k-r2', full: 'Luca Bianchi', position: 4, dnf: false },
    ] },
    { season: 1, grid: [
      { key: 'k-me', full: 'Mauro Turbigno', isPlayer: true, position: 3, dnf: false },
      { key: 'k-r1', full: 'Antoine Laisne', team: 'BK', position: 1, dnf: false },
      { key: 'k-r3', full: 'Paolo Verdi', position: 9, dnf: true },
    ] },
  ],
};

test('seasonReview: i conti della stagione e il duello dell\'anno dal registro rivali', () => {
  writeFileSync(join(DATA, 'rivals.json'), JSON.stringify(store), 'utf8');
  const r = seasonReview(ladder, mkState([g1, g2, g3, g4]), { season: 1 });
  assert.deepEqual(r.stats, { races: 3, wins: 1, podiums: 2, poles: 1, fls: 1, dnfs: 1, points: 39, prize: 4200 });
  assert.equal(r.champion, true);
  assert.equal(r.position, 1);
  // il duello: chi mi incrocia più spesso (Antoine 2 scontri, 1-1)
  assert.equal(r.duello.name, 'Antoine Laisne');
  assert.equal(r.duello.beatenByMe, 1);
  assert.equal(r.duello.beatenMe, 1);
  // la gara sparata (gap 1,2\") e le piste con nome tradotto
  assert.ok(r.close.some((c) => c.track === 'imola'));
  assert.ok(r.text.includes('# Stagione 1 — Coppa Città'));
  assert.ok(r.text.includes('🏆 **CAMPIONE**'));
  assert.ok(r.text.includes('Duello dell\'anno**: Antoine Laisne'));
});

test('seasonReview senza registro rivali: la rassegna esce comunque (silenzio, non crash)', async () => {
  const DATA2 = mkdtempSync(join(tmpdir(), 'evo-stampa2-'));
  process.env.EVO_DATA_DIR = DATA2;
  // nuovo import con il nido diverso (await nel corpo del test, è async)
  const m = await import(`../src/review.mjs?bust=${Date.now()}`);
  const r = m.seasonReview(ladder, mkState([g1, g2]), { season: 1 });
  assert.equal(r.rivals.length, 0);
  assert.equal(r.duello, null);
  process.env.EVO_DATA_DIR = DATA;   // resto del test sul nido principale
});

test('exportReview scrive data/journal/stagione-N.md e la seconda rassegna lo riprende', async () => {
  const DATA3 = mkdtempSync(join(tmpdir(), 'evo-stampa3-'));
  process.env.EVO_DATA_DIR = DATA3;
  const m = await import(`../src/review.mjs?bust3=${Date.now()}`);
  const r = m.seasonReview(ladder, mkState([g1, g2]), { season: 1 });
  const file = m.exportReview(r);
  assert.ok(readFileSync(file, 'utf8').includes('Stagione 1'));
  // stessa stagione: la rassegna ANNUNCIA il file già esportato
  const r2 = m.seasonReview(ladder, mkState([g1, g2]), { season: 1 });
  assert.equal(r2.file, file);
  //-season: le stagioni possibili = chiuse + corrente, la più recente prima
  const list = m.reviewableSeasons(mkState([g1, g2]));
  assert.ok(list.includes(1) && list.includes(2));
  process.env.EVO_DATA_DIR = DATA;
});

/* ------------------------------------------------------------------ */
/* gazzetta: gli stessi dati fan la STESSA pagina                       */
/* ------------------------------------------------------------------ */

const ctx = (entry, extra = {}) => ({
  ladder, node: ladder.nodes[0],
  state: { season: 1, driver: { first: 'Mauro' } },
  entry,
  rivals: [
    { key: 'k-r1', name: 'Antoine Laisne', h2h: { losses: 3 } },
    { key: 'k-r2', name: 'Luca Bianchi', h2h: { losses: 2 } },
  ],
  beaten: ['Antoine Laisne', 'Luca Bianchi'],
  beatMe: [],
  trackDisplay: 'Monza',
  ...extra,
});

test('gazzetta: grand chelem, ritiro e la pagina che NON cambia rifacendo il round', () => {
  resetNews();
  const chelem = publishRaceNews(ctx({ round: 2, position: 1, dnf: false, pole: true, fl: true }));
  assert.ok(chelem.title.includes('GRANDE CHELEM A MONZA'));
  assert.equal(chelem.outcome, 'P1');
  const ritiro = publishRaceNews(ctx({ round: 3, position: 0, dnf: true }));
  assert.equal(ritiro.outcome, 'dnf');
  assert.ok(ritiro.title.includes('ritiro'));
  // il feed: la più recente prima; la citazione è DETERMINISTICA sul round
  const feed = newsFeed();
  assert.equal(feed[0].title, ritiro.title);
  assert.equal(feed[1].title, chelem.title);
  resetNews();
  const again = publishRaceNews(ctx({ round: 2, position: 1, dnf: false, pole: true, fl: true }));
  assert.equal(again.title, chelem.title);
  assert.equal(again.body, chelem.body, 'stesso risultato, stessa pagina');
});

test('gazzetta: il battuto di sempre ottiene la voce, e chi mi taglia il traguardo risponde', () => {
  resetNews();
  // vittoria con 2 battuti con h2h.losses ≥ 2: la vittima di sempre parla
  const v = publishRaceNews(ctx({ round: 0, position: 1, dnf: false }));
  assert.ok(v.body.length > 40);
  // qualcuno mi batte: il "culprit" chiude davanti nel body
  const lost = publishRaceNews(ctx({ round: 4, position: 2, dnf: false }, { beaten: [], beatMe: ['Antoine Laisne'] }));
  assert.ok(/chiude davanti: conto in sospeso/.test(lost.body), `body: ${lost.body}`);
});

test('gazzetta: il foglio si riempie fino a 80 voci, le notice con kind proprio', () => {
  resetNews();
  for (let i = 0; i < 85; i++) publishNotice(`Notizia ${i}`, 'corpo', { season: 1 });
  const feed = newsFeed(999);
  assert.equal(feed.length, 80, 'il taglio storico: 80 voci, i vecchi scaricati');
  resetNews();
  publishNotice('Contratto firmato', 'fabbrica', { season: 1, kind: 'contract' });
  const after = newsFeed(1)[0];
  assert.equal(after.kind, 'contract');
  assert.equal(after.title, 'Contratto firmato');
});

/* ------------------------------------------------------------------ */
/* titoli per-round (28/10): lo storico decide, niente dado             */
/* ------------------------------------------------------------------ */

test('gazzetta: titoli per round — pole buttata e ritiri in serie', () => {
  resetNews();
  const p = publishRaceNews(ctx({ round: 1, position: 0, dnf: true, pole: true }));
  assert.ok(p.title.includes('LA POLE BUTTATA'));
  // un ritiro non basta per la serie, due di fila sì
  const st = { season: 1, driver: { first: 'Mauro' }, results: { coppa: [
    { season: 1, round: 0, dnf: true }, { season: 1, round: 1, dnf: true },
  ] } };
  const serie = publishRaceNews(ctx({ round: 2, position: 0, dnf: true }, { state: st }));
  assert.ok(serie.title.includes('BRUTTA SERIE'));
  assert.ok(serie.title.includes('3 ritiri consecutivi'));
  assert.ok(!p.title.includes('BRUTTA SERIE'), 'un ritiro solo resta il titolo semplice');
});

test('gazzetta: il ritorno dal box e le vittorie di fila', () => {
  // vittoria subito dopo il ritiro
  const st1 = { season: 1, driver: { first: 'Mauro' }, results: { coppa: [{ season: 1, round: 0, dnf: true }] } };
  const back = publishRaceNews(ctx({ round: 1, position: 1, dnf: false }, { state: st1 }));
  assert.ok(back.title.includes('RITORNO DAL BOX'));
  // due vittorie di fila
  const st2 = { season: 1, driver: { first: 'Mauro' }, results: { coppa: [
    { season: 1, round: 0, dnf: false, position: 1 },
  ] } };
  const fila = publishRaceNews(ctx({ round: 1, position: 1, dnf: false }, { state: st2 }));
  assert.ok(fila.title.includes('DUE DI FILO'));
});

test('gazzetta: prima vittoria sulla pista e primo gradino della stagione', () => {
  const st = { season: 1, driver: { first: 'Mauro' }, results: { coppa: [
    { season: 1, round: 0, dnf: false, position: 3, track: 'monza_a' },
  ] } };
  const prima = publishRaceNews(ctx({ round: 4, position: 1, dnf: false, track: 'imola' }, { state: st, trackDisplay: 'Imola' }));
  assert.ok(prima.title.includes('PRIMA VOLTA A IMOLA'));
  // no podi prima di oggi: il titolo cambia gradino
  const st5 = { season: 1, driver: { first: 'Mauro' }, results: { coppa: [
    { season: 1, round: 0, dnf: false, position: 5, points: 6 },
  ] } };
  const first = publishRaceNews(ctx({ round: 1, position: 3, dnf: false }, { state: st5 }));
  assert.ok(first.title.includes('IL PRIMO GRADINO'));
});

test('gazzetta: podio a serie e titoli deterministici sul re-runa', () => {
  const st = { season: 1, driver: { first: 'Mauro' }, results: { coppa: [
    { season: 1, round: 0, dnf: false, position: 2 },
    { season: 1, round: 1, dnf: false, position: 2 },
    { season: 1, round: 2, dnf: false, position: 3 },
  ] } };
  const serie = publishRaceNews(ctx({ round: 3, position: 2, dnf: false }, { state: st }));
  assert.ok(serie.title.includes('PODIO A SERIE'));
  assert.ok(serie.title.includes('4 podi consecutivi'));
  // stesso storico, stessa pagina: rifare la ronda non cambia titolo né body
  resetNews();
  const a = publishRaceNews(ctx({ round: 1, position: 1, dnf: false }, { state: st1Like() }));
  resetNews();
  const b = publishRaceNews(ctx({ round: 1, position: 1, dnf: false }, { state: st1Like() }));
  assert.equal(b.title, a.title, 'stesso storico, stesso titolo');
  assert.equal(b.body, a.body);    function st1Like() {
    return { season: 1, driver: { first: 'Mauro' }, results: { coppa: [{ season: 1, round: 0, dnf: true }] } };
  }
});

/* ------------------------------------------------------------------ */
/* LA GAZZETTA DI STAGIONE: il volume che rilega i titoli dell'anno    */
/* ------------------------------------------------------------------ */

test('gazzetta di stagione: i titoli del foglio tornano in ordine di round, DETERMINISTICI', () => {
  resetNews();
  publishRaceNews(ctx({ round: 0, position: 1, dnf: false, pole: true, fl: true })); // chelem
  publishRaceNews(ctx({ round: 1, position: 3, dnf: false }));
  publishRaceNews(ctx({ round: 2, position: 0, dnf: true }));
  const p = seasonPress({ season: 1 });
  assert.equal(p.season, 1);
  assert.equal(p.races, 3, 'le tre gare della stagione entrano nel volume');
  assert.equal(p.wins, 1, 'una vittoria (il chelem)');
  assert.equal(p.podiums, 2, 'P1 + P3: due podi');
  assert.equal(p.dnf, 1, 'un ritiro');
  // in ordine di round: R0, R1, R2
  assert.deepEqual(p.heads.map((h) => h.round), [0, 1, 2]);
  assert.ok(p.heads[0].title.includes('GRANDE CHELEM A MONZA'));
  assert.ok(p.heads[2].title.includes('ritiro'));
  // DETERMINISTICO: stessa stampa, stesso titolo, stesso foglio
  const again = seasonPress({ season: 1 });
  assert.equal(again.races, p.races);
  assert.deepEqual(again.heads, p.heads, 'stesso anno, stessa pagina');
});

test('gazzetta di stagione: senza news il volume esce comunque (silenzioso, non crash)', () => {
  resetNews();
  const p = seasonPress({ season: 1 });
  assert.equal(p.races, 0);
  assert.deepEqual(p.heads, [], 'nessun titolo, nessuna pagina');
  assert.deepEqual(p.wins, 0);
});
