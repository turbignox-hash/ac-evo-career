// live-danni.test.mjs — danni per zona e per sospensione dal DamageState (6/11).
// Il DamageState della grafica porta cinque zone e quattro sospensioni in
// frazioni 0–1; lo snapshot ne mostrava solo l'aggregato del physics. Questi
// test fissano la conversione (× 100, verificata sul collaudo del 4/11) e che i
// buchi restino null invece di diventare zeri inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageStateDaGraphics } from '../src/shmem.mjs';

test('danni: nessun DamageState = nessun dato (mai un oggetto di zeri)', () => {
  assert.equal(damageStateDaGraphics(null), null);
  assert.equal(damageStateDaGraphics(undefined), null);
  assert.equal(damageStateDaGraphics({}), null);
});

test('danni: frazioni 0–1 convertite in percentuale, una zona per voce', () => {
  // valori reali del collaudo del 4/11 a Laguna Seca: front 0,0491 nel
  // DamageState corrisponde a 4,91 nel carDamage del physics — la scala è quella
  const d = damageStateDaGraphics({
    carDamage: { front: 0.04910748079419136, rear: 0, left: 0.0026284537743777037, right: 0.0054479362443089485, center: 0.05718386545777321 },
  });
  assert.deepEqual(d.zones, { front: 4.9, rear: 0, left: 0.3, right: 0.5, centre: 5.7 });
});

test('danni: le quattro sospensioni restano distinte, nell’ordine LF/RF/LR/RR', () => {
  const d = damageStateDaGraphics({
    carDamage: { front: 0, rear: 0, left: 0, right: 0, center: 0, suspension: { lf: 0.2, rf: 0, lr: 0.075, rr: 1 } },
  });
  assert.deepEqual(d.suspension, { LF: 20, RF: 0, LR: 7.5, RR: 100 });
});

test('danni: campi assenti o sporchi restano null, non zero', () => {
  const d = damageStateDaGraphics({ carDamage: { front: 'x', rear: null, suspension: { lf: Number.NaN } } });
  assert.equal(d.zones.front, null);
  assert.equal(d.zones.rear, null);
  assert.equal(d.zones.left, null);
  assert.equal(d.suspension.LF, null);
  assert.equal(d.suspension.RR, null);
});
