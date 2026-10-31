// test/readcells-tinta.test.mjs — TINTA a vista in readCells (vetrina DA-10,
// 1/11, autorizzazione migliorie): la lettura del customgrid per GUI/CLI porta
// anche la LIVERIA di ogni cella (campo 11, stessa estrazione del builder
// tintaDi), così la tab Griglia e i riquardi la dicono senza decodifiche a mano.
// Regole provate qui:
//   • le celle dei template FABBRICATI (test/tool: '\n' + byte lunghezza + nome)
//     escono col nome presa PULITA (il fallback toglie l'intestazione);
//   • il campo 11 ASSENTE conta '(default)' — una livrea propria, come il
//     builder;
//   • i BYTE VERI (formato gioco: tag \x12, preset nel SEGMENTO PRIMA di \x18)
//     si estraggono come del builder: lo stesso segmento prima del \x18.

import test from 'node:test';
import assert from 'node:assert/strict';

const ev = await import('../tools/evo-grid.mjs');
const { encodeMsg } = ev;
const { readCells } = await import('../tools/grid-balance.mjs');

const B = (s) => Buffer.from(String(s), 'utf8');
const f2 = () => { const b = Buffer.alloc(4); b.writeFloatLE(0.6, 0); return b; };

/** cella SINTETICA (fabbrica test): campo 11 = '\n' + byte lunghezza + visual */
const cellaSintetica = (id, preset, visual) => {
  const fields = [
    { field: 3, wire: 2, bytes: B(id) },
    { field: 4, wire: 2, bytes: B('Ferrari F40 LM') },
    { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B(preset) }]) },
  ];
  if (visual != null) fields.push({ field: 11, wire: 2, bytes: B('\n' + String.fromCharCode(visual.length + 0x10) + visual) });
  fields.push({ field: 42, wire: 5, bytes: f2() });
  return encodeMsg(fields);
};

/** cella FORMATO GIOCO REALE: campo 11 con il preset visuale nel primo segmento
 *  (prima di \x18 — il nome capital-dopo \x18 NON è il preset, commento builder). */
const cellaReale = (id, preset, presetVisual) => encodeMsg([
  { field: 3, wire: 2, bytes: B(id) },
  { field: 4, wire: 2, bytes: B('Ferrari F40 LM') },
  { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B(preset) }]) },
  { field: 11, wire: 2, bytes: B(`\x12${String.fromCharCode(presetVisual.length)}${presetVisual}\x18F40 LM Visual ${presetVisual.slice(-1)}`) },
  { field: 42, wire: 5, bytes: f2() },
]);

const bufferDi = (celle) => encodeMsg([
  ...celle.map((c) => ({ field: 1, wire: 2, bytes: c })),
  { field: 2, wire: 2, bytes: encodeMsg([{ field: 4, wire: 5, bytes: f2() }]) },
  { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(celle.length) }]) },
]);

test('readCells: tinta PULITA dalle celle dei template sintetici (no prefisso di lunghezza)', () => {
  const out = readCells(bufferDi([
    cellaSintetica('ks_f40_lm', 'preset_f40lm_mech_1', 'preset_f40lm_visual_3'),
    cellaSintetica('ks_f40_lm', 'preset_f40lm_mech_2', 'preset_f40lm_visual_7'),
  ]));
  assert.deepEqual(out.cells.map((c) => c.tinta), ['preset_f40lm_visual_3', 'preset_f40lm_visual_7']);
});

test('readCells: campo 11 ASSENTE è (default) — una livrea propria, come il builder', () => {
  const out = readCells(bufferDi([cellaSintetica('ks_f40_lm', 'preset_f40lm_mech_1', null)]));
  assert.equal(out.cells[0].tinta, '(default)');
});

test('readCells: formato GIOCO reale — segmento PRIMA di \\x18 (il nome dopo \\x18 non è il preset)', () => {
  const out = readCells(bufferDi([cellaReale('ks_f40_lm', 'preset_f40lm_mech_1', 'preset_f40lm_visual_4')]));
  assert.equal(out.cells[0].tinta, 'preset_f40lm_visual_4');
  assert.doesNotMatch(out.cells[0].tinta, /Visual/, 'il nome leggibile dopo \x18 NON finisce nella tinta');
});

test('readCells: le altre missioni del dump restano (preset, kg, count) — niente regressione', () => {
  const out = readCells(bufferDi([
    cellaSintetica('ks_f40_lm', 'preset_f40lm_mech_1', 'preset_f40lm_visual_3'),
    cellaSintetica('ks_f40_lm', 'preset_f40lm_mech_2', 'preset_f40lm_visual_7'),
    cellaSintetica('ks_f40_lm', 'preset_f40lm_mech_3', null),
  ]));
  assert.deepEqual(out.cells.map((c) => c.preset), ['preset_f40lm_mech_1', 'preset_f40lm_mech_2', 'preset_f40lm_mech_3']);
  assert.equal(out.count, 3, 'config.count decodificato');
  assert.equal(out.cells.every((c) => c.kg === 0), true, 'ballast a 0 (niente campo 24)');
});
