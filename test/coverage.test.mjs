// coverage.test.mjs — la copertura dei dati (6/11).
// Il rapporto conta solo ciò che esiste: gare nei risultati, uscite libere,
// telemetrie, rivali. L'unica voce derivata sono i km (giri × lunghezza di
// catalogo) e deve RESTARE dichiarata: pista fuori catalogo → niente km.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogTrackOf, catalogLengthKm, coverageReport, analysisGaps, scanTelemetry, sectorCompare } from '../src/coverage.mjs';

const results = {
  mx5: [
    { track: 'monza', laps: 10, car: 'Mazda MX-5 ND Cup', bestLap: '01:49.031', at: '2026-11-01T10:00:00.000Z' },
    { track: 'monza', laps: 8, car: 'Mazda MX-5 ND Cup', bestLap: '01:48.558', at: '2026-11-02T10:00:00.000Z' },
    { track: 'pista_ignota', laps: 5, car: 'Abarth 695 Biposto', at: '2026-11-03T10:00:00.000Z' },
  ],
  gt: [
    { track: 'imola', laps: 6, car: 'Mazda MX-5 ND Cup', at: '2026-10-01T10:00:00.000Z' },
  ],
};
const freeSessions = [
  { track: 'Monza GP', lapsCount: 3, session: 'Practice', bestLapMs: null, at: '2026-11-04T09:00:00.000Z' },
  { track: 'Laguna Seca', lapsCount: 4, session: 'Practice', bestLapMs: 1100, sectors: [{ index: 1, best: 41424 }], at: '2026-11-05T09:00:00.000Z' },
];

test('coverage: il nome del gioco e l\'id del risultato sono la stessa pista', () => {
  assert.equal(catalogTrackOf('Monza GP')?.name, 'Monza');
  assert.equal(catalogTrackOf('monza')?.name, 'Monza');
  assert.equal(catalogTrackOf('pista_ignota'), null);
  assert.equal(catalogLengthKm('laguna_seca'), 3.602);
});

test('coverage: giri, km dichiarati e piste fuori catalogo che non gonfiano il totale', () => {
  const c = coverageReport({ results, freeSessions });
  assert.equal(c.totals.races, 4);
  assert.equal(c.totals.free, 2);
  assert.equal(c.totals.sessions, 6);
  assert.equal(c.totals.laps, 36);
  // 21 giri a Monza + 6 a Imola + 4 a Laguna; i 5 giri di "pista_ignota" NON diventano km
  assert.equal(c.totals.km, 166);
  assert.equal(c.totals.kmKnown, false, 'con una pista fuori catalogo i km sono per difetto e va detto');
  assert.equal(c.totals.tracks, 4);
  assert.equal(c.totals.cars, 2);
});

test('coverage: una riga per pista (id + nome gioco uniti), ordinata per giri', () => {
  const c = coverageReport({ results, freeSessions });
  const monza = c.byTrack[0];
  assert.equal(monza.name, 'Monza');
  assert.equal(monza.sessions, 3, 'due gare importate + una libera');
  assert.equal(monza.laps, 21);
  assert.equal(monza.km, 121.7);
  assert.deepEqual(c.byTrack.slice(0, 4).map((r) => r.name), ['Monza', 'Imola', 'pista_ignota', 'Laguna Seca'],
    'prima le piste corse, per giri; poi (sotto) quelle mai corse');
  assert.ok(c.byTrack.slice(4).every((r) => r.never), 'le piste di catalogo senza dati chiudono la tabella, dichiarate');
  const ignota = c.byTrack.find((r) => r.name === 'pista_ignota');
  assert.equal(ignota.km, null, 'senza lunghezza di catalogo non si inventano km');
});

test('coverage: cosa manca e ultimo dato', () => {
  const c = coverageReport({ results, freeSessions });
  assert.equal(c.noTime, 1, 'solo la libera di Monza non ha un giro cronometrato');
  assert.equal(c.lastAt, '2026-11-05T09:00:00.000Z');
  assert.equal(c.neverDriven.length, 15, 'le 18 piste di catalogo meno Monza, Imola e Laguna Seca');
  assert.ok(c.neverDriven.some((x) => x.name === 'Suzuka'));
  assert.deepEqual(c.bySessionType.map((x) => [x.type, x.sessions]), [['Race', 4], ['Practice', 2]]);
});

test('coverage: senza fonti esterne niente numeri inventati', () => {
  const c = coverageReport({});
  assert.equal(c.totals.sessions, 0);
  assert.equal(c.totals.laps, 0);
  assert.equal(c.totals.km, 0);
  assert.equal(c.telemetry, null);
  assert.equal(c.rivals, null);
  assert.equal(c.lastAt, null);
  assert.equal(c.neverDriven.length, 18);
});

test('coverage: i settori dei file risultato entrano per pista e danno il miglior giro', () => {
  const c = coverageReport({
    results,
    freeSessions,
    resultSectors: [
      { track: 'Circuit de Spa Francorchamps', splitsMs: [42750, 46452, 65655] },
      { track: 'Circuit de Spa Francorchamps', splitsMs: [42000, 46000, 65000] },
    ],
  });
  const spa = c.byTrack.find((r) => r.name === 'Circuit de Spa Francorchamps');
  assert.equal(spa.sectors, 2, 'due sessioni con gli splits del giocatore');
  assert.equal(spa.bestLapMs, 153000, 'il miglior giro e la somma degli splits piu veloce');
  assert.equal(spa.timed, 2, 'una sessione con gli splits è cronometrata: il max non somma due volte');
});

test('coverage: le piste con dati insufficienti dicono cosa manca (indicatore Cruscotto)', () => {
  const g = analysisGaps(coverageReport({
    results,
    freeSessions,
    telemetry: { files: 3, bytes: 300, cars: 1, tracks: [{ name: 'Monza GP', files: 3, bytes: 300 }] },
  }));
  const perPista = new Map(g.incomplete.map((r) => [r.name, r.mancano]));
  assert.deepEqual(perPista.get('Monza'), ['settori'], 'Monza supera le soglie ma non ha settori');
  assert.deepEqual(perPista.get('Laguna Seca'), ['telemetria-insufficiente'], 'Laguna ha giri e settori ma nessun .ld');
  assert.deepEqual(perPista.get('pista_ignota'), ['telemetria-insufficiente', 'cronometrati', 'settori'], 'pista ignota ha pochi dati utili');
  assert.equal(g.piste, 19, '4 piste corse (una fuori catalogo) + le 15 di catalogo mai corse');
  assert.equal(g.scoperte.length, 15, 'le 15 piste di catalogo mai corse restano fuori dal conto delle pronte');
  assert.equal(g.pronte, 1, 'Monza supera le soglie numeriche ed è pronta anche se mancano i settori');
  assert.deepEqual(g.soglia, { giri: 3, giriSessione: 3, fileTelemetria: 2 });
  assert.equal(g.incomplete.find((r) => r.name === 'Monza')?.maxSessionLaps, 10, 'la gara più lunga di Monza ha 10 giri');
  assert.ok(!g.incomplete.some((r) => r.never), 'le mai corse non finiscono fra le incomplete: hanno un conto loro');
});

test('coverage: pronte solo da 3 giri, 3 nella stessa sessione e 2 file .ld (soglie incluse)', () => {
  const g = analysisGaps({ byTrack: [
    { name: 'Esattamente alla soglia', laps: 3, maxSessionLaps: 3, timed: 1, sectors: 1, telemetry: { files: 2 }, never: false },
    { name: 'Un giro in meno', laps: 2, maxSessionLaps: 2, timed: 1, sectors: 1, telemetry: { files: 2 }, never: false },
    { name: 'Un solo giro e un file', laps: 1, maxSessionLaps: 1, timed: 1, sectors: 1, telemetry: { files: 1 }, never: false },
    { name: 'Un file in meno', laps: 3, maxSessionLaps: 3, timed: 1, sectors: 1, telemetry: { files: 1 }, never: false },
    // tre giri SPARSI su tre uscite da uno: il totale passa, il run no
    { name: 'Tre uscite da un giro', laps: 3, maxSessionLaps: 1, timed: 1, sectors: 1, telemetry: { files: 2 }, never: false },
    { name: 'Mai corsa', laps: 0, timed: 0, sectors: 0, telemetry: { files: 0 }, never: true },
  ] });
  assert.equal(g.pronte, 1, '3 giri (di cui 3 in una sessione) + 2 .ld + un giro cronometrato bastano');
  assert.equal(g.incomplete.length, 4);
  const mancanti = new Map(g.incomplete.map((r) => [r.name, r.mancano]));
  assert.deepEqual(mancanti.get('Un giro in meno'), ['pochi-giri', 'giri-sessione'], '2 giri: falliscono entrambe le soglie sui giri');
  assert.deepEqual(mancanti.get('Un file in meno'), ['telemetria-insufficiente']);
  assert.deepEqual(mancanti.get('Un solo giro e un file'), ['telemetria-insufficiente', 'pochi-giri', 'giri-sessione']);
  assert.deepEqual(mancanti.get('Tre uscite da un giro'), ['giri-sessione'], 'tre giri sparsi non fanno un run');
  assert.deepEqual(g.scoperte, ['Mai corsa']);
});

test('coverage: le piste incomplete sono ordinate per gravità, le peggiori per prime', () => {
  const g = analysisGaps({ byTrack: [
    { name: 'Solo settori', laps: 4, maxSessionLaps: 4, timed: 2, sectors: 0, telemetry: { files: 3 }, never: false },
    { name: 'Senza cronometrati', laps: 4, maxSessionLaps: 4, timed: 0, sectors: 1, telemetry: { files: 3 }, never: false },
    { name: 'Un giro', laps: 1, maxSessionLaps: 1, timed: 1, sectors: 1, telemetry: { files: 3 }, never: false },
    { name: 'Due giri', laps: 2, maxSessionLaps: 2, timed: 1, sectors: 1, telemetry: { files: 3 }, never: false },
    { name: 'Senza telemetria', laps: 4, maxSessionLaps: 4, timed: 1, sectors: 1, telemetry: { files: 0 }, never: false },
  ] });
  // 1 giro (10) > 2 giri (8) > niente telemetria (6) > niente cronometrati (4) > solo settori (1)
  assert.deepEqual(g.incomplete.map((r) => r.name), [
    'Un giro', 'Due giri', 'Senza telemetria', 'Senza cronometrati', 'Solo settori',
  ]);
  const gr = g.incomplete.map((r) => r.gravita);
  assert.deepEqual(gr, [...gr].sort((a, b) => b - a), 'gravità decrescente');
  assert.ok(g.incomplete.every((r) => Number.isFinite(r.gravita)), 'ogni riga porta il suo numero');
});

test('coverage: i giri della sessione più lunga vengono dai risultati, dalle libere e dai settori', () => {
  const c = coverageReport({
    results: {
      a: [{ track: 'Monza', laps: 1, car: 'MX-5' }, { track: 'Monza', laps: 2, car: 'MX-5' }, { track: 'Monza', laps: 1, car: 'MX-5' }],
      b: [{ track: 'Imola', laps: 1, car: 'MX-5' }],
    },
    freeSessions: [{ track: 'Laguna Seca', lapsCount: 4, session: 'Practice' }],
    resultSectors: [{ track: 'Suzuka', splitsMs: [40000, 40000, 40000], laps: 6 }],
  });
  const row = (n) => c.byTrack.find((r) => r.name === n);
  assert.equal(row('Monza').laps, 4, 'il totale resta la somma delle sessioni');
  assert.equal(row('Monza').maxSessionLaps, 2, 'ma la sessione più lunga ha 2 giri: non basta');
  assert.equal(row('Imola').maxSessionLaps, 1);
  assert.equal(row('Laguna Seca').maxSessionLaps, 4);
  assert.equal(row('Suzuka').maxSessionLaps, 6, 'i giri arrivano anche dai file risultato con settori');
  // con una telemetria finta, Monza resta fuori dalle pronte proprio per i giri-sessione
  const g = analysisGaps({ byTrack: c.byTrack.map((r) => ({ ...r, telemetry: { files: 2 } })) });
  assert.ok(g.incomplete.some((x) => x.name === 'Monza' && x.mancano.includes('giri-sessione')));
  assert.ok(!g.incomplete.some((x) => x.name === 'Laguna Seca' && x.mancano.includes('giri-sessione')));
});

test('coverage: telemetrie contate dai .ld, cartella assente = zero', () => {
  assert.deepEqual(scanTelemetry(null), { files: 0, bytes: 0, cars: 0, tracks: [] });
  assert.deepEqual(scanTelemetry({ dataDirs: ['/cartella/che/non/esiste'] }), { files: 0, bytes: 0, cars: 0, tracks: [] });
});

test('coverage: per ogni pista cosa c\'è e cosa manca (telemetria, cronometrati, settori)', () => {
  const c = coverageReport({
    results,
    freeSessions,
    telemetry: { files: 3, bytes: 300, cars: 1, tracks: [{ name: 'Monza GP', files: 3, bytes: 300 }] },
  });
  const monza = c.byTrack.find((r) => r.name === 'Monza');
  assert.equal(monza.telemetry.files, 3, 'i .ld della cartella "Monza GP" cadono sulla riga Monza');
  assert.equal(monza.timed, 2, 'due gare con il tempo del miglior giro + la libera senza tempo');
  assert.equal(monza.sectors, 0, 'nessuna sessione di Monza porta i settori');
  assert.equal(monza.bestLapMs, 108558, 'il miglior giro è il più veloce dei testi delle gare');
  const laguna = c.byTrack.find((r) => r.name === 'Laguna Seca');
  assert.equal(laguna.sectors, 1, 'la libera di Laguna ha i settori');
  assert.equal(laguna.bestLapMs, 1100);
  const ignota = c.byTrack.find((r) => r.name === 'pista_ignota');
  assert.deepEqual([ignota.telemetry.files, ignota.timed, ignota.sectors], [0, 0, 0], 'i buchi restano buchi, a zero');
  const mai = c.byTrack.find((r) => r.never);
  assert.ok(mai && mai.sessions === 0 && mai.telemetry.files === 0, 'le piste mai corse sono righe a zero');
  assert.equal(c.totals.tracks, 4, 'il totale piste conta solo quelle con dati');
});

/* CONFRONTO SETTORE PER SETTORE (6/11): la gara contro il miglior giro della
   stessa auto. Le regole che il test difende: solo stessa pista E stessa auto
   E stesso numero di settori; la somma dei settori non è il tempo ufficiale;
   senza un altro giro con quell'auto non si inventa un confronto. */
test('coverage: il confronto settori sceglie il miglior giro della stessa auto', () => {
  const rows = [
    { track: 'Donington Park', file: 'gara.json', session: 'Race', car: 'mx5', splitsMs: [25734, 51204, 49599], lapMs: 126537 },
    { track: 'Donington Park', file: 'qual.json', session: 'Qualifying', car: 'mx5', splitsMs: [25485, 50400, 48717], lapMs: 124602 },
    { track: 'Donington Park', file: 'gt3.json', session: 'Race', car: 'gt3', splitsMs: [20000, 40000, 38000], lapMs: 98000 },
    { track: 'Oulton Park', file: 'altra.json', session: 'Race', car: 'mx5', splitsMs: [30000, 60000, 40000], lapMs: 130000 },
  ];
  const c = sectorCompare(rows, 'gara.json');
  assert.equal(c.rif.file, 'qual.json', 'il riferimento è il giro più veloce, non il primo trovato');
  assert.equal(c.altre, 2, 'solo i giri della stessa auto sulla stessa pista');
  assert.deepEqual(c.delta, [249, 804, 882]);
  assert.equal(c.gara.lapMs, 126537);
  assert.equal(c.ideale.lapMs, 124602, 'ideale = somma dei migliori settori di sempre');
  assert.equal(c.rif.stessoFile, false);

  // stesso file come riferimento: delta a zero, dichiarato
  const best = sectorCompare(rows, 'qual.json');
  assert.equal(best.rif.stessoFile, true);
  assert.deepEqual(best.delta, [0, 0, 0]);

  // nessun altro giro con quell'auto (pista diversa o auto diversa): niente rif
  const solo = sectorCompare([rows[0], rows[2], rows[3]], 'gara.json');
  assert.equal(solo.rif, null);
  assert.equal(solo.delta, null);
  assert.equal(solo.altre, 0);

  // un file senza splits non è confrontabile
  assert.equal(sectorCompare(rows, 'manca.json'), null);
});

/* PARAGONE TRA AUTO (6/11, richiesta Mauro: «anche il miglior giro della pista
   con auto diversa, etichettato chiaramente come paragone tra auto»). Le regole
   che il test difende: si prende il più veloce con un'ALTRA auto sulla stessa
   pista e con lo stesso numero di settori; il nome dell'auto viaggia per
   esteso; senza auto della gara nel file non si dichiara «diversa» niente;
   il paragone resta un campo a parte, non tocca `rif` né l'ideale. */
test('coverage: il paragone tra auto prende il miglior giro con un\'altra auto', () => {
  const rows = [
    { track: 'Donington Park', file: 'gara.json', session: 'Race', car: 'mx-5 cup', carLabel: 'Mazda MX-5 ND Cup', splitsMs: [25734, 51204, 49599], lapMs: 126537 },
    { track: 'Donington Park', file: 'qual.json', session: 'Qualifying', car: 'mx-5 cup', carLabel: 'Mazda MX-5 ND Cup', splitsMs: [25485, 50400, 48717], lapMs: 124602 },
    { track: 'Donington Park', file: 'gt3.json', session: 'Race', car: 'bmw m4 gt3', carLabel: 'BMW M4 GT3', splitsMs: [20000, 40000, 38000], lapMs: 98000 },
    { track: 'Donington Park', file: 'gt3-lenta.json', session: 'Practice', car: 'bmw m4 gt3', carLabel: 'BMW M4 GT3', splitsMs: [21000, 41000, 39000], lapMs: 101000 },
    { track: 'Donington Park', file: 'due-settori.json', session: 'Race', car: 'gt4', carLabel: 'GT4', splitsMs: [40000, 50000], lapMs: 90000 },
    { track: 'Oulton Park', file: 'altrapista.json', session: 'Race', car: 'gt3', carLabel: 'GT3', splitsMs: [20000, 40000, 38000], lapMs: 50000 },
  ];
  const c = sectorCompare(rows, 'gara.json');
  assert.equal(c.altraAuto.car, 'BMW M4 GT3', 'il paragone porta il nome dell\'auto per esteso');
  assert.equal(c.altraAuto.file, 'gt3.json', 'delle due GT3 vale la più veloce');
  assert.equal(c.altraAuto.lapMs, 98000);
  assert.deepEqual(c.altraAuto.delta, [5734, 11204, 11599]);
  assert.equal(c.altraAuto.deltaGiro, 28537);
  assert.equal(c.rif.file, 'qual.json', 'il riferimento resta la stessa auto: il paragone non lo sostituisce');
  assert.equal(c.ideale.lapMs, 124602, 'l\'ideale resta fatto dei settori della stessa auto');
  assert.equal(c.gara.car, 'Mazda MX-5 ND Cup');

  // pista diversa, due settori e auto uguali non entrano nel paragone
  const soloMia = sectorCompare(rows.filter((r) => r.car !== 'bmw m4 gt3'), 'gara.json');
  assert.equal(soloMia.altraAuto, null, 'due settori non si paragonano a tre');
  const senzaGt3 = sectorCompare(rows.filter((r) => !r.car.startsWith('bmw')), 'gara.json');
  assert.equal(senzaGt3.altraAuto, null, 'senza un\'altra auto non c\'è paragone');

  // auto della gara sconosciuta: «diversa» non è dimostrabile, niente paragone
  const ignota = sectorCompare(rows.map((r) => (r.file === 'gara.json' ? { ...r, car: '', carLabel: null } : r)), 'gara.json');
  assert.equal(ignota.altraAuto, null);
  assert.equal(ignota.gara.car, null);
});
