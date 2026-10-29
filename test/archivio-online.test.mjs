// 2/11 — L'ARCHIVIO ONLINE senza un'unità di prova: il tab Online e il libro
// dei rivali vivono di regole delicate (identità dal driver_id, righe doppie
// riciclate dai server, base 0/1 delle posizioni, il bug «tutti te» delle
// qualifiche) fin qui coperte SOLO in superficie dallo smoke del webui.
// Qui il contratto completo di catalog.mjs: onlineArchive e resultDetail su
// una griglia _MP_ sintetica in una cartella Results di sacrificio.
// Zero I/O del gioco: la data viene dal NOME del file (YYMMDD-HHMM), com'è
// nel gioco vero — i test non dipendono da mtime né da adesso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const Results = mkdtempSync(join(tmpdir(), 'evo-mp-'));
const paths = { resultsDirs: [Results] };
const DRIVER = { name: 'Mauro Turbigno', first: 'Mauro', last: 'Turbigno' };

const { isMpResultFile, onlineArchive, resultDetail } = await import('../src/catalog.mjs');

/* Il pilota di una riga, nel formato che EVO chiude nei file _MP_. */
const riga = ({ nome, cognome, pos, id = null, me = false, laps = 8, best = null, tot = null, car = ['Ferrari', '296 GT3'] }) => ({
  driver_name: nome, driver_surname: cognome, position: pos, laps,
  best_lap: best, total_time: tot, num_pits: 0,
  is_current_driver: me,
  ...(id ? { driver_id: id } : {}),
  car_brand: car[0], car_name: car[1],
});

/* Gara 1 — posizioni one-based (vincitore = position 1), il flag del gioco
   parla SOLO di me (via sana). Community = season, layout GP. */
const gara1 = {
  session: 'Race', event: ':: Bremskiller.de - Rennstrecke',
  season: ':: Bremskiller.de - Rennstrecke',
  track: 'Monza', layout: 'GP', weather_type: 'WeatherType_Clear', hour: 17,
  drivers: [
    riga({ nome: 'Mauro', cognome: 'Turbigno', pos: 1, id: { a: 'mt1', b: 'x' }, me: true, laps: 11, best: '01:32.259', tot: '17:30.541' }),
    riga({ nome: 'Antoine', cognome: 'Laisne', pos: 2, id: { a: 'r9', b: 'k' }, tot: '17:34.792' }),
    riga({ nome: 'Luca', cognome: 'Bianchi', pos: 3, tot: '17:44.000', car: ['BMW', 'M4 GT3'] }),
  ],
};

/* Gara 2 — posizioni zero-based (0 = vincitore, il formato del server vero) e
   il DOPPIO NICKNAME: la STESSA identità r9 con due nomi in riga (TOINE e
   Antoine Laisne) — le righe doppie che i server riciclano, da contare UNA
   volta. Tutti col flag is_current_driver (il bug delle qualifiche «tutti
   te»): qui il riconoscimento DEVE passare per il nome. */
const gara2 = {
  session: 'Race', event: 'Westpfalz-Racers - Retro Street Car',
  season: 'German / Deutsch Westpfalz-Racers - Retro Street Car',
  track: 'Monza', layout: 'GP', weather_type: 'WeatherType_Rain', hour: 14,
  drivers: [
    riga({ nome: 'TOINE', cognome: '', pos: 0, id: { a: 'r9', b: 'k' }, me: true, tot: '15:00.000' }),
    riga({ nome: 'Antoine', cognome: 'Laisne', pos: 1, id: { a: 'r9', b: 'k' }, me: true, tot: '15:02.000' }),
    riga({ nome: 'Mauro', cognome: 'Turbigno', pos: 2, id: { a: 'mt1', b: 'x' }, me: true, best: '01:31.900', tot: '15:10.000' }),
    riga({ nome: 'luca', cognome: 'BIANCHI', pos: 3, me: true, tot: '15:40.000', car: ['BMW', 'M4 GT3'] }),
  ],
};

/* Una gara SP: NON deve entrare nell'archivio online (la salvaguardia del
   tab è il tag _MP_, se vacilla verrebbero gare di carriera nel libro). */
const garaSp = {
  session: 'Race', event: 'Carrera Coppa', season: 'Carrera Coppa',
  track: 'Imola', layout: '', drivers: [riga({ nome: 'Mauro', cognome: 'Turbigno', pos: 1, me: true, laps: 9 })],
};

const scrivi = (nome, obj) => writeFileSync(join(Results, nome), JSON.stringify(obj), 'utf8');
scrivi('260416-2108_MP_Race.sessionresults.json', gara1);
scrivi('260417-1936_MP_Race.sessionresults.json', gara2);
scrivi('260415-1800_SP_Race.sessionresults.json', garaSp);

const isMp = isMpResultFile('260416-2108_MP_Race.sessionresults.json');
const ordinaIncroci = (e) => [...e.names].sort();

test('isMpResultFile: il tag _MP_ decide, _SP_ no', () => {
  assert.ok(isMp);
  assert.ok(!isMpResultFile('260415-1800_SP_Race.sessionresults.json'));
  assert.ok(!isMpResultFile(null));
});

test('offline separato online: le sessioni SP non entrano, le righe _MP_ sì e sono complete', () => {
  const arch = onlineArchive(paths, { driver: DRIVER });
  assert.equal(arch.total, 2, 'due file _MP_, la gara SP fuori');
  assert.ok(!arch.rows.some((r) => r.file.includes('_SP_')), 'nessuna riga SP nell’archivio online');
  // le righe più nuove prima; la data VERA dal nome del file (YYMMDD-HHMM, in
  // ora locale: l'ISO la rende UTC, quindi si prova sul GIORNO anche col fuso)
  assert.equal(arch.rows[0].file, '260417-1936_MP_Race.sessionresults.json');
  assert.ok(arch.rows[0].when.startsWith('2026-04-17'), `data dal nome, ricevuto ${arch.rows[0].when}`);
  assert.equal(arch.rows[0].community, gara2.season, 'la community (season) nella riga');
  assert.equal(arch.rows[0].session, 'Race');
  assert.equal(arch.rows[0].track, 'Monza');
  assert.equal(arch.rows[0].weather, 'Rain', 'meteo ripulito dal prefisso WeatherType_');
  assert.equal(arch.rows[0].winner, 'TOINE', 'vincitore = position 0 nel formato zero-based');
});

test('io in gara: flag del gioco quando vale, riconoscimento per nome quando il bug lo rende generico', () => {
  const arch = onlineArchive(paths, { driver: DRIVER });
  const [file2, file1] = arch.rows;
  // gara1: solo io flaggato → via bandierina, P1 col giro veloce
  assert.equal(file1.me.position, 1);
  assert.equal(file1.me.bestLap, '01:32.259');
  // gara2: tutti flaggati («tutti te») → per nome; zero-based normalizzato a P3
  assert.equal(file2.me.position, 3);
  assert.equal(file2.me.bestLap, '01:31.900');
});

test('libro dei rivali: l’identità dal driver_id sopravvive al cambiamento nickname', () => {
  const arch = onlineArchive(paths, { driver: DRIVER });
  const a = arch.rivals.find((e) => e.key.startsWith('id:r9'));
  assert.ok(a, 'TOINE e Antoine Laisne sono LO STESSO rivale');
  assert.equal(a.meetings, 2);
  assert.deepEqual(ordinaIncroci(a), ['Antoine Laisne', 'TOINE'], 'entrambi i nickname nel libro');
  assert.equal(a.beats, 1, 'gara2: TOINE vince (P1) e mi mette dietro');
  assert.equal(a.beaten, 1, 'gara1: io davanti a lui (P1 vs P2)');
  assert.ok(a.lastWhen.startsWith('2026-04-17'), 'ultima volta = la gara più recente');
  assert.equal(a.favTrack.track, 'Monza');
  assert.equal(a.favTrack.n, 2);
  assert.equal(a.favTrack.tu, 1, 'su Monza una su due l’ho battuto');
  assert.equal(a.favCar, 'Ferrari 296 GT3');
});

test('senza driver_id il nome normalizzato tiene insieme le righe (case e spazi fuori gioco)', () => {
  const arch = onlineArchive(paths, { driver: DRIVER });
  const b = arch.rivals.find((e) => e.key.startsWith('nome:'));
  assert.ok(b, 'Luca Bianchi è nel libro anche senza driver_id');
  assert.equal(b.meetings, 2, '"Luca Bianchi" (gara1) e "luca BIANCHI" (gara2) sono una persona sola');
  assert.equal(b.beaten, 2, 'in ENTRAMBE le gare sono arrivato davanti');
  assert.equal(b.beats, 0);
});

test('righe doppie dei server (stessa identità, due nomi): contano UNA volta', () => {
  const arch = onlineArchive(paths, { driver: DRIVER });
  const a = arch.rivals.find((e) => e.key.startsWith('id:r9'));
  assert.equal(a.meetings, 2, 'non 3: la riga doppiata di gara2 non raddoppia l’incrocio');
  assert.equal(arch.rivals.length, 2, 'nel libro solo DUE persone, non tre né quattro');
  assert.ok(!arch.rivals.some((e) => e.key.includes(e.key.startsWith('id:r9') ? 'zz' : 'zz')), 'niente fantasmi');
  // il conto piloti della riga riflette la lista DEDUPICATA (3 in gara2, non 4)
  assert.equal(arch.rows[0].drivers, 3);
});

test('ordine del libro e forma: gli incroci più nuovi prima, il posto MIO in forma', () => {
  const arch = onlineArchive(paths, { driver: DRIVER });
  assert.equal(arch.rivals[0].key.startsWith('id:r9'), true, 'primo chi mi incrocia più spesso e vince: TOINE');
  const a = arch.rivals[0];
  assert.deepEqual(a.form, [{ pos: 3, beat: false }, { pos: 1, beat: true }],
    'i punti (miei) degli ultimi 5 incroci, la gara più recente in testa');
});

test('resultDetail _MP_: griglia completa col testa a testa per NICKNAME alternativo', () => {
  const det = resultDetail(paths, '260417-1936_MP_Race.sessionresults.json', { driver: DRIVER });
  assert.ok(det);
  assert.equal(det.is_mp, true, 'il file _MP_ è marcato online');
  // UNA SOLA VERITÀ (2/11): anche qui le righe doppie (TOINE e Antoine
  // Laisne, STESSO driver_id r9) contano UNA volta, come nell'archivio
  // e come nell'import — la griglia è delle persone vere, non degli slot.
  assert.equal(det.rows.length, 3, 'la riga doppia (stesso driver_id) è fuori: 3 persone vere');
  const toine = det.rows.find((r) => r.name === 'TOINE');
  const meRow = det.rows.find((r) => r.me);
  assert.equal(toine.position, 1, 'posizione ufficiale: TOINE vince (nessuna penalità in gioco)');
  assert.deepEqual(toine.h2h, { meetings: 2, tu: 1, lui: 1 },
    'testa a testa col LIBRO: incrociato 2 volte, 1 volta davanti tu, 1 lui — riconosciuto nel NICKNAME attuale');
  assert.equal(meRow.name, 'Mauro Turbigno');
  assert.equal(meRow.h2h, null, 'il testa a testa non parla di me');
  // il gap con lo zero-based al vincitore: 15:10.000 − 15:00.000 = 10 s in ms
  assert.equal(meRow.gap, 10000);
});

test('resultDetail SP: nessuna salvaguardia online, niente testa a testa', () => {
  const det = resultDetail(paths, '260415-1800_SP_Race.sessionresults.json', { driver: DRIVER });
  assert.ok(det);
  assert.equal(det.is_mp, false);
  assert.ok(det.rows.every((r) => r.h2h == null), 'fuori dal libro: le sessioni SP non viaggiano nel testa a testa online');
});
