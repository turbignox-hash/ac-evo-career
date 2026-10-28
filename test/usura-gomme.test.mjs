import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { lapDegradation, tyreTempsOf, tyreWearFromLd } from '../src/usura-gomme.mjs';
import { analyzeLd } from '../src/motec.mjs';

// Cartella dei file .ld reali registrati dal gioco (nessun dato di prova).
const MOTEC_ROOT = join(homedir(), 'Saved Games', 'ACE', 'MoTec');

function firstLdFile(dir) {
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      const found = firstLdFile(p);
      if (found) return found;
    } else if (name.toLowerCase().endsWith('.ld')) {
      return p;
    }
  }
  return null;
}

const LD = firstLdFile(MOTEC_ROOT);
const skip = LD ? false : 'nessun file .ld reale in Saved Games/ACE/MoTec';

test('lapDegradation: primi vs ultimi giri', () => {
  const d = lapDegradation([80, 80.4, 80.6, 82, 84, 85.2], { window: 2 });
  assert.ok(d);
  // media dei primi 2 (80, 80.4) e degli ultimi 2 (84, 85.2)
  assert.equal(d.firstAvg, 80.2);
  assert.equal(d.lastAvg, 84.6);
  assert.equal(d.deltaSec, 4.4);
  // trend a giro: delta/(n-w) = 4.4/4
  assert.equal(d.trendPerLap, 1.1);
});

test('lapDegradation: con 3 giri le finestre si dividono un giro a testa', () => {
  const d = lapDegradation([90, 92, 94]);
  assert.ok(d);
  assert.equal(d.firstAvg, 90);
  assert.equal(d.lastAvg, 94);
  assert.equal(d.deltaSec, 4);
});

test('lapDegradation rifiuta input invalidi', () => {
  assert.equal(lapDegradation(null), null);
  assert.equal(lapDegradation([90]), null);           // un solo giro
  assert.equal(lapDegradation([90, NaN, 'x']), null); // non numeri finiti
});

test('tyreTempsOf: trend termico per ruota, ruota senza dati esclusa', () => {
  const laps = [
    { surf: { LF: [80, 81, 81], RF: [70, 70, 70], RR: [null, null, null] } },
    { surf: { LF: [82, 83, 83], RF: [70, 70, 70], RR: [null, null, null] } },
  ];
  const t = tyreTempsOf(laps);
  assert.deepEqual(Object.keys(t).sort(), ['LF', 'RF']); // RR senza dati: fuori
  assert.equal(t.LF.first, 80.7);   // media dei 3 bordi a giro 1
  assert.equal(t.LF.last, 82.7);    // e a giro 2
  assert.equal(t.LF.deltaC, 2);     // si scalda: +2 °C
  assert.equal(t.LF.max, 83);
  assert.equal(t.RF.deltaC, 0);     // ferma: nessuna sensibilità
});

test('tyreWearFromLd legge un blocco reale: degrado e temperature coerenti', { skip }, () => {
  const u = tyreWearFromLd(LD);
  assert.ok(u, 'il file .ld reale deve essere leggibile');
  // i numeri di confronto elencati qui sotto DERICHÉRISCONO dallo stesso .ld reale
  const an = analyzeLd(LD);
  const validAll = an.laps.filter((l) => l.durationSec > 15);
  const validLen = validAll.length;
  if (validLen >= 2) {
    assert.ok(u.degradation, 'con 2+ giri validi il degrado esiste');
    assert.equal(typeof u.degradation.deltaSec, 'number');
    // la prima media si ricalcola dai dati veri con la STESSA regola di finestra
    // del modulo: w = min(3, metà dei giri) — a meno di 6 giri le finestre
    // si spartiscono la metà a testa (test 2 lo copre sui numeri a mano).
    const w = Math.max(1, Math.min(3, Math.floor(validLen / 2)));
    const prime = validAll.slice(0, w);
    assert.equal(u.degradation.firstAvg, Math.round((prime.reduce((s, l) => s + l.durationSec, 0) / prime.length) * 100) / 100);
    assert.equal(u.bestLapSec, Math.round(Math.min(...validAll.map((l) => l.durationSec)) * 10) / 10);
  } else {
    assert.equal(u.degradation, null, 'con 0-1 giri validi il degrado è null');
  }
  for (const w of Object.keys(u.temps)) {
    assert.ok(['LF', 'RF', 'LR', 'RR'].includes(w), 'la ruota è una delle quattro');
    for (const k of ['first', 'last', 'deltaC', 'max']) assert.ok(Number.isFinite(u.temps[w][k]));
  }
  if (u.hottestWheel) assert.equal(u.temps[u.hottestWheel].last, Math.max(...Object.values(u.temps).map((t) => t.last)));
});

test('tyreWearFromLd rifiuta un file inesistente', () => {
  assert.equal(tyreWearFromLd('non-esiste.ld'), null);
});
