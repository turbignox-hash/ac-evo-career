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

const { raceAutopsy, tettoReport, rivalDossier, setupAB, seatMonteCarlo, zoneTimeline, quadroZoneCheck, abPreferite } = await import('../src/analisi.mjs');
const { sampleLap } = await import('../src/motec.mjs');
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

test('raceAutopsy: vittoria — il margine sul secondo prende il posto dello 0,00 finto', () => {
  // come in classifica HE, gapMs del vincitore è SEMPRE 0 (tempo mio − tempo
  // vincitore): la voce «Distanza» deve parlare del MARGINE (secondGapMs,
  // calcolato in classify dal file grezzo), non dire «ridare 0,00s a me stesso».
  setLang('it');
  const a = raceAutopsy(ladder, {
    node: 'serie_gt3', season: 1,
    results: { serie_gt3: [{
      ...entry, position: 1, gapMs: 0, secondGapMs: 37036, points: 20,
      gridPosition: 1, laps: 3, winnerLaps: 3,
    }] },
  });
  assert.equal(a.entry.position, 1);
  assert.equal(a.entry.secondGapMs, 37036);
  const distanza = a.attributions.find((x) => x.title === 'Distanza');
  assert.ok(distanza, 'la voce Distanza nella vittoria c’è (con il margine)');
  assert.match(distanza.text, /Vittoria: margine sul secondo 37,04s su 3 giri/);
  assert.match(distanza.text, /~12,35s al giro di vantaggio/);
  assert.ok(!distanza.text.includes('0,00'), 'niente 0,00 finto nel racconto della vittoria');

  // GIRO VELOCE + PARTENZA NELL'AUTOPSIA (2/11, richiesta Mauro):
  // tale e quale al file: il giro veloce della ronda 1 (registrata dal test
  // qui sopra) l'ha firmato Bianchi (1:40.100) — la vittoria lo racconta anche
  // senza il Bonus del pilota.
  assert.ok(a.fastestOfRace, 'fastestOfRace c’è (griglia in archivio)');
  assert.equal(a.fastestOfRace.lap, '1:40.100');
  assert.match(String(a.fastestOfRace.by ?? ''), /Bianchi/);
  const giroVeloce = a.attributions.find((x) => x.title === 'Giro veloce');
  assert.ok(giroVeloce, 'la voce Giro veloce c’è (non firmato da te)');
  assert.match(giroVeloce.text, /1:40\.100/);
  assert.match(giroVeloce.text, /Bianchi/);
  const partenzaWin = a.attributions.find((x) => x.title === 'Partenza e primo giro');
  assert.ok(partenzaWin, 'la voce partenza c’è anche nella vittoria');
  assert.match(partenzaWin.text, /P1 in griglia → vittoria/);
  assert.match(partenzaWin.text, /pole intoccata/);

  // senza margine (file dato senza P2 leggibile): SOLO un silenzio, niente voce Distanza
  // stagione 99: nessuna raceRow in archivio — anche fastestOfRace e Giro veloce restano a zero
  const aSenza = raceAutopsy(ladder, {
    node: 'serie_gt3', season: 1,
    results: { serie_gt3: [{ ...entry, season: 99, position: 1, gapMs: 0, secondGapMs: null, laps: 3 }] },
  });
  assert.ok(!aSenza.attributions.some((x) => x.title === 'Distanza'), 'senza margine niente voce Distanza');
  // griglia non in archivio: niente fastestOfRace né voce Giro veloce (niente inventato)
  assert.equal(aSenza.fastestOfRace, null);
  assert.ok(!aSenza.attributions.some((x) => x.title === 'Giro veloce'), 'senza archivio niente voce Giro veloce');
});

test('raceAutopsy: P3 con giri corti — margine su P2 nel racconto e commento sul gap dal leader', () => {
  setLang('it');
  // stagione 99: nessuna raceRow in archivio — l'autopsia parla solo dei campi dell'entry
  const a = raceAutopsy(ladder, {
    node: 'serie_gt3', season: 1,
    results: { serie_gt3: [{
      ...entry, season: 99, round: 4, position: 3, gapMs: 9500, laps: 6, winnerLaps: 8,
      prevGapMs: 1200, prevName: 'Luca Bianchi', prevLaps: 6,
    }] },
  });
  assert.equal(a.entry.prevGapMs, 1200);
  const distanza = a.attributions.find((x) => x.title === 'Distanza');
  assert.ok(distanza, 'la voce Distanza c’è');
  assert.match(distanza.text, /Margine su P2 \(Luca Bianchi\): 1,20s/);
  assert.match(distanza.text, /Arrivi 2 giro\(i\) corto dal leader \(6 su 8\)/);
  assert.match(distanza.text, /misura la distanza piena, non il ritmo/);
  // il vecchio testo sospeso («l'età della gara fa il resto») non deve tornare
  assert.ok(!distanza.text.includes('età della gara'), 'niente frase corrotta di nuovo');
});

test('raceAutopsy: P3 doppiato dal precedente — il margine di tempo tace e il KPI non esiste', () => {
  setLang('it');
  const a = raceAutopsy(ladder, {
    node: 'serie_gt3', season: 1,
    results: { serie_gt3: [{
      ...entry, season: 99, round: 5, position: 3, gapMs: 9500, laps: 6, winnerLaps: 8,
      prevGapMs: 9500, prevName: 'Luca Bianchi', prevLaps: 8,
    }] },
  });
  const distanza = a.attributions.find((x) => x.title === 'Distanza');
  assert.ok(distanza);
  assert.ok(!distanza.text.includes('Margine su P2'), 'il prev è a un giro: il margine di tempo non si dice');
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

test('zoneTimeline: la fase lungo il giro, stesse soglie del riparto per zona', () => {
  setLang('it');
  const ab = setupAB(LD_A, LD_B);
  const ztl = zoneTimeline(sampleLap(LD_A, 'best', 240), sampleLap(LD_B, 'best', 240));
  assert.ok(ztl?.ok, JSON.stringify(ztl));
  assert.ok(ztl.segs.length >= 2, 'fette: ' + ztl.segs.length);
  // ordinate e NON sovrapposte lungo la frazione di distanza
  for (let i = 1; i < ztl.segs.length; i++) assert.ok(ztl.segs[i].x1 >= ztl.segs[i - 1].x2 - 1e-9, 'sovrappostetroppo: ' + JSON.stringify([ztl.segs[i - 1], ztl.segs[i]]));
  for (const g of ztl.segs) {
    assert.ok(['frenata', 'uscita', 'gas'].includes(g.zone), 'zona: ' + g.zone);
    assert.ok(g.s > 0, 'B domina: tutta fatta di tempo PERSO da A, non ' + g.s);
    assert.ok(g.pts >= 2, 'larghezza: ' + g.pts);
  }
  // la somma delle fette ritaglia il netto del riparto (le scarti sotto soglia sono centesimi)
  const tot = ztl.segs.reduce((a, g) => a + g.s, 0);
  assert.ok(Math.abs(tot - (ab.lostS - ab.gainedS)) < 0.15, 'fette ' + tot + ' vs netto ' + (ab.lostS - ab.gainedS));
  // la staccata del giro A esiste comessa fascia: la frenata pesa nella striscia come nel riparto
  assert.ok(ztl.segs.some((g) => g.zone === 'frenata'), 'frenata in vista: ' + JSON.stringify(ztl.segs.map((g) => g.zone)));
});

test('zoneTimeline: senza dati è null, e due file uguali non disegnano niente', () => {
  assert.equal(zoneTimeline(null, null), null);
  const ztl = zoneTimeline(sampleLap(LD_A, 'best', 240), sampleLap(LD_A, 'best', 240));
  assert.equal(ztl, null, 'A vs A: ogni fettina vale 0, sotto la soglia → nessuna fetta');
});

test('quadroZoneCheck: registra se la striscia del quadro-zone torna col riparto del banco', () => {
  const abc = { zones: { frenata: 0.36, uscita: 0.23, gas: 0.01 }, netRiparto: 0.58 };
  const zl = {
    ok: true,
    segs: [
      { zone: 'frenata', sign: 1, s: 0.342, x1: 0.02, x2: 0.18, pts: 12 },
      { zone: 'uscita', sign: 1, s: 0.228, x1: 0.18, x2: 0.34, pts: 12 },
      { zone: 'gas', sign: 1, s: 0.010, x1: 0.34, x2: 0.40, pts: 5 },
    ],
    somme: { frenata: 0.342, uscita: 0.228, gas: 0.010 },
    riparto: { frenata: 0.36, uscita: 0.23, gas: 0.01 },
    gained: 0.002,
  };
  const cOK = quadroZoneCheck(zl, abc);
  assert.ok(cOK.ok === true, JSON.stringify(cOK));
  assert.equal(cOK.netto, 0.58);
  assert.deepEqual(cOK.scarti, []);
  // fette sotto soglia: se il riparto del banco dichiara piu' della striscia il segnalatore lo dice (qui +0.44s in frenata sopra tolleranza)
  const c2 = quadroZoneCheck(zl, { ...abc, zones: { frenata: 0.80, uscita: 0.23, gas: 0.01 }, netRiparto: 1.02 });
  assert.equal(c2.ok, false, JSON.stringify(c2));
  assert.ok(c2.scarti.some((s) => s.zone === 'frenata'), JSON.stringify(c2));
  assert.ok(c2.scarti.some((s) => s.zone === 'netto'), JSON.stringify(c2));
  assert.equal(quadroZoneCheck(null, abc), null);
});

/* -- 3bis) AUTOPUNTAMENTO DEL BANCO (2/11) ------------------------ */
test('abPreferite: prende la coppia con più sessioni, A la più vecchia e B la più recente', () => {
  const ses = [
    { file: 'aa', car: 'Porsche GT3', track: 'Monza', mtimeMs: 1000 },
    { file: 'im1', car: 'Mazda MX-5', track: 'Imola', mtimeMs: 2000 },
    { file: 'im2', car: 'Mazda MX-5', track: 'Imola', mtimeMs: 5000 },
    { file: 'im3', car: 'Mazda MX-5', track: 'Imola', mtimeMs: 3000 },
    { file: 'im4', car: 'Mazda MX-5', track: 'Imola', mtimeMs: 4000 },
  ];
  const p = abPreferite(ses);
  assert.deepEqual(p, { car: 'Mazda MX-5', track: 'Imola', fileA: 'im1', fileB: 'im2' });
});

test('abPreferite: parità di quantità si risolve col binomio più recente, e senza coppia doppia è null', () => {
  const pari = abPreferite([
    { file: 'a1', car: 'Uno', track: 'Imola', mtimeMs: 5000 },
    { file: 'a2', car: 'Uno', track: 'Imola', mtimeMs: 6000 },
    { file: 'b1', car: 'Due', track: 'Monza', mtimeMs: 1000 },
    { file: 'b2', car: 'Due', track: 'Monza', mtimeMs: 4000 },
  ]);
  assert.equal(pari.fileA, 'a1'); // 2 = 2, ma Unò ha la sessione più recente → vince
  assert.equal(abPreferite([{ file: 'solo', car: 'X', track: 'Imola', mtimeMs: 1 }]), null);
  assert.equal(abPreferite([]), null);
  const fuori = abPreferite([
    { file: 'x1', car: 'X', track: 'Imola', mtimeMs: 1 },
    { file: 'x2', car: 'X', track: 'Imola', mtimeMs: 2 },
    { file: '', car: 'X', track: 'Imola', mtimeMs: 3 }, // senza file: scartata
  ]);
  assert.equal(fuori.fileA, 'x1');
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

test('tettoReport: aggrega per pista delta sul campione top e settore peggiore', () => {
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
  // il margine best−teorico NON c'è più: i splits di EVO sono i settori del
  // giro migliore (3/11, dopo «il margine a 0.00» verificato su tutte le 14
  // piste), quindi giro teorico ≡ best per costruzione — il dato non esiste.
  assert.equal(monza.marginBestMs, undefined);
  assert.equal(monza.marginLastMs, undefined);
  assert.equal(monza.marginMs, undefined);
  // mediana (bassa) dei delta per settore: S1 [300,250] → 250, S2 [400,200] → 200
  // → il peggiore è S1
  assert.equal(monza.worstSector, 1);
  assert.equal(monza.worstSectorDeltaMs, 250);
  // IL PICCO (3/11, richiesta Mauro): il colpo singolo più grosso che la
  // mediana nasconde — qui la mediana dice S1 250, ma il picco è S2 400
  // (round 0) — esce come evento nella colonna «Reparto che pesa»
  assert.deepEqual(monza.picco, { sector: 2, deltaMs: 400, season: 1, round: 0 });
  assert.equal(monza.campTopDeltaMs, 400);
  // i peggiori della carriera: il massimo per primo
  assert.equal(t.worstSectors[0].sector, 2);
  assert.deepEqual(t.worstSectors[0], { track: 'Monza', sector: 2, deltaMs: 400, season: 1, round: 0 });
  // la frase-corrotta «collecchia» non deve tornare nell'hint
  assert.ok(!t.hint.includes('collecchia'));
});

test('tettoReport: il 0,00 è campione SOLO col campo vivo, senza campo è nessun dato (3/11, lezione Suzuka)', () => {
  const state3 = { results: {
    campionata: [
      // campione vero: delta 0 ma fieldCount > 0 (rivali reali, best tutti miei)
      { track: 'Champion Park', season: 2, round: 0, position: 1, dnf: false, sectors: { sectors: [
        { index: 1, deltaMs: 0, fieldCount: 13 }, { index: 2, deltaMs: 0, fieldCount: 13 }, { index: 3, deltaMs: 0, fieldCount: 11 },
      ] } },
    ],
    buca_bianca: [
      // campo vuoto: nessun rivale con split misurato — il 0,00 NON è un punteggio
      { track: 'Vuota Seca', season: 2, round: 1, position: 1, dnf: false, sectors: { sectors: [
        { index: 1, deltaMs: 0, fieldCount: 0 }, { index: 2, deltaMs: 0, fieldCount: 0 }, { index: 3, deltaMs: 0, fieldCount: 0 },
      ] } },
    ],
    mestizzano: [
      // misto: S1 e S3 senza campo, S2 con campo e delta vero — la busta è 300
      { track: 'Mistona', season: 2, round: 2, position: 4, dnf: false, sectors: { sectors: [
        { index: 1, deltaMs: 0, fieldCount: 0 }, { index: 2, deltaMs: 300, fieldCount: 9 }, { index: 3, deltaMs: 0, fieldCount: 0 },
      ] } },
    ],
    antica: [
      // vecchio import senza provenienza: si calcola col campo presente (stesso comportamento di ieri)
      { track: 'Monza', season: 1, round: 0, position: 3, dnf: false, sectors: { sectors: [
        { index: 1, deltaMs: 150 }, { index: 2, deltaMs: 220 }, { index: 3, deltaMs: null },
      ] } },
    ],
  } };
  const t = tettoReport(ladder, state3);
  assert.equal(t.ok, true);
  const champ = t.perTrack.find((x) => x.track === 'Champion Park');
  assert.equal(champ.campTopDeltaMs, 0, 'campione col campo vivo: il numero resta 0, non null');
  assert.equal(champ.picco, null, 'deltas a 0 col campo vivo: nessun picco da raccontare');
  const vuota = t.perTrack.find((x) => x.track === 'Vuota Seca');
  assert.equal(vuota.campTopDeltaMs, null, 'senza campo: NESSUN DATO (null), non uno 0,00 da vanteria');
  assert.equal(t.perTrack.filter((x) => x.track === 'Vuota Seca').length, 1);
  assert.equal(t.worstSectors.every((w) => w.track !== 'Vuota Seca'), true, 'senza campo non c\'è tempo "perso" da classificare');
  const misto = t.perTrack.find((x) => x.track === 'Mistona');
  assert.equal(misto.campTopDeltaMs, 300, 'i settori senza campo non azzeraono la busta: pesa SOLO il settore con campo');
  assert.deepEqual(misto.picco, { sector: 2, deltaMs: 300, season: 2, round: 2 }, 'il picco segue la regola del campo: pesa solo il S2 con campo');
  assert.equal(t.perTrack.find((x) => x.track === 'Monza').campTopDeltaMs, 220, 'vecchio import senza fieldCount: campo presente, busta come ieri');
  // nel tetto visibile il campione ed il sans-dato escono entrambi (entrambi
  // hanno riparto) mentre la pista vuota resta fuori dalla tabella: worstSectorDeltaMs null
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
