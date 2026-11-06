// agenda-procedurale.test.mjs — il calendario delle serie NON iscritte (6/11).
//
// La regressione che conta: la stagione di una serie procedurale deve AVANZARE
// a ogni giro completo del suo ciclo. Prima la formula usava l'indice della
// ronda dentro il ciclo (sempre 0…len−1) e la stagione restava ferma per
// sempre: tutte le gare proiettate dicevano la stagione del pilota, anche a
// centinaia di giorni di distanza. Qui si verifica:
//   - R1…Rlen del primo ciclo = stagione del pilota;
//   - lo stesso ciclo successivo = stagione + 1, ronde comprese;
//   - niente gare prima del primo R1;
//   - quando il pilota AVANZA nel ciclo, la serie corre la sua stagione
//     corrente (la proiezione non scappa avanti coi giorni).
import test from 'node:test';
import assert from 'node:assert/strict';
import { racesOnDay, cadenzaSerie } from '../src/agenda.mjs';

const ROUNDS = 3;
const CADENZA = cadenzaSerie(1);          // la prima serie del ladder → 3..10
const CYCLE = ROUNDS * CADENZA;
const R1 = (1 * (509 + CADENZA * 297)) % CYCLE + 1;

const ladder = {
  nodes: [{
    nodeId: 'demo', display: 'Demo Cup', discipline: 'touring', profile: 'sprint', level: 1,
    cars: ['car1'], econ: { prize: 1000 },
    calendar: Array.from({ length: ROUNDS }, (_, i) => ({ name: `Round ${i + 1}`, track: `t${i}`, laps: 3, hour: 10 })),
  }],
  contentNames: { tracks: { t0: 'Track 0', t1: 'Track 1', t2: 'Track 2' } },
};

/** Stato minimo: nessun sedile (serie procedurale), stagione e giorno scelti. */
const stato = (day, season = 16) => ({ season, rep: 0, bestFinish: {}, seats: {}, agenda: { day } });

/** La gara della serie nel giorno `day` VISTA da `today` (default: lo stesso
 *  giorno). La distinzione conta: la stagione si misura dal ciclo che contiene
 *  OGGI, quindi una proiezione sul futuro deve avere un oggi fermo. */
const garaDelGiorno = (day, season = 16, today = day) =>
  racesOnDay(ladder, stato(today, season), day).find((g) => g.node.nodeId === 'demo') ?? null;

test('procedurale: la stagione avanza a ogni ciclo, ronda per ronda', () => {
  // oggi = primo R1: il primo ciclo È la stagione del pilota
  const g0 = garaDelGiorno(R1, 16, R1);
  assert.ok(g0, 'la R1 del primo ciclo deve esistere');
  assert.equal(g0.index, 0);
  assert.equal(g0.season, 16, 'il primo ciclo è la stagione in corso');

  // R2 e R3 dello stesso ciclo restano la stessa stagione
  assert.equal(garaDelGiorno(R1 + CADENZA, 16, R1).season, 16);
  assert.equal(garaDelGiorno(R1 + 2 * CADENZA, 16, R1).season, 16);

  // giro completo del ciclo: si riparte da R1, ma è la stagione DOPO
  const g1 = garaDelGiorno(R1 + CYCLE, 16, R1);
  assert.equal(g1.index, 0, 'il ciclo ricomincia dalla R1');
  assert.equal(g1.season, 17, 'un ciclo intero = una stagione in più');
  assert.equal(garaDelGiorno(R1 + CYCLE + CADENZA, 16, R1).season, 17);
  assert.equal(garaDelGiorno(R1 + CYCLE + 2 * CADENZA, 16, R1).season, 17);

  // tre cicli avanti: tre stagioni avanti, non sempre 16
  assert.equal(garaDelGiorno(R1 + 3 * CYCLE, 16, R1).season, 19);
  assert.notEqual(garaDelGiorno(R1 + 3 * CYCLE, 16, R1).season, garaDelGiorno(R1).season, 'la stagione non deve restare ferma');
});

test('procedurale: la stagione avanza anche a stagioni del pilota diverse', () => {
  assert.equal(garaDelGiorno(R1, 3, R1).season, 3);
  assert.equal(garaDelGiorno(R1 + CYCLE, 3, R1).season, 4);
  assert.equal(garaDelGiorno(R1 + 2 * CYCLE, 20, R1).season, 22);
});

test('procedurale: niente gare prima del primo R1', () => {
  for (let d = 1; d < R1; d++) {
    assert.equal(garaDelGiorno(d, 16, R1), null, `il giorno ${d} è prima della prima R1 (che cade il ${R1})`);
  }
});

test('procedurale: col pilota avanti nel ciclo, la serie corre la sua stagione (niente fuga in avanti)', () => {
  // oggi dentro il secondo ciclo: quella ronda è la stagione corrente, non 17
  const oggi = R1 + CYCLE;
  assert.equal(garaDelGiorno(oggi, 16, oggi).season, 16, 'il ciclo che contiene oggi è la stagione del pilota');
  // ...e la ronda del ciclo dopo è la stagione successiva
  assert.equal(garaDelGiorno(oggi + CYCLE, 16, oggi).season, 17);
  // anche guardando indietro di un ciclo non si scende sotto la stagione corrente
  assert.equal(garaDelGiorno(R1, 16, oggi).season, 16);
});
