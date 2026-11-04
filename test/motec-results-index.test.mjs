import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readResultMeta } from '../src/motec.mjs';

function risultato(dir, name, { track, session, mtime, weather = 'CLEAR', hour = 12, min = 0, layout = 'GP' }) {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify({ track, layout, session, weather_type: `GameModeSelectionWeatherType_${weather}`, hour, min }));
  utimesSync(file, new Date(mtime), new Date(mtime));
}

test('readResultMeta: sceglie il Results più vicino della stessa pista, non il primo trovato', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-results-index-'));
  try {
    risultato(dir, 'a.json', { track: 'Monza', session: 'Practice', mtime: 100000 });
    risultato(dir, 'b.json', { track: 'Monza', session: 'Race', mtime: 100060, weather: 'RAIN', hour: 15, min: 30 });
    risultato(dir, 'c.json', { track: 'Spa', session: 'Qualify', mtime: 100049 });
    const out = readResultMeta(dir, { endMs: 100050, track: 'Monza' });
    assert.equal(out?.file, 'b.json', 'il Results di Monza a 10 s batte quello di Spa a 1 s: la pista filtra prima');
    assert.equal(out?.kind, 'race');
    assert.equal(out?.weather, 'RAIN');
    assert.equal(out?.hour, 15);
    assert.equal(out?.min, 30);
    assert.equal(out?.track, 'Monza');
    assert.equal(out?.layout, 'GP');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readResultMeta: fuori dalla finestra non inventa un risultato', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-results-window-'));
  try {
    risultato(dir, 'lontano.json', { track: 'Monza', session: 'Race', mtime: 100000 });
    const out = readResultMeta(dir, { endMs: 100000 + 120001, track: 'Monza' });
    assert.equal(out, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});