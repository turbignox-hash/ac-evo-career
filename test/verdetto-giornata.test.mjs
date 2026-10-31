// test/verdetto-giornata.test.mjs — il VERDETTO DI GIORNATA (29/10).
// I file dei Results qui sotto sono FINTI ma fedeli allo schema che il
// gioco scrive DAVVERO (posizioni 0-based, avversari con il pallino •,
// best_lap/total_time in formato m:ss.mmm): la stessa strada del rapporto
// di gara — niente dati inventati nel core, la fabbricazione sta SOLO qui
// per riprodurre quella forma. Il tool legge con resultDetail (catalog:
// deduplica + posizioni ufficiali con penalità), quindi anche la
// penalità vera di EVO (high_penalty '+10.0s') deve riflettere in md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verdettoGiornata } from '../tools/verdetto-giornata.mjs';

const DRIVER = { first: 'Mauro', last: 'Turbigno', name: 'Mauro Turbigno', nation: 'ITA' };

/** Una fila di gara come la scrive EVO (0-based, AI con il pallino). */
const fila = (nome, cognome, pos, { best = '01:30.000', total = '05:00.000', penalty = '', me = false, car = ['Ferrari', 'F2004'] } = {}) => ({
  driver_id: { a: String(9000 + pos), b: String(10000 + pos) },
  is_current_driver: !!me,
  position: pos,
  driver_name: me ? driver_name : nome,
  driver_surname: cognome,
  driver_nation: 'ITA',
  team: '',
  car_brand: car[0], car_name: car[1], car_number: pos,
  laps: 4, splits: ['00:30.000', '00:29.500'],
  best_lap: best, total_time: total,
  diff_first: '', diff_previous: '',
  num_pits: 0, penalties: [], high_penalty: penalty,
  ballast: 0, restrictor: 0, has_best_lap: best !== '',
});
const driver_name = 'Mauro';

const scriviGara = (dir, nome, drivers, extra = {}) => {
  writeFileSync(join(dir, nome), JSON.stringify({
    season: 11, event: 'Prova', session: 'Race', track: 'Monza', layout: 'GP',
    weather_type: 'GameModeSelectionWeatherType_CLEAR', hour: 15, min: 20,
    drivers, ...extra,
  }, null, 2));
};

test('verdetto di giornata: due gare → aggregato (vittorie, podi, media, giro migliore) e righe corrette', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  // gara 1: vittoria (pos 0), giro 1:29.240
  scriviGara(dir, '261029-1352_SP_Race.sessionresults.json', [
    fila(driver_name, 'Turbigno', 0, { best: '01:29.240', total: '06:10.000', me: true }),
    fila('Adrian', 'Palmer', 1, { best: '01:29.900', total: '06:12.400' }),
    fila('Ryan', 'Coleman', 2, { best: '01:30.400', total: '06:13.900' }),
  ]);
  // gara 2: terzo posto (pos 2), giro peggiore, penalità +10s che resta nella riga
  scriviGara(dir, '261029-1558_SP_Race.sessionresults.json', [
    fila('Adrian', 'Palmer', 0, { best: '01:28.800', total: '06:00.000' }),
    fila('Ryan', 'Coleman', 1, { best: '01:29.100', total: '06:01.500' }),
    fila(driver_name, 'Turbigno', 2, { best: '01:31.700', total: '06:10.000', me: true, penalty: '+10.0s' }),
    fila('Lukas', 'Zimmermann', 3, { best: '01:32.000', total: '06:11.000' }),
  ]);

  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER, prefix: '261029' });
  assert.equal(v.gare.length, 2, 'due gare del prefisso');
  // LA PENALITÀ NON È SOLO RIGA: officialPositionOf la ricalcola — i +10s
  // mandano il mio 3° di pista a 4° UFFICIALE (media 2.5, podi solo gara 1)
  assert.deepEqual(v.aggregato, { gare: 2, vittorie: 1, podi: 1, mediaPos: 2.5, giroTop: { ms: 89240, pista: 'Monza (GP)' } }, 'aggregato con la penalità ricalcolata: 1 vittoria, 1 podio, media 2.5, giro 1:29.240');
  assert.match(v.md, /13:52.*01:29\.240/s, 'la riga della gara 1 (ora dal nome file) col suo giro');
  assert.match(v.md, /01:31\.700 \(\+10\.0s\)/s, 'la penalità di EVO dentro la cella del giro, non in una colonna a sé');
  assert.match(v.md, /Verdetto di giornata/, 'titolo in italiano (lingua di default)');
  rmSync(dir, { recursive: true, force: true });
});

test('giornata senza gare: messaggio gentile, mai un crash (anche nel PC vergine)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER, prefix: '260101' });
  assert.equal(v.gare.length, 0);
  assert.match(v.md, /Nessuna gara/, "noto che non c'è nulla");
  rmSync(dir, { recursive: true, force: true });
});

test('file illeggibile col prefisso: passa in silenzio, la giornata delle buone rimane', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  writeFileSync(join(dir, '261029-1000_SP_Race.sessionresults.json'), '{ non sono json }');
  scriviGara(dir, '261029-1100_SP_Race.sessionresults.json', [
    fila(driver_name, 'Turbigno', 0, { me: true }),
    fila('Adrian', 'Palmer', 1),
  ]);
  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER, prefix: '261029' });
  assert.equal(v.gare.length, 1, 'il file guasto esce, il buono resta');
  assert.equal(v.gare[0].posto, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('LA PRACTICE NON PAGA (2/11, una sola verità col carriera): gli aggregati vedono solo le gare', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  // practice di mezzogiorno: primo posto in pista NON è una vittoria del verdetto
  scriviGara(dir, '261029-1200_SP_Practice.sessionresults.json', [
    fila(driver_name, 'Turbigno', 0, { best: '01:44.500', total: '03:00.000', me: true }),
    fila('Adrian', 'Palmer', 1),
  ], { session: 'Practice' });
  // la gara del pomeriggio: solo terzo posto in pista — i tempi NON unisoni:
  // con lo stesso total_time la classificazione ufficiale mette alla pari
  scriviGara(dir, '261029-1500_SP_Race.sessionresults.json', [
    fila('Adrian', 'Palmer', 0, { total: '06:00.000' }),
    fila('Ryan', 'Coleman', 1, { total: '06:05.000' }),
    fila(driver_name, 'Turbigno', 2, { total: '06:10.000', me: true }),
  ]);
  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER, prefix: '261029' });
  assert.equal(v.gare.length, 1, 'solo la gara entra nell’aggregato');
  assert.deepEqual(v.aggregato, { gare: 1, vittorie: 0, podi: 1, mediaPos: 3, giroTop: { ms: 90000, pista: 'Monza (GP)' } }, 'la practice P0 non sporca né vittoria né media (3, non 1.5) né giro (1:30.000, non 1:44.500)');
  assert.match(v.md, /Practice/s, 'la practice resta come NOTE, non sparisce');
  assert.match(v.md, /01:44\.500/s, 'il giro della practice nella nota, fuori dal conto');
  rmSync(dir, { recursive: true, force: true });
});

test('giornata di sole practice: messaggio gentile + note, mai un crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  scriviGara(dir, '261029-0900_SP_Practice.sessionresults.json', [
    fila(driver_name, 'Turbigno', 0, { best: '01:45.000', me: true }),
  ], { session: 'Practice' });
  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER, prefix: '261029' });
  assert.equal(v.gare.length, 0);
  assert.match(v.md, /Nessuna gara/, 'nessuna gara, ma la giornata non era vuota');
  assert.match(v.md, /Practice/, 'la practice resta nella nota, non sparisce');
  assert.match(v.md, /01:45\.000/, 'il giro della practice nella nota');
  rmSync(dir, { recursive: true, force: true });
});

test('QUALI IN SEZIONE A PARTE (30/10): la griglia non si mescola alle practice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  // la quali della mattina: i tempi che poi fanno la griglia della gara
  scriviGara(dir, '261029-1000_SP_Qualifying.sessionresults.json', [
    fila(driver_name, 'Turbigno', 0, { best: '01:29.900', me: true }),
    fila('Adrian', 'Palmer', 1, { best: '01:30.400' }),
  ], { session: 'Qualifying' });
  // la practice del pomeriggio: un altro giro, MAI nello stesso blocco
  scriviGara(dir, '261029-1200_SP_Practice.sessionresults.json', [
    fila(driver_name, 'Turbigno', 0, { best: '01:31.200', me: true }),
  ], { session: 'Practice' });
  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER, prefix: '261029' });
  assert.equal(v.gare.length, 0, 'né quali né practice nell’aggregato');
  const re = new RegExp([
    'Qualifiche della giornata, sezione a parte \\(la griglia, non il verdetto\\) \\(1\\):',
    '\\| 10:00 \\| Qualifying \\| Monza \\(GP\\) \\| 01:29\\.900 \\|',
    'Practice della giornata \\(non conta nel verdetto\\) \\(1\\)',
    '\\| 12:00 \\| Practice \\| Monza \\(GP\\) \\| 01:31\\.200 \\|',
  ].join('[\\s\\S]*?'), 's');
  assert.match(v.md, re, 'due sezioni separate, nel giusto ordine');
  rmSync(dir, { recursive: true, force: true });
});

test('righe doppie nel file (persona riciclata su due slot): il verdetto conta UNA volta, come l’import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  // Adrian Palmer ricicla il SUO slot della griglia: due righe, STESSO driver_id,
  // posizioni 1 e 2 — come la griglia doppia di Brand Hatch: 3 righe, 2 persone.
  const adrian = fila('Adrian', 'Palmer', 1);
  scriviGara(dir, '261029-2050_SP_Race.sessionresults.json', [
    fila(driver_name, 'Turbigno', 0, { me: true }),
    adrian,
    { ...adrian, position: 2 },
  ]);
  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER, prefix: '261029' });
  assert.equal(v.gare.length, 1);
  assert.equal(v.gare[0].partecipanti, 2, 'due PERSONE, non tre righe: la stessa deduplica di carriera e archivio');
  assert.equal(v.gare[0].posto, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('SENZA prefisso il verdetto prende OGGI, mai la stringa "undefined" (31/10, «verdetto webui Gare 0»)', () => {
  // La GUI chiama /api/verdetto senza prefisso: l'endpoint passava
  // `prefix: undefined` e la scansione cercava il NOME FILE letterale
  // «undefined…» → «Gare 0 · 0 vittorie · 0 podi» su una giornata piena.
  // Adesso il default aammgg di oggi vive DENTRO la funzione.
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-'));
  const oggi = new Date(); const due = (n) => String(n).padStart(2, '0');
  const prefisso = `${String(oggi.getFullYear()).slice(2)}${due(oggi.getMonth() + 1)}${due(oggi.getDate())}`;
  scriviGara(dir, `${prefisso}-1010_SP_Race.sessionresults.json`, [
    fila(driver_name, 'Turbigno', 0, { me: true }),
    fila('Adrian', 'Palmer', 1),
  ]);
  const v = verdettoGiornata({ paths: { resultsDirs: [dir] }, driver: DRIVER });   // NESSUN prefix
  assert.equal(v.gare.length, 1, 'una gara di OGGI deve contare anche senza prefisso');
  assert.ok(v.aggregato, 'l’aggregato esce (Gare 1 · 1 vittoria · 1 podio)');
  assert.equal(v.aggregato.vittorie, 1);
  rmSync(dir, { recursive: true, force: true });
});
