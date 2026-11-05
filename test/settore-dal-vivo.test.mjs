// test/settore-dal-vivo.test.mjs — IL SETTORE PEGGIORE DEL GIRO DAL VIVO
// (6/11, richiesta Mauro: «leggiamo anche i delta dal vivo — inseriscili in
// qualifica nel copilot»). La funzione pura nasce in lapdelta.mjs; il lettore
// la congela a cambio giro (_commitLap) col best di PRIMA del giro stesso;
// il server la manda alla copilota solo in qualifica (settoreQualifica).
import test from 'node:test';
import assert from 'node:assert/strict';
import { settorePeggiore } from '../src/lapdelta.mjs';
import { LiveReader } from '../src/shmem.mjs';

const segmenti = (dv) => dv.map((v) => ({ p: 0, dv: v }));

test('settorePeggiore: sceglie il terzo con la perdita media più alta', () => {
  const dv = [];
  for (let i = 0; i < 48; i++) dv.push(i < 16 ? 0.12 : i < 32 ? 0.5 : 0.2);
  const peggio = settorePeggiore(segmenti(dv));
  assert.equal(peggio.indice, 2);
  assert.equal(peggio.deltaMs, 500);
});

test('settorePeggiore: giro tutto più veloce del best → null, non si dice', () => {
  const dv = Array.from({ length: 48 }, () => -0.3);
  assert.equal(settorePeggiore(segmenti(dv)), null);
});

test('settorePeggiore: sotto i 100 ms o sopra i 3 s non si parla', () => {
  assert.equal(settorePeggiore(segmenti(Array.from({ length: 48 }, () => 0.05))), null);
  assert.equal(settorePeggiore(segmenti(Array.from({ length: 48 }, () => 3.5))), null);
});

test('settorePeggiore: i segmenti senza valore non contano', () => {
  const dv2 = Array.from({ length: 48 }, (_, i) => (i >= 16 && i < 24 ? 0.4 : null));
  const peggio = settorePeggiore(segmenti(dv2));
  assert.equal(peggio.indice, 2);
  assert.equal(peggio.deltaMs, 400);
});

/* --- il congelamento a cambio giro nel lettore --- */

/* geometria d'esame: una pista lineare (x da 0 a 3900, z=0), il best scalda
   3000 ms a puntò; il giro corrente mantiene il distacco costante per terzo:
   +120 ms nel primo, +500 nel secondo (il peggiore), +200 nel terzo. */
const PEDI = 72;
const BEST_T = (k) => k * 2000;
const DV = (k) => (k < 24 ? 120 : k < 48 ? 500 : 200);
const CUR_T = (k) => k * 2000 + DV(k);
const pistaBest = Array.from({ length: PEDI }, (_, k) => ({ x: k * 100, z: 0, t: BEST_T(k) }));
const pistaCur = Array.from({ length: PEDI }, (_, k) => ({ x: k * 100, z: 0, t: CUR_T(k) }));

function lettoreConLap(msBest, msLast) {
  const r = new LiveReader();
  r.bestTrack = pistaBest.map((p) => ({ ...p }));
  r.bestLapMs = msBest;
  r.lapTrack = pistaCur.map((p) => ({ ...p }));
  r.last.graphics = { session: 1, status: 2, isValidLap: true, lapMs: { last: msLast } };
  return r;
}

const MS_BEST = (PEDI - 1) * 3000;
const MS_LAST = MS_BEST + 800; // più lento del best: il confronto ha senso

test("commit del giro: congela il peggiore settore del giro uscito (2, +500 ms)", () => {
  const r = lettoreConLap(MS_BEST, MS_LAST);
  r._commitLap(4);
  assert.equal(r.settoreUltimo.indice, 2);
  assert.equal(r.settoreUltimo.deltaMs, 500);
  assert.equal(r.settoreUltimo.lapNo, 4);
  assert.ok(Number.isFinite(r.settoreUltimo.at));
});

test("commit del giro: il giro uscito è il NUOVO best → niente settore (perdere contro se stesso non si dice)", () => {
  const r = lettoreConLap(MS_BEST, MS_BEST - 500);
  r._commitLap(4);
  assert.equal(r.settoreUltimo, null);
});

test("commit del giro: senza best già committato → niente settore", () => {
  const r = lettoreConLap(null, MS_LAST);
  r._commitLap(4);
  assert.equal(r.settoreUltimo, null);
});

test("cambio sessione: il settore congelato si azzera con tutto il resto", () => {
  const r = lettoreConLap(MS_BEST, MS_LAST);
  r._commitLap(4);
  assert.ok(r.settoreUltimo);
  r.lapTrack = [];
  r.last.graphics = { status: 0, isValidLap: false, lapMs: {} };
  r._commitLap(4); // la traccia vuota non tocca il settore già congelato
  assert.ok(r.settoreUltimo);
  r._resetSession();
  assert.equal(r.settoreUltimo, null);
});
