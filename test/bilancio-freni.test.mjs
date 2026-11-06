// test/bilancio-freni.test.mjs — il bilancio di frenata per ruota su .ld
// SINTETICI con comportamento noto: la ripartizione si legge dalla coppia
// applicata (BRAKE_TORQUE_xx) e il fade dal calo di coppia a pari pedale
// quando la temperatura sale. Nessun file reale richiesto: il formato è lo
// stesso decodificato da laptrace.test/analisi.test (header 64B, tabella
// canali 124B, dati float32 LE per canale, beacon nel .ldx in microsecondi).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-freni-'));
const { brakeBalance } = await import('../src/bilancio-freni.mjs');
const { setLang } = await import('../src/lang.mjs');

const WHEELS = ['LF', 'RF', 'LR', 'RR'];
const T0 = 64;
const N_CH = 12; // FUEL + SPEED + THROTTLE + BRAKE + 4 coppie + 4 temperature
const T1 = T0 + N_CH * 124;

/**
 * Costruisce un .ld con frenate note.
 * ops.lapSec      durata di ogni giro (beacon ogni lapSec)
 * ops.laps        numero di giri
 * ops.frontGain   (tempC) => Nm totali dell'asse anteriore per unità di pedale
 * ops.rearGain    (tempC) => Nm totali dell'asse posteriore per unità di pedale
 * ops.lfShare     quota della coppia anteriore sulla ruota sinistra (0–1)
 * ops.tempOf      (t, dur) => { front, rear } °C
 */
function mkLd(dir, name, ops) {
  const lapSec = ops.lapSec ?? 30;
  const laps = ops.laps ?? 3;
  const dur = lapSec * laps;
  const n20 = Math.round(dur * 20);
  const n60 = Math.round(dur * 60);
  const layout = [
    ['FUEL', 'L', n20, 20],
    ['SPEED', 'km/h', n60, 60],
    ['THROTTLE', '%', n60, 60],
    ['BRAKE', '%', n60, 60],
    ...WHEELS.map((w) => [`BRAKE_TORQUE_${w}`, 'Nm', n60, 60]),
    ...WHEELS.map((w) => [`BRAKE_TEMP_${w}`, 'C', n20, 20]),
  ];
  const table = [];
  let off = T1;
  for (const [nome, unit, cnt, rate] of layout) { table.push({ nome, unit, cnt, rate, off }); off += 4 * cnt; }
  const buf = Buffer.alloc(off);
  buf.writeUInt32LE(T0, 8);
  buf.writeUInt32LE(T1, 12);
  table.forEach((ch, i) => {
    const R = T0 + i * 124;
    buf.writeUInt32LE(ch.off, R + 8);
    buf.writeUInt32LE(ch.cnt, R + 12);
    buf.writeUInt32LE(ch.rate << 16, R + 20);
    buf.write(ch.nome, R + 32, 'latin1');
    buf.write(ch.unit, R + 72, 'latin1');
  });
  const chan = (nome) => table.find((c) => c.nome === nome);
  const fuel = chan('FUEL');
  for (let i = 0; i < fuel.cnt; i++) buf.writeFloatLE(30, fuel.off + 4 * i);
  const lfShare = ops.lfShare ?? 0.5;
  for (let i = 0; i < n60; i++) {
    const t = i / 60;
    const phase = (t % lapSec) / lapSec;
    // pedale a zero fuori dalla staccata, rampa 20 → 90 → 20% dentro la staccata
    const pedal = phase < 0.5 ? Math.max(0, 20 + 160 * Math.min(phase * 4, 1) * (1 - phase)) : 0;
    const p = pedal / 100;
    const temps = ops.tempOf(t, dur);
    const fGain = ops.frontGain(temps.front);
    const rGain = ops.rearGain(temps.rear);
    buf.writeFloatLE(200, chan('SPEED').off + 4 * i);
    buf.writeFloatLE(p > 0 ? 0 : 100, chan('THROTTLE').off + 4 * i);
    buf.writeFloatLE(pedal, chan('BRAKE').off + 4 * i);
    buf.writeFloatLE(fGain * p * lfShare, chan('BRAKE_TORQUE_LF').off + 4 * i);
    buf.writeFloatLE(fGain * p * (1 - lfShare), chan('BRAKE_TORQUE_RF').off + 4 * i);
    buf.writeFloatLE(rGain * p * 0.5, chan('BRAKE_TORQUE_LR').off + 4 * i);
    buf.writeFloatLE(rGain * p * 0.5, chan('BRAKE_TORQUE_RR').off + 4 * i);
  }
  for (let i = 0; i < n20; i++) {
    const temps = ops.tempOf(i / 20, dur);
    for (const w of ['LF', 'RF']) buf.writeFloatLE(temps.front, chan(`BRAKE_TEMP_${w}`).off + 4 * i);
    for (const w of ['LR', 'RR']) buf.writeFloatLE(temps.rear, chan(`BRAKE_TEMP_${w}`).off + 4 * i);
  }
  const file = join(dir, name);
  writeFileSync(file, buf);
  const beacons = [];
  for (let g = 0; g <= laps; g++) beacons.push(g * lapSec);
  writeFileSync(file.replace(/.ld$/, '.ldx'),
    '<?xml version="1.0"?>' + beacons.map((s) => `<r ClassName="BCN" Time="${(s * 1e6).toExponential(7)}"/>`).join(''));
  return file;
}
const DIR = mkdtempSync(join(tmpdir(), 'evo-freni-files-'));

// Sessione "pulita": prima metà fredda (100/60 °C), seconda calda (300/180 °C).
// L'anteriore perde il 30% di coppia per pedale quando è caldo, il posteriore no.
const clean = mkLd(DIR, 'preset_base_test_test_Sat Nov 1 100000 2026.ld', {
  lapSec: 30,
  laps: 3,
  lfShare: 0.5,
  tempOf: (t, dur) => (t < dur / 2 ? { front: 100, rear: 60 } : { front: 300, rear: 180 }),
  frontGain: (temp) => (temp >= 300 ? 1400 : 2000),
  rearGain: () => 700,
});

// Stessa sessione ma la pinza sinistra anteriore lavora meno (40% dell'asse).
const lopsided = mkLd(DIR, 'preset_pinza_test_test_Sat Nov 1 110000 2026.ld', {
  lapSec: 30,
  laps: 2,
  lfShare: 0.4,
  tempOf: () => ({ front: 120, rear: 80 }),
  frontGain: () => 2000,
  rearGain: () => 700,
});

test('ripartizione: quote per ruota, asse e sinistra/destra dalla coppia applicata', () => {
  setLang('it');
  const b = brakeBalance(clean);
  assert.ok(b?.ok, JSON.stringify(b));
  // la staccata cade nella prima metà di ogni giro: due staccate a 2000 Nm/pedale
  // all'anteriore (freddo) contro una a 1400 (caldo) → 1800 su 2500 totali
  assert.ok(Math.abs(b.balance.frontPct - 72) < 1.5, 'anteriore: ' + b.balance.frontPct);
  assert.ok(Math.abs(b.balance.rearPct - 28) < 1.5, 'posteriore: ' + b.balance.rearPct);
  assert.ok(Math.abs(b.balance.frontPct + b.balance.rearPct - 100) < 0.2, 'la somma degli assi fa 100');
  // simmetrica: 50/50 su entrambi gli assi
  assert.equal(b.balance.lfOfFrontPct, 50);
  assert.equal(b.balance.lrOfRearPct, 50);
  assert.ok(Math.abs(b.balance.leftPct - 50) < 0.5, 'sinistra: ' + b.balance.leftPct);
  // quote per ruota: due anteriori al 36%, due posteriori al 14%
  assert.ok(Math.abs(b.wheels.LF.sharePct - 36) < 1, 'LF: ' + b.wheels.LF.sharePct);
  assert.ok(Math.abs(b.wheels.RR.sharePct - 14) < 1, 'RR: ' + b.wheels.RR.sharePct);
  assert.ok(b.wheels.LF.torquePeakNm > b.wheels.LR.torquePeakNm, 'il picco anteriore supera il posteriore');
  assert.ok(b.wheels.LF.tempPeakC >= 300, 'picco termico anteriore letto: ' + b.wheels.LF.tempPeakC);
  assert.ok(b.pedal.brakingSharePct > 45 && b.pedal.brakingSharePct < 55, 'quota di frenata: ' + b.pedal.brakingSharePct);
});

test('fade: la coppia per pedale cala col calore — 30% all\'anteriore, niente al posteriore', () => {
  setLang('it');
  const b = brakeBalance(clean);
  const f = b.fade.front;
  assert.equal(f.fromC, 100);
  assert.equal(f.toC, 300);
  assert.ok(Math.abs(f.pct + 30) < 1, 'fade anteriore atteso -30%, letto ' + f.pct);
  assert.match(f.verdict, /fade/);
  const r = b.fade.rear;
  assert.ok(Math.abs(r.pct) < 1, 'posteriore stabile, letto ' + r.pct);
  assert.match(r.verdict, /nessun fade/);
});

test('fade: senza salto termico il numero NON si inventa (pct null + motivo)', () => {
  setLang('it');
  const b = brakeBalance(lopsided);
  assert.ok(b?.ok);
  assert.equal(b.fade.front.pct, null, 'due gruppi alla stessa temperatura: niente fade');
  assert.match(b.fade.front.reason, /salto termico/);
});

test('sbilanciamento: la ruota che lavora meno si vede nella quota dell\'asse', () => {
  setLang('it');
  const b = brakeBalance(lopsided);
  assert.equal(b.balance.lfOfFrontPct, 40);
  assert.equal(b.wheels.LF.sharePct, 29.6);
  assert.equal(b.wheels.RF.sharePct, 44.4);
});

test('dettaglio per giro: la ripartizione segue il riscaldamento dell\'asse', () => {
  setLang('it');
  const b = brakeBalance(clean);
  assert.equal(b.perLap.length, 3, 'tre giri dai beacon');
  assert.equal(b.laps, 3);
  assert.ok(b.perLap[0].frontPct > b.perLap[2].frontPct, 'il giro freddo ha più anteriore: ' + JSON.stringify(b.perLap.map((l) => l.frontPct)));
  assert.ok(b.perLap[2].frontPeakC > b.perLap[0].frontPeakC, 'picco termico che sale');
});

test('onestà: senza canali di coppia risponde ok:false elencandoli, non stima', () => {
  setLang('it');
  const bare = mkLd(DIR, 'preset_senza_test_test_Sat Nov 1 120000 2026.ld', {
    lapSec: 30, laps: 1, tempOf: () => ({ front: 100, rear: 60 }), frontGain: () => 2000, rearGain: () => 700,
  });
  // tabella canali chiusa PRIMA del primo BRAKE_TORQUE: il file legge, la coppia no
  const buf = readFileSync(bare);
  buf.writeUInt32LE(T0 + 5 * 124, 12); // tabella chiusa dopo BRAKE_TORQUE_LF: le altre tre mancano
  writeFileSync(bare, buf);
  const out = brakeBalance(bare);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'canali');
  assert.ok(out.missing.includes('BRAKE_TORQUE_RF'), 'elenca i canali mancanti: ' + out.missing.join(','));
  assert.match(out.hint, /coppia frenante/);
});

test('file inesistente o illeggibile: null, mai un crash', () => {
  assert.equal(brakeBalance(join(DIR, 'non-esiste.ld')), null);
});

