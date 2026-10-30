// test/analisi.test.mjs — I PRIMI TEST DEDICATI di src/analisi.mjs (31/10).
// Il modulo c'è dal 23/10 (708 righe: autopsia, dossier rivali, banco A/B,
// Monte Carlo del sedile, tetto teorico) e nessun test lo importava:
// arrivava sotto puntini in webui.

// La sandbox: l'archivio rivali vive in rivals.json dentro EVO_DATA_DIR —
// stessa rete di test/rivals.test.mjs. raceAutopsy e rivalDossier leggono
// lì; il tetto legge il save già passato come argomento (puro).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'evo-analisi-'));
mkdirSync(DATA, { recursive: true });
process.env.EVO_DATA_DIR = DATA;

const { raceAutopsy, tettoReport, rivalDossier, setupAB, seatMonteCarlo } = await import('../src/analisi.mjs');
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
/* ==================================================================
   FETTA 31/11 — setupAB e seatMonteCarlo, gli UNICI DUE strumenti di
   analisi.mjs ancora senza test. Servivano due fixture che prima non
   esistevano: le SESSIONI MoTeC (.ld + .ldx sintetici, stesso formato
   decodificato da laptrace.test.mjs) e un LADDER+STATE con il parco
   piloti che gridFor vuole (stessa scala di life.test/race-card).
   ================================================================== */

/* -- 3) BANCO A/B: due sessioni sintetiche ------------------------ */
/* builder del .ld: header 64B + 5 canali (124B a testa), dati float32
   contigui FUEL@20Hz, SPEED/THROTTLE/BRAKE/TYRE_PRESS_LF@60Hz; i beacon
   del GATE sono nel .ldx in MICROSECONDI (parseLdx: Time/1e6). */
const T0 = 64, N_CH = 5;
const T1 = T0 + N_CH * 124;
const mkMotec = (dir, name, laps, prof) => {
  const total = laps.reduce((a, b) => a + b, 0);
  const n20 = total * 20, n60 = total * 60;
  const FUEL_OFF = T1, SPEED_OFF = FUEL_OFF + 4 * n20;
  const TH_OFF = SPEED_OFF + 4 * n60, BR_OFF = TH_OFF + 4 * n60;
  const PLF_OFF = BR_OFF + 4 * n60;
  const buf = Buffer.alloc(PLF_OFF + 4 * n60);
  buf.writeUInt32LE(T0, 8);
  buf.writeUInt32LE(T1, 12);
  const channel = (R, n, unit, off, cnt, rate) => {
    buf.writeUInt32LE(off, R + 8);
    buf.writeUInt32LE(cnt, R + 12);
    buf.writeUInt32LE(rate << 16, R + 20);
    buf.write(n, R + 32, 'latin1');
    buf.write(unit, R + 72, 'latin1');
  };
  let R = T0;
  channel(R, 'FUEL', 'L', FUEL_OFF, n20, 20); R += 124;
  channel(R, 'SPEED', 'km/h', SPEED_OFF, n60, 60); R += 124;
  channel(R, 'THROTTLE', '%', TH_OFF, n60, 60); R += 124;
  channel(R, 'BRAKE', '%', BR_OFF, n60, 60); R += 124;
  channel(R, 'TYRE_PRESS_LF', 'psi', PLF_OFF, n60, 60);
  for (let i = 0; i < n20; i++) buf.writeFloatLE(30, FUEL_OFF + 4 * i);
  for (let i = 0; i < n60; i++) {
    const t = i / 60;
    let li = 0, acc = 0;
    while (li < laps.length - 1 && t >= acc + laps[li]) { acc += laps[li]; li++; }
    const s = prof(li, t - acc, laps[li]);
    buf.writeFloatLE(s.v, SPEED_OFF + 4 * i);
    buf.writeFloatLE(s.th, TH_OFF + 4 * i);
    buf.writeFloatLE(s.br, BR_OFF + 4 * i);
    buf.writeFloatLE(27, PLF_OFF + 4 * i);
  }
  const file = join(dir, name);
  writeFileSync(file, buf);
  const bcn = [0];
  for (let k = 0; k < laps.length - 1; k++) bcn.push(bcn[k] + laps[k]);
  writeFileSync(file.replace(/\.ld$/, '.ldx'),
    '<?xml version="1.0"?>' + bcn.map((s) => `<r ClassName="BCN" Time="${(s * 1e6).toExponential(7)}"/>`).join(''));
  return file;
};
// A (base): 4 giri 20/21/22/23 s, UNA curva con staccata (br 1): l'INGRESSO
// in frenata cambia per giro (270/260/250/240) — la «matita» che cammina.
const profA = (l, tl, D) => {
  const entry = 270 - 10 * l;
  if (tl < 10) return { v: 150 + (entry - 150) * (tl / 10), th: 1, br: 0 };
  if (tl < 15) return { v: entry - (entry - 120) * ((tl - 10) / 5), th: 0, br: 1 };
  return { v: 140 + 20 * ((tl - 15) / Math.max(1, D - 15)), th: 1, br: 0 };
};
// B (prova): lo STESSO profilo +40 km/h, MAI freno: più veloce ovunque.
const profB = (l, tl, D) => {
  const s = profA(l, tl, D);
  return { v: s.v + 40, th: 1, br: 0 };
};
const MOT = join(DATA, 'motec-fixture');
mkdirSync(MOT, { recursive: true });
// nome nel formato che la regex STRETTA di presetOf vuole
// (preset_<nome>_<token>_<token>_Sat ...): il fallback greedy è per i file veri
const LD_A = mkMotec(MOT, 'preset_base_prova_test_Sat Oct 31 120000 2026.ld', [20, 21, 22, 23], profA);
const LD_B = mkMotec(MOT, 'preset_prova_utile_test_Sat Oct 31 130000 2026.ld', [16, 17, 18], profB);

test('setupAB: file illeggibile → ok:false con messaggio, non un crash', () => {
  const ab = setupAB(join(MOT, 'inesistente.ld'), LD_B);
  assert.equal(ab.ok, false);
  assert.match(ab.error, /MoTeC/);
});

test('setupAB: B più veloce di A — delta sul best, tempo PERSO da A, staccata in vista', () => {
  setLang('it');
  const ab = setupAB(LD_A, LD_B);
  assert.equal(ab.ok, true);
  // best lap: A 20 s, B 16 s (dai beacon del .ldx)
  assert.equal(ab.A.bestLapSec, 20);
  assert.equal(ab.B.bestLapSec, 16);
  assert.equal(ab.deltaBest, 4);
  // la riga del best: delta = b − a
  assert.equal(ab.rows[0].a, 20);
  assert.equal(ab.rows[0].b, 16);
  assert.equal(ab.rows[0].delta, -4);
  // preset dal nome file: base vs prova
  assert.equal(ab.A.preset, 'base');
  assert.equal(ab.B.preset, 'prova');
  // B è più veloce di A ovunque: tutto il netto è tempo PERSO da A, niente guadagnato
  assert.ok(ab.lostS > 0, 'lostS: ' + ab.lostS);
  assert.equal(ab.gainedS, 0);
  // la staccata di A (25% del giro) pesa in frenata; ma la percentuale maggiore
  // del netto sta a gas pieno (75% del giro)
  assert.ok(ab.zones.frenata > 0, 'frenata: ' + ab.zones.frenata);
  assert.ok(ab.zones.gas > ab.zones.frenata, 'gas vs frenata: ' + JSON.stringify(ab.zones));
  assert.match(ab.zonesText, /perso da A/);
  // la matita: 4 giri validi caduti in brakeConsistency, uno dei due rami onesto
  assert.ok(ab.brake, 'brake presente');
  assert.equal(ab.brake.laps, 4);
  assert.match(ab.brake.text, /Costanza in frenata/);
});

test('setupAB: STESSO file due volte — pari sul best, zero zone, niente dominante', () => {
  setLang('it');
  const ab = setupAB(LD_A, LD_A);
  assert.equal(ab.ok, true);
  assert.equal(ab.deltaBest, 0);
  assert.equal(ab.lostS, 0);
  assert.equal(ab.gainedS, 0);
  assert.deepEqual(ab.zones, { frenata: 0, uscita: 0, gas: 0 });
  assert.match(ab.zonesText, /pari/);
  // la matita girata contro se stessa: identica giro per giro
  assert.match(ab.brake.text, /Costanza in frenata/);
});

/* -- 4) MONTE CARLO DEL SEDILE ------------------------------------ */
const mkWorldMc = () => ({
  drivers: Array.from({ length: 30 }, (_, i) => ({
    id: `d${i + 1}`, name: `Rivale ${i + 1}`, first: 'Rivale', last: `${i + 1}`,
    country: 'IT', archetype: 'pro', iconic: false, age: 25, hot: false,
    skill: Math.round((0.9 - i * 0.01) * 1000) / 1000, active: true,
    cons: 0.85 + (i % 3) * 0.02, aggr: 0.5,
  })),
});
const calMc = (n = 5) => Array.from({ length: n }, (_, i) => ({ track: `traccia${i}` }));
const mkLadderMc = () => ({
  disciplines: [],
  nodes: [
    { nodeId: 'serie_gt3', display: 'GT3 Serie', level: 3, ai: [80, 84], gridSize: 12, points: 'sys1', discipline: 'gt', calendar: calMc(), econ: { entry: 500, rent: 0, prize: 5000 }, cars: [] },
    { nodeId: 'serie_gt4', display: 'GT4 Serie', level: 3, ai: [90, 94], gridSize: 14, points: 'sys1', discipline: 'gt', calendar: calMc(), econ: { entry: 500, rent: 0, prize: 8000 }, cars: [] },
    { nodeId: 'serie_low', display: 'Coppa Bassa', level: 1, ai: [76, 80], gridSize: 10, points: 'sys1', discipline: 'gt', calendar: calMc(), econ: { entry: 200, rent: 0, prize: 2000 }, cars: [] },
  ],
  pointsSystems: { sys1: { table: [25, 18, 15, 12, 10], flPoint: 0, polePoint: 0, flTopN: 99 } },
});
// profilo osservato del pilota: 5 gare, una fuoripista → dnfRate 20% e
// frazioni di piazzamento reali variabili
const mcResults = () => ({
  serie_gt3: [1, 2, 3, 7, 5].map((pos, i) => ({ season: 2, round: i, position: pos, gridSize: 14, dnf: i === 4, points: 10 })),
});
const mcState = (over = {}) => ({
  node: 'serie_gt3', season: 2, world: mkWorldMc(),
  difficulty: { mode: 'adaptive', base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], global: 0 },
  results: mcResults(), bestFinish: {}, driver: { name: 'Mauro', nation: 'IT' },
  ...over,
});

test('seatMonteCarlo: offerta di fine stagione — profilo osservato e aritmetica del saldo', () => {
  setLang('it');
  const mc = seatMonteCarlo(mkLadderMc(), mcState({ offers: [{ nodeId: 'serie_gt4', display: 'GT4 Serie' }] }), { sims: 200 });
  assert.equal(mc.ok, true);
  assert.equal(mc.basis.fromOffers, true);
  // il tasso DNF osservato (1/5) entra nel motore
  assert.equal(mc.basis.dnfRate, 20);
  assert.equal(mc.basis.racesMeasured, 5);
  assert.ok(mc.basis.variability > 0, 'sdev delle frazioni: ' + mc.basis.variability);
  const s = mc.seats[0];
  assert.ok(s, 'il sedile offerto è stato simulato');
  assert.equal(s.nodeId, 'serie_gt4');
  assert.equal(s.rounds, 5);
  assert.ok(s.gridSize >= 2, 'gridSize: ' + s.gridSize);
  assert.ok(s.expPosFrac >= 0 && s.expPosFrac <= 1, 'expPosFrac: ' + s.expPosFrac);
  assert.ok(s.medianPos >= 1 && s.medianPos <= s.gridSize, 'medianPos: ' + s.medianPos);
  for (const k of ['podiumPct', 'winPct', 'dnfPct', 'titlePct', 'top3StandingsPct']) {
    assert.ok(s[k] >= 0 && s[k] <= 100, k + ': ' + s[k]);
  }
  // l'MC è un'aspettativa: il 20% osservato non si discosta di più di 6 punti
  assert.ok(Math.abs(s.dnfPct - 20) <= 6, 'dnfPct: ' + s.dnfPct);
  assert.ok(s.expSeasonPoints > 0, 'punti stagione: ' + s.expSeasonPoints);
  // saldo = premio atteso − affitto − fee per ogni ronda (le firme di state.mjs)
  assert.equal(s.netSeason, s.expPrizeSeason - s.rentPerSeason - s.feePerRound * s.rounds);
  assert.equal(s.feePerRound, 500);
  // l'avvertenza di onestà è in pagina, non un promettitori
  assert.match(mc.caveat, /ordine di GRANDEZZA/);
});

test('seatMonteCarlo: DETERMINISTICO — stessa simulazione due volte, stessi sedili', () => {
  setLang('it');
  const ladder = mkLadderMc();
  const st = mcState({ offers: [{ nodeId: 'serie_gt4' }, { nodeId: 'serie_gt3' }] });
  const uno = seatMonteCarlo(ladder, st, { sims: 150 });
  const due = seatMonteCarlo(ladder, st, { sims: 150 });
  assert.deepEqual(due.seats, uno.seats);
  assert.deepEqual(due.basis, uno.basis);
});

test('seatMonteCarlo: senza offerte — serie aperte con gate + rinnovo, mai la serie sotto', () => {
  setLang('it');
  const mc = seatMonteCarlo(mkLadderMc(), mcState(), { sims: 100 });
  assert.equal(mc.ok, true);
  assert.equal(mc.basis.fromOffers, false);
  const got = mc.seats.map((s) => [s.nodeId, s.note]).sort();
  assert.deepEqual(got, [['serie_gt3', 'rinnovo'], ['serie_gt4', 'aperte']]);
  assert.ok(!mc.seats.some((s) => s.nodeId === 'serie_low'), 'la serie di livello inferiore non è un candidato');
});

test('seatMonteCarlo: casi onesti di bordo — serie corrente ignota, offerta fantasma', () => {
  setLang('it');
  const bad = seatMonteCarlo(mkLadderMc(), mcState({ node: 'ignoto' }), { sims: 100 });
  assert.equal(bad.ok, false);
  assert.ok(bad.error.length > 5);

  // l'offerta di un nodo che nel ladder non c'è: scartata in silenzio, zero sedili
  const ghost = seatMonteCarlo(mkLadderMc(), mcState({ offers: [{ nodeId: 'fantasma' }] }), { sims: 100 });
  assert.equal(ghost.ok, true);
  assert.deepEqual(ghost.seats, []);
  assert.equal(ghost.basis.fromOffers, true);
});

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
