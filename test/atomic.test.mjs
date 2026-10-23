import "./_flows-sandbox.mjs"; // sandbox flussi
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonAtomic } from '../src/atomic.mjs';

test('writeJsonAtomic scrive JSON leggibile, sovrascrive e non lascia .tmp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-atomic-'));
  const file = join(dir, 'x.json');
  writeJsonAtomic(file, { a: 1 });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 1 });
  writeJsonAtomic(file, { a: 2 });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { a: 2 });
  assert.equal(existsSync(`${file}.tmp`), false);
});

test('writeJsonAtomic non crea le cartelle: il chiamante fa mkdirSync (come documentato)', () => {
  // documentiamo il comportamento: senza cartella, la write fallisce (il chiamante fa mkdirSync)
  const dir = mkdtempSync(join(tmpdir(), 'evo-atomic2-'));
  const file = join(dir, 'sub', 'x.json');
  assert.throws(() => writeJsonAtomic(file, { a: 1 }));
});
