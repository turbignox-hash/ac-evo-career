// test/verifica-release.test.mjs — le parti pure del controllo post-release:
// il piano degli asset e il parser dei sidecar, senza rete.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pianoAtteso, leggiSidecar } from '../tools/verifica-release.mjs';

test('piano release: EXE, bundle e pacchetto amico con i nomi della versione', () => {
  const piano = pianoAtteso('0.1.57');
  assert.equal(piano.length, 4);
  assert.deepEqual(piano.map((v) => v.nome ?? v.prefisso), [
    'EVO-Pitwall-Setup.exe',
    'EVO-Pitwall-Setup-Offline.exe',
    'EVO-Pitwall-v0.1.57-Windows.zip',
    'ac-evo-career-amico-v0.1.57-',
  ]);
  assert.equal(piano[2].sidecar, 'EVO-Pitwall-v0.1.57-Windows.zip.sha256');
  assert.equal(piano[3].suffisso, '.zip');
});

test('sidecar: accetta SHA-256 e nome giusti, rifiuta nome o formato sbagliati', () => {
  const hash = 'a'.repeat(64);
  assert.equal(leggiSidecar(`${hash}  EVO-Pitwall-Setup.exe\n`, 'EVO-Pitwall-Setup.exe'), hash);
  assert.throws(() => leggiSidecar(`${hash}  altro.exe\n`, 'EVO-Pitwall-Setup.exe'), /sidecar/);
  assert.throws(() => leggiSidecar('non-un-sidecar', 'EVO-Pitwall-Setup.exe'), /sidecar/);
});
