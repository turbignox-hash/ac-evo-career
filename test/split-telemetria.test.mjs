// split-telemetria.test.mjs — gli split a terzi di distanza dal .ld (6/11).
// Su un giro a velocità COSTANTE i terzi di distanza cadono nei terzi di
// tempo: 18 s di giro → tre split da 6 s. Se il conto sballa, si vede qui.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-split-'));
const { splitDaTelemetria } = await import('../src/motec.mjs');

const T0 = 64;
const N_CH = 5;
const T1 = T0 + N_CH * 124;
const FUEL_OFF = T1;
const SPEED_OFF = FUEL_OFF + 4 * 800;
const TH_OFF = SPEED_OFF + 4 * 2400;
const BR_OFF = TH_OFF + 4 * 2400;
const PLF_OFF = BR_OFF + 4 * 2400;
const buf = Buffer.alloc(PLF_OFF + 4 * 2400);
buf.writeUInt32LE(T0, 8);
buf.writeUInt32LE(T1, 12);

const channel = (R, name, unit, off, cnt, rate) => {
  buf.writeUInt32LE(off, R + 8);
  buf.writeUInt32LE(cnt, R + 12);
  buf.writeUInt32LE(rate << 16, R + 20);
  buf.write(name, R + 32, 'latin1');
  buf.write(unit, R + 72, 'latin1');
};
let R = T0;
channel(R, 'FUEL', 'L', FUEL_OFF, 800, 20); R += 124;
channel(R, 'SPEED', 'km/h', SPEED_OFF, 2400, 60); R += 124;
channel(R, 'THROTTLE', '%', TH_OFF, 2400, 60); R += 124;
channel(R, 'BRAKE', '%', BR_OFF, 2400, 60); R += 124;
channel(R, 'TYRE_PRESS_LF', 'psi', PLF_OFF, 2400, 60);

for (let i = 0; i < 800; i++) buf.writeFloatLE(20, FUEL_OFF + 4 * i);
for (let i = 0; i < 2400; i++) {
  const t = i / 60;
  // due giri (0–18 s e 18–40 s) sempre a 100 km/h: distanza ∝ tempo
  buf.writeFloatLE(100, SPEED_OFF + 4 * i);
  buf.writeFloatLE(t > 10 ? 1 : 0, TH_OFF + 4 * i);
  buf.writeFloatLE(0, BR_OFF + 4 * i);
  buf.writeFloatLE(27, PLF_OFF + 4 * i);
}

const DIR = mkdtempSync(join(tmpdir(), 'evo-split-files-'));
const LD = join(DIR, 'preset_test_test_Sun Oct 20 101010 2026.ld');
writeFileSync(LD, buf);
writeFileSync(LD.replace(/\.ld$/, '.ldx'),
  '<?xml version="1.0"?><r><r ClassName="BCN" Time="0.0"/>' +
  '<r ClassName="BCN" Time="1.8000000e+7"/><r ClassName="BCN" Time="4.0000000e+7"/></r>');

test('split dalla telemetria: giro a velocità costante = terzi uguali', () => {
  const s = splitDaTelemetria(LD);
  assert.ok(s, 'il file sintetico deve leggersi');
  assert.equal(s.parti, 3);
  assert.equal(s.splitsMs.length, 3);
  assert.ok(Math.abs(s.lapMs - 18000) < 60, `giro atteso ~18 s, letto ${s.lapMs} ms`);
  for (const v of s.splitsMs) assert.ok(Math.abs(v - 6000) < 80, `split atteso ~6 s, letto ${v} ms`);
  assert.ok(Math.abs(s.splitsMs.reduce((a, b) => a + b, 0) - s.lapMs) < 2, 'la somma degli split deve dare il giro');
});

test('split dalla telemetria: parti diverse dai terzi', () => {
  const s = splitDaTelemetria(LD, { parti: 2 });
  assert.equal(s.parti, 2);
  assert.equal(s.splitsMs.length, 2);
  for (const v of s.splitsMs) assert.ok(Math.abs(v - 9000) < 90, `metà giro attesa ~9 s, letto ${v} ms`);
});

test('split dalla telemetria: file assente = null, niente numeri inventati', () => {
  assert.equal(splitDaTelemetria(join(DIR, 'non-esiste.ld')), null);
});
