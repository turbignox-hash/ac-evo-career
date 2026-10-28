// Fumo dei comandi CLI (processi veri, su cartella dati temporanea) e del watcher.
//
// Motivo: il bug persist del 2026-10-14 era già nel commit iniziale ma nessun
// test lo vedeva, perché la strada CLI veniva esercitata solo a gara finita.
// Qui i comandi di sola lettura girano per davvero; il watcher invece vive su
// una cartella temporanea e non tocca nulla di vero.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, readFileSync, renameSync, copyFileSync } from 'node:fs';
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
  const state = createCareer(ladder, { name: 'Test Driver', nation: 'ITA' });
  // la serie di partenza NON si codifica a mano: l'ordine dei calendari cambia
  // legittimamente (passata di stile entry, 30/10). La pista attesa si legge
  // DA LADDER: prima serie, R1, col nome bello di contentNames per evo-fake-result.
  const entryNode = ladder.nodes[0];
  const entryTrackId = entryNode.calendar[0].track;
  const entryTrackName = ladder.contentNames.tracks[entryTrackId] ?? entryTrackId;
  const entryCarId = entryNode.cars[0]; // deve essere una auto AMMESSA della serie (vigia del parco auto)
  const entryCarName = ladder.contentNames.cars[entryCarId] ?? entryCarId;
  const JSON_MK = await import('node:fs');
  JSON_MK.writeFileSync(SAVE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');

  // gara finta in formato EVO (stesso generatore usato per la demo), fresca e sulla pista attesa
  const fake = spawnSync(process.execPath, [join(ROOT, 'tools', 'evo-fake-result.mjs'),
    '--dir', Results, '--player', 'Test Driver', '--track', entryTrackName, '--position', '2', '--cars', '14',
    // auto AMMESSA della serie presa dal ladder (la vigia del parco auto
    // (car-pool.mjs) giudica la car del risultato: una estranea → premio ZERO.
    '--car', entryCarName,], { encoding: 'utf8', timeout: 30000 });
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

test('watchOnce davanti a una gara MULTIPLAYER (_MP_): carriera intonaca, poi la stessa gara SP incassa', async () => {
  // La gara col server NON deve MAI pagare punti, soldi o rep della carriera.
  // Qui una gara vera della pista attesa viene rinominata col tag _MP_ del
  // gioco (stesso formato, nome in stile "260416-2108_MP_Race"): il watcher
  // la STESSA gara, col nome SP, resta incassabile.
  const DATA = mkdtempSync(join(tmpdir(), 'evo-watch-mp-'));
  process.env.EVO_DATA_DIR = DATA;
  process.env.ACE_DATA = DATA;
  const Results = join(DATA, 'Results');
  mkdirSync(Results, { recursive: true });

  const { createCareer, loadState, saveState } = await import('../src/state.mjs?v=mp');
  const { SAVE_FILE } = await import('../src/import.mjs?v=mp');
  const { resolvePaths } = await import('../src/paths.mjs?v=mp');
  const { watchOnce } = await import('../src/watch.mjs?v=mp');
  const ladder = JSON.parse(LADDER);
  // Pilota PROPRIO per questo test ("MP Tester"): evo-fake-result è
  // deterministico, e il registro anti-doppioni lavora per HASH DEL FILE —
  // una gara Twin-identica a quella del test e2e sopra era "già incassata",
  // indipendentemente dalla salvaguardia _MP_ che qui si prova.
  const state = createCareer(ladder, { name: 'MP Tester', nation: 'ITA' });
  const entryNode = ladder.nodes[0];
  const entryTrackName = ladder.contentNames.tracks[entryNode.calendar[0].track] ?? entryNode.calendar[0].track;
  const entryCarName = ladder.contentNames.cars[entryNode.cars[0]] ?? entryNode.cars[0];
  writeFileSync(SAVE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');

  const fake = spawnSync(process.execPath, [join(ROOT, 'tools', 'evo-fake-result.mjs'),
    '--dir', Results, '--player', 'MP Tester', '--track', entryTrackName, '--position', '2', '--cars', '14',
    '--car', entryCarName], { encoding: 'utf8', timeout: 30000 });
  assert.equal(fake.status, 0, `evo-fake-result exit ${fake.status}: ${(fake.stderr || fake.stdout || '').slice(-300)}`);

  // rinomina al formato ONLINE vero del gioco (tag _MP_ nel nome)
  const sp = (await import('node:fs')).readdirSync(Results).find((f) => f.endsWith('.json'));
  assert.ok(sp, 'la gara finta deve esistere in Results');
  const mpName = sp.replace(/_SP_/, '_MP_');
  const mp = join(Results, mpName);
  renameSync(join(Results, sp), mp);
  const now = new Date();
  utimesSync(mp, now, now); // freschissima: un watcher reale la vedrebbe

  const moneyBefore = state.money;
  const out = watchOnce(ladder, resolvePaths(), {
    baselineMs: Date.now() - 5000,
    stateLoader: () => loadState(SAVE_FILE),
    persist: (s) => saveState(SAVE_FILE, s),
  });
  assert.equal(out.error, null, `watcher in errore: ${out.error?.message ?? ''}`);
  assert.equal(out.imported, null, 'la gara online NON deve pagare la carriera');
  assert.ok(out.ignored.some((x) => x.name === mpName && /online|_MP_|multiplayer/i.test(x.reason)),
    `lo scarto online deve spiegare il perché: ${JSON.stringify(out.ignored)}`);
  const saved = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
  assert.equal(saved.round, 0, 'la ronda non deve avanzare per una gara col server');
  assert.equal(saved.money, moneyBefore, 'i soldi non devono muoversi per una gara online');

  // La STESSA gara, senza il tag _MP_, resta incassabile: la salvaguardia non
  // deve mangiare le gare vere — pretende UNICAMENTE il tag del gioco.
  const spName = join(Results, mpName.replace(/_MP_/, '_SP_'));
  copyFileSync(mp, spName);
  utimesSync(spName, now, now);
  const out2 = watchOnce(ladder, resolvePaths(), {
    baselineMs: Date.now() - 5000,
    stateLoader: () => loadState(SAVE_FILE),
    persist: (s) => saveState(SAVE_FILE, s),
  });
  assert.equal(out2.error, null);
  assert.ok(out2.imported, `la stessa gara SENZA il tag online deve invece incassare: ${JSON.stringify(out2)}`);
  assert.equal(out2.imported.entry.position, 2);
});
