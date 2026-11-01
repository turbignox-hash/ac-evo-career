// test/gridbuilder-banda-serie.test.mjs — regressione del richiamo di Mauro
// dell'1/11/2026: la scheda Griglia mostrava «AI 82–92» per la Peugeot 205 T16
// perché il builder, senza classe combaciata («Nessuna classe combacia»),
// prendeva la banda PREISTORICA del nodo ladder («ai»: [82, 92] scritta dal
// primo script d'impianto) invece della banda VIVA dei cursori del weekend
// (84–85, trim accettati compresi). Ora il builder accetta `aiBandSerie`
// (banda di serie calcolata da state.raceSettings / difficultyFor con la
// STESSA formula del pannello Difficoltà) e la usa come ripiego PRIMA del
// ladder. Priorità: aiBand (evento) > classe pinnata > aiBandSerie > node.ai.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const g = await import('../src/gridbuilder.mjs');
const stateMod = await import('../src/state.mjs');
const ev = await import('../tools/evo-grid.mjs');
const { encodeMsg } = ev;
const { buildGridMessage } = g;
const { bandaSerieSlider } = stateMod;

const TMP = mkdtempSync(join(tmpdir(), 'grid-banda-test-'));
const B = (s) => Buffer.from(String(s), 'utf8');

/** cella minima con preset FINTO (il preset non combaccia con nessuna classe reale:
 *  pickClass esige ≥2 overlap di preset, e il nodeId nemmeno è una classe). */
const cella = (visual) => {
  const f = Buffer.alloc(4); f.writeFloatLE(10.000019073486328, 0);
  return encodeMsg([
    { field: 3, wire: 2, bytes: B('ks_f40_lm') },
    { field: 4, wire: 2, bytes: B('Ferrari F40 LM') },
    { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B('preset_banda_finta_mech_1') }]) },
    { field: 11, wire: 2, bytes: B('\n' + String.fromCharCode(visual.length + 0x10) + visual) },
    { field: 42, wire: 5, bytes: f },
  ]);
};
const driverSkill = (skill) => {
  const f = Buffer.alloc(4); f.writeFloatLE(skill, 0);
  return encodeMsg([{ field: 4, wire: 5, bytes: f }]);
};
const templateOf = (n) => {
  const fields = [];
  for (let i = 0; i < n; i++) fields.push({ field: 1, wire: 2, bytes: cella('preset_banda_finta_visual_' + i) });
  fields.push({ field: 2, wire: 2, bytes: driverSkill(0.60) });
  fields.push({ field: 2, wire: 2, bytes: driverSkill(0.40) });
  fields.push({ field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(2) }]) });
  return encodeMsg(fields);
};

const file = join(TMP, 'test.customgrid');
const ladder = {
  nodes: [{
    nodeId: 'coppa_test_banda',
    display: 'Coppa TEST banda',
    gridSize: 5,
    cars: ['ks_f40_lm'],
    // la banda preistorica del ladder: SENZA banda di serie resta il vecchio REGOLE
    ai: [82, 92],
    calendar: [{ name: 'prova', track: 'Pista Di Prova', weather: 0, laps: 3 }],
  }],
};

test('senza aiBandSerie il builder mantiene la banda del ladder (comportamento invariato)', () => {
  writeFileSync(file, templateOf(5));
  const r = buildGridMessage({ ladder, nodeId: 'coppa_test_banda', roundIndex: 0, file });
  assert.match(r.report.ai, /82-92/);
  assert.match(r.report.ai, /dal ladder/);
});

test('con aiBandSerie la banda VIVA della serie vince sul ladder preistorico', () => {
  writeFileSync(file, templateOf(5));
  const r = buildGridMessage({ ladder, nodeId: 'coppa_test_banda', roundIndex: 0, file, aiBandSerie: [84, 85] });
  assert.match(r.report.ai, /84-85/);
  assert.match(r.report.ai, /banda di serie \(cursori\)/);
});

test('aiBand (evento) resta sopra la banda di serie', () => {
  writeFileSync(file, templateOf(5));
  const r = buildGridMessage({ ladder, nodeId: 'coppa_test_banda', roundIndex: 0, file, aiBand: [88, 93], aiBandSerie: [84, 85] });
  assert.match(r.report.ai, /88-93/);
  assert.match(r.report.ai, /banda richiesta \(evento\)/);
});

/** stato minimo: tutta la struttura che difficultyFor legge (base/trim/offClass…) */
const stato = (raceSettings) => ({
  difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
  raceSettings,
});

test('bandaSerieSlider: override dei cursori (raceSettings) parla per primo', () => {
  const s = stato({ coppa_test_banda: { sliderMin: 84, sliderMax: 85 } });
  const out = bandaSerieSlider(ladder, s, ladder.nodes[0], 'Pista Di Prova');
  assert.deepEqual(out.banda, [84, 85]);
  assert.equal(out.override, true);
});

test('bandaSerieSlider: senza override segue lo slider calcolato, banda stretta di 1 punto', () => {
  const s = stato({});
  const out = bandaSerieSlider(ladder, s, ladder.nodes[0], 'Pista Di Prova');
  assert.equal(out.banda[1], Math.min(100, out.banda[0] + 1));
  assert.equal(out.banda[0], out.slider);      // lo minimo È lo slider arrotondato
  assert.equal(out.override, false);
});
