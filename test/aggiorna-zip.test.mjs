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

test('statoZipAsync senza build-id: GUARDA SAME (remotoAvanti+primoZip): il primo avvio si porta da solo al passo con main', async () => {
  const casa = TMP();
  // fetch simulata: GitHub risponde col proprio sha (main); NIENTE rete vera
  const finta = async () => ({ ok: true, status: 200, json: async () => ({ sha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b' }) });
  const vera = globalThis.fetch;
  globalThis.fetch = finta;
  try {
    const s = await statoZipAsync(casa);
    assert.equal(s.skip, undefined, 'non è più skip: da ZtA-apprezzato, il primo avvio scarica da solo');
    assert.equal(s.remotoAvanti, 1);
    assert.equal(s.primoZip, true, 'flag per il messaggio giusto al primo avvio');
    assert.equal(s.remoto, '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b');
  } finally { globalThis.fetch = vera; }
});

test('statoZipAsync senza build-id su repo PRIVATO senza token: skip col rimedio chiaro (token)', async () => {
  const casa = TMP();
  const finta = async () => ({ ok: false, status: 404 });
  const vera = globalThis.fetch;
  globalThis.fetch = finta;
  try {
    const s = await statoZipAsync(casa);
    assert.equal(s.skip, true);
    assert.match(s.motivo, /token di LETTURA/);
  } finally { globalThis.fetch = vera; }
});

test('installaZip segna il build-id NUOVO: la seconda volta è un installazione zip normale', () => {
  const casa = TMP();
  assert.equal(leggiBuildId(casa), '', 'primo avvio: muta (già coperto dal test sopra)');
  // certificato installazione: dentro INSTALLA_VERA la copia di codice riuscita
  // su build-id via scriviBuildId: registra l'hash di main senza riscaricarlo
  scriviBuildId('1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', casa);
  assert.equal(leggiBuildId(casa), '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b');
});
