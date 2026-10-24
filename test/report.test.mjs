// test/report.test.mjs — il link "Segnala un problema" precompilato: deve
// partire da github.com/<owner>/<repo>/issues/new e portare nel corpo versione
// build, serie in curso (ronda, pista, orario, difficoltà) e gli errori
// recenti del registro (data/errors.jsonl dell'EVO_DATA_DIR di test).
// Repo GitHub assente → issuesUrl null: il bottone sparisce in GUI, niente crash.
process.env.EVO_DATA_DIR = process.env.EVO_DATA_DIR ?? ''; // fissato sotto, prima degli import dinamici

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = mkdtempSync(join(tmpdir(), 'evo-report-'));
process.env.EVO_DATA_DIR = DATA; // il registro errori del test è indipendente
writeFileSync(join(DATA, 'errors.jsonl'),
  JSON.stringify({ at: '2026-10-23T10:00:00Z', module: 'motec', message: 'errore di prova segnalazione', extra: 'dettaglio' }) + '\n',
  'utf8');

const { feedbackReport, feedbackLinks } = await import('../src/report.mjs?v=report-test');

const ladder = {
  nodes: [{ nodeId: 'coppa-test', display: 'Coppa Test', calendar: [{ track: 'istanza-pista', hour: 14, timeScale: 5 }] }],
  contentNames: { tracks: { 'istanza-pista': 'Pista Immaginaria' } },
};
const state = { node: 'coppa-test', round: 0, difficulty: { mode: 'adaptive', locked: [] } };
const ctx = { ladder, state };
const opts = { repo: 'pippo/pluto' };

test('feedbackLinks: URL issues new con titolo e corpo compilati', () => {
  const { issuesUrl } = feedbackLinks(ctx, opts);
  assert.match(issuesUrl, /^https:\/\/github\.com\/pippo\/pluto\/issues\/new\?/, 'deve essere il new-issue della repo');
  const u = new URL(issuesUrl);
  assert.match(u.searchParams.get('title'), /^Segnalazione — build /, 'manca la build nel titolo');
  const body = u.searchParams.get('body');
  assert.match(body, /build \d+/, 'manca la versione build (package.json) nel corpo');
  assert.ok(body.includes('Coppa Test'), 'manca la serie in corso');
  assert.ok(body.includes('ronda 1/1'), 'manca il contatore ronda');
  assert.ok(body.includes('Pista Immaginaria'), 'manca la pista (via contentNames)');
  assert.ok(body.includes('orario gara: 14:00'), 'manca l\'oraggio della gara');
  assert.ok(body.includes('errore di prova segnalazione'), 'manca l\'errore del registro');
  assert.ok(body.includes('Descrizione del problema'), 'manca lo spazio per la descrizione utente');
});

test('feedbackReport senza stato: si dichiara carriera assente', () => {
  const rep = feedbackReport(null, opts);
  assert.ok(rep.body.includes('carriera: non ancora creata'));
});

test('feedbackLinks senza repo GitHub: issuesUrl null, nessun errore', () => {
  const { issuesUrl } = feedbackLinks(ctx, { repo: null });
  assert.equal(issuesUrl, null);
});

test('githubRepo() reale: rileva la repo dal remote git del progetto', async () => {
  const { githubRepo } = await import('../src/report.mjs?v=report-test2');
  // il pacchetto amico (zip da git archive) NON porta .git: nell'estrazione il
  // valore atteso è l'assenza (undefined/stringa vuota) SENZA crash. Solo dove
  // .git c'è davvero si esige owner/repo ben formato.
  const r = githubRepo();
  if (existsSync(join(ROOT, '.git'))) {
    assert.match(r ?? '', /^[\w.-]+\/[\w.-]+$/, 'owner/repo dal remote git (se presente)');
  } else {
    assert.equal(r ?? '', '', 'senza .git: niente repo e nessun errore');
  }
});
