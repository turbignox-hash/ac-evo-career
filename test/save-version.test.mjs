// La migrazione del salvataggio: una versione passata si carica (mai più
// "Ricomincia con new"), una versione più NUOVA dell'app si rifiuta senza
// toccare il file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-save-'));
const { loadState, SAVE_VERSION } = await import('../src/state.mjs');

const career = (version) => JSON.stringify({
  version,
  driver: { name: 'Mauro Rossi', first: 'Mauro', last: 'Rossi', nation: 'ITA' },
  money: 1000,
  messages: [],
});

test('salvataggio della versione corrente: carica com\'è', () => {
  const f = join(process.env.EVO_DATA_DIR, 'save-current.json');
  writeFileSync(f, career(SAVE_VERSION));
  const s = loadState(f);
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.messages.length, 0);
});

test('versione passata: migrata con messaggio in cruscotto, nessun dato perso', () => {
  const f = join(process.env.EVO_DATA_DIR, 'save-old.json');
  writeFileSync(f, career(0));
  const s = loadState(f);
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.messages.length, 1);
  assert.ok(s.messages[0].text.includes('aggiornato'));
});

test('versione più NUOVA dell\'app: rifiutata senza toccare il file', () => {
  const f = join(process.env.EVO_DATA_DIR, 'save-future.json');
  writeFileSync(f, career(SAVE_VERSION + 1));
  assert.throws(() => loadState(f), /più nuovo/);
});

test('file mancante: errore chiaro col comando per cominciare', () => {
  assert.throws(() => loadState(join(process.env.EVO_DATA_DIR, 'inesistente.json')), /Nessuna carriera/);
});
