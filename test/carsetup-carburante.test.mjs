// test/carsetup-carburante.test.mjs — la benzina non resta mai fuori dal file.
//
// 5/11 sera, la segnalazione di Mauro: «applicando il setup in gioco è rimasto
// 30 L». Il sospetto numero uno è il file SENZA il blocco carburante: touch()
// non trova il campo, non scrive, e il piano lo dava per fatto. Qui si pesa la
// regola nuova: se root.7 manca, si CREA nella forma che il gioco usa
// (nested {1: f32 litri}); se c'è, si patcha come sempre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits } from '../src/carsetup.mjs';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';

const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; };
const senzaCarburante = () => Buffer.from(encodeMsg([
  // root.1 con un solo wire5 (freni): basta a rendere il file "leggibile"
  { field: 1, wire: 2, bytes: Buffer.from(encodeMsg([{ field: 3, wire: 2, bytes: Buffer.from(encodeMsg([{ field: 1, wire: 5, bytes: f32(56) }])) }])) },
  { field: 10, wire: 0, varint: 1 },
]));

test('applyEdits: se il file NON ha il blocco carburante, lo crea (root.7 = {1: litri})', () => {
  const out = applyEdits(senzaCarburante(), { fuel: { liters: 42.5 } });
  const root = decodeMsg(out.bytes);
  const e7 = root.find((x) => x.field === 7);
  assert.ok(e7, 'il blocco carburante esiste nel file scritto');
  const dentro = decodeMsg(e7.bytes);
  const litri = dentro.find((x) => x.field === 1 && x.wire === 5);
  assert.ok(litri, 'dentro il blocco c’è il campo 1 (litri)');
  assert.equal(Math.round(litri.bytes.readFloatLE(0) * 10) / 10, 42.5);
  assert.ok(out.changes.some((c) => /Benzina: creata a 42\.5 L/.test(c)), 'la modifica si nomina nella lista');
});

test('applyEdits: col blocco già presente il patch resta quello di sempre', () => {
  const conCarburante = Buffer.from(encodeMsg([
    { field: 7, wire: 2, bytes: Buffer.from(encodeMsg([{ field: 1, wire: 5, bytes: f32(30) }])) },
  ]));
  const out = applyEdits(conCarburante, { fuel: { liters: 21 } });
  const e7 = decodeMsg(out.bytes).find((x) => x.field === 7);
  const litri = decodeMsg(e7.bytes).find((x) => x.field === 1);
  assert.equal(Math.round(litri.bytes.readFloatLE(0) * 10) / 10, 21);
  assert.ok(out.changes.some((c) => /Benzina: 30→21 L/.test(c)));
});
