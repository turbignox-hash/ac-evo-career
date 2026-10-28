// percorsi-evo-root.test.mjs — AUTO-DETEZIONE del gioco su dischi diversi (27/10):
// PC vergine di Mauro: EVO installato NON su C: — il tool deve trovare
// AssettoCorsaEVO.exe nelle librerie Steam su altri dischi (D..H: + vdf) o
// tramite override ACE_ROOT, senza Deriera guardare la consegna.
// Niente rete, niente registro: tutto in cartelle temporanee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findGameExe, resolvePaths } from '../src/paths.mjs';

const C = mkdtempSync(join(tmpdir(), 'evo-root-test-'));
const fakeExe = (dir) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AssettoCorsaEVO.exe'), 'mocca');
  return dir;
};

test('ACE_ROOT diretto: la cartella del gioco sta alla radice (libreria a mano)', () => {
  const root = fakeExe(join(C, 'giochi', 'ACE'));
  assert.equal(findGameExe({ ACE_ROOT: root }), join(root, 'AssettoCorsaEVO.exe'));
});

test('ACE_ROOT annidato: <root>/Assetto Corsa EVO/AssettoCorsaEVO.exe (layout Steam)', () => {
  const root = join(C, 'libreria-extra');
  const inner = fakeExe(join(root, 'Assetto Corsa EVO'));
  assert.equal(findGameExe({ ACE_ROOT: root }), join(inner, 'AssettoCorsaEVO.exe'));
});

test('file sbagliato nel root: NON vale come gioco (solo il nome esatto conta)', () => {
  const root = join(C, 'maledetto');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'AssettoCorsaEVO_evro.exe'), 'x'); // nome sbagliato di proposito
  const r = findGameExe({ ACE_ROOT: root });
  assert.ok(r == null || !r.includes(root), 'dal root sbagliato non deve uscire nulla');
});

test('STEAM_ROOT: libreria non convenzionale (tipo Z:/giochi/steam) trova il gioco', () => {
  const lib = join(C, 'steam-non-standard');
  fakeExe(join(lib, 'steamapps', 'common', 'Assetto Corsa EVO'));
  const vera = process.env.STEAM_ROOT;
  const aceVera = process.env.ACE_ROOT;
  process.env.STEAM_ROOT = lib;
  delete process.env.ACE_ROOT;
  try {
    const r = findGameExe();
    assert.ok(r?.includes(lib), `attesa l'exe dentro ${lib}, ricevo ${r}`);
  } finally {
    if (vera) process.env.STEAM_ROOT = vera; else delete process.env.STEAM_ROOT;
    if (aceVera) process.env.ACE_ROOT = aceVera; else delete process.env.ACE_ROOT;
  }
});

test('resolvePaths con ACE_DATA su disco diverso: la cartella dati comanda e Results/Logs si leggono', () => {
  const ace = join(C, 'altro-disco', 'ACE');
  mkdirSync(join(ace, 'Results'), { recursive: true });
  mkdirSync(join(ace, 'Logs'), { recursive: true });
  const p = resolvePaths({ ACE_DATA: ace });
  assert.equal(p.primary, ace);
  assert.deepEqual(p.resultsDirs, [join(ace, 'Results')]);
  assert.deepEqual(p.logsDirs, [join(ace, 'Logs')]);
});
