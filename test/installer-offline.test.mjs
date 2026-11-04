// installer-offline.test.mjs — la prova del ramo «installer offline».
//
// installa.cmd deve usare gli zip LOCALI (EVO_INSTALLER_NODEZIP e
// EVO_INSTALLER_CODEZIP) senza toccare la rete: qui API e NODEURL puntano a una
// porta chiusa, quindi un download accidentale farebbe fallire l'installazione.
// Il finto node.exe del PC esce sempre 1: forza il ramo del Node portatile.
// Windows only; richiede csc.exe di .NET Framework, come il test del Node vecchio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLATORE = join(QUI, 'installa.cmd');
const TAR = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
const CSC = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  : null;
const SKIP = process.platform !== 'win32' || !CSC || !existsSync(CSC);
const COMMIT = 'offline0x1a2b';

function cmdAsync(file, args, opts, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const child = spawn(file, args, opts);
    let closed = false;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('exit', (code, signal) => {
      if (closed) return;
      closed = true;
      clearTimeout(guard);
      resolve({ status: code, signal, stdout, stderr });
    });
    const guard = setTimeout(() => {
      if (closed) return;
      try { child.kill(); } catch { /* pazienza */ }
      closed = true;
      resolve({ status: null, signal: 'WATCHDOG', stdout, stderr });
    }, timeoutMs);
  });
}

test('installatore offline: usa Node e codice incorporati, senza rete', { skip: SKIP }, async (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'installer-offline-'));
  const destinazione = mkdtempSync(join(tmpdir(), 'installer-offline-target-'));
  t.after(() => {
    rmSync(blob, { recursive: true, force: true });
    rmSync(destinazione, { recursive: true, force: true });
  });

  // --- finto Node vecchio: where node lo trova, ma -e esce 1 ---
  const oldDir = join(blob, 'oldnode');
  mkdirSync(oldDir);
  const oldCs = join(blob, 'old-node.cs');
  writeFileSync(oldCs, 'using System; class P { static int Main(string[] args) { return 1; } }\n', 'utf8');
  const oldExe = join(oldDir, 'node.exe');
  const oldCsc = spawnSync(CSC, ['/nologo', '/target:exe', `/out:${oldExe}`, oldCs], { encoding: 'utf8', windowsHide: true });
  assert.equal(oldCsc.status, 0, 'compilazione stub Node vecchio: ' + (oldCsc.stderr ?? '') + (oldCsc.stdout ?? ''));

  // --- zip del codice come lo produce il builder offline ---
  const codeStage = join(blob, 'code-stage');
  const codeRoot = `ac-evo-career-${COMMIT}`;
  mkdirSync(join(codeStage, codeRoot, 'tools'), { recursive: true });
  writeFileSync(join(codeStage, codeRoot, 'package.json'), JSON.stringify({ name: 'ac-evo-career', version: '0.0.0-offline' }), 'utf8');
  writeFileSync(join(codeStage, codeRoot, 'ac-evo-career.mjs'), 'console.log("offline sandbox")\n', 'utf8');
  writeFileSync(join(codeStage, codeRoot, 'avvia.cmd'), '@echo off\nrem stub\n', 'utf8');
  writeFileSync(join(codeStage, codeRoot, 'disinstalla.cmd'), '@echo off\nrem stub\n', 'utf8');
  copyFileSync(join(QUI, 'tools', 'crea-scorciatoia.mjs'), join(codeStage, codeRoot, 'tools', 'crea-scorciatoia.mjs'));
  const codeZip = join(blob, 'code.zip');
  const codeTar = spawnSync(TAR, ['-a', '-cf', codeZip, '-C', codeStage, codeRoot], { encoding: 'utf8' });
  assert.equal(codeTar.status, 0, 'zip codice: ' + (codeTar.stderr ?? ''));

  // --- zip Node incorporato: stub che accetta il controllo versione ---
  const nodeStage = join(blob, 'node-stage');
  const nodeRoot = 'node-v20.0.0-win-x64';
  mkdirSync(join(nodeStage, nodeRoot), { recursive: true });
  const stubCs = join(blob, 'node-stub.cs');
  writeFileSync(stubCs, 'using System; class P { static int Main(string[] args) { return 0; } }\n', 'utf8');
  const nodeExe = join(nodeStage, nodeRoot, 'node.exe');
  const csc = spawnSync(CSC, ['/nologo', '/target:exe', `/out:${nodeExe}`, stubCs], { encoding: 'utf8', windowsHide: true });
  assert.equal(csc.status, 0, 'compilazione stub node.exe: ' + (csc.stderr ?? '') + (csc.stdout ?? ''));
  const nodeZip = join(blob, 'node.zip');
  const nodeTar = spawnSync(TAR, ['-a', '-cf', nodeZip, '-C', nodeStage, nodeRoot], { encoding: 'utf8' });
  assert.equal(nodeTar.status, 0, 'zip Node: ' + (nodeTar.stderr ?? ''));
  const nodeSha = createHash('sha256').update(readFileSync(nodeZip)).digest('hex');

  // API e NODEURL su una porta chiusa: se l'installatore scaricasse, fallirebbe.
  const r = await cmdAsync('cmd.exe', ['/d', '/c', INSTALLATORE], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TMP: blob,
      TEMP: blob,
      PATH: `${oldDir};${process.env.PATH ?? ''}`,
      EVO_INSTALLER_DIR: destinazione,
      EVO_INSTALLER_API: 'http://127.0.0.1:1/repos/turbignox-hash/ac-evo-career',
      EVO_INSTALLER_NODEURL: 'http://127.0.0.1:1/node.zip',
      EVO_INSTALLER_NODEZIP: nodeZip,
      EVO_INSTALLER_NODESHA: nodeSha,
      EVO_INSTALLER_CODEZIP: codeZip,
      EVO_INSTALLER_AUTO: '1',
      EVO_INSTALLER_FAST: '1',
      EVO_INSTALLER_NOSCORCIATOIA: '1',
      EVO_INSTALLER_NOAVVIO: '1',
      EVO_INSTALLER_NOREGISTRO: '1',
    },
  }, 120_000);

  assert.equal(r.signal, null, `watchdog: impalato\n${r.stdout}\n${r.stderr}`);
  assert.equal(r.status, 0, `uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes("Uso il Node incluso nell'installer offline"), `Node locale non usato:\n${r.stdout}`);
  assert.ok(r.stdout.includes("Uso il codice incluso nell'installer offline"), `codice locale non usato:\n${r.stdout}`);
  assert.ok(existsSync(join(destinazione, '_node', 'node.exe')), 'node.exe incorporato non è nella destinazione');
  assert.ok(existsSync(join(destinazione, 'ac-evo-career.mjs')), 'codice non copiato');
  assert.equal(readFileSync(join(destinazione, 'build-id.txt'), 'utf8').trim(), COMMIT, 'build-id non letto dallo zip locale');
  assert.ok(!existsSync(join(destinazione, 'data', '.github-token')), 'token scritto senza motivo');

  // --- hash sbagliato: l'installatore deve FERMARSI prima di estrarre ---
  const destinazione2 = mkdtempSync(join(tmpdir(), 'installer-offline-reject-'));
  t.after(() => rmSync(destinazione2, { recursive: true, force: true }));
  const r2 = await cmdAsync('cmd.exe', ['/d', '/c', INSTALLATORE], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TMP: blob,
      TEMP: blob,
      PATH: `${oldDir};${process.env.PATH ?? ''}`,
      EVO_INSTALLER_DIR: destinazione2,
      EVO_INSTALLER_AUTO: '1',
      EVO_INSTALLER_FAST: '1',
      EVO_INSTALLER_NOSCORCIATOIA: '1',
      EVO_INSTALLER_NOAVVIO: '1',
      EVO_INSTALLER_NOREGISTRO: '1',
      EVO_INSTALLER_NODEZIP: nodeZip,
      EVO_INSTALLER_NODESHA: '0'.repeat(64),
      EVO_INSTALLER_CODEZIP: codeZip,
    },
  }, 120_000);
  assert.notEqual(r2.status, 0, 'hash sbagliato accettato:\n' + r2.stdout);
  assert.ok(r2.stdout.includes('non corrisponde allo SHA-256 atteso'), `messaggio hash assente:\n${r2.stdout}`);
  assert.ok(!existsSync(join(destinazione2, 'ac-evo-career.mjs')), 'codice estratto nonostante l\'hash sbagliato');
});
