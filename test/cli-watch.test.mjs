// Fumo dei comandi CLI (processi veri, su cartella dati temporanea) e del watcher.
//
// Motivo: il bug persist del 2026-10-14 era già nel commit iniziale ma nessun
// test lo vedeva, perché la strada CLI veniva esercitata solo a gara finita.
// Qui i comandi di sola lettura girano per davvero; il watcher invece vive su
// una cartella temporanea e non tocca nulla di vero.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'ac-evo-career.mjs');
const LADDER = readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8');

test('comandi CLI di sola lettura girano senza crash (fumo)', async () => {
  // Cartella dati finta + carriera nuova: nessuna dipendenza da EVO né dal tuo salvataggio vero.
  const DATA = mkdtempSync(join(tmpdir(), 'evo-smoke-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const { createCareer } = await import('../src/state.mjs?v=smoke');
  const career = createCareer(JSON.parse(LADDER), { name: 'Test Driver', nation: 'ITA' });
  writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(career, null, 2) + '\n', 'utf8');
  const env = { ...process.env, EVO_DATA_DIR: DATA, ACE_DATA: DATA };
  for (const cmd of [['status'], ['next'], ['calendar'], ['messages', '--digest'], ['help']]) {
    const r = spawnSync(process.execPath, [CLI, ...cmd], { encoding: 'utf8', timeout: 30000, cwd: ROOT, env });
    assert.equal(r.status, 0, `comando ${cmd.join(' ')} exit ${r.status}: ${(r.stderr || r.stdout || '').slice(-400)}`);
    assert.ok((r.stdout || '').length > 10, `${cmd.join(' ')} non stampa nulla`);
  }
});

test('watchOnce ignora i file pre-esistenti (baseline): non incassa il passato', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-watch-'));
  process.env.EVO_DATA_DIR = DATA;
  process.env.ACE_DATA = DATA; // isolato: non dipende dall'installazione di EVO sul PC
  const Results = join(DATA, 'Results');
  mkdirSync(Results, { recursive: true });
  const old = join(Results, '261010-1000_SP_Race.sessionresults.json');
  writeFileSync(old, JSON.stringify({ session: 'race', track: 'xyz' }));
  const past = new Date(Date.parse('2026-10-10T10:00:00Z'));
  utimesSync(old, past, past); // scritto prima del via del watcher

  const { watchOnce } = await import('../src/watch.mjs');
  const { loadState } = await import('../src/state.mjs');
  const { resolvePaths } = await import('../src/paths.mjs');
  const paths = resolvePaths();

  const out = watchOnce(JSON.parse(LADDER), paths, {
    baselineMs: Date.now(),
    stateLoader: () => loadState(join(DATA, 'evo-career.save.json')),
  });
  assert.equal(out.scanned, 0, 'i file scritti prima del baseline non devono essere guardati');
  assert.equal(out.imported, null);
  assert.equal(out.error, null);
});

test('watchOnce su cartella senza file: scansiona zero e non tocca lo stato', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-watch-2-'));
  process.env.EVO_DATA_DIR = DATA;
  process.env.ACE_DATA = DATA; // isolato: non dipende dall'installazione di EVO sul PC
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const { watchOnce } = await import('../src/watch.mjs');
  const { resolvePaths } = await import('../src/paths.mjs');
  const out = watchOnce(JSON.parse(LADDER), resolvePaths(), {
    baselineMs: Date.now(),
    stateLoader: () => { throw new Error('lo stato non deve essere toccato senza gare nuove'); },
  });
  assert.equal(out.scanned, 0);
  assert.equal(out.imported, null);
  assert.equal(out.error, null);
});

test('watchOnce incassa davvero una gara fresca della pista attesa (end-to-end, formato EVO reale)', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-watch-e2e-'));
  process.env.EVO_DATA_DIR = DATA;
  process.env.ACE_DATA = DATA; // resolvePaths guard solo questa cartella, niente sfiora
  const Results = join(DATA, 'Results');
  mkdirSync(Results, { recursive: true });

  const { createCareer, loadState } = await import('../src/state.mjs?v=e2e');
  const { SAVE_FILE } = await import('../src/import.mjs?v=e2e');
  const { resolvePaths } = await import('../src/paths.mjs?v=e2e');
  const { watchOnce } = await import('../src/watch.mjs?v=e2e');
  const ladder = JSON.parse(LADDER);

  assert.equal(SAVE_FILE, join(DATA, 'evo-career.save.json'), 'il salvataggio è quello della cartella di prova');
  const state = createCareer(ladder, { name: 'Test Driver', nation: 'ITA' }); // prima serie: coppa_citta, R1 = Imola
  const JSON_MK = await import('node:fs');
  JSON_MK.writeFileSync(SAVE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');

  // gara finta in formato EVO (stesso generatore usato per la demo), fresca e sulla pista attesa
  const fake = spawnSync(process.execPath, [join(ROOT, 'tools', 'evo-fake-result.mjs'),
    '--dir', Results, '--player', 'Test Driver', '--track', 'Imola', '--position', '2', '--cars', '14',], { encoding: 'utf8', timeout: 30000 });
  assert.equal(fake.status, 0, `evo-fake-result exit ${fake.status}: ${(fake.stderr || fake.stdout || '').slice(-300)}`);

  const { saveState } = await import('../src/state.mjs?v=e2e');
  const out = watchOnce(ladder, resolvePaths(), {
    baselineMs: Date.now() - 5000,
    stateLoader: () => loadState(SAVE_FILE),
    persist: (s) => saveState(SAVE_FILE, s), // esplicito: niente casi "SAVE_FILE dal primo import"
  });
  assert.equal(out.error, null, `watcher in errore: ${out.error?.message ?? ''}`);
  assert.equal(out.ignored.length, 0, `direi nessun scarto: ${JSON.stringify(out.ignored)}`);
  assert.ok(out.imported, 'la guardia deve incassare la gara');
  assert.equal(out.imported.entry.position, 2);
  assert.ok(out.imported.money > state.money, 'i soldi devono crescere col premio');

  // lo stato scritto dal default di persist, non da un apportatore esterno
  const saved = JSON.parse(JSON_MK.readFileSync(SAVE_FILE, 'utf8'));
  assert.equal(saved.round, 1, 'la ronda deve avanzare a 2a gara');

  // secondo giro di scansione: stesso file, nessun doppio incasso. Il motivo dello
  // scarto può variare (già incassata, oppure ronda attesa diversa dopo l'avanzamento):
  // la garanzia dura è che imported resta null e lo stato non cambia.
  const savedBefore = JSON_MK.readFileSync(SAVE_FILE, 'utf8');
  const again = watchOnce(ladder, resolvePaths(), {
    baselineMs: Date.now() - 5000,
    stateLoader: () => loadState(SAVE_FILE),
    persist: (s) => saveState(SAVE_FILE, s),
  });
  assert.equal(again.imported, null, 'nessun doppio incasso');
  assert.equal(JSON_MK.readFileSync(SAVE_FILE, 'utf8'), savedBefore, 'lo stato non deve cambiare al secondo giro');
});
