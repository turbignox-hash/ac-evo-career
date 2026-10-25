// percorsi-saved-games.test.mjs — LA GUARDIA DEI PERCORSI DEL SAVE (26/10):
// su un PC con profilo o libreria su un disco diverso da C: la cartella
// «Saved Games» di Windows può essere ricollocata: il tool deve trovarla
// (registro: cartella nota GUID 4C5C32FF = Saved Games, o override
// ACE_SAVEDIR) e non restare muto con «gamemodesave non trovato».
// In test NON si pretende il registro del PC di chi gira i test: si prova
// che 1) la lista non è mai vuota e ogni voce ESISTE; 2) l'override
// ACE_SAVEDIR comanda; 3) i candidati di dataDirCandidates puntano a ACE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { savedGamesRoots, dataDirCandidates } from '../src/paths.mjs';
import { GAME_SAVEDIR } from '../tools/evo-grid.mjs';

test('savedGamesRoots: almeno una radice e ogni voce è una cartella vera', () => {
  const roots = savedGamesRoots();
  assert.ok(roots.length >= 1, 'nessuna radice di Saved Games trovata: il tool resta muto');
  for (const r of roots) assert.equal(statSync(r).isDirectory(), true, `radice inesistente: ${r}`);
});

test('savedGamesRoots: ACE_SAVEDIR comanda da solo', () => {
  const roots = savedGamesRoots({ ACE_SAVEDIR: 'C:/Programmi-inesistenti-tanto-non-guardo' });
  assert.deepEqual(roots, ['C:/Programmi-inesistenti-tanto-non-guardo'],
    "l'override esplicito deve avere la precedenza ASSOLUTA");
});

test('savedGamesRoots: il default %USERPROFILE% resta in fondo alla lista', () => {
  const roots = savedGamesRoots({});
  const ultima = roots[roots.length - 1];
  assert.ok(/Saved Games$/i.test(ultima.replace(/\\\\/g, '/')), `il default manca dalla coda: ${roots.join(' | ')}`);
});

test('dataDirCandidates: ogni Saved Games contribuisce la sua ACE', () => {
  const cands = dataDirCandidates();
  assert.ok(cands.length >= 1, 'nessun candidato dati: di stampi troppo severo nei richi');
  for (const c of cands) assert.ok(c.endsWith('ACE'), `candidato fuori dallo schema ${c}`);
});

test('GAME_SAVEDIR dei tool: dentro una radice TROVATA (ACE può ancora mancare sul PC vergine)', () => {
  // La guardia vera è sulla RADICE: il bug del 26/10 era il tool che resta
  // muto mentre Windows ha «Saved Games» ricollocata. Su un PC vergine
  // (prova dell'amico del 25/10: save spostato, radice c'è) ACE non esiste
  // ancora — i tool sanno crearvi GameModes e non devono restare muti.
  const roots = savedGamesRoots();
  assert.ok(roots.length >= 1, 'nessuna radice di Saved Games: il tool resta muto');
  const norm = (p) => p.replace(/\\/g, '/');
  assert.ok(roots.some((r) => norm(GAME_SAVEDIR) === norm(join(r, 'ACE'))),
    `GAME_SAVEDIR (${GAME_SAVEDIR}) non viene da nessuna radice trovata (${roots.join(' | ')}): è il bug del 26/10`);
  assert.ok(/ACE$/.test(norm(GAME_SAVEDIR)), `GAME_SAVEDIR fuori dallo schema ACE: ${GAME_SAVEDIR}`);
  const st = statSync(GAME_SAVEDIR, { throwIfNoEntry: false });
  if (st) assert.equal(st.isDirectory(), true, `${GAME_SAVEDIR} esiste ma non è una cartella`);
});
