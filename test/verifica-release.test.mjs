// test/verifica-release.test.mjs — le parti pure del controllo post-release:
// il piano degli asset e il parser dei sidecar, senza rete.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pianoAtteso, leggiSidecar } from '../tools/verifica-release.mjs';

test('piano release: due EXE e pacchetto amico (dal 0.1.59 niente bundle unico)', () => {
  const piano = pianoAtteso('0.1.59');
  assert.equal(piano.length, 3);
  assert.deepEqual(piano.map((v) => v.nome ?? v.prefisso), [
    'EVO-Pitwall-Setup.exe',
    'EVO-Pitwall-Setup-Offline.exe',
    'ac-evo-career-amico-v0.1.59-',
  ]);
  assert.equal(piano[2].suffisso, '.zip');
  assert.ok(!piano.some((v) => String(v.nome ?? '').includes('Windows.zip')));
});

test('sidecar: accetta SHA-256 e nome giusti, rifiuta nome o formato sbagliati', () => {
  const hash = 'a'.repeat(64);
  assert.equal(leggiSidecar(`${hash}  EVO-Pitwall-Setup.exe\n`, 'EVO-Pitwall-Setup.exe'), hash);
  assert.throws(() => leggiSidecar(`${hash}  altro.exe\n`, 'EVO-Pitwall-Setup.exe'), /sidecar/);
  assert.throws(() => leggiSidecar('non-un-sidecar', 'EVO-Pitwall-Setup.exe'), /sidecar/);
});
