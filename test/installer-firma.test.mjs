// installer-firma.test.mjs — la prova della firma Authenticode NEL BUILDER.
//
// Non serve un certificato vero: un finto signtool.exe (compilato con csc)
// registra gli argomenti e risponde 0 a sign e verify. Il test verifica che il
// builder lo chiami con SHA-256 + timestamp + thumbprint, e che produca EXE e
// .sha256 nella cartella indicata da EVO_BUILD_DIR (mai nei dist dell'utente).
//
// La firma vera (certificato e catena) non è verificabile qui: quella si prova
// una volta con il certificato reale. Questo test blinda il CABLAGGIO.
//
// Windows only; richiede csc.exe di .NET Framework, come gli altri test EXE.
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
const THUMB = 'a'.repeat(40);
const TIMESTAMP = 'http://timestamp.test.invalid';

test('builder: con EVO_SIGN_THUMBPRINT chiama signtool e calcola l\'hash dopo la firma', { skip: SKIP }, (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'firma-builder-'));
  const out = join(blob, 'out');
  const src = join(blob, 'stub.cs');
  const stub = join(blob, 'signtool.exe');
  const log = join(blob, 'signtool.log');
  t.after(() => rmSync(blob, { recursive: true, force: true }));

  // finto signtool: scrive una riga per ogni invocazione, esce sempre 0
  writeFileSync(src, [
    'using System;',
    'using System.IO;',
    'class P {',
    '  static int Main(string[] args) {',
    '    string log = Environment.GetEnvironmentVariable("STUB_LOG");',
    '    if (!String.IsNullOrEmpty(log)) File.AppendAllText(log, String.Join(" ", args) + Environment.NewLine);',
    '    return 0;',
    '  }',
    '}',
    '',
  ].join('\n'), 'utf8');
  const cc = spawnSync(CSC, ['/nologo', '/target:exe', `/out:${stub}`, src], { encoding: 'utf8', windowsHide: true });
  assert.equal(cc.status, 0, 'compilazione stub signtool: ' + (cc.stdout ?? '') + (cc.stderr ?? ''));

  const r = spawnSync(process.execPath, [BUILDER], {
    cwd: QUI,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      EVO_BUILD_DIR: out,
      EVO_SIGNTOOL: stub,
      EVO_SIGN_THUMBPRINT: THUMB,
      EVO_SIGN_TIMESTAMP: TIMESTAMP,
      STUB_LOG: log,
    },
  });

  assert.equal(r.status, 0, `builder fallito:\n${r.stdout}\n${r.stderr}`);
  const exe = join(out, 'EVO-Pitwall-Setup.exe');
  assert.ok(existsSync(exe), 'EXE non prodotto nella cartella di test');
  assert.ok(existsSync(`${exe}.sha256`), 'file .sha256 non prodotto');

  const righe = readFileSync(log, 'utf8').trim().split(/\r?\n/);
  assert.equal(righe.length, 2, `attese 2 invocazioni (sign + verify):\n${righe.join('\n')}`);
  assert.match(righe[0], new RegExp(`^sign /fd SHA256 /tr ${TIMESTAMP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} /td SHA256 /sha1 ${THUMB} .+EVO-Pitwall-Setup\\.exe$`));
  assert.match(righe[1], /^verify \/pa \/q .+EVO-Pitwall-Setup\.exe$/);
  assert.ok(!righe[0].includes('/p '), 'nessuna password deve finire sulla riga di comando senza PFX');

  const sha = createHash('sha256').update(readFileSync(exe)).digest('hex');
  assert.ok(readFileSync(`${exe}.sha256`, 'utf8').startsWith(sha), 'lo .sha256 deve coprire il file finale');

  const meta = JSON.parse(readFileSync(`${exe}.build.json`, 'utf8'));
  const versione = JSON.parse(readFileSync(join(QUI, 'package.json'), 'utf8')).version;
  assert.equal(meta.version, versione, 'il .build.json deve portare la versione del progetto');
  assert.equal(meta.sha256, sha, 'il .build.json deve coprire lo stesso file finale');
  assert.equal(meta.firmato, true, 'il .build.json deve dire che è firmato');
});
