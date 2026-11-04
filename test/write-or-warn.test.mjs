import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('writeOrWarn conserva il fallback e annota il fallimento in errors.jsonl', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-write-or-warn-'));
  process.env.EVO_DATA_DIR = dir;

  const { writeOrWarn } = await import('../src/safe-write.mjs');
  const { readWarnings } = await import('../src/warnings.mjs');

  assert.equal(writeOrWarn('test.ok', () => 42), 42);

  const fallback = writeOrWarn('test.write', () => {
    throw Object.assign(new Error('disco pieno'), { code: 'ENOSPC' });
  }, 'fallback');
  assert.equal(fallback, 'fallback');

  const w = readWarnings({ perModule: 10 });
  const mod = w.modules.find((m) => m.module === 'test.write');
  assert.ok(mod, 'la voce del modulo test.write deve esserci');
  assert.match(mod.last[0].message, /ENOSPC/);
  assert.match(mod.last[0].message, /disco pieno/);
  assert.equal(w.modules.some((m) => m.module === 'test.ok'), false);

  rmSync(dir, { recursive: true, force: true });
});
