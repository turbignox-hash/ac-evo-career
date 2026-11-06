// test/griglia-campionato.test.mjs — REGOLA DELLE GRIGLIE DI CAMPIONATO
// (4/11/2026. Prima richiesta Mauro: «26-28 auto sono troppe»; poi la
// correzione: «non per tutti 20-22: differenzia, alcuni partono con 12, 14,
// 16, 18, 20 — varia in base al tipo di auto e al campionato»).
//
// Il 27/28 non nasceva dal ladder (che già varia: 12, 14, 16, 18, 20): nasceva
// dal gate di rebuildGridApply, che allineava il customgrid al conteggio
// NATIVO del weekend. La griglia giusta è quella DEL campionato (gridSize del
// nodo), con tetto 22 e minimo 12; per scendere servono DUE scritture coerenti
// — voci 3.10 (roster AI) e 3.7 dichiarato. Fixture sintetica in tmp.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMsg } from '../src/evo-grid.mjs';
import {
  GRIGLIA_CAMPIONATO, celleGrigliaCampionato, weekendCarCount,
  weekendGridMode, setWeekendGridCustom,
} from '../src/set-track.mjs';
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

test('ogni campionato porta IL SUO numero: 12, 14, 16, 18, 20 (tetto 22)', () => {
  assert.deepEqual(GRIGLIA_CAMPIONATO, { min: 12, max: 22 });
  const serie = [
    ['coppa_citta', 12], ['trofeo_mx5', 14], ['dtm_legends', 16],
    ['touring_pro', 18], ['gt_apex', 20],
  ];
  for (const [nodeId, atteso] of serie) {
    assert.equal(celleGrigliaCampionato({ nodeId, gridSize: atteso }), atteso,
      `${nodeId} deve partire con ${atteso} auto, non con un numero unico`);
  }
  assert.ok(new Set(serie.map(([, n]) => n)).size > 1, 'le griglie non devono avere tutte lo stesso numero');
  assert.equal(celleGrigliaCampionato({ gridSize: 28 }), 22, 'i 28 nativi scendono al tetto');
  assert.equal(celleGrigliaCampionato({ gridSize: 10 }), 12, 'sotto il minimo si sale a 12');
  assert.equal(celleGrigliaCampionato({ gridSize: 13 }), 14, 'la griglia ha numero pari');
  assert.equal(celleGrigliaCampionato({}), 14, 'serie senza stima: il valore più diffuso');
  assert.equal(celleGrigliaCampionato(null), 14, 'anche senza nodo non si torna a zero');
});

test('riduciSlotRoster + 3.7: il weekend scende a 13 avversari, 14 celle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'griglia-campionato-'));
  const file = join(dir, 'GameModeType_RACE_WEEKEND.gamemodesave');
  try {
    scriviWeekend(file, { declared: 27, cars: 27 });
    const prima = weekendCarCount(file);
    assert.equal(prima.cars, 27);
    assert.equal(prima.declared, 27);

    // force: la suite gira anche con EVO aperto (stessa regola di syncRoster)
    const rid = riduciSlotRoster(13, { file, force: true });
    assert.equal(rid.written, true, 'le voci 3.10 oltre gli avversari si tolgono');
    assert.equal(setWeekendGridCustom(13, { file }).written, true);

    const dopo = weekendCarCount(file);
    assert.equal(dopo.cars, 13, 'roster allineato agli avversari');
    assert.equal(dopo.declared, 13, '3.7 = avversari');
    assert.equal(dopo.declared + 1, 14, 'la griglia è declared + te: 14 celle');
    assert.deepEqual(weekendGridMode(file), { mode: 'custom', count: 13 });
    assert.equal(riduciSlotRoster(13, { file, force: true }).written, false, 'idempotente');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pianoGriglia segue il campionato, non un numero unico', async () => {
  const { pianoGriglia } = await import('../tools/ronda-ladder.mjs');
  const nodo = (gridSize) => ({ cars: ['a', 'b'], gridSize });
  assert.equal(pianoGriglia(nodo(12), 'off').count, 11);
  assert.equal(pianoGriglia(nodo(14), 'off').count, 13);
  assert.equal(pianoGriglia(nodo(18), 'off').count, 17);
  assert.equal(pianoGriglia(nodo(20), 'off').count, 19);
  assert.equal(pianoGriglia(nodo(26), 'off').count, 21, 'sopra il tetto resta 22 auto');
  assert.equal(pianoGriglia(nodo(26), 'off').count + 1, GRIGLIA_CAMPIONATO.max);
});
