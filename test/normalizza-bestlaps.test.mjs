// normalizza-bestlaps.test.mjs — GUARDIA DELLA LEVA DI CURA bestLaps (2/11,
// richiesta Mauro: «merge case-insensitive, con backup di guardia e verifica»).
//
// Il difetto custodito: l'anomalia A1 dell'audit 1/11 — «imola» (23/9) e
// «Imola» (31/10) nella stessa mappa. La leva (tools/normalizza-bestlaps.mjs)
// fonde i gruppi case-insensitive; qui si fissa il PATTO della fusione,
// in puro (nessun disco):
//   gruppo in doppia grafia → una chiave sola, col CANONE del ladder;
//   record vincente         → il più VELOCE, a parità il più recente;
//   accento ≠ grafia        → «Nurburgring» e «Nürburgring» non si fondono;
//   chiavi estranee         → immutabili alla lettera (deep-equal);
//   niente perso            → le sepolte sono DICHIARATE, mai evaporate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaBestLaps, lapMs, grafiaNorma, chiaveBestLaps } from '../tools/normalizza-bestlaps.mjs';

const IMPOLA_VECCHIA = { time: '02:17.115', car: 'Abarth 695 Biposto', season: 1, round: 0, at: '2026-09-23T18:21:00.103Z' };
const IMPOLA_VIVA = { time: '02:05.382', car: 'Porsche 911 GT3 RS (992)', season: 13, round: 5, at: '2026-10-31T14:46:24.242Z' };
const MONZA = { time: '02:16.680', car: 'Honda S2000 AP1', season: 4, round: 1, at: '2026-09-30T20:03:49.575Z' };

test('Gruppo in doppia grafia: una chiave sola col canone del ladder, il giro più VELOCE vince', () => {
  const { nuovo, fusioni } = normalizzaBestLaps({ imola: IMPOLA_VECCHIA, Imola: IMPOLA_VIVA, Monza: MONZA }, ['Imola', 'Monza']);
  assert.deepEqual(Object.keys(nuovo).sort(), ['Imola', 'Monza'], 'devono restare due piste, non tre chiavi.');
  assert.equal(nuovo.Imola.time, '02:05.382', 'il record di Imola deve essere il più VELOCE del gruppo, non l\'ultimo arrivato.');
  assert.equal(fusioni.length, 1);
  assert.deepEqual(fusioni[0], {
    in: 'Imola',
    tempo: '02:05.382',
    sepolte: [{ chiave: 'imola', time: '02:17.115' }],
  }, 'la morte del record doppio deve essere DICHIARATA, mai evaporata.');
  assert.deepEqual(nuovo.Monza, MONZA, 'le chiavi fuori dal gruppo restano IDENTICHE alla lettera.');
});

test('A parità di giro vince il PIÙ RECENTE; in ORTOGRAFIA vince il canone del ladder, non la novità', () => {
  const vecchia = { time: '01:40.000', car: 'A', at: '2026-01-01T00:00:00Z' };
  const recente = { time: '01:40.000', car: 'B', at: '2026-06-01T00:00:00Z' };
  const { nuovo } = normalizzaBestLaps({ fuji: vecchia, Fuji: recente }, []);
  assert.equal(nuovo.Fuji.car, 'B', 'tempo pari → il record più recente vince.');
  assert.equal(Object.keys(nuovo)[0], 'Fuji', 'senza canone l\'ortografia segue il record più recente.');
  // col canone nel ladder: l'ortografia è quella, anche se il suo record è il vecchio
  const c = normalizzaBestLaps({ monza: recente, Monza: vecchia }, ['Monza']);
  assert.equal(Object.keys(c.nuovo)[0], 'Monza', 'col canone l\'ortografia è quella del ladder, pure col record vecchio.');
});

test('L\'ACCENTO non è grafia: Nurburgring e Nürburgring restano DUE piste', () => {
  const r1 = { time: '02:25.608', at: '2026-09-30T19:06:43.961Z' };
  const r2 = { time: '02:10.000', at: '2026-10-31T10:00:00Z' };
  const { nuovo, fusioni } = normalizzaBestLaps({ Nurburgring: r1, Nürburgring: r2 }, ['Nürburgring']);
  assert.equal(fusioni.length, 0, 'accento ≠ case: niente fusione.');
  assert.equal(nuovo.Nurburgring?.time, r1.time);
  assert.equal(nuovo.Nürburgring?.time, r2.time);
});

test('Niente evaporato: le sepolte di ogni fusione sono dichiarate nel registro', () => {
  const bl = { imola: IMPOLA_VECCHIA, Imola: IMPOLA_VIVA, Monza: MONZA };
  const { nuovo, fusioni } = normalizzaBestLaps(bl, ['Imola', 'Monza']);
  const persi = Object.entries(bl).filter(([k]) => Object.keys(nuovo).every((n) => grafiaNorma(n) !== grafiaNorma(k)));
  assert.deepEqual(persi, [], 'nessuna pista evaporata: ogni chiave prima ha il suo gruppo dopo.');
  assert.equal(fusioni[0].sepolte.length, 1, 'le ortografie morte di ogni fusione sono elencate nel registro.');
});

test('lapMs legge il formato del save e fallisce a Infinity (mai NaN in corsa)', () => {
  assert.equal(lapMs('02:17.115'), 137115);
  assert.equal(lapMs('1:38.958'), 98958);
  assert.equal(lapMs('01:02:03.400'), 3723400, 'la forma lunga H:MM:SS.mmm si parsa pure, senza confondere minuti e ore');
  assert.equal(lapMs('n/d'), Infinity);
  assert.equal(lapMs(null), Infinity);
});

test('Chiavi anormali (spazi, record null) non fanno esplodere la fusione', () => {
  const { nuovo, fusioni } = normalizzaBestLaps({ ' Suzuka  ': { time: '02:17.976' }, Suzuka: { time: '02:10.000' }, vuota: null }, []);
  assert.deepEqual(nuovo.Suzuka, { time: '02:10.000' }, 'anche con spazi la grafia si raggruppa case-insensitive.');
  assert.equal(nuovo.vuota, null, 'il record vuoto non è un peccato: si conserva com\'è.');
  assert.equal(fusioni.length, 1);
});

// — AGGANCIO 3/11: la leva arriva PRIMA del nodo di import —
// La scrittura di una gara NUOVA (src/state.mjs · applyRaceResult) usa
// chiaveBestLaps: nessuna doppia grafia dovrà più risorgere dal save.

test('chiaveBestLaps: una gara nuova atterra sulla grafia GIÀ PRESENTE, non ne semina una gemella', () => {
  const bl = { imola: IMPOLA_VECCHIA, Monza: MONZA };
  // l'import porta «Imola» (nome attivo del ladder): la chiave è l'imola vecchia
  assert.equal(chiaveBestLaps(bl, 'Imola', ['Imola', 'Monza']), 'imola', 'la grafia esistente (anche bassa) riceve il record nuovo.');
  // grafia non ancora toccata e nome ladder presente: il canone del ladder
  assert.equal(chiaveBestLaps(bl, 'suzuka', ['Suzuka']), 'Suzuka', 'il nome ladder è il canone per le piste nuove.');
  // niente aggancio possibile: il valore del payload, pulito
  assert.equal(chiaveBestLaps(bl, '  laguna ', []), 'laguna', 'senza aggancio la chiave è il payload, senza spazi in testa né in coda.');
  // accento ≠ grafia: il canone del ladder NON aggancia la pista accennata
  assert.equal(chiaveBestLaps({ Nürburgring:IMPOLA_VECCHIA }, 'Nurburgring', []), 'Nurburgring', 'l\'accento NON è grafia: la chiave bassa non atterra su quella accennata (e viceversa).');
});

test('applyRaceResult NON risemina doppie grafie: il record di una gara nuova va nella grafia esistente', async () => {
  await import('./_flows-sandbox.mjs');
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))));
  const LADDER = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const { createCareer, applyRaceResult, nodeById } = await import('../src/state.mjs');

  const ladder = JSON.parse(JSON.stringify(LADDER));
  const state = createCareer(ladder, { name: 'Canone', first: 'C', last: 'N' });
  const node = nodeById(ladder, state.node);
  const trackId = node.calendar[0].track;
  const disp = ladder.contentNames?.tracks?.[trackId] ?? trackId;   // il nome attivo (i lettori cercano QUESTO)
  // la doppia grafia dell'anomalia A1: STESSA grafia, ALTRA battitura —
  // la C maiuscola/minuscola ribaltata ('brands Hatch' ≈ 'Brands Hatch');
  // il trattino basso dell'ID NON è grafia: un id tipo brands_hatch resta
  // un'altra pista agli occhi della leva e del canone.
  const strana = disp[0] === disp[0].toLowerCase()
    ? disp[0].toUpperCase() + disp.slice(1)
    : disp[0].toLowerCase() + disp.slice(1);
  assert.notEqual(strana, disp, 'fixture: serve una grafia DIVERSA a parità di suono');
  assert.equal(grafiaNorma(strana), grafiaNorma(disp), 'fixture: le due grafie devono raggrupparsi insieme');
  state.stats ??= {};
  state.stats.bestLaps ??= {};   // su una carriera vergine ensureStats non è ancora passata
  state.stats.bestLaps[strana] = { time: '99:99.999', car: 'Vecchia', at: '2026-01-01T00:00:00.000Z' };

  // la gara nuova (track = id del calendario) scrive il record personale
  applyRaceResult(ladder, state, node, {
    position: 1, gridSize: node.gridSize, track: trackId, bestLap: '01:39.000', fl: false,
  });

  const chiavi = Object.keys(state.stats.bestLaps);
  const gruppi = new Set(chiavi.map((k) => grafiaNorma(k)));
  assert.equal(chiavi.length, gruppi.size, 'nessuna doppia grafia dopo l\'import: il nuovo atterra sulla grafia già presente.');
  assert.ok(chiavi.includes(strana), `la chiave preesistente «${strana}» resta, la gara nuova la raccoglie (non la gemella «${disp}»).`);
  assert.ok(!chiavi.includes(disp), `non dev'essersi creata la chiave gemella «${disp}» accanto a «${strana}».`);
  assert.ok(state.stats.bestLaps[strana].time < '02', `il record migliore sulla grafia viva è fresco (trovato: ${state.stats.bestLaps[strana].time}).`);
});
