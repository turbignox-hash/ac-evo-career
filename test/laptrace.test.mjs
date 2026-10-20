// laptrace.test.mjs — il grafico del giro su un .ld SINTETICO: due giri con
// profili di velocità noti (lap1 100→300 in 18s, lap2 75→275 in 22s, gas e
// freno inclusi). Si verifica campionamento, distanza, best lap e la
// differenza allineata sulla FRAZIONE DI DISTANZA (l'asse del grafico).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-laptrace-'));
const { lapTrace, analyzeLd } = await import('../src/motec.mjs');

// --- costruzione del .ld sintetico: 40s, due giri (beacon 0 / 18 / 40) --------
const T0 = 64;
const N_CH = 5; // FUEL + SPEED + THROTTLE + BRAKE + TYRE_PRESS_LF (minimo 5 per parseLd)
const T1 = T0 + N_CH * 124;
const FUEL_OFF = T1;              // 800 campioni @20Hz
const SPEED_OFF = FUEL_OFF + 4 * 800;   // 2400 @60Hz
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
  // giro 1 (0–18s): 100 → 300); giro 2 (18–40s): 75 → 275 (10 km/h in media più lento)
  const v = t < 18 ? 100 + (200 / 18) * t : 75 + (200 / 22) * (t - 18);
  buf.writeFloatLE(Math.max(0, v), SPEED_OFF + 4 * i);
  buf.writeFloatLE(Math.min(1, t / 10), TH_OFF + 4 * i);   // gas pieno dopo 10s
  buf.writeFloatLE(0, BR_OFF + 4 * i);                      // mai freno
  buf.writeFloatLE(27, PLF_OFF + 4 * i);
}

const DIR = mkdtempSync(join(tmpdir(), 'evo-laptrace-files-'));
const LD = join(DIR, 'preset_test_test_Sun Oct 20 101010 2026.ld');
writeFileSync(LD, buf);
writeFileSync(LD.replace(/\.ld$/, '.ldx'),
  '<?xml version="1.0"?><r><r ClassName="BCN" Time="0.0"/>' +
  '<r ClassName="BCN" Time="1.8000000e+7"/><r ClassName="BCN" Time="4.0000000e+7"/></r>');

const approx = (v, expected, eps = 0.6) => Math.abs(v - expected) < eps;

test('lapTrace: giri validi, best lap e campionamento', () => {
  const t = lapTrace(LD, { lap: 'best', compare: 'best', points: 120 });
  assert.ok(t?.ok, 'traccia prodotta');
  assert.equal(t.lap, 1, 'il best lap è il giro 1 (18s)');
  assert.equal(t.durationSec, 18);
  assert.equal(t.bestLap, 1);
  assert.equal(t.points.length, 120);
  assert.ok(t.compare, 'confronto al best: il secondo best (giro 2)');
  assert.equal(t.compare.lap, 2);
  // il primo punto parte dal valore iniziale del canale (100 km/h)
  assert.ok(approx(t.points[0].v, 100), 'v[0] ≈ 100: ' + t.points[0].v);
  // frazione di distanza monotona e completa
  assert.ok(t.points[0].x === 0 && approx(t.points.at(-1).x, 1, 0.001));
  for (let i = 1; i < t.points.length; i++) assert.ok(t.points[i].x > t.points[i - 1].x, 'x monotona');
  // distanza: integrazione di v·dt (media 200 km/h × 18s ≈ 1.0 km)
  assert.ok(approx(t.distanceKm, 1.0, 0.05), 'dist ≈ 1 km: ' + t.distanceKm);
  // gas dopo 10s è a fondo (1), freno mai premuto (0)
  assert.ok(approx(t.points.at(-8).th, 1, 0.05), 'throttle a fondo sul rettifilo finale');
  assert.equal(t.points.at(-8).br, 0);
});

test('lapTrace: il giro 2 resta sotto il giro 1 a pari distanza (dv sempre negativo)', () => {
  const t = lapTrace(LD, { lap: 2, compare: 1, points: 150 });
  assert.ok(t?.ok);
  assert.equal(t.lap, 2);
  assert.equal(t.durationSec, 22);
  assert.equal(t.compare.timeDelta, 4); // il giro 2 dura 4s in più
  assert.equal(t.compare.dv.length, 150);
  // profili 75–275 vs 100–300: a pari frazione di distanza il giro 2 è sempre ~25 km/h sotto
  assert.ok(t.compare.dvMax < -5, 'mai sopra il confronto: picco ' + t.compare.dvMax);
  assert.ok(t.compare.dvMin < -20 && t.compare.dvMin >= -26, 'fondo: ' + t.compare.dvMin);
  assert.ok(t.compare.dvAvg < -15, 'media: ' + t.compare.dvAvg);
  // distanze: il giro 2 (scelto) ~1.07 km, il giro 1 di confronto ~1.0 km
  assert.ok(approx(t.distanceKm, 1.07, 0.05), 'dist giro 2: ' + t.distanceKm);
  assert.ok(approx(t.compare.distKm, 1.0, 0.05), 'dist giro 1: ' + t.compare.distKm);
});

test('lapTrace: senza .ldx e senza canale SPEED: casi gestiti senza crash', async () => {
  // beacon assenti: il giro unico (sessione intera) si campiona comunque
  const noBeacon = join(DIR, 'nobe.lx.ld');
  writeFileSync(noBeacon, buf);
  const t = lapTrace(noBeacon, { compare: null, points: 50 });
  assert.ok(t?.ok, 'senza .ldx il giro unico si campiona comunque');
  assert.equal(t.lap, 1);
  assert.equal(t.compare, null);
  // 5 canali senza SPEED (FUEL obbligatorio per il parse): lapTrace → null
  const T1b = T0 + 5 * 124;
  const buf2 = Buffer.alloc(T1b + 4 * 800 + 3 * 4 * 2400 + 4 * 800);
  buf2.writeUInt32LE(T0, 8); buf2.writeUInt32LE(T1b, 12);
  const FAR_OFF2 = T1b;                // 800 @20Hz
  const PRLF2 = FAR_OFF2 + 4 * 800;    // 2400 @60Hz
  const PRRF2 = PRLF2 + 4 * 2400;
  const AIRF2 = PRRF2 + 4 * 2400;      // 800 @20Hz
  const ROAF2 = AIRF2 + 4 * 800;
  const ch3 = (R3, name, off, cnt, rate) => {
    buf2.writeUInt32LE(off, R3 + 8); buf2.writeUInt32LE(cnt, R3 + 12); buf2.writeUInt32LE(rate << 16, R3 + 20);
    buf2.write(name, R3 + 32, 'latin1');
  };
  ch3(T0, 'FUEL', FAR_OFF2, 800, 20);
  ch3(T0 + 124, 'TYRE_PRESS_LF', PRLF2, 2400, 60);
  ch3(T0 + 248, 'TYRE_PRESS_RR', PRRF2, 2400, 60);
  ch3(T0 + 372, 'AIR_TEMP', AIRF2, 800, 20);
  ch3(T0 + 496, 'ROAD_TEMP', ROAF2, 800, 20);
  const noSpeed = join(DIR, 'nospeed.ld');
  writeFileSync(noSpeed, buf2);
  assert.ok(analyzeLd(noSpeed), 'il file si legge normalmente');
  assert.equal(lapTrace(noSpeed), null, 'senza SPEED niente traccia');
});
