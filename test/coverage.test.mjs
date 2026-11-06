// coverage.test.mjs — la copertura dei dati (6/11).
// Il rapporto conta solo ciò che esiste: gare nei risultati, uscite libere,
// telemetrie, rivali. L'unica voce derivata sono i km (giri × lunghezza di
// catalogo) e deve RESTARE dichiarata: pista fuori catalogo → niente km.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogTrackOf, catalogLengthKm, coverageReport, scanTelemetry } from '../src/coverage.mjs';

const results = {
  mx5: [
    { track: 'monza', laps: 10, car: 'Mazda MX-5 ND Cup', at: '2026-11-01T10:00:00.000Z' },
    { track: 'monza', laps: 8, car: 'Mazda MX-5 ND Cup', at: '2026-11-02T10:00:00.000Z' },
    { track: 'pista_ignota', laps: 5, car: 'Abarth 695 Biposto', at: '2026-11-03T10:00:00.000Z' },
  ],
  gt: [
    { track: 'imola', laps: 6, car: 'Mazda MX-5 ND Cup', at: '2026-10-01T10:00:00.000Z' },
  ],
};
const freeSessions = [
  { track: 'Monza GP', lapsCount: 3, session: 'Practice', bestLapMs: null, at: '2026-11-04T09:00:00.000Z' },
  { track: 'Laguna Seca', lapsCount: 4, session: 'Practice', bestLapMs: 1100, at: '2026-11-05T09:00:00.000Z' },
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
  assert.deepEqual(c.byTrack.map((r) => r.name), ['Monza', 'Imola', 'pista_ignota', 'Laguna Seca']);
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

test('coverage: telemetrie contate dai .ld, cartella assente = zero', () => {
  assert.deepEqual(scanTelemetry(null), { files: 0, bytes: 0, cars: 0 });
  assert.deepEqual(scanTelemetry({ dataDirs: ['/cartella/che/non/esiste'] }), { files: 0, bytes: 0, cars: 0 });
});
