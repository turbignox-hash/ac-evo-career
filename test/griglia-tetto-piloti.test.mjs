// griglia-tetto-piloti.test.mjs — LE SCHEDE VUOTE DELLA GRIGLIA (7/11).
//
// Il fatto: sul vivo alle 16:07 il customgrid aveva 17 celle-auto e 13 record
// pilota, e il menu EVO mostrava quattro riquadri vuoti. Il pending della ronda
// dichiarava ancora 18 auto / 17 avversari (il numero della SERIE) mentre il
// gate aveva riallineato la griglia al weekend (13 posti): il Cruscotto chiedeva
// 17 modelli a un weekend da 13, e le celle senza pilota restavano mute.
//
// Il patto, provato qui sui FILE in sandbox:
//   1. il pending scende sul numero di celle DAVVERO scritte (sincronizzaPendingGriglia)
//   2. il comando non manda più avversari dei piloti che la griglia ha (weekendConTetto)
//   3. il monomarca resta intatto (la griglia la genera EVO)
//   4. niente griglia leggibile → weekend com'era (mai un blocco)
import './_game-sandbox.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const { encodeMsg, GAME_MODES_DIR } = await import('../src/evo-grid.mjs');
const { GRID_FILE } = await import('../src/grid-apply.mjs');
const { weekendConTetto } = await import('../src/uiapp-pub.mjs');
const { sincronizzaPendingGriglia } = await import('../src/race.mjs');

const cella = (carId) => encodeMsg([
  { field: 1, wire: 2, bytes: Buffer.from('Demo', 'utf8') },
  { field: 3, wire: 2, bytes: Buffer.from(carId, 'utf8') },
]);
const pilota = (nome) => encodeMsg([{ field: 1, wire: 2, bytes: Buffer.from(nome, 'utf8') }]);
/** griglia con `celle` auto e `piloti` record: la forma del file vero. */
const scriviGriglia = ({ celle, piloti }) => {
  writeFileSync(GRID_FILE, encodeMsg([
    ...Array.from({ length: celle }, () => ({ field: 1, wire: 2, bytes: cella('ks_porsche_718_cayman_gt4_rs') })),
    ...Array.from({ length: piloti }, (_, i) => ({ field: 2, wire: 2, bytes: pilota(`pilota-${i}`) })),
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(celle) }]) },
  ]));
};

test('il pending scende sul numero di celle scritte (18/17 → 13/12)', () => {
  const pending = { gridSize: 18, weekend: { opponents: 17 } };
  assert.equal(sincronizzaPendingGriglia(pending, 13), true, 'il cambio si firma');
  assert.equal(pending.gridSize, 13);
  assert.equal(pending.weekend.opponents, 12);
  assert.equal(sincronizzaPendingGriglia(pending, 13), false, 'idempotente: già allineato');
});

test('il pending già giusto non si tocca e i numeri storti non lo rompono', () => {
  const pending = { gridSize: 13, weekend: { opponents: 12 } };
  assert.equal(sincronizzaPendingGriglia(pending, 13), false);
  assert.equal(sincronizzaPendingGriglia(pending, null), false, 'senza conteggio non si scrive');
  assert.equal(sincronizzaPendingGriglia(pending, 1), false, 'una griglia da 1 auto non è credibile');
  assert.equal(sincronizzaPendingGriglia(null, 13), false);
  const senzaWeekend = { gridSize: 18 };
  assert.equal(sincronizzaPendingGriglia(senzaWeekend, 13), false);
});

test('il comando non chiede più avversari dei piloti sul disco', () => {
  scriviGriglia({ celle: 17, piloti: 13 });
  const weekend = { singleMake: false, opponents: 17, gridCars: ['ks_porsche_718_cayman_gt4_rs', 'ks_audi_r8_lms_gt4_evo'] };
  const out = weekendConTetto(weekend);
  assert.equal(out.opponents, 12, '13 piloti = 12 avversari + la tua cella (stessa forma del gate declared + 1)');
  assert.deepEqual(out.gridCars, weekend.gridCars, 'il resto del weekend viaggia intero');
  assert.equal(weekend.opponents, 17, 'la fixture non si muta');
});

test('dentro il tetto il weekend torna com\'è (stesso oggetto, nessun lavoro)', () => {
  scriviGriglia({ celle: 13, piloti: 13 });
  const weekend = { singleMake: false, opponents: 12 };
  assert.equal(weekendConTetto(weekend), weekend);
  const stretto = { singleMake: false, opponents: 6 };
  assert.equal(weekendConTetto(stretto), stretto);
});

test('monomarca: la griglia la genera EVO, il tetto non c\'entra', () => {
  scriviGriglia({ celle: 5, piloti: 5 });
  const weekend = { singleMake: true, opponents: 15, gridCars: ['r5_touring'] };
  assert.equal(weekendConTetto(weekend), weekend);
});

test('griglia assente o illeggibile: il weekend resta quello scritto', () => {
  rmSync(GRID_FILE, { force: true });
  const weekend = { singleMake: false, opponents: 17 };
  assert.equal(weekendConTetto(weekend), weekend);
  writeFileSync(GRID_FILE, Buffer.from([0xff, 0xff, 0xff]));
  assert.equal(weekendConTetto(weekend), weekend, 'file storto: nessun taglio a caso');
});

test('senza weekend il comando non inventa niente', () => {
  assert.equal(weekendConTetto(null), null);
  assert.equal(weekendConTetto(undefined), null);
});

test('vince il tetto più stretto: comanda anche il numero dichiarato dal weekend', () => {
  // griglia larga (18 piloti) ma weekend che dichiara 12 avversari: è il 12
  // quello su cui EVO dimensiona il via (celle diverse dall'atteso = crash).
  scriviGriglia({ celle: 18, piloti: 18 });
  const weekendSave = encodeMsg([
    { field: 3, wire: 2, bytes: encodeMsg([
      { field: 1, wire: 2, bytes: Buffer.from('Practice', 'utf8') },
      { field: 7, wire: 0, varint: BigInt(12) },
      ...Array.from({ length: 12 }, (_, i) => ({ field: 10, wire: 2, bytes: cella(`ks_demo_${i}`) })),
    ]) },
  ]);
  writeFileSync(join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave'), weekendSave);
  const weekend = { singleMake: false, opponents: 17 };
  assert.equal(weekendConTetto(weekend).opponents, 12);
});
