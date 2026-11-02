/* margine-log.test.mjs — il margine vero (3/11): settori giro-per-giro dai log
   del gioco, best = la tripla accreditata del file risultato. Scene sintetiche
   che riproducono i casi veri cacciati dai log del 31/10:
     due sessioni sulla STESSA pista nello stesso log (practice + race di un
     weekend Kyalami), righe lap:0 con ms cumulativi da scartare, righe
     scritte tre volte di fila da deduplicare, un'altra pista che non DEVE
     inquinare i settori della sessione legata. */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { join } from 'node:path';
import { margineVeroDaLog } from '../src/margine-log.mjs';
import { tettoReport } from '../src/analisi.mjs';

const riga = (ts, car, ms, id, lap = 1) =>
  `[2026-10-31 ${ts}] [gameplay] [info] Split completed for car ${car}: (${ms} ms, splitindex ${id}) lap:${lap}`;
const marker = (ts, pista, tipo) =>
  `[2026-10-31 ${ts}] [gameplay] [info] Game Started! GameModeType_RACE_WEEKEND | ${pista} ${tipo} 900 seconds @2014/8/15 9:0:0 | ks_car | nền`;

const CAR = '4e295b6676c6e38d-ff867ff83e4dc788';

const cont = [
  // weekend KYALAMI: practice (10:01) poi race (10:14) — STESSA pista, due sessioni
  marker('10:01:00.000', 'Kyalami GP', 'Time Attack Practice'),
  // lap:0 del practice: ms cumulativi gonfi, da scartare
  riga('10:01:42.100', CAR, '2983419', 0, 0),
  riga('10:02:02.100', CAR, '2993419', 2, 0),
  // practice gir 1/2 (ees triplicate, come fa il gioco)
  ...[1, 2, 3].map(() => riga('10:03:10.000', CAR, '30000', 0, 1)),
  riga('10:03:40.000', CAR, '35000', 1, 1),
  riga('10:04:10.000', CAR, '36000', 2, 1),
  ...[1, 2, 3].map(() => riga('10:05:10.000', CAR, '29500', 0, 2)),
  riga('10:05:40.000', CAR, '34800', 1, 2),
  riga('10:06:10.000', CAR, '35900', 2, 2),
  // weekend RACE, stessa pista, 4 minuti dopo: nuovo marker
  marker('10:14:00.000', 'Kyalami GP', 'Race'),
  riga('10:14:50.000', CAR, '2812345', 2, 0), // lap:0 cumulativo: fuori
  riga('10:15:20.000', CAR, '28000', 0, 1),
  riga('10:15:55.000', CAR, '34000', 1, 1),
  riga('10:16:30.000', CAR, '35200', 2, 1),
  // un altro giro della race, un filo più lento
  riga('10:17:20.000', CAR, '28150', 0, 2),
  riga('10:17:55.000', CAR, '34100', 1, 2),
  riga('10:18:30.000', CAR, '35350', 2, 2),
  // piste diverse DOPO: non devono mai toccare i settori di Kyalami
  marker('10:25:00.000', 'Brands Hatch GP', 'Time Attack Practice'),
  riga('10:26:00.000', CAR, '1000', 0, 1), // settore «magico» su Brands: fuori finestra
  riga('10:26:30.000', CAR, '9000', 1, 1),
  riga('10:27:00.000', CAR, '9000', 2, 1),
].join('\n');

const tmp = mkdtempSync(join(tmpdir(), 'margine-log-'));
const logsDir = tmp;
writeFileSync(join(logsDir, 'log-261031-100033.txt'), `${cont}\r\n`);

test('margine vero: race legata dalla tripla, practice non contamina', () => {
  const offer = margineVeroDaLog([logsDir], [
    // la tripla del GIRO MIGLIORE della race (dal file risultato)
    { chiave: 'race', track: 'Kyalami', bestSplits: [28000, 34000, 35200] },
    // la tripla del giro migliore del PRACTICE
    { chiave: 'practice', track: 'Kyalami', bestSplits: [29500, 34800, 35900] },
  ]);
  const race = offer.get('race');
  // le fratrie della sessione Race: sólo i giri di quel marker
  assert.ok(race, 'la race deve restare legata');
  // settori della race: 28000/34000/35200 (le fratrie stanno tutte nel marker Race)
  assert.deepEqual(race.settoriMs, [28000, 34000, 35200]);
  assert.equal(race.margineMs, 0);
  assert.ok(race.giri >= 2);
  const prac = offer.get('practice');
  assert.ok(prac, 'il practice deve restare legato');
  assert.equal(prac.margineMs, 0);
  assert.equal(offer.size, 2);
});

test('lap:0 e righe cumulative non entrano nei settori', () => {
  const res = margineVeroDaLog([logsDir], [{ chiave: 'k', track: 'Kyalami', bestSplits: [29500, 34800, 35900] }]);
  const x = res.get('k');
  assert.ok(x);
  // niente 2812345 né 2983419: i minimi restano decine di secondi
  assert.equal(x.sommaMs, 100200); // 29500 + 34800 + 35900
});

test('una tripla consettata su una pista che non combacia non viene mai legata', () => {
  const res = margineVeroDaLog([logsDir], [{ chiave: 'brands-legata-male', track: 'Kyalami', bestSplits: [1000, 9000, 9000] }]);
  assert.ok(!res.has('brands-legata-male'));
});

test('tettoReport porta il margine vero per pista', () => {
  const ladder = { nodes: [] };
  const state = {
    results: {
      n1: [{
        track: 'Kyalami', season: 1, round: 2, dnf: false, position: 2,
        sectors: {
          sectors: [
            { index: 1, mine: 28000, best: 27000, deltaMs: 1000 },
            { index: 2, mine: 34000, best: 33800, deltaMs: 200 },
            { index: 3, mine: 35200, best: 34500, deltaMs: 700 },
          ],
        },
      }],
    },
  };
  const d = tettoReport(ladder, state, { logsDirs: [logsDir] });
  const t = d.perTrack.find((x) => String(x.track).toLowerCase().includes('kyalami'));
  assert.ok(t, 'pista in tabella');
  assert.equal(t.margineSessioni, 1);
  assert.equal(t.margineMs, 0);
});
