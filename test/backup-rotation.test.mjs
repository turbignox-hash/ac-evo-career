// La rotazione dei backup: solo .auto.json si toccano, l'ordine è per data di
// modifica (i nomi hanno mescolato formati di data: per nome il più vecchio
// risultava il più recente e non veniva mai cancellato).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-bak-data-'));
const { pruneAutoBackups } = await import('../src/import.mjs');

const mk = (dir, name, mtimeMs) => {
  const p = join(dir, name);
  writeFileSync(p, '{}');
  utimesSync(p, mtimeMs / 1000, mtimeMs / 1000);
};

test('pruneAutoBackups: tiene i 10 .auto più recenti per mtime, non tocca i manuali', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-bak-'));
  // 12 backup automatici: nomi in ordine crescente ma mtime DECRESCENTE —
  // un ordinamento per nome avrebbe sbagliato completamente il più vecchio
  for (let i = 0; i < 12; i++) mk(dir, `evo-career.save.bak-${String(i).padStart(2, '0')}.auto.json`, 10_000 - i);
  // due backup manuali (formato vecchio e nuovo): non si toccano MAI
  mk(dir, 'evo-career.save.bak-20260923-205651.json', 1);
  mk(dir, 'evo-career.save.bak-2026-10-01T10-00-00.json', 99_999);

  pruneAutoBackups(dir, 10);

  // restano le 10 .auto con mtime più alto (i=0..9), sparisecono i più vecchi (i=10,11)
  assert.equal(existsSync(join(dir, 'evo-career.save.bak-00.auto.json')), true);
  assert.equal(existsSync(join(dir, 'evo-career.save.bak-09.auto.json')), true);
  assert.equal(existsSync(join(dir, 'evo-career.save.bak-10.auto.json')), false);
  assert.equal(existsSync(join(dir, 'evo-career.save.bak-11.auto.json')), false);
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.auto.json')).length, 10);
  // i manuali restano qualunque cosa succeda
  assert.equal(existsSync(join(dir, 'evo-career.save.bak-20260923-205651.json')), true);
  assert.equal(existsSync(join(dir, 'evo-career.save.bak-2026-10-01T10-00-00.json')), true);
});

test('pruneAutoBackups: cartella inesistente o vuota non lancia errori', () => {
  assert.doesNotThrow(() => pruneAutoBackups(join(tmpdir(), 'non-esiste-per-niente'), 10));
  const empty = mkdtempSync(join(tmpdir(), 'evo-bak-empty-'));
  assert.doesNotThrow(() => pruneAutoBackups(empty, 10));
});
