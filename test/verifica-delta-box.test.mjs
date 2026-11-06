// 6/11 — il controllo «delta dai box» deve dire la verità.
// Lo strumento tools/verifica-delta-box.mjs ricostruisce le finestre
// boxopen→boxclose dal registro vocale e conta le frasi `chi: "delta"` dentro:
// se sbagliasse il confine darebbe un «pulito» falso, che è peggio di nessun
// controllo. Qui il contratto: esce 1 con una frase dentro la sosta, esce 0 se
// la frase è fuori, e una sosta rimasta aperta si chiude alla sessione nuova
// (le frasi della sessione dopo non le vengono attribuite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, '..', 'tools', 'verifica-delta-box.mjs');

/** Registro finto: righe già pronte, scritte in una cartella temporanea. */
function registro(righe) {
  const dir = mkdtempSync(join(tmpdir(), 'delta-box-'));
  const f = join(dir, 'copilot-voce-finto.jsonl');
  writeFileSync(f, righe.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return f;
}

const esegui = (file, ...extra) => spawnSync(process.execPath, [TOOL, '--file', file, '--json', ...extra], { encoding: 'utf8' });

const boxopen = (t) => ({ t, chi: 'boxopen', it: 'Box aperto: in pitlane' });
const boxclose = (t) => ({ t, chi: 'boxclose', it: 'Box chiuso: fuori dal pitlane' });
const delta = (t, testo = 'sei più veloce del best di 1.2') => ({ t, chi: 'delta', it: testo });
const nuovaSessione = (t) => ({ t, evento: 'SESSIONE NUOVA (firma cambiata) — memoria dei narratori azzerata, grazia ripartita' });

const T0 = Date.UTC(2026, 10, 6, 20, 0, 0);

test('una frase delta DENTRO la sosta è un difetto: esce 1 e la nomina', () => {
  const f = registro([boxopen(T0), delta(T0 + 5000, 'sei più veloce del best di 3.3'), boxclose(T0 + 60000)]);
  const r = esegui(f);
  assert.equal(r.status, 1, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.finestreConDelta, 1);
  assert.equal(out.frasiDeltaInBox, 1);
  assert.equal(out.dettaglio[0].frasi[0], 'sei più veloce del best di 3.3');
  assert.equal(out.dettaglio[0].durataSec, 60);
});

test('la stessa frase fuori dalla sosta non conta: esce 0', () => {
  const f = registro([
    delta(T0, 'prima di entrare'),
    boxopen(T0 + 1000),
    boxclose(T0 + 30000),
    delta(T0 + 40000, 'dopo essere uscito'),
  ]);
  const r = esegui(f);
  assert.equal(r.status, 0, r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.finestre, 1);
  assert.equal(out.frasiDeltaInBox, 0);
});

test('sosta rimasta aperta: la sessione nuova la chiude, le frasi dopo non sono «ai box»', () => {
  const f = registro([
    boxopen(T0),
    nuovaSessione(T0 + 10000),
    delta(T0 + 20000, 'sessione nuova, in pista'),
  ]);
  const r = esegui(f);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(JSON.parse(r.stdout).frasiDeltaInBox, 0);
});

test('--dopo taglia le soste vecchie: il difetto storico non conta per la gara di adesso', () => {
  const f = registro([
    boxopen(T0), delta(T0 + 1000), boxclose(T0 + 2000),          // vecchia, sporca
    boxopen(T0 + 3600000), boxclose(T0 + 3660000),               // nuova, pulita
  ]);
  assert.equal(esegui(f).status, 1);
  const dopo = new Date(T0 + 1800000).toISOString();
  const r = esegui(f, '--dopo', dopo);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(JSON.parse(r.stdout).finestre, 1);
});
