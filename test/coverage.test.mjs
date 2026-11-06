// coverage.test.mjs — la copertura dei dati (6/11).
// Il rapporto conta solo ciò che esiste: gare nei risultati, uscite libere,
// telemetrie, rivali. L'unica voce derivata sono i km (giri × lunghezza di
// catalogo) e deve RESTARE dichiarata: pista fuori catalogo → niente km.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogTrackOf, catalogLengthKm, coverageReport, analysisGaps, scanTelemetry } from '../src/coverage.mjs';

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
  assert.deepEqual(perPista.get('Monza'), ['settori'], 'Monza ha telemetria e giri, ma nessun settore');
  assert.deepEqual(perPista.get('Laguna Seca'), ['telemetria'], 'Laguna ha il giro e i settori, ma nessun .ld');
  assert.deepEqual(perPista.get('pista_ignota'), ['telemetria', 'cronometrati', 'settori'], 'pista ignota non ha nulla');
  assert.equal(g.piste, 19, '4 piste corse (una fuori catalogo) + le 15 di catalogo mai corse');
  assert.equal(g.scoperte.length, 15, 'le 15 piste di catalogo mai corse restano fuori dal conto delle pronte');
  assert.equal(g.pronte, 0, 'in questo fixture nessuna pista ha tutto');
  assert.ok(!g.incomplete.some((r) => r.never), 'le mai corse non finiscono fra le incomplete: hanno un conto loro');
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
