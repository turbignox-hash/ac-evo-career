// release-corpo.test.mjs — il fail-fast del corpo release.
//
// Il VERO crea-release.mjs gira in una sandbox git pulita. Con un corpo
// mancante o vuoto deve fermarsi PRIMA del preflight, senza cercare
// tools/genera-uiapp.mjs e senza creare zip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

function creaSandbox(t) {
  const blob = mkdtempSync(join(tmpdir(), 'release-corpo-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));

  mkdirSync(join(blob, 'tools'), { recursive: true });
  copyFileSync(join(QUI, 'tools', 'crea-release.mjs'), join(blob, 'tools', 'crea-release.mjs'));
  copyFileSync(join(QUI, 'tools', 'release-assets.mjs'), join(blob, 'tools', 'release-assets.mjs'));
  writeFileSync(join(blob, 'package.json'), JSON.stringify({ name: 'sandbox', version: '0.0.0' }), 'utf8');
  writeFileSync(join(blob, 'README.md'), '# sandbox\n', 'utf8');

  const git = (...args) => spawnSync('git', args, { cwd: blob, encoding: 'utf8' });
  const init = git('init', '-q');
  assert.equal(init.status, 0, 'git init: ' + (init.stderr ?? ''));
  assert.equal(git('config', 'user.email', 'test@example.invalid').status, 0);
  assert.equal(git('config', 'user.name', 'test').status, 0);
  assert.equal(git('add', '.').status, 0);
  assert.equal(git('commit', '-qm', 'base').status, 0);
  return { blob, git };
}

function esegui(blob, corpo) {
  return spawnSync(process.execPath, [
    join(blob, 'tools', 'crea-release.mjs'),
    'v0.0.0', 'titolo', corpo, '--con-pacchetto',
  ], { cwd: blob, encoding: 'utf8', timeout: 30_000 });
}

test('crea-release: corpo file mancante → stop prima del preflight', { skip: !GIT }, (t) => {
  const { blob } = creaSandbox(t);
  const r = esegui(blob, 'manca.md');

  assert.notEqual(r.status, 0, `con il corpo mancante la release deve fermarsi:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /corpo della release non leggibile/);
  assert.match(r.stdout + r.stderr, /manca\.md/);
  assert.doesNotMatch(r.stdout, /PREFLIGHT UIAPP/, 'il preflight non deve nemmeno partire');
  assert.ok(!existsSync(join(blob, 'pacchetti')), 'non deve nascere nessuno zip');
});

test('crea-release: corpo file vuoto → stop prima del preflight', { skip: !GIT }, (t) => {
  const { blob, git } = creaSandbox(t);
  writeFileSync(join(blob, 'vuoto.md'), '', 'utf8');
  assert.equal(git('add', 'vuoto.md').status, 0);
  assert.equal(git('commit', '-qm', 'corpo vuoto').status, 0);

  const r = esegui(blob, 'vuoto.md');
  assert.notEqual(r.status, 0, `con il corpo vuoto la release deve fermarsi:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /corpo della release vuoto/);
  assert.doesNotMatch(r.stdout, /PREFLIGHT UIAPP/, 'il preflight non deve nemmeno partire');
  assert.ok(!existsSync(join(blob, 'pacchetti')), 'non deve nascere nessuno zip');
});

test('crea-release: corpo inline di soli spazi → stop prima del preflight', { skip: !GIT }, (t) => {
  const { blob } = creaSandbox(t);
  const r = esegui(blob, '   ');

  assert.notEqual(r.status, 0, `con il corpo vuoto la release deve fermarsi:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /corpo della release vuoto/);
  assert.doesNotMatch(r.stdout, /PREFLIGHT UIAPP/, 'il preflight non deve nemmeno partire');
  assert.ok(!existsSync(join(blob, 'pacchetti')), 'non deve nascere nessuno zip');
});
