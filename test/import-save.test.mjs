// Regressione (2026-10-14): l'import da CLI crashava con ERR_INVALID_ARG_TYPE
// ("path" argomento stringa, ricevuto Object) perché il default di persist era
// saveState così com'è — che ha firma (file, state) — e veniva chiamato
// persist(state): lo state finiva al posto del percorso. Nei test precedenti il
// difetto non si vedeva perché veniva sempre iniettata una persist finta.
// Qui NON la iniettiamo: il default deve salvare da solo, senza crashare.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';

const DATA = mkdtempSync(join(tmpdir(), 'evo-import-save-'));
process.env.EVO_DATA_DIR = DATA;
const { runImport, SAVE_FILE } = await import('../src/import.mjs');
const { createCareer } = await import('../src/state.mjs');
const { readFileSync: rf } = await import('node:fs');

const ladder = JSON.parse(rf(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));

test("runImport senza persist esplicita salva davvero la carriera (regressione: state passato come percorso)", () => {
  assert.equal(existsSync(SAVE_FILE), false, 'setup: nessuna carriera iniziale');
  const state = createCareer(ladder, { name: 'Test Driver', nation: 'ITA', discipline: 'entry' });

  const out = runImport(ladder, null, state, {
    manual: { position: 1, gridSize: state.garage?.[0]?.car ? 12 : 12, dnf: false, fl: true },
  });

  assert.equal(out.ok, true);
  assert.equal(out.entry.position, 1);
  assert.equal(existsSync(SAVE_FILE), true, 'il default di persist deve scrivere il salvataggio');
  const saved = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
  assert.equal(saved.node, state.node);
  const imported = Object.values(saved.results ?? {}).flat();
  assert.equal(imported.length, 1, 'il risultato manuale deve finire nel salvataggio');
});

// OROLOGIO DI GIORNATA (1/11, lezione 31/10 23:57): l'avanzamento del tempo
// (+8 ore) deve comparire nel SALVATAGGIO scritto dall'import stesso — prima
// era DOPO il persist: l'ultimo +8 restava in memoria e col riavvio del
// server si perdeva (le tre gare di quella notte hanno fermato il tempo alle
// 16 invece di chiudere la giornata).
test("la gara importata fa avanzare l'orologio NEL FILE (lezione 31/10 23:57: prima del persist)", () => {
  const state = createCareer(ladder, { name: 'Clock Driver', nation: 'ITA', discipline: 'entry' });
  // mattina della giornata (null) + un SECONDO sedile ancora a programma oggi:
  // il giorno non salta e l'orologio resta sulla giornata in corso.
  state.agenda = { day: 1, ora: null };
  state.seats.hyper_road = { day: 1, season: 1 };

  const out = runImport(ladder, null, state, {
    manual: { position: 1, gridSize: 12, dnf: false, fl: false },
  });

  assert.equal(out.ok, true);
  assert.equal(out.agenda?.ora, 8, 'la voce «agenda» del debrief dice 8:00');
  const saved = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
  assert.equal(saved.agenda.ora, 8, 'l orologio a 8:00 sta nel SALVATAGGIO, non solo in memoria');
  assert.equal(saved.agenda.day, 1, 'col buco ancora a programma il giorno non salta');
});
