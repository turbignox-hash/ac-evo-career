import "./_flows-sandbox.mjs"; // sandbox flussi
// gridclasses.test.mjs — le tre scoperte fragili del 19–20/10/2026, protette:
//   1) restrictor: nel FILE è una FRAZIONE (raw = %/100 — setF32(pct/100));
//      senza test, la classe roadster_classic era già regredita di un fattore 100.
//   2) classe monomarca: regole tutte a 0/0 (hyper_road) → la griglia si riscrive
//      nude, e il match di classe NON si rompe.
//   3) merge perTraccia: i supplementi sostituiscono il restrictor di regole
//      (non si sommano) solo sulla pista combaciata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLASSES = join(HERE, '..', 'data', 'grid-classes.json');

test('restrictor: la scrittura usa setF32(pct/100) — il campo file è una FRAZIONE', async () => {
  const src = readFileSync(join(HERE, '..', 'src', 'gridbuilder.mjs'), 'utf8');
  const restore = readFileSync(join(HERE, '..', 'src', 'grid-restore.mjs'), 'utf8');
  // scrittura: la % va in campo 25 come frazione; lettura: la frazione torna ×100
  assert.match(src, /setF32\(\s*rl\.pct\s*\/\s*100\s*\)/, 'gridbuilder: campo 25 = %/100');
  assert.match(restore, /f32of\(f\.bytes\)\s*\*\s*100/, 'grid-restore: % = frazione × 100');
});

test('hyper_road: classe monomarca con regole tutte a 0/0 (e aiStandard pinnato)', () => {
  const j = JSON.parse(readFileSync(CLASSES, 'utf8'));
  const h = j.classi.hyper_road;
  assert.ok(h, 'classe presente');
  assert.ok(h.regole.every((r) => (r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0), 'tutte le regole a 0/0');
  assert.ok(Array.isArray(h.aiStandard) && h.aiStandard.length === 2, 'campo AI pinnato');
});

test('merge perTraccia: supplementi sostituiscono il restrictor (non si sommano) solo sulla pista combaciata', async () => {
  const { patchPerTrack, perTrackKey } = await import('../src/gridbuilder.mjs');
  const cls = {
    regole: [
      { preset: 'preset_a_mech_1', ballastKg: 100, restrictorPct: 1 },
      { preset: 'preset_b_mech_1', ballastKg: 100, restrictorPct: 2 },
    ],
    perTraccia: {
      '_readme': 'no',
      'Circuit Of The Americas': { restrictorPct: { preset_a_mech_1: 9 } },
    },
  };
  const rules = [
    { rule: { preset: 'preset_a_mech_1' }, kg: 100, pct: 1 },
    { rule: { preset: 'preset_b_mech_1' }, kg: 100, pct: 2 },
  ];
  // pista combaciante (anche per id ladder): la A sostituisce 1 → 9, la B resta 2
  const key = perTrackKey(cls, 'Circuit Of The Americas');
  assert.equal(key, 'Circuit Of The Americas');
  const out = patchPerTrack(rules, cls, 'circuit_of_the_americas');
  assert.equal(out, 'Circuit Of The Americas');
  assert.deepEqual(rules.map((r) => r.pct), [9, 2], 'sostituzione, non somma');
  // pista senza chiave: nessuna patch
  assert.equal(patchPerTrack(rules, cls, 'Brands Hatch'), null);
});

test('vigia campo AI: segnala il range perso e zitta quando combacia o senza pin', async () => {
  const { aiRangeProposal } = await import('../src/grid-restore.mjs');
  const j = JSON.parse(readFileSync(CLASSES, 'utf8'));
  const hyper = j.classi.hyper_road;
  // il giudizio esige un pin: senza aiStandard la vigia è muta (difesa regressione)
  assert.ok(hyper.aiStandard, 'hyper_road pinnata: senza questo test la vigia non avrebbe regole');
  // file assente/anomalo → null senza crash (comportamento già vinto dai watcher)
  assert.equal(aiRangeProposal('(inesistente).customgrid'), null);
});
