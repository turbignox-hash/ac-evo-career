import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bridgeSetup } from '../src/carsetup.mjs';

function sandbox() {
  const saved = mkdtempSync(join(tmpdir(), 'ponte-'));
  const auto = 'Ferrari 296 GT3';
  const srcDir = join(saved, 'Car Setups', auto, 'Imola');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, 'Mio setup.carsetup'), 'PAYLOAD-IMOLA-42');
  return { saved, auto, srcDir };
}

test('ponte: copia byte per byte nella cartella della pista di arrivo', () => {
  const { saved, auto, srcDir } = sandbox();
  const r = bridgeSetup(saved, auto, 'Monza', join(srcDir, 'Mio setup.carsetup'));
  assert.equal(r.ok, true);
  assert.equal(readFileSync(r.file, 'utf8'), 'PAYLOAD-IMOLA-42');
  assert.equal(r.name, 'Mio setup');
  const tracks = readdirSync(join(saved, 'Car Setups', auto));
  assert.ok(tracks.includes('Monza'));
});

test('ponte: non sovrascrive mai — secondo ponte stesso nome prende « (2)»', () => {
  const { saved, auto, srcDir } = sandbox();
  bridgeSetup(saved, auto, 'Monza', join(srcDir, 'Mio setup.carsetup'));
  const r = bridgeSetup(saved, auto, 'Monza', join(srcDir, 'Mio setup.carsetup'));
  assert.equal(r.ok, true);
  assert.equal(r.name, 'Mio setup (2)');
  assert.equal(readFileSync(r.file, 'utf8'), 'PAYLOAD-IMOLA-42');
});

test('ponte: rifiuta stessa pista, file assente e auto mancante', () => {
  const { saved, auto, srcDir } = sandbox();
  assert.equal(bridgeSetup(saved, auto, 'Imola', join(srcDir, 'Mio setup.carsetup')).ok, false);
  assert.equal(bridgeSetup(saved, auto, 'Monza', join(srcDir, 'INESISTENTE.carsetup')).ok, false);
  assert.equal(bridgeSetup(saved, '', 'Monza', join(srcDir, 'Mio setup.carsetup')).ok, false);
  assert.equal(bridgeSetup(saved, auto, 'Monza', join(saved, 'nope.carsetup')).ok, false);
});
