// installer-node-vecchio.test.mjs — la prova del ramo «Node del PC < 18».
//
// Il test mette un finto node.cmd che risponde sempre 1 in testa al PATH,
// serve un Node zip locale con un node.exe stub che risponde 0 al controllo
// di versione, e verifica che installa.cmd scarichi e usi il portatile.
// Non tocca nodejs.org, GitHub o il registro reale: server HTTP locale e
// chiave HKCU temporanea. Windows only; richiede csc.exe di .NET Framework.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLATORE = join(QUI, 'installa.cmd');
const TAR = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
const CSC = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  : null;
const SKIP = process.platform !== 'win32' || !CSC || !existsSync(CSC);
const COMMIT = 'oldnode0x1a2b';

function cmdAsync(file, args, opts, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const process = spawn(file, args, opts);
    let closed = false;
    let stdout = '';
    let stderr = '';
    process.stdout.on('data', (d) => { stdout += d; });
    process.stderr.on('data', (d) => { stderr += d; });
    process.on('exit', (code, signal) => {
      if (closed) return;
      closed = true;
      clearTimeout(guard);
      resolve({ status: code, signal, stdout, stderr });
    });
    const guard = setTimeout(() => {
      if (closed) return;
      try { process.kill(); } catch { /* pazienza */ }
      closed = true;
      resolve({ status: null, signal: 'WATCHDOG', stdout, stderr });
    }, timeoutMs);
  });
}

test('installatore: Node del PC < 18 → scarica e usa il portatile', { skip: SKIP }, async (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'installer-oldnode-'));
  const destinazione = mkdtempSync(join(tmpdir(), 'installer-oldnode-target-'));
  const regkey = `HKCU\\Software\\EVO-Pitwall-OldNode-${process.pid}-${Date.now()}`;
  t.after(() => {
    spawnSync('reg', ['delete', regkey, '/f']);
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

  // --- zip del codice minimo che l'installatore deve copiare ---
  const codeStage = join(blob, 'code-stage');
  const codeRoot = `turbignox-hash-ac-evo-career-${COMMIT}`;
  mkdirSync(join(codeStage, codeRoot, 'tools'), { recursive: true });
  writeFileSync(join(codeStage, codeRoot, 'package.json'), JSON.stringify({ name: 'ac-evo-career', version: '0.0.0-oldnode' }), 'utf8');
  writeFileSync(join(codeStage, codeRoot, 'ac-evo-career.mjs'), 'console.log("old node sandbox")\n', 'utf8');
  writeFileSync(join(codeStage, codeRoot, 'avvia.cmd'), '@echo off\nrem stub\n', 'utf8');
  writeFileSync(join(codeStage, codeRoot, 'disinstalla.cmd'), '@echo off\nrem stub\n', 'utf8');
  copyFileSync(join(QUI, 'tools', 'crea-scorciatoia.mjs'), join(codeStage, codeRoot, 'tools', 'crea-scorciatoia.mjs'));
  const codeZip = join(blob, 'code.zip');
  const codeTar = spawnSync(TAR, ['-a', '-cf', codeZip, '-C', codeStage, codeRoot], { encoding: 'utf8' });
  assert.equal(codeTar.status, 0, 'zip codice: ' + (codeTar.stderr ?? ''));

  // --- zip Node con uno stub che accetta il controllo -e ---
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

  // --- server locale: codice + Node; nessuna rete esterna ---
  let nodeHits = 0;
  const server = createServer((req, res) => {
    if (req.url?.endsWith('/node.zip')) {
      nodeHits++;
      res.writeHead(200, { 'Content-Type': 'application/zip' });
      res.end(readFileSync(nodeZip));
      return;
    }
    if (req.url?.endsWith('/zipball/main')) {
      res.writeHead(200, { 'Content-Type': 'application/zip' });
      res.end(readFileSync(codeZip));
      return;
    }
    res.writeHead(404);
    res.end('nope');
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  server.keepAliveTimeout = 0;
  t.after(() => {
    try { server.closeAllConnections?.(); } catch { /* pazienza */ }
    return new Promise((done) => server.close(done));
  });
  const port = server.address().port;

  const r = await cmdAsync('cmd.exe', ['/d', '/c', INSTALLATORE], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TMP: blob,
      TEMP: blob,
      PATH: `${oldDir};${process.env.PATH ?? ''}`,
      EVO_INSTALLER_DIR: destinazione,
      EVO_INSTALLER_API: `http://127.0.0.1:${port}/repos/turbignox-hash/ac-evo-career`,
      EVO_INSTALLER_NODEURL: `http://127.0.0.1:${port}/node.zip`,
      EVO_INSTALLER_NODESHA: nodeSha,
      EVO_INSTALLER_AUTO: '1',
      EVO_INSTALLER_FAST: '1',
      EVO_INSTALLER_NOSCORCIATOIA: '1',
      EVO_INSTALLER_NOAVVIO: '1',
      EVO_INSTALLER_REGKEY: regkey,
    },
  }, 120_000);

  assert.equal(r.signal, null, `watchdog: impalato\n${r.stdout}\n${r.stderr}`);
  assert.equal(r.status, 0, `uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stdout.includes("Il Node del PC e' piu' vecchio di 18"), `ramo Node vecchio non dichiarato:\n${r.stdout}`);
  assert.ok(r.stdout.includes('Node pronto portatile'), `portatile non dichiarato:\n${r.stdout}`);
  assert.ok(existsSync(join(destinazione, '_node', 'node.exe')), 'node.exe portatile non è nella destinazione');
  assert.equal(nodeHits, 1, `zip Node richiesto ${nodeHits} volte: attesa 1`);
  assert.ok(existsSync(join(destinazione, 'ac-evo-career.mjs')), 'codice non copiato');
  const reg = spawnSync('reg', ['query', regkey, '/v', 'InstallLocation'], { encoding: 'utf8' });
  assert.equal(reg.status, 0, `registrazione assente: ${reg.stderr ?? ''}`);
  assert.ok(reg.stdout.includes(destinazione), 'InstallLocation errato:\n' + reg.stdout);
});
