import "./_flows-sandbox.mjs"; // sandbox flussi
// orario.test.mjs — piani orari per round (richiesta Mauro 21/10/2026):
// notte, tramontoalba 48x, variabile, e specForRound deterministico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIANI, pianoFor, specForRound, applyPianoToCalendar } from '../src/orario.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';

// SANITÀ (lezione 21/10, notte): un test senza --dry HA RISCRITTO IL LADDER VERO
// del progetto (config/career.evo.ladder.json): il full-suite è arrosto per 6 file
// e il ripristino è passato da git. I test che scrivono lo fanno SOLO su un file
// ladder temporaneo passato col nuovo parametro file.
const TMP_DIR = mkdtempSync(join(tmpdir(), 'ac-orario-test-'));
const TMP_LADDER = join(TMP_DIR, 'ladder.json');

const fakeLadder = () => ({
  nodes: [{
    nodeId: 'serie_x', display: 'Serie X',
    calendar: Array.from({ length: 6 }, (_, i) => ({ name: `R${i + 1}`, track: `t${i}`, laps: 3, hour: 14 })),
  }],
});

test('piani: ogni piano ha ora/e valide e scala 1..60', () => {
  for (const [id, p] of Object.entries(PIANI)) {
    assert.ok(Array.isArray(p.orari) && p.orari.length >= 1, `${id}: orari mancanti`);
    for (const h of p.orari) assert.ok(h >= 0 && h <= 23, `${id}: ora ${h} fuori range`);
    assert.ok(p.scale >= 1 && p.scale <= 60, `${id}: scala ${p.scale} fuori range`);
  }
});

test('pianoFor: nome completo, prefisso univoco, ambigu già risolto', () => {
  assert.equal(pianoFor('notte'), 'notte');
  assert.equal(pianoFor('tram'), 'tramontoalba');
  assert.equal(pianoFor('alinonostante'), null);
});

test('specForRound variabile: mai la stessa ora su round consecutivi', () => {
  const ore = Array.from({ length: 6 }, (_, i) => specForRound('variabile', i).hour);
  for (let i = 1; i < ore.length; i++) assert.notEqual(ore[i], ore[i - 1], `R${i} e R${i + 1} con la stessa ora: ${ore}`);
});

test('specForRound notte: ora dentro 1-3 e scala 2', () => {
  for (let i = 0; i < 4; i++) {
    const s = specForRound('notte', i);
    assert.ok([1, 2, 3].includes(s.hour));
    assert.equal(s.timeScale, PIANI.notte.scale);
  }
});

test('tramontoalba: ore 21 e scala 48 su ogni round', () => {
  for (let i = 0; i < 3; i++) {
    const s = specForRound('tramontoalba', i);
    assert.equal(s.hour, 21);
    assert.equal(s.timeScale, 48);
  }
});

test('applyPiano scrive hour/timeScale nel calendario (e --da/--a limita) su FILE TEMPORANEO', () => {
  const ladder = fakeLadder();
  const rep = applyPianoToCalendar(ladder, 'serie_x', 'notte', { a: 1, file: TMP_LADDER });
  assert.equal(rep.righe.length, 2);
  assert.equal(ladder.nodes[0].calendar[0].hour, rep.righe[0].dopo.hour);
  assert.equal(ladder.nodes[0].calendar[1].timeScale, PIANI.notte.scale);
  // i round oltre "a" restano intatti
  assert.equal(ladder.nodes[0].calendar[2].hour, 14);
  assert.equal(ladder.nodes[0].calendar[2].timeScale, undefined);
  // il file scritto è il temporaneo, e combacia col ladder in memoria
  const onDisk = JSON.parse(readFileSync(TMP_LADDER, 'utf8'));
  assert.equal(onDisk.nodes[0].calendar[0].hour, ladder.nodes[0].calendar[0].hour);
});

test('applyPiano dry: niente scritture', () => {
  const ladder = fakeLadder();
  applyPianoToCalendar(ladder, 'serie_x', 'alba', { dry: true, file: TMP_LADDER });
  assert.equal(ladder.nodes[0].calendar[0].hour, 14);
});

test('applyPiano serie sconosciuta: errore chiaro', () => {
  assert.throws(() => applyPianoToCalendar(fakeLadder(), 'niente', 'notte', { dry: true }), /non trovata/);
});
