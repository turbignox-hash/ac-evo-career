// preflight-firma-release.test.mjs — l'AGGANCIO COMPLETO del preflight firma.
//
// Non basta provare il verificatore: qui gira il VERO tools/crea-release.mjs
// (copiato in una sandbox) con il suo preflight UIAPP/Layout finto, un EXE
// finto e un signtool.exe stub. Nessun certificato, nessun GitHub, nessuna
// app installata toccata.
//
// Casi:
//   0) tag ≠ package.json → la release non parte prima ancora del preflight;
//   1) firma configurata + stub verde → la release passa e chiama verify /pa /q;
//   2) stub rosso → crea-release esce non-zero e dice che la release NON parte;
//   3) nessuna variabile EVO_SIGN_* → skip esplicito, stub mai chiamato.
//
// Windows only; richiede csc.exe di .NET Framework, come installer-firma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSC = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  : null;
const SKIP = process.platform !== 'win32' || !CSC || !existsSync(CSC);
const THUMB = 'c'.repeat(40);

function compilaStub(blob) {
  const src = join(blob, 'stub.cs');
  const stub = join(blob, 'signtool.exe');
  writeFileSync(src, [
    'using System;',
    'using System.IO;',
    'class P {',
    '  static int Main(string[] args) {',
    '    string log = Environment.GetEnvironmentVariable("STUB_LOG");',
    '    if (!String.IsNullOrEmpty(log)) File.AppendAllText(log, String.Join(" ", args) + Environment.NewLine);',
    '    if (args.Length > 0 && args[0] == "verify") {',
    '      string code = Environment.GetEnvironmentVariable("STUB_VERIFY_EXIT");',
    '      int n;',
    '      if (!String.IsNullOrEmpty(code) && Int32.TryParse(code, out n)) return n;',
    '    }',
    '    return 0;',
    '  }',
    '}',
    '',
  ].join('\n'), 'utf8');
  const cc = spawnSync(CSC, ['/nologo', '/target:exe', `/out:${stub}`, src], { encoding: 'utf8', windowsHide: true });
  assert.equal(cc.status, 0, 'compilazione stub signtool: ' + (cc.stdout ?? '') + (cc.stderr ?? ''));
  return stub;
}

test('preflight release: firma stub verde, rossa e assente', { skip: SKIP }, (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'preflight-firma-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));

  const stub = compilaStub(blob);
  const log = join(blob, 'signtool.log');
  const radice = join(blob, 'repo');
  mkdirSync(join(radice, 'tools'), { recursive: true });
  mkdirSync(join(radice, 'test'), { recursive: true });
  mkdirSync(join(radice, 'dist'), { recursive: true });

  // Il VERO crea-release e il VERO builder: la sandbox cambia solo le cose
  // che il preflight comanda (UIAPP/layout) e gli EXE.
  copyFileSync(join(QUI, 'tools', 'crea-release.mjs'), join(radice, 'tools', 'crea-release.mjs'));
  copyFileSync(join(QUI, 'tools', 'build-installer-exe.mjs'), join(radice, 'tools', 'build-installer-exe.mjs'));
  copyFileSync(join(QUI, 'tools', 'release-assets.mjs'), join(radice, 'tools', 'release-assets.mjs'));
  writeFileSync(join(radice, 'package.json'), JSON.stringify({ name: 'sandbox', version: '0.0.0' }), 'utf8');
  writeFileSync(join(radice, 'tools', 'genera-uiapp.mjs'), 'process.exit(0);\n', 'utf8');
  for (const file of ['uiapp-installata.test.mjs', 'skip-guardia-layout.test.mjs', 'layout-impostazioni.test.mjs']) {
    writeFileSync(join(radice, 'test', file), 'import { test } from "node:test";\ntest("ok", () => {});\n', 'utf8');
  }

  const scriviExe = (file) => {
    writeFileSync(file, Buffer.from(`finto EXE firmato ${basename(file)}\n`));
    const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
    writeFileSync(`${file}.sha256`, `${sha}  ${basename(file)}\n`, 'utf8');
    writeFileSync(`${file}.build.json`, JSON.stringify({
      schema: 1,
      version: '0.0.0',
      build: 'sandbox',
      variante: 'online',
      firmato: true,
      sha256: sha,
    }), 'utf8');
  };
  const exe = join(radice, 'dist', 'EVO-Pitwall-Setup.exe');
  scriviExe(exe);
  const extraUno = join(radice, 'extra-uno.exe');
  const extraDue = join(radice, 'extra-due.exe');
  scriviExe(extraUno);
  scriviExe(extraDue);

  // Le variabili di firma del chiamante non entrano nella sandbox.
  const base = { ...process.env };
  for (const k of ['EVO_SIGN_PFX', 'EVO_SIGN_PASSWORD', 'EVO_SIGN_THUMBPRINT', 'STUB_VERIFY_EXIT']) delete base[k];
  base.EVO_SIGNTOOL = stub;
  base.STUB_LOG = log;

  const giro = (extra = {}, argsExtra = [], tag = 'v0.0.0') => spawnSync(process.execPath, [
    join(radice, 'tools', 'crea-release.mjs'),
    tag, 'smoke', 'body', '--solo-preflight', ...argsExtra,
  ], {
    cwd: radice,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...base, ...extra },
  });

  // 0) tag e package non allineati: niente preflight, niente release
  writeFileSync(log, '');
  let r = giro({}, [], 'v0.0.1');
  assert.notEqual(r.status, 0, 'un tag diverso dal package deve fermare la release');
  assert.match(r.stdout + r.stderr, /tag v0\.0\.1 .*package\.json 0\.0\.0/);
  assert.equal(readFileSync(log, 'utf8').trim(), '', 'senza allineamento non deve chiamare signtool');

  // 1) firma configurata e valida: il preflight passa e verifica davvero
  writeFileSync(log, '');
  r = giro({ EVO_SIGN_THUMBPRINT: THUMB });
  assert.equal(r.status, 0, `preflight valido fallito:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /Firma: verificata/);
  assert.match(r.stdout, /preflight superato/);
  assert.match(readFileSync(log, 'utf8'), /^verify \/pa \/q .+EVO-Pitwall-Setup\.exe$/m);
  assert.match(r.stdout, /EXE in release: EVO-Pitwall-Setup\.exe, EVO-Pitwall-Setup\.exe\.sha256/);
  assert.match(r.stdout, /Asset release \(2\): EVO-Pitwall-Setup\.exe, EVO-Pitwall-Setup\.exe\.sha256/);

  // 1b) --asset ripetuto: il flag separa i file, non entra nel piano
  writeFileSync(log, '');
  r = giro({ EVO_SIGN_THUMBPRINT: THUMB }, ['--asset', extraUno, '--asset', extraDue]);
  assert.equal(r.status, 0, `preflight con due --asset fallito:\n${r.stdout}\n${r.stderr}`);
  const righeAsset = readFileSync(log, 'utf8').trim().split(/\r?\n/);
  assert.equal(righeAsset.length, 3, `attese 3 verifiche (dist + due asset):\n${righeAsset.join('\n')}`);
  assert.match(r.stdout, /EXE in release: .*extra-uno\.exe.*extra-due\.exe/);
  assert.match(r.stdout, /Asset release \(6\): .*extra-uno\.exe/);
  assert.doesNotMatch(r.stdout, /Asset release .*--asset/);

  // 2) firma configurata ma catena rotta: la release NON deve partire
  writeFileSync(log, '');
  r = giro({ EVO_SIGN_THUMBPRINT: THUMB, STUB_VERIFY_EXIT: '1' });
  assert.notEqual(r.status, 0, 'con verify rosso crea-release deve fermarsi');
  assert.match(r.stdout + r.stderr, /verifica Authenticode fallita/);
  assert.match(r.stdout + r.stderr, /release NON parte/);

  // 3) nessuna variabile di firma: skip esplicito, signtool mai chiamato
  writeFileSync(log, '');
  r = giro();
  assert.equal(r.status, 0, `senza firma il preflight deve passare:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /non configurata/);
  assert.equal(readFileSync(log, 'utf8').trim(), '', 'senza certificato non deve chiamare signtool');
});
