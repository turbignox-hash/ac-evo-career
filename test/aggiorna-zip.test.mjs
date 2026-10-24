import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copiaAlbero, leggiBuildId, scriviBuildId, viaGit, statoZipAsync } from '../tools/aggiorna-zip.mjs';

const TMP = () => mkdtempSync(join(tmpdir(), 'evo-aggiornazip-test-'));

test('copiaAlbero: sovrascrive il codice MA lascia data/ e .git del PC intatti', () => {
  const casa = TMP(), dest = TMP();
  // "zipball" di GitHub: codice nuovo + tracked che potrebbe sparire sopra data/
  mkdirSync(join(casa, 'src'));
  writeFileSync(join(casa, 'src', 'nuovo.mjs'), 'export const v = 2;');
  mkdirSync(join(casa, 'data'));
  writeFileSync(join(casa, 'data', 'dovrebbe-restare-del-repo.txt'), 'op');
  // installazione-zip già sul PC: codice vecchio + data/ LOCALE prezioso + .git che
  // per via-zip non c'è (il test lo finge: l'esclusione è la stessa)
  mkdirSync(join(dest, 'src'));
  writeFileSync(join(dest, 'src', 'nuovo.mjs'), 'export const v = 1;');
  writeFileSync(join(dest, 'evo-career.save.json'), '{"v":1}');
  mkdirSync(join(dest, 'data'));
  writeFileSync(join(dest, 'data', 'evo-career.save.json'), 'IL SAVE VERO');
  mkdirSync(join(dest, '.git'));
  writeFileSync(join(dest, 'data', 'config.txt'), 'PERCORSI DEL PC');

  copiaAlbero(casa, dest);

  // il codice viene aggiornato
  assert.equal(readFileSync(join(dest, 'src', 'nuovo.mjs'), 'utf8'), 'export const v = 2;');
  // data/ e .git NON toccati (nemmeno i tracked che il repo riporta dentro data/)
  assert.equal(readFileSync(join(dest, 'data', 'evo-career.save.json'), 'utf8'), 'IL SAVE VERO');
  assert.equal(readFileSync(join(dest, 'data', 'config.txt'), 'utf8'), 'PERCORSI DEL PC');
  assert.equal(existsSync(join(dest, 'data', 'dovrebbe-restare-del-repo.txt')), false, 'niente repo dentro data/');
  assert.equal(existsSync(join(dest, '.git', 'HEAD')), false);
  // e il save del PC non sparisce dall'installazione
  assert.equal(existsSync(join(dest, 'evo-career.save.json')), true);
});

test('build-id: leggi e scrivi rispondono solo a hashe veri', () => {
  const casa = TMP();
  assert.equal(leggiBuildId(casa), '', 'senza file: stringa vuota (– l installazione muta)');
  scriviBuildId('abc123def456abc123def456abc12def456abc12', casa);
  assert.equal(leggiBuildId(casa), 'abc123def456abc123def456abc12def456abc12');
  writeFileSync(join(casa, 'build-id.txt'), 'corto\n', 'utf8');
  assert.equal(leggiBuildId(casa), '', 'un indicatore corto non è un commit');
});

test('viaGit distingue il clone dalla cartella zip', () => {
  const casa = TMP();
  assert.equal(viaGit(casa), false, 'una mocca no .git — la via zip');
  mkdirSync(join(casa, '.git'));
  assert.equal(viaGit(casa), true, 'clonata — la via git');
});

test('statoZipAsync senza build-id: skip con motivo chiaro, NIENTE rete', async () => {
  const casa = TMP();
  const s = await statoZipAsync(casa);
  assert.equal(s.skip, true);
  assert.match(s.motivo, /ri-scarica lo zip/);
});
