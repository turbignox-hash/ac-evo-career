import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { findCorners, cornersOfLap, DEFAULT_CORNER_KMH } from '../src/telemetria-curve.mjs';
import { sampleLap } from '../src/motec.mjs';

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

test('cornersOfLap legge un giro reale e trova curve sotto soglia', { skip }, () => {
  const c = cornersOfLap(LD);
  assert.ok(c, 'il giro reale deve essere leggibile');
  assert.ok(c.corners.length > 0, 'un giro reale ha almeno una curva');
  for (const k of c.corners) {
    assert.ok(k.speedKmh < DEFAULT_CORNER_KMH, 'la curva è sotto la soglia');
    assert.ok(k.distFrac >= 0 && k.distFrac <= 1, 'posizione nel giro in [0,1]');
  }
});

test('findCorners sul giro reale: ogni indice è un minimo locale', { skip }, () => {
  const c = cornersOfLap(LD);
  assert.ok(c);
  const s = sampleLap(LD, 'best', 240);
  const idx = findCorners(s.vs);
  assert.deepEqual(idx, c.corners.map((k) => k.index));
  for (const i of idx) {
    for (let j = Math.max(0, i - 5); j <= Math.min(s.vs.length - 1, i + 5); j++) {
      assert.ok(s.vs[j] >= s.vs[i], 'nessun campione vicino è più basso');
    }
  }
});

test('findCorners rifiuta tracce non valide', () => {
  assert.deepEqual(findCorners(null), []);
  assert.deepEqual(findCorners([100, 90]), []);
});
