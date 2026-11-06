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
  // un altro giro della race, un filo più lento — chiuso 97,6 s dopo il
  // precedente (somma dei settori 28150+34100+35350 = 97,6 s): tempi coerenti,
  // altrimenti la divisione in stint leggerebbe una sosta che non c'è
  riga('10:17:10.000', CAR, '28150', 0, 2),
  riga('10:17:40.000', CAR, '34100', 1, 2),
  riga('10:18:07.600', CAR, '35350', 2, 2),
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

/* COSTANZA SUI SETTORI (6/11, richiesta Mauro: «la costanza sui settori tra i
   giri, non solo il miglior giro»). Il test difende le regole: media/migliore/
   peggiore per settore sui giri veri; escursione = peggiore − migliore; σ e
   costanza % SOLO da 3 giri (con due giri la statistica non esiste); la
   finestra è la stessa del margine vero (stessa pista, giri della sessione). */
import { costanzaSettori, costanzaSettoriDaLog } from '../src/margine-log.mjs';

test('costanza settori: media, escursione e σ su tre giri noti', () => {
  const c = costanzaSettori([
    [30000, 35000, 36000],
    [29500, 34800, 35900],
    [30100, 34600, 36100],
  ]);
  assert.equal(c.giri, 3);
  const s1 = c.perSettore[0];
  assert.equal(s1.miglioreMs, 29500);
  assert.equal(s1.peggioreMs, 30100);
  assert.equal(Math.round(s1.mediaMs), 29867);
  assert.equal(s1.escursioneMs, 600);
  assert.ok(Math.abs(s1.sigmaMs - 321.46) < 0.5, `σ S1 ${s1.sigmaMs}`);
  assert.ok(Math.abs(s1.costanzaPct - 1.0763) < 0.01, `costanza S1 ${s1.costanzaPct}`);
  // il totale è il giro intero: migliore = la somma più bassa tra i GIRI
  // (non la somma dei singoli settori migliori, che non è un giro fatto)
  assert.equal(c.totale.miglioreMs, 29500 + 34800 + 35900);
  assert.equal(c.totale.peggioreMs, 30000 + 35000 + 36000);
  assert.ok(c.totale.sigmaMs > 0);
});

test('costanza settori: con due giri niente σ, la statistica non esiste', () => {
  const c = costanzaSettori([[30000, 35000, 36000], [30200, 34800, 35900]]);
  assert.equal(c.giri, 2);
  assert.equal(c.perSettore[0].sigmaMs, null);
  assert.equal(c.perSettore[0].costanzaPct, null);
  assert.equal(c.perSettore[0].escursioneMs, 200, 'l\'escursione si vede anche con due giri');
  assert.equal(costanzaSettori([]), null);
  assert.equal(costanzaSettori([[1, 2, 3]]), null, 'valori sotto il secondo non sono settori');
});

test('costanza settori: il giro legato apre la finestra del log, pista compresa', () => {
  const c = costanzaSettoriDaLog([logsDir], { track: 'Kyalami', bestSplits: [28000, 34000, 35200] });
  assert.ok(c, 'la race deve essere abbinata');
  assert.equal(c.giri, 2, 'i due giri della sessione Race, non il practice né Brands');
  assert.deepEqual(c.perSettore.map((s) => s.miglioreMs), [28000, 34000, 35200]);
  assert.equal(c.perSettore[0].sigmaMs, null, 'due giri: σ non si mostra');
  assert.equal(c.track, 'Kyalami GP');
  assert.equal(c.auto, CAR);
  // tripla che non esiste nel log, o settori mancanti: nessun numero inventato
  assert.equal(costanzaSettoriDaLog([logsDir], { track: 'Kyalami', bestSplits: [1, 2, 3] }), null);
  assert.equal(costanzaSettoriDaLog([logsDir], { track: 'Kyalami', bestSplits: [28000, 34000] }), null);
  assert.equal(costanzaSettoriDaLog([], { track: 'Kyalami', bestSplits: [28000, 34000, 35200] }), null);
});

/* COSTANZA PER STINT (6/11, richiesta Mauro: «la costanza dei settori separata
   per stint, così si vede se il degrado nasce in un settore preciso»). Gli
   stint si aprono su una sosta MISURATA (pausa ≥ 10 s oltre il tempo del giro)
   o su un salto di numero di giro: mai su un'ipotesi di carburante. */
import { stintiSettori } from '../src/margine-log.mjs';

const S = (a, b, c) => [a, b, c];
const G = (lap, t, s) => ({ lap, t, s });

test('stint: giri consecutivi senza pause restano un stint solo', () => {
  const giri = [
    G(1, 100000, S(30000, 35000, 36000)),
    G(2, 201000, S(30000, 35000, 36000)),
    G(3, 302000, S(30200, 34800, 35900)),
  ];
  const st = stintiSettori(giri);
  assert.equal(st.length, 1);
  assert.equal(st[0].giri, 3);
  assert.equal(st[0].fromLap, 1);
  assert.equal(st[0].toLap, 3);
  assert.equal(st[0].pausaPrimaMs, null);
  assert.ok(Math.abs(st[0].costanza.perSettore[0].sigmaMs - 115.47) < 0.5);
});

test('stint: una sosta lunga apre il secondo stint e lo dichiara', () => {
  const giri = [
    G(1, 100000, S(30000, 35000, 36000)),
    G(2, 201000, S(30000, 35000, 36000)),
    // ai box: 75 s di fermata oltre il tempo del giro
    G(3, 201000 + 101000 + 75000, S(29900, 34600, 35900)),
    G(4, 201000 + 101000 + 75000 + 100400, S(29900, 34700, 35800)),
  ];
  const st = stintiSettori(giri);
  assert.equal(st.length, 2);
  assert.deepEqual(st.map((x) => [x.numero, x.giri, x.fromLap, x.toLap]), [[1, 2, 1, 2], [2, 2, 3, 4]]);
  assert.ok(st[1].pausaPrimaMs >= 75000);
  // il secondo stint ha i suoi settori (S2 più lento del primo: è lì il segnale)
  assert.equal(st[1].costanza.perSettore[1].miglioreMs, 34600);
});

test('stint: un giro saltato dalla finestra spezza lo stint, senza attribuire degrado', () => {
  const giri = [
    G(1, 100000, S(30000, 35000, 36000)),
    G(2, 201000, S(30000, 35000, 36000)),
    G(4, 403000, S(30000, 35000, 36000)), // il 3 è stato scartato (fuori pista)
  ];
  const st = stintiSettori(giri);
  assert.equal(st.length, 2);
  assert.equal(st[1].fromLap, 4);
  assert.equal(st[1].pausaPrimaMs, null, 'il salto di giro non è una sosta: non si inventa una durata');
});

test('pendenza: dentro lo stint dice quanto cresce ogni settore a ogni giro', () => {
  const giri = [
    G(1, 100000, S(30000, 35000, 36000)),
    G(2, 201000, S(30000, 35100, 35950)),
    G(3, 302100, S(30000, 35200, 35900)),
    G(4, 403250, S(30000, 35300, 35850)),
  ];
  const st = stintiSettori(giri);
  assert.equal(st.length, 1, 'giri consecutivi: un solo stint');
  const p = st[0].pendenza;
  assert.equal(p.giri, 4);
  assert.ok(Math.abs(p.perSettore[0].pendenzaMsGiro) < 0.01, 'S1 costante: pendenza 0');
  assert.ok(Math.abs(p.perSettore[1].pendenzaMsGiro - 100) < 0.01, 'S2 +100 ms/giro');
  assert.ok(Math.abs(p.perSettore[2].pendenzaMsGiro + 50) < 0.01, 'S3 −50 ms/giro');
  assert.ok(Math.abs(p.totale.pendenzaMsGiro - 50) < 0.01, 'totale +50 ms/giro');
  assert.equal(p.perSettore[1].primoMs, 35000);
  assert.equal(p.perSettore[1].ultimoMs, 35300);
});

test('pendenza: sotto 3 giri non si calcola (due punti fanno sempre una retta)', () => {
  const st = stintiSettori([
    G(1, 100000, S(30000, 35000, 36000)),
    G(2, 202000, S(30200, 35400, 36000)),
  ]);
  assert.equal(st[0].pendenza.giri, 2);
  assert.equal(st[0].pendenza.perSettore[0].pendenzaMsGiro, null);
  assert.equal(st[0].pendenza.totale.pendenzaMsGiro, null);
});

test('stint: dentro il riepilogo del log, i giri senza pause fanno un stint', () => {
  const c = costanzaSettoriDaLog([logsDir], { track: 'Kyalami', bestSplits: [28000, 34000, 35200] });
  assert.equal(c.stinti.length, 1);
  assert.equal(c.stinti[0].giri, 2);
  assert.equal(c.stinti[0].costanza.giri, 2);
});
