// test/analisi.test.mjs — I PRIMI TEST DEDICATI di src/analisi.mjs (31/10).
// Il modulo c'è dal 23/10 (708 righe: autopsia, dossier rivali, banco A/B,
// Monte Carlo del sedile, tetto teorico) e nessun test lo importava:
// arrivava sotto puntini in webui.

// La sandbox: l'archivio rivali vive in rivals.json dentro EVO_DATA_DIR —
// stessa rete di test/rivals.test.mjs. raceAutopsy e rivalDossier leggono
// lì; il tetto legge il save già passato come argomento (puro).
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'evo-analisi-'));
mkdirSync(DATA, { recursive: true });
process.env.EVO_DATA_DIR = DATA;

const { raceAutopsy, tettoReport, rivalDossier } = await import('../src/analisi.mjs');
const { recordRaceGrid, rivalKey } = await import('../src/rivals.mjs');
const { setLang } = await import('../src/lang.mjs');

import test from 'node:test';
import assert from 'node:assert/strict';

/* ---- fixture: una serie GT3 con due gare registrate nell'archivio ---- */
const mkResult = () => ({
  session: 'race', track: 'Monza',
  drivers: [
    { driver_name: 'Mauro', driver_surname: 'Rossi', position: 0, laps: 10, total_time: '10:00.000', best_lap: '1:40.500', car_brand: 'F', car_name: 'X' },
    { driver_name: 'Luca', driver_surname: 'Bianchi', position: 1, laps: 10, total_time: '10:03.000', best_lap: '1:40.100', car_brand: 'F', car_name: 'X' },
    { driver_name: 'Paolo', driver_surname: 'Verdi', position: 2, laps: 10, total_time: '10:06.000', best_lap: '1:41.000', car_brand: 'F', car_name: 'X' },
  ],
});
const payload = { driverFirst: 'Mauro', driverLast: 'Rossi', position: 1, dnf: false };
const opts = (round) => ({ season: 1, round, nodeId: 'serie_gt3', nodeDisplay: 'GT3 Serie A', trackDisplay: 'Monza' });

const ladder = { nodes: [{ nodeId: 'serie_gt3', display: 'GT3 Serie A', level: 3, calendar: [{ name: 'Monza', laps: 8 }] }] };
const entry = {
  at: '2026-10-30T12:00:00.000Z', season: 1, round: 1,
  position: 2, gridPosition: 5, gridSize: 3, laps: 8,
  bestLap: '1:40.500', gapMs: 4500, points: 18, dnf: false,
};
const state = { node: 'serie_gt3', season: 1, results: { serie_gt3: [entry] } };

test('raceAutopsy: null senza risultati — l\u0027onestà del modulo', () => {
  assert.equal(raceAutopsy(ladder, { node: 'serie_gt3', results: {} }), null);
});

test('raceAutopsy: autopsia IT con griglia in archivio — partenza, ritmo secco e racconto', () => {
  assert.ok(recordRaceGrid(mkResult(), payload, opts(0)), 'la ronda 0 si registra');
  assert.ok(recordRaceGrid(mkResult(), payload, opts(1)), 'la ronda 1 si registra');
  setLang('it');
  const a = raceAutopsy(ladder, state);
  assert.equal(a.ok, true);
  assert.equal(a.node, 'GT3 Serie A');
  assert.equal(a.hasRaceRow, true);

  const partenza = a.attributions.find((x) => x.title === 'Partenza e primo giro');
  assert.ok(partenza, 'la voce partenza c\u0027è');
  assert.match(partenza.text, /P5 in griglia/);
  assert.match(partenza.text, /perse 3 posizioni/);

  const ritmo = a.attributions.find((x) => x.title === 'Ritmo secco');
  assert.ok(ritmo, 'la voce ritmo c\u0027è');
  assert.match(ritmo.text, /1:40\.500/);
  assert.match(ritmo.text, /2° della griglia/);
  assert.match(ritmo.text, /0,40s dal giro del campo-top/);
  // delta 0,40s è sotto la soglia del 0,4 → giudizio buono
  assert.equal(ritmo.kind, 'good');

  // il racconto: la headline apre la narrativa, P2 su 3 con i punti
  assert.match(a.narrative[0], /P2 su 3 · \+18 punti/);
  assert.equal(a.narrative.length, a.attributions.length + 1);
});

test('raceAutopsy: ritiro — headline abbandonata in EN e IT, niente «handed in»', () => {
  setLang('en');
  const aEn = raceAutopsy(ladder, {
    node: 'serie_gt3', season: 1,
    results: { serie_gt3: [{ ...entry, dnf: true, position: 3, laps: 4, winnerLaps: 8 }] },
  });
  assert.match(aEn.narrative[0], /Race abandoned/);
  assert.ok(!aEn.narrative[0].includes('handed in'), 'la frase corrotta non deve tornare');

  setLang('it');
  const aIt = raceAutopsy(ladder, {
    node: 'serie_gt3', season: 1,
    results: { serie_gt3: [{ ...entry, dnf: true, position: 3, laps: 4, winnerLaps: 8 }] },
  });
  assert.match(aIt.narrative[0], /Gara abbandonata/);
});
/* ---- setupAB e seatMonteCarlo: prossima fetta (servono fixture MoTeC e world) ---- */

test('tettoReport: aggrega per pista margine (best − teorico) e settore peggiore', () => {
  const state2 = { results: {
    serie_gt3: [
      { track: 'Monza', season: 1, round: 0, position: 3, dnf: false, sectors: { bestLapMs: 100500, theoreticalMs: 99800, sectors: [{ index: 1, deltaMs: 300 }, { index: 2, deltaMs: 400 }, { index: 3, deltaMs: null }] } },
      { track: 'Monza', season: 1, round: 1, position: 2, dnf: false, sectors: { bestLapMs: 100300, theoreticalMs: 99850, sectors: [{ index: 1, deltaMs: 250 }, { index: 2, deltaMs: 200 }, { index: 3, deltaMs: null }] } },
    ],
  } };
  const t = tettoReport(ladder, state2);
  assert.equal(t.ok, true);
  assert.equal(t.perTrack.length, 1);
  const monza = t.perTrack[0];
  assert.equal(monza.track, 'Monza');
  assert.equal(monza.sessions, 2);
  // margini 700 e 450 ms: il migliore resta 450
  assert.equal(monza.marginBestMs, 450);
  assert.equal(monza.marginLastMs, 450);
  // mediana (bassa) dei delta per settore: S1 [300,250] → 250, S2 [400,200] → 200
  // → il peggiore è S1
  assert.equal(monza.worstSector, 1);
  assert.equal(monza.worstSectorDeltaMs, 250);
  assert.equal(monza.campTopDeltaMs, 400);
  // i peggiori della carriera: il massimo per primo
  assert.equal(t.worstSectors[0].sector, 2);
  assert.deepEqual(t.worstSectors[0], { track: 'Monza', sector: 2, deltaMs: 400, season: 1, round: 0 });
  // la frase-corrotta «collecchia» non deve tornare nell'hint
  assert.ok(!t.hint.includes('collecchia'));
});

test('tettoReport: senza settori archiviati — vuoto e hint, non un errore', () => {
  const t = tettoReport(ladder, { results: {} });
  assert.equal(t.ok, true);
  assert.deepEqual(t.perTrack, []);
  assert.ok(t.hint.length > 10);
});

test('rivalDossier: due gare in archivio → h2h coerente, ritmo mediano e trend', () => {
  setLang('it');
  const key = rivalKey('Luca', 'Bianchi');
  const d = rivalDossier(key, state);
  assert.ok(d, 'il dossier esiste');
  assert.equal(d.key, key);
  assert.equal(d.meetingsCount, 2);
  assert.equal(d.totals.races, 2);
  // Luca è P2 in entrambe, io P1: due sconfitte per lui
  assert.equal(d.h2h.losses, 2);
  // il suo giro (1:40.100) contro il mio (1:40.500): −400 ms a gara, mediana −0,4 s
  assert.equal(d.pace.samples, 2);
  assert.equal(d.pace.himVsMeSec, -0.4);
  assert.match(d.pace.verdict, /PIÙ VELOCE/);
  // il delta è identico nelle due gare → trend stabile
  assert.equal(d.pace.closeTrendSec, 0);
  assert.match(d.pace.closeTrendText, /ritmo stabile nel tempo/);
  // la consistenza: due P2 di fila, sdev 0, DNF 0
  assert.equal(d.consistency.meanPos, 2);
  assert.ok(d.consistency.posSd === 0 || d.consistency.posSd == null);
  assert.equal(d.consistency.dnfRate, 0);
});

test('rivalDossier: chi non è in archivio non ha dossier (null, non eccezione)', () => {
  assert.equal(rivalDossier('chi-non-corre-mai', state), null);
});
