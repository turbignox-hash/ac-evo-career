// La cache del parsing MoTeC (motec.mjs): i .ld pesano decine di MB e prima
// venivano riletti/riparsati a ogni /api/card. Qui si costruisce un .ld SINTETICO
// (stesso formato binario dei file veri: header 64B, tabella canali 124B/canale,
// dati float32 LE per canale) e si verifica hit/miss/invalidazione per mtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-motec-cache-'));
const { analyzeLd, collectSessions, motecCacheStats, motecCacheClear } = await import('../src/motec.mjs');

// --- costruzione del .ld sintetico: sessione di 40s, 2 giri da 20s -------------
const T0 = 64;                 // inizio tabella canali (header 64B, come nei file veri)
const N_CH = 5;                // FUEL + 2 pressioni + 2 temperature (minimo 5 record per parseLd)
const T1 = T0 + N_CH * 124;
const FUEL_OFF = T1;           // 800 campioni @20Hz
const PLF_OFF = FUEL_OFF + 4 * 800;  // 2400 @60Hz
const PRR_OFF = PLF_OFF + 4 * 2400;
const AIR_OFF = PRR_OFF + 4 * 2400;  // 800 @20Hz
const ROAD_OFF = AIR_OFF + 4 * 800;
const buf = Buffer.alloc(ROAD_OFF + 4 * 800);
buf.writeUInt32LE(T0, 8);
buf.writeUInt32LE(T1, 12);

const channel = (R, name, unit, off, cnt, rate) => {
  buf.writeUInt32LE(off, R + 8);
  buf.writeUInt32LE(cnt, R + 12);
  buf.writeUInt32LE(rate << 16, R + 20); // la frequenza viaggia nei bit alti
  buf.write(name, R + 32, 'latin1');
  buf.write(unit, R + 72, 'latin1');
};
channel(T0, 'FUEL', 'L', FUEL_OFF, 800, 20);
channel(T0 + 124, 'TYRE_PRESS_LF', 'psi', PLF_OFF, 2400, 60);
channel(T0 + 248, 'TYRE_PRESS_RR', 'psi', PRR_OFF, 2400, 60);
channel(T0 + 372, 'AIR_TEMP', 'C', AIR_OFF, 800, 20);
channel(T0 + 496, 'ROAD_TEMP', 'C', ROAD_OFF, 800, 20);

for (let i = 0; i < 800; i++) {
  const t = i / 20;
  buf.writeFloatLE(20 - 0.075 * t, FUEL_OFF + 4 * i);   // 1,5 L ogni giro di 20s
  buf.writeFloatLE(23, AIR_OFF + 4 * i);
  buf.writeFloatLE(30, ROAD_OFF + 4 * i);
}
for (let i = 0; i < 2400; i++) {
  const t = i / 60;
  buf.writeFloatLE(27 + 0.05 * t, PLF_OFF + 4 * i);     // freddo 27.0 → sale ~29 a fine sessione
  buf.writeFloatLE(27 + 0.05 * t, PRR_OFF + 4 * i);
}

const ldx = '<?xml version="1.0"?><r><r ClassName="BCN" Time="0.000000e+0"/>' +
  '<r ClassName="BCN" Time="2.0000000e+7"/><r ClassName="BCN" Time="4.0000000e+7"/></r>';

const DIR = mkdtempSync(join(tmpdir(), 'evo-motec-files-'));
const LD = join(DIR, 'preset_test_fuji_Sat Sep 26 200627 2026.ld');
const LDX = LD.replace(/\.ld$/, '.ldx');
writeFileSync(LD, buf);
writeFileSync(LDX, ldx);

const approx = (v, expected, eps = 0.05) => Math.abs(v - expected) < eps;

test('analyzeLd: parsing del .ld sintetico corretto al primo colpo (miss)', () => {
  motecCacheClear();
  const a = analyzeLd(LD);
  assert.ok(a, 'il file sintetico deve essere leggibile');
  assert.equal(a.durationSec, 40);
  assert.equal(a.validLaps, 2);
  assert.ok(approx(a.fuelPerLap, 1.49), 'benzina per giro ~1.49');
  assert.ok(approx(a.coldPressures.LF, 27.0), 'pressione a freddo = 27.0');
  assert.equal(a.airTemp, 23);
  assert.equal(a.roadTemp, 30);
  assert.equal(a.beaconsFromLdx, 3);
  const st = motecCacheStats();
  assert.equal(st.misses, 1);
  assert.equal(st.hits, 0);
});

test('cache: stesso file → stesso oggetto (hit), zero nuovi miss', () => {
  const a1 = analyzeLd(LD);
  const a2 = analyzeLd(LD);
  assert.strictEqual(a1, a2, 'il hit deve restituire lo STESSO oggetto in cache');
  const st = motecCacheStats();
  assert.equal(st.hits, 2); // a1 e a2 sono DUE chiamate: entrambe hit
  assert.equal(st.misses, 1); // il miss è quello del test precedente
});

test('cache: EVO riscrive il file (mtime cambia) → riparseggia', () => {
  const before = motecCacheStats();
  const d = new Date(Date.now() + 5000);
  utimesSync(LD, d, d); // tocca solo il mtime, il contenuto è identico
  const a = analyzeLd(LD);
  const after = motecCacheStats();
  assert.equal(after.misses, before.misses + 1, 'mtime nuovo = miss nuovo');
  assert.equal(analyzeLd(LD), a, 'subito dopo il miss, il file torna in cache');
  assert.ok(approx(a.fuelPerLap, 1.49));
});

test('file illeggibile: null (senza crash), nessuna voce spazzatura che rompa', () => {
  assert.equal(analyzeLd(join(DIR, 'inesistente.ld')), null);
  assert.equal(analyzeLd(join(DIR, 'inesistente.ld')), null); // ripetibile
});

test('collectSessions: usa la cache (stesso array laps tra due chiamate)', () => {
  motecCacheClear();
  const root = join(DIR, 'MoTec');
  const carDir = join(root, 'Honda S2000 AP1');
  const trkDir = join(carDir, 'Fuji Speedway GP');
  mkdirSync(trkDir, { recursive: true });
  copyFileSync(LD, join(trkDir, 'preset_test_fuji_Sat Sep 26 200627 2026.ld'));
  copyFileSync(LDX, join(trkDir, 'preset_test_fuji_Sat Sep 26 200627 2026.ldx'));
  const resultsDir = join(DIR, 'Results'); // vuota: kind/meteo null, va bene

  const s1 = collectSessions(root, resultsDir, { car: 'Honda S2000 AP1', track: 'Fuji Speedway' });
  const s2 = collectSessions(root, resultsDir, { car: 'Honda S2000 AP1', track: 'Fuji Speedway' });
  assert.equal(s1.length, 1);
  assert.equal(s1[0].car, 'Honda S2000 AP1');
  assert.equal(s1[0].track, 'Fuji Speedway GP');
  assert.ok(approx(s1[0].fuelPerLap, 1.49));
  assert.strictEqual(s1[0].laps, s2[0].laps, 'il secondo collectSessions riusa il parse in cache');
  const st = motecCacheStats();
  assert.equal(st.misses, 1); // un solo file, parsato una volta
  assert.equal(st.hits, 1);
});
