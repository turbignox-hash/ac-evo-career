// disinstallatore-sandbox.test.mjs — LA PROVA DI disinstalla.cmd, in sandbox
// (26/10, gemello di test/installatore-sandbox.test.mjs).
//
// Niente desktop vere e niente installazioni vere: ogni prova costruisce una
// finta installazione in TEMP (ac-evo-career.mjs + build-id.txt + data\) e un
// finto .lnk su un desktop-vacanze. Il disinstallatore arriva SOLO via override
// d'ambiente (EVO_DISINSTALLA_DIR/OK/KEEP/DESKTOP, attesi dallo stesso script,
// vedi il blocco di intestazione).
//
// NOTA: spawn ASINCRONO con watchdog, NON spawnSync — stessa lezione del test
// dell'installatore (spawnSync si impala sui pipe ereditati su Windows).
//
// Windows only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const DISINSTALLA = join(QUI, 'disinstalla.cmd');

/** spawn con promessa + watchdog (vedi installatore-sandbox.test.mjs). */
function cmdAsync(file, args, opts, tettoMs = 60_000) {
  return new Promise((fine) => {
    const processo = spawn(file, args, opts);
    let chiuso = false;
    let stdout = '', stderr = '';
    processo.stdout.on('data', (d) => { stdout += d; });
    processo.stderr.on('data', (d) => { stderr += d; });
    processo.on('exit', (code, signal) => {
      if (chiuso) return;
      chiuso = true;
      clearTimeout(guardia);
      fine({ status: code, signal, stdout, stderr });
    });
    const guardia = setTimeout(() => {
      if (chiuso) return;
      try { processo.kill(); } catch { /* pazienza */ }
      chiuso = true;
      fine({ status: null, signal: 'WATCHDOG', stdout, stderr });
    }, tettoMs);
  });
}

/** Finta installazione: sembra un installato, con (o senza) carriera dentro. */
function fintaInstallazione(root, { conCarriera = false } = {}) {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'ac-evo-career.mjs'), 'console.log("fake")\n');
  writeFileSync(join(root, 'build-id.txt'), 'fintocommit0x1\n');
  writeFileSync(join(root, 'data', '.github-token'), 'token-finto\n');
  if (conCarriera) writeFileSync(join(root, 'data', 'career.json'), '{"fake": true}\n');
}

/** Finto .lnk sul desktop-vacanze, costruito con WScript.Shell (come fa il tool vero). */
function scorciatoia(dirDesktop, targetAvvia) {
  const lnk = join(dirDesktop, 'Carriera EVO.lnk');
  const ps = [
    '$shell = New-Object -ComObject WScript.Shell',
    `$s = $shell.CreateShortcut('${lnk}')`,
    `$s.TargetPath = '${targetAvvia}'`,
    '$s.Save()',
  ].join('; ');
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'il test non riesce a costruire il finto .lnk: ' + (r.stderr ?? ''));
  return lnk;
}

/** aspetta (max ms) che condición diventi vera: il figlio-servizio del
 *  saltello lavora in background, il padre che è uscito subito non basta. */
function aspetta(cond, ms = 8000) {
  return new Promise((fine) => {
    const inizio = Date.now();
    const battito = setInterval(() => {
      if (cond() || Date.now() - inizio > ms) {
        clearInterval(battito);
        fine();
      }
    }, 250);
  });
}

const baseEnv = (extra) => ({
  ...process.env,
  EVO_DISINSTALLA_OK: extra.OK ? '1' : undefined,
  EVO_DISINSTALLA_DIR: extra.DIR,
  EVO_DISINSTALLA_KEEP: extra.KEEP ? '1' : undefined,
  EVO_DISINSTALLA_DESKTOP: extra.DESKTOP,
});

test('disinstalla: pulita «via tutto», scorciatoia puntata qua → tolta', { skip: process.platform !== 'win32' }, async (t) => {
  const DESK = mkdtempSync(join(tmpdir(), 'dis-desk-'));
  const TARGET = mkdtempSync(join(tmpdir(), 'dis-inst-'));
  const PORTA = TARGET + '-data'; // come la scrive il disinstallatore (fratello accanto)
  t.after(() => { for (const d of [DESK, TARGET, PORTA]) rmSync(d, { recursive: true, force: true }); });
  fintaInstallazione(TARGET);
  const lnk = scorciatoia(DESK, join(TARGET, 'avvia.cmd'));
  const r = await cmdAsync('cmd.exe', ['/d', '/c', DISINSTALLA], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: baseEnv({ OK: true, DIR: TARGET, DESKTOP: DESK }),
  });
  assert.equal(r.signal, null, `watchdog: impalato\n${r.stdout}\n${r.stderr}`);
  assert.equal(r.status, 0, `uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.ok(!existsSync(TARGET), `la cartella deve andare via:\n${r.stdout}\n${r.stderr}`);
  assert.ok(!existsSync(lnk), `la scorciatoia puntata qua deve andare:\n${r.stdout}`);
  assert.ok(!existsSync(PORTA), `nessuna copia di data inaspettata:\n${r.stdout}\n${r.stderr}`);
});

test('disinstalla: scorciatoia di un\'ALTRA installazione → resta', { skip: process.platform !== 'win32' }, async (t) => {
  const DESK = mkdtempSync(join(tmpdir(), 'dis-desk2-'));
  const TARGET = mkdtempSync(join(tmpdir(), 'dis-inst2-'));
  const ALTRO = mkdtempSync(join(tmpdir(), 'dis-altro-'));
  t.after(() => { for (const d of [DESK, TARGET, ALTRO + '-data']) rmSync(d, { recursive: true, force: true }); });
  fintaInstallazione(TARGET);
  const lnk = scorciatoia(DESK, join(ALTRO, 'avvia.cmd')); // punta altrove
  const r = await cmdAsync('cmd.exe', ['/d', '/c', DISINSTALLA], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: baseEnv({ OK: true, DIR: TARGET, DESKTOP: DESK }),
  });
  assert.equal(r.status, 0, `uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.ok(!existsSync(TARGET), 'la cartella va via comunque');
  assert.ok(existsSync(lnk), `la scorciatoia di un'altra installazione sta al suo posto:\n${r.stdout}`);
  assert.ok(r.stdout.includes('resta'), `il disinstallatore lo dice:\n${r.stdout}`);
});

test('disinstalla: guardia 1 — cartella estranea, niente toccato', { skip: process.platform !== 'win32' }, async (t) => {
  const DESK = mkdtempSync(join(tmpdir(), 'dis-desk3-'));
  const TARGET = mkdtempSync(join(tmpdir(), 'dis-altremateria-'));
  t.after(() => { rmSync(DESK, { recursive: true, force: true }); rmSync(TARGET, { recursive: true, force: true }); });
  mkdirSync(join(TARGET, 'Documenti'), { recursive: true });
  writeFileSync(join(TARGET, 'relazione.docx'), 'non e\' mia\n');
  const r = await cmdAsync('cmd.exe', ['/d', '/c', DISINSTALLA], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: baseEnv({ OK: true, DIR: TARGET, DESKTOP: DESK }),
  });
  assert.equal(r.status, 1, `una cartella estranea NON deve andarsene: uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.ok(existsSync(join(TARGET, 'relazione.docx')), 'il contenuto estraneo resta');
});

test('disinstalla: carriera VERA + tengo → data\\ traslocata, cartella vietata', { skip: process.platform !== 'win32' }, async (t) => {
  const DESK = mkdtempSync(join(tmpdir(), 'dis-desk4-'));
  const TARGET = mkdtempSync(join(tmpdir(), 'dis-inst4-'));
  const PORTA = TARGET + '-data';
  t.after(() => { for (const d of [DESK, TARGET]) rmSync(d, { recursive: true, force: true }); });
  fintaInstallazione(TARGET, { conCarriera: true });
  const r = await cmdAsync('cmd.exe', ['/d', '/c', DISINSTALLA], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: baseEnv({ OK: true, DIR: TARGET, KEEP: true, DESKTOP: DESK }),
  });
  assert.equal(r.status, 0, `uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.ok(!existsSync(TARGET), `la cartella installata va via:\n${r.stdout}\n${r.stderr}`);
  assert.ok(existsSync(join(PORTA, 'career.json')), `la carriera si salva accanto:\n${r.stdout}\n${r.stderr}`);
  assert.ok(existsSync(join(PORTA, 'ac-evo-career.mjs')) === false, 'niente codice nella copia-tenuta');
});

test('disinstalla: lunciato DALLA cartella → saltello in TEMP e via', { skip: process.platform !== 'win32' }, async (t) => {
  const DESK = mkdtempSync(join(tmpdir(), 'dis-desk5-'));
  const TARGET = mkdtempSync(join(tmpdir(), 'dis-inst5-'));
  t.after(() => { for (const d of [DESK, TARGET]) rmSync(d, { recursive: true, force: true }); });
  fintaInstallazione(TARGET);
  // + copia del disinstallatore dentro la finta installazione (il caso amico
  // che lo tiene accanto al codice installato)
  writeFileSync(join(TARGET, 'disinstalla.cmd'), readFileSync(DISINSTALLA));
  const r = await cmdAsync('cmd.exe', ['/d', '/c', join(TARGET, 'disinstalla.cmd')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: baseEnv({ OK: true, DIR: TARGET, DESKTOP: DESK }),
  });
  assert.equal(r.signal, null, `impalato nel saltello\n${r.stdout}\n${r.stderr}`);
  assert.equal(r.status, 0, `uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  // il figlio-servizio lavora in background: gli do tempo di hausare
  await aspetta(() => !existsSync(TARGET));
  assert.ok(!existsSync(TARGET), `la cartella dove lo script viveva va via:\n${r.stdout}\n${r.stderr}`);
});
