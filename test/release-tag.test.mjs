// release-tag.test.mjs — il cancello del tag.
//
// La release vera non deve mai far creare a GitHub un tag sul commit
// sbagliato: il tag deve esistere in locale e puntare a HEAD. Il test gira
// il VERO crea-release in una sandbox, senza preflight né GitHub.
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
  const blob = mkdtempSync(join(tmpdir(), 'release-tag-'));
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

  // Remoto bare locale: il controllo `git ls-remote offsite` deve poter
  // leggere un tag vero, senza rete né credenziali.
  const remoto = mkdtempSync(join(tmpdir(), 'release-remoto-'));
  t.after(() => rmSync(remoto, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '--bare', '-q', remoto], { encoding: 'utf8' }).status, 0);
  assert.equal(git('remote', 'add', 'offsite', remoto).status, 0);
  assert.equal(git('push', '-q', '-u', 'offsite', 'HEAD:main').status, 0);
  return { blob, git };
}

function esegui(blob) {
  return spawnSync(process.execPath, [
    join(blob, 'tools', 'crea-release.mjs'),
    'v0.0.0', 'titolo', 'corpo inline valido', '--con-pacchetto',
  ], { cwd: blob, encoding: 'utf8', timeout: 30_000 });
}

test('crea-release: tag mancante → stop; tag su HEAD → arriva al preflight', { skip: !GIT }, (t) => {
  const { blob, git } = creaSandbox(t);

  // Senza tag la release non deve partire: GitHub potrebbe crearlo sul
  // commit sbagliato. Il corpo inline è valido, quindi l'errore è del tag.
  const senzaTag = esegui(blob);
  assert.notEqual(senzaTag.status, 0, `senza tag la release deve fermarsi:\n${senzaTag.stdout}\n${senzaTag.stderr}`);
  assert.match(senzaTag.stdout + senzaTag.stderr, /tag v0\.0\.0 non esiste/);
  assert.doesNotMatch(senzaTag.stdout, /PREFLIGHT UIAPP/, 'il preflight non deve partire senza tag');

  // Tag locale ma non pushato: non basta, il remoto non lo vede.
  assert.equal(git('tag', 'v0.0.0').status, 0);
  const senzaRemoto = esegui(blob);
  assert.notEqual(senzaRemoto.status, 0, 'un tag solo locale non deve far partire la release');
  assert.match(senzaRemoto.stdout + senzaRemoto.stderr, /tag v0\.0\.0 non è su offsite/);
  assert.doesNotMatch(senzaRemoto.stdout, /PREFLIGHT UIAPP/, 'il preflight non deve partire senza tag remoto');

  // Con il tag pushato sul remoto il cancello passa; la sandbox non ha
  // genera-uiapp, quindi il preflight si ferma subito dopo, come prova che
  // il tag non blocca più.
  assert.equal(git('push', '-q', 'offsite', 'v0.0.0').status, 0);
  const conTag = esegui(blob);
  assert.notEqual(conTag.status, 0, 'la sandbox non ha genera-uiapp: il preflight deve fermarsi');
  assert.match(conTag.stdout, /PREFLIGHT UIAPP/);
  assert.doesNotMatch(conTag.stdout + conTag.stderr, /tag v0\.0\.0 non punta a HEAD/);
  assert.doesNotMatch(conTag.stdout + conTag.stderr, /tag v0\.0\.0 non è su offsite/);
  assert.ok(!existsSync(join(blob, 'pacchetti')), 'non deve nascere nessuno zip');
});
