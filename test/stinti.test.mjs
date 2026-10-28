import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stintsOf, fuelPaceOf, stintsFromLd } from '../src/stinti.mjs';
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

const r2 = (v) => Math.round(v * 100) / 100;

// giro: lap, durationSec, fuelStart, fuelEnd (fuelUsed se entrambi presenti)
function lapF(n, dur, fs, fe) {
  return { lap: n, durationSec: dur, fuelStart: fs, fuelEnd: fe, fuelUsed: fs != null && fe != null ? r2(fs - fe) : null };
}

test('stintsOf: spezza su un rifornimento reale (salto di carburante)', () => {
  const laps = [
    lapF(1, 86, 100, 96), lapF(2, 85.5, 96, 92), lapF(3, 86.4, 92, 88), lapF(4, 85, 88, 84),
    lapF(5, 85.8, 124, 120), lapF(6, 85.6, 120, 116), // rifornito: +40 l → stint nuovo
  ];
  const s = stintsOf(laps);
  assert.equal(s.length, 2);
  assert.equal(s[0].fromLap, 1); assert.equal(s[0].toLap, 4); assert.equal(s[0].nLaps, 4);
  assert.equal(s[1].fromLap, 5); assert.equal(s[1].toLap, 6); assert.equal(s[1].nLaps, 2);
  assert.equal(s[0].avgLapSec, r2((86 + 85.5 + 86.4 + 85) / 4));   // 85.73
  assert.equal(s[0].bestLapSec, 85);
  assert.equal(s[0].fuelPerLap, 4);
  // degrado DENTRO il stint, stessa regola di usura-gomme: 4 giri → finestra
  // di 2 a testa → prima media (86, 85.5) = 85.75, ultima (86.4, 85) = 85.7
  assert.equal(s[0].degradation.deltaSec, -0.05);
});

test('stintsOf: senza canale FUEL non spezza niente, il degrado resta misurabile', () => {
  const s = stintsOf([{ lap: 1, durationSec: 90 }, { lap: 2, durationSec: 89 }, { lap: 3, durationSec: 91 }]);
  assert.equal(s.length, 1);
  assert.equal(s[0].nLaps, 3);
  assert.equal(s[0].fuelPerLap, null);
  assert.equal(s[0].degradation.deltaSec, 1); // 90 → 91: si è rallentato di 1 s
});

test('stintsOf rifiuta input vuoti e giri da out lap', () => {
  assert.deepEqual(stintsOf([]), []);
  assert.deepEqual(stintsOf(null), []);
  // sotto i 15 s non è un giro di pista (out lap, fermo in box)
  assert.deepEqual(stintsOf([{ lap: 1, durationSec: 8 }]), []);
});

test('fuelPaceOf: la pendenza ritmo-carburante esce dai dati, non da un manuale', () => {
  const laps = [
    lapF(1, 85.0, 100, 98.5), lapF(2, 85.4, 97, 95.5), lapF(3, 85.9, 94, 92.5), lapF(4, 86.2, 91, 89.5),
  ];
  const p = fuelPaceOf(laps);
  assert.ok(p);
  assert.equal(p.n, 4);
  assert.ok(p.fuelSpread >= 2);
  // la benzina scende (100→91) e i tempi salgono (85.0→86.2): pendenza
  // NEGATIVA = ogni litro in meno accelera. Il segno va COL dato, non a mano.
  assert.ok(p.secPerLiter < 0);
});

test('fuelPaceOf: sotto soglia esce null invece di un numero di rumore', () => {
  // meno di 4 giri: pendenza non affidabile
  assert.equal(fuelPaceOf([lapF(1, 85, 100, 98.5), lapF(2, 85.1, 98.5, 97)]), null);
  // 4 giri ma spread < 2 l: senza benzina diversa non si misura
  assert.equal(fuelPaceOf([
    lapF(1, 85, 100, 98.5), lapF(2, 85.3, 99.8, 98.2), lapF(3, 85.6, 99.6, 98), lapF(4, 85.9, 99.4, 97.8),
  ]), null);
});

test('stintsFromLd legge una sessione REALE: stint coerenti con i giri', { skip }, () => {
  const st = stintsFromLd(LD);
  assert.ok(st, 'il file .ld reale deve essere leggibile');
  assert.ok(st.nStints >= 1, 'almeno un stint');
  // la somma dei giri dei stint è TUTTI i giri validi (nessuna perdita)
  const an = analyzeLd(LD);
  const validLen = an.laps.filter((l) => l.durationSec > 15).length;
  assert.equal(st.laps, validLen);
  assert.equal(st.stints.reduce((s, k) => s + k.nLaps, 0), validLen);
  // il best stint è quello col ritmo medio migliore: definizione = comparazione
  assert.equal(st.bestStint.avgLapSec, Math.min(...st.stints.map((s) => s.avgLapSec)));
  if (st.fuelPace) {
    assert.ok(Number.isFinite(st.fuelPace.secPerLiter));
    assert.equal(st.fuelPace.n, validLen);
    assert.ok(st.fuelPace.fuelSpread >= 2);
  }
});

test('stintsFromLd rifiuta un file che non c\'è', () => {
  assert.equal(stintsFromLd('non-esiste.ld'), null);
});
