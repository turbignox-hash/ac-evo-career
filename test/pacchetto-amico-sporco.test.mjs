// pacchetto-amico-sporco.test.mjs — il cancello dello zip da HEAD.
//
// Non serve un repo vero né si tocca il progetto: sandbox git temporanea con
// il VERO tools/pacchetto-amico.mjs copiato dentro. La zip nasce da
// `git archive HEAD`: un file tracciato modificato tornerebbe vecchio, un
// file nuovo non tracciato resterebbe fuori; in entrambi i casi il tool deve
// fermarsi PRIMA di creare pacchetti/. Un albero pulito, invece, deve
// continuare a produrre la zip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
const WINDOWS = process.platform === 'win32';

/** Sandbox minima: repo git con il tool vero e un file tracciato. */
function creaSandbox(t) {
  const blob = mkdtempSync(join(tmpdir(), 'pacchetto-sporco-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));

  mkdirSync(join(blob, 'tools'), { recursive: true });
  copyFileSync(join(QUI, 'tools', 'pacchetto-amico.mjs'), join(blob, 'tools', 'pacchetto-amico.mjs'));
  writeFileSync(join(blob, 'package.json'), JSON.stringify({ name: 'sandbox', version: '0.0.0' }), 'utf8');
  writeFileSync(join(blob, 'README.md'), '# sandbox\n', 'utf8');

  const git = (...args) => spawnSync('git', args, { cwd: blob, encoding: 'utf8' });
  const init = git('init', '-q');
  assert.equal(init.status, 0, 'git init: ' + (init.stderr ?? ''));
  assert.equal(git('config', 'user.email', 'test@example.invalid').status, 0);
  assert.equal(git('config', 'user.name', 'test').status, 0);
  assert.equal(git('add', '.').status, 0);
  assert.equal(git('commit', '-qm', 'base').status, 0);
  return blob;
}

function eseguiPacchetto(blob) {
  return spawnSync(process.execPath, [join(blob, 'tools', 'pacchetto-amico.mjs'), '--no-test'], {
    cwd: blob, encoding: 'utf8', timeout: 30_000,
  });
}

test('pacchetto-amico: file tracciato modificato → nessuno zip', { skip: !GIT }, (t) => {
  const blob = creaSandbox(t);

  // Il file è tracciato e ora è diverso da HEAD: git archive HEAD porterebbe
  // il contenuto vecchio. Il cancello deve fermarsi qui.
  writeFileSync(join(blob, 'README.md'), '# sporco\n', 'utf8');

  const r = eseguiPacchetto(blob);
  assert.notEqual(r.status, 0, `con un file tracciato sporco il pacchetto deve fermarsi:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /File non committati/);
  assert.match(r.stdout + r.stderr, /Committa o rimuovi/);
  assert.ok(!existsSync(join(blob, 'pacchetti')), 'non deve nascere nessuno zip da un albero sporco');
});

test('pacchetto-amico: file nuovo non tracciato → nessuno zip', { skip: !GIT }, (t) => {
  const blob = creaSandbox(t);

  // Non è in HEAD: git archive non lo porterebbe proprio. Il cancello deve
  // fermarsi anche qui, invece di confezionare una release incompleta.
  writeFileSync(join(blob, 'nuovo.txt'), 'appena scritto\n', 'utf8');

  const r = eseguiPacchetto(blob);
  assert.notEqual(r.status, 0, `con un file nuovo non tracciato il pacchetto deve fermarsi:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout + r.stderr, /File non committati/);
  assert.match(r.stdout + r.stderr, /Committa o rimuovi/);
  assert.ok(!existsSync(join(blob, 'pacchetti')), 'non deve nascere nessuno zip da un albero incompleto');
});

// Il percorso pulito usa bsdtar (System32) per leggere e reinballare lo zip:
// su Linux il test sporco basta, questo lo si prova dove gira la release.
test('pacchetto-amico: albero pulito → zip creata', { skip: !GIT || !WINDOWS }, (t) => {
  const blob = creaSandbox(t);

  const r = eseguiPacchetto(blob);
  assert.equal(r.status, 0, `un albero pulito deve ancora produrre la zip:\n${r.stdout}\n${r.stderr}`);
  const dir = join(blob, 'pacchetti');
  assert.ok(existsSync(dir), 'il percorso pulito deve creare pacchetti/');
  const zips = readdirSync(dir).filter((f) => f.endsWith('.zip'));
  assert.equal(zips.length, 1, `attesa una sola zip, trovate: ${zips.join(', ')}`);
  assert.match(zips[0], /^ac-evo-career-amico-v0\.0\.0-[0-9a-f]{7}\.zip$/);
});
