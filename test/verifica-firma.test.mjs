// verifica-firma.test.mjs — la verifica che il preflight di release usa.
//
// Non serve un certificato vero: un finto signtool.exe (compilato con csc)
// registra la chiamata `verify /pa /q` e risponde 0, oppure il codice scelto
// da STUB_VERIFY_EXIT. I file EXE sono finti: qui si blinda il CABLAGGIO
// (catena, sidecar .sha256, uscita non-zero), non la firma reale.
//
// Windows only; richiede csc.exe di .NET Framework, come installer-firma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER = join(QUI, 'tools', 'build-installer-exe.mjs');
const CSC = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  : null;
const SKIP = process.platform !== 'win32' || !CSC || !existsSync(CSC);
const PKG = JSON.parse(readFileSync(join(QUI, 'package.json'), 'utf8')).version;
const THUMB = 'b'.repeat(40);

test('verifica-firma: catena, sidecar e uscite del preflight', { skip: SKIP }, (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'firma-preflight-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));

  const stub = join(blob, 'signtool.exe');
  const log = join(blob, 'signtool.log');
  const src = join(blob, 'stub.cs');
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

  const exe = join(blob, 'EVO-Pitwall-Setup.exe');
  const sidecar = `${exe}.sha256`;
  writeFileSync(exe, Buffer.from('finto EXE firmato\n'));
  const sha = createHash('sha256').update(readFileSync(exe)).digest('hex');
  writeFileSync(sidecar, `${sha}  EVO-Pitwall-Setup.exe\n`, 'utf8');
  const buildFile = `${exe}.build.json`;
  const scriviBuild = (versione = PKG) => writeFileSync(buildFile, JSON.stringify({
    schema: 1, version: versione, build: 'test', variante: 'online', firmato: true, sha256: sha,
  }), 'utf8');
  scriviBuild();

  // Le variabili di firma del chiamante non devono entrare nel banco: qui
  // l'unico certificato è il thumbprint finto, e lo stub è l'unico signtool.
  const base = { ...process.env };
  delete base.EVO_SIGN_PFX;
  delete base.EVO_SIGN_PASSWORD;
  delete base.EVO_SIGN_THUMBPRINT;
  const env = {
    ...base,
    EVO_SIGNTOOL: stub,
    EVO_SIGN_THUMBPRINT: THUMB,
    STUB_LOG: log,
  };
  const giro = (extra = {}) => spawnSync(process.execPath, [BUILDER, '--verifica-firma', exe], {
    cwd: QUI,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...env, ...extra },
  });

  // 1) firma valida + hash coerente: passa e chiama signtool con /pa /q
  let r = giro();
  assert.equal(r.status, 0, `verifica valida fallita:\n${r.stdout}\n${r.stderr}`);
  const righe = readFileSync(log, 'utf8').trim().split(/\r?\n/);
  assert.equal(righe.length, 1, `attesa una sola invocazione di signtool:\n${righe.join('\n')}`);
  assert.match(righe[0], /^verify \/pa \/q .+EVO-Pitwall-Setup\.exe$/);
  assert.match(r.stdout, /Firma: verificata/);

  // 2) catena rotta: signtool esce 1 → il preflight NON deve passare
  writeFileSync(log, '');
  r = giro({ STUB_VERIFY_EXIT: '1' });
  assert.notEqual(r.status, 0, 'una catena rotta deve fermare la release');
  assert.match(r.stdout + r.stderr, /verifica Authenticode fallita/);

  // 3) .sha256 sbagliato: il file non è quello firmato → NON deve passare
  writeFileSync(sidecar, `${'0'.repeat(64)}  EVO-Pitwall-Setup.exe\n`, 'utf8');
  r = giro();
  assert.notEqual(r.status, 0, 'un hash che non copre il file deve fermare la release');
  assert.match(r.stdout + r.stderr, /SHA-256 non corrisponde/);

  // 3b) EXE di una build vecchia: firma e hash tornano, ma la versione no
  writeFileSync(sidecar, `${sha}  EVO-Pitwall-Setup.exe\n`, 'utf8');
  scriviBuild('9.9.9');
  r = giro();
  assert.notEqual(r.status, 0, 'un EXE di un\'altra versione deve fermare la release');
  assert.match(r.stdout + r.stderr, /versione 9\.9\.9/);

  // 3c) metadati assenti: la versione non è verificabile → NON deve passare
  rmSync(buildFile, { force: true });
  r = giro();
  assert.notEqual(r.status, 0, 'senza .build.json la release non deve partire');
  assert.match(r.stdout + r.stderr, /manca .+\.build\.json/);
  scriviBuild();

  // 4) senza certificato configurato: salta pulito e non chiama signtool
  writeFileSync(sidecar, `${sha}  EVO-Pitwall-Setup.exe\n`, 'utf8');
  writeFileSync(log, '');
  const senzaFirma = { ...env };
  delete senzaFirma.EVO_SIGN_PFX;
  delete senzaFirma.EVO_SIGN_PASSWORD;
  delete senzaFirma.EVO_SIGN_THUMBPRINT;
  r = spawnSync(process.execPath, [BUILDER, '--verifica-firma', exe], {
    cwd: QUI,
    encoding: 'utf8',
    timeout: 30_000,
    env: senzaFirma,
  });
  assert.equal(r.status, 0, `senza firma la verifica deve essere uno skip, non un errore:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /non configurata/);
  assert.equal(readFileSync(log, 'utf8').trim(), '', 'senza certificato non deve chiamare signtool');

  // 5) file passato ma assente: errore chiaro
  r = spawnSync(process.execPath, [BUILDER, '--verifica-firma', join(blob, 'manca.exe')], {
    cwd: QUI,
    encoding: 'utf8',
    timeout: 30_000,
    env,
  });
  assert.notEqual(r.status, 0, 'un file mancante deve fermare la release');
  assert.match(r.stdout + r.stderr, /file non trovato/);
});
