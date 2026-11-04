// test/griglia-campionato.test.mjs — REGOLA DELLE GRIGLIE DI CAMPIONATO
// (4/11/2026, richiesta Mauro: «26-28 auto sono troppe, fai in modo che i
// campionati generino griglie da 20-22»).
//
// Il 27/28 non nasceva dal ladder (max gridSize 20): nasceva dal gate di
// rebuildGridApply, che allineava il customgrid al conteggio NATIVO del
// weekend. Per scendere servono DUE scritture coerenti — le voci 3.10
// (roster AI) e il 3.7 dichiarato — altrimenti il gate rilancia il conto e
// 22 celle contro 27 attese sono il 0xC0000005 della lezione 24/10.
// Qui si custodiscono: la regola unica, il tetto del ladder e la riduzione
// del roster. Fixture sintetica in tmp: mai il save vero.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMsg } from '../tools/evo-grid.mjs';
import {
  GRIGLIA_CAMPIONATO, celleGrigliaCampionato, weekendCarCount,
  weekendGridMode, setWeekendGridCustom,
} from '../tools/set-track.mjs';
import { riduciSlotRoster } from '../src/weekend-roster.mjs';

const B = (s) => Buffer.from(String(s), 'utf8');
const cella = (i) => encodeMsg([
  { field: 3, wire: 2, bytes: B(`ks_car_${i}`) },
  { field: 10, wire: 2, bytes: B(`mech_${i}`) },
  { field: 11, wire: 2, bytes: B(`vis_${i}`) },
]);
const sessione = ({ nome, declared = null, cars = 0 }) => {
  const s = [
    { field: 1, wire: 2, bytes: B(nome) },
    { field: 5, wire: 2, bytes: encodeMsg([{ field: 2, wire: 2, bytes: B('Monza') }]) },
    { field: 6, wire: 0, varint: BigInt(1) },
  ];
  if (declared != null) s.push({ field: 7, wire: 0, varint: BigInt(declared) });
  for (let i = 0; i < cars; i++) s.push({ field: 10, wire: 2, bytes: cella(i) });
  return { field: 3, wire: 2, bytes: encodeMsg(s) };
};
const scriviWeekend = (file, { declared = 27, cars = 27 } = {}) => writeFileSync(file, encodeMsg([
  sessione({ nome: 'Practice', declared, cars }),
  sessione({ nome: 'Qualifying', cars }),
  sessione({ nome: 'Race', cars }),
]));

test('la regola di campionato è una sola: 20-22 auto', () => {
  assert.deepEqual(GRIGLIA_CAMPIONATO, { min: 20, max: 22 });
  assert.equal(celleGrigliaCampionato(28), 22, 'i 28 del weekend scendono a 22');
  assert.equal(celleGrigliaCampionato(27), 22);
  assert.equal(celleGrigliaCampionato(23), 22);
  assert.equal(celleGrigliaCampionato(22), 22);
  assert.equal(celleGrigliaCampionato(21), 21);
  assert.equal(celleGrigliaCampionato(20), 20);
  assert.equal(celleGrigliaCampionato(14), 20, 'sotto il minimo la griglia sale a 20');
  assert.equal(celleGrigliaCampionato(null), 20, 'senza numero vale il minimo, non zero');
});

test('riduciSlotRoster + 3.7: il weekend scende a 21 avversari, 22 celle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'griglia-campionato-'));
  const file = join(dir, 'GameModeType_RACE_WEEKEND.gamemodesave');
  try {
    scriviWeekend(file, { declared: 27, cars: 27 });
    const prima = weekendCarCount(file);
    assert.equal(prima.cars, 27);
    assert.equal(prima.declared, 27);

    // force: la suite gira anche con EVO aperto (stessa regola di syncRoster)
    const rid = riduciSlotRoster(21, { file, force: true });
    assert.equal(rid.written, true, 'le voci 3.10 oltre gli avversari si tolgono');
    assert.equal(setWeekendGridCustom(21, { file }).written, true);

    const dopo = weekendCarCount(file);
    assert.equal(dopo.cars, 21, 'roster allineato agli avversari');
    assert.equal(dopo.declared, 21, '3.7 = avversari');
    assert.equal(dopo.declared + 1, 22, 'la griglia è declared + te: 22 celle');
    assert.deepEqual(weekendGridMode(file), { mode: 'custom', count: 21 });
    assert.equal(riduciSlotRoster(21, { file, force: true }).written, false, 'idempotente');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pianoGriglia non supera mai il tetto di campionato', async () => {
  const { pianoGriglia } = await import('../tools/ronda-ladder.mjs');
  const nodo = { cars: ['a', 'b'], gridSize: 26 };
  assert.equal(pianoGriglia(nodo, 'off').count, 21, 'una scala a 26 auto resta a 22 in griglia');
  assert.equal(pianoGriglia(nodo, 'off').count + 1, GRIGLIA_CAMPIONATO.max);
  assert.equal(pianoGriglia({ cars: ['a', 'b'], gridSize: 20 }, 'off').count, 19);
});
