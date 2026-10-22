// Fumo del comando prepara (processo vero su cartella dati temporanea).
//
// Solo --dry: nel CLI SAVE_FILE è ancorato a PROJECT/data (non segue le env
// finte del smoke), quindi un giro SENZA --dry scriverebbe la carriera vera.
// Il dry tocca solo la stampa: il save finto deve restare IDENTICO dopo il run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, statSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'ac-evo-career.mjs');
const LADDER = readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8');

test('prepara --dry: card stampata, save intatto, niente griglia scritta (fumo)', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-prepara-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const { createCareer } = await import('../src/state.mjs?v=prepara');
  const career = createCareer(JSON.parse(LADDER), { name: 'Test Driver', nation: 'ITA' });
  writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(career, null, 2) + '\n', 'utf8');
  const before = statSync(join(DATA, 'evo-career.save.json')).mtimeMs;

  // USERPROFILE finto: il customgrid del test è inesistente — la griglia va in
  // catch di cmdPrepara ("Griglia non preparata") e il giro prosegue con la card.
  // EVO_LANG=it: il test aspetta i testi italiani; senza override la CLI seguirebbe
  // la lingua salvata in evo.config.json (bilingue a scelta dell'utente).
  const env = { ...process.env, EVO_DATA_DIR: DATA, ACE_DATA: DATA, USERPROFILE: DATA, EVO_LANG: 'it' };
  const r = spawnSync(process.execPath, [CLI, 'prepara', '--dry'], { encoding: 'utf8', timeout: 60000, cwd: ROOT, env });
  assert.equal(r.status, 0, `prepara --dry exit ${r.status}: ${(r.stderr || r.stdout || '').slice(-500)}`);
  assert.ok((r.stdout || '').includes('Prepara-ronda'), 'manca il titolo del comando');
  assert.ok((r.stdout || '').includes('dry-run'), 'manca la nota dry-run');

  // zero scritture: il save finto non è cambiato (mtime identico)
  const after = statSync(join(DATA, 'evo-career.save.json')).mtimeMs;
  assert.equal(after, before, 'il save è stato toccato in --dry (non dovrebbe)');
});
