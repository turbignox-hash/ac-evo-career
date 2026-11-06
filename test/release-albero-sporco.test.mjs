// release-albero-sporco.test.mjs — il fail-fast di crea-release.
//
// Il VERO tools/crea-release.mjs gira in una sandbox git con package e tool
// copiati. Con --con-pacchetto e un file tracciato modificato deve fermarsi
// PRIMA del preflight: niente genera-uiapp, niente guardia layout, niente
// GitHub. Il cancello dentro pacchetto-amico resta la seconda rete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

test('crea-release: albero sporco → stop prima del preflight', { skip: !GIT }, (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'release-sporca-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));

  mkdirSync(join(blob, 'tools'), { recursive: true });
  copyFileSync(join(QUI, 'tools', 'crea-release.mjs'), join(blob, 'tools', 'crea-release.mjs'));
  mkdirSync(join(blob, 'src'), { recursive: true });   // release-assets.mjs vive qui (6/11)
  copyFileSync(join(QUI, 'src', 'release-assets.mjs'), join(blob, 'src', 'release-assets.mjs'));
  writeFileSync(join(blob, 'package.json'), JSON.stringify({ name: 'sandbox', version: '0.0.0' }), 'utf8');
  writeFileSync(join(blob, 'README.md'), '# sandbox\n', 'utf8');

  const git = (...args) => spawnSync('git', args, { cwd: blob, encoding: 'utf8' });
  const init = git('init', '-q');
  assert.equal(init.status, 0, 'git init: ' + (init.stderr ?? ''));
  assert.equal(git('config', 'user.email', 'test@example.invalid').status, 0);
  assert.equal(git('config', 'user.name', 'test').status, 0);
  assert.equal(git('add', '.').status, 0);
  assert.equal(git('commit', '-qm', 'base').status, 0);

  // Tracciato e diverso da HEAD: la zip uscirebbe vecchia. Il fail-fast deve
  // scattare subito, senza cercare tools/genera-uiapp.mjs (che qui non c'è).
  writeFileSync(join(blob, 'README.md'), '# sporco\n', 'utf8');

  const r = spawnSync(process.execPath, [
    join(blob, 'tools', 'crea-release.mjs'),
    'v0.0.0', 'titolo', 'corpo.md', '--con-pacchetto',
  ], { cwd: blob, encoding: 'utf8', timeout: 30_000 });

  assert.notEqual(r.status, 0, `con l'albero sporco la release deve fermarsi:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /albero non pulito/);
  assert.match(r.stdout + r.stderr, /Committa o rimuovi/);
  assert.doesNotMatch(r.stdout, /PREFLIGHT UIAPP/, 'il preflight non deve nemmeno partire');
  assert.ok(!existsSync(join(blob, 'pacchetti')), 'non deve nascere nessuno zip');
});
