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

/* ------------------------------------------------------------------ */
/* 2/11 — BANDA DI SERIE SCRITTA NEL LADDER (richiesta Mauro: «copri i   */
/* nodi con l'84–85 attuale così nemmeno il ripiego resta preistorico»)  */
/* ------------------------------------------------------------------ */

const { bandaSerieLadder } = stateMod;

/** il nodo del ladder test ora porta la banda di serie d'epoca (aiSerie) */
const ladderConAiSerie = { nodes: [{ ...ladder.nodes[0], aiSerie: [84, 85] }] };

test('senza aiBandSerie: il ripiego è la banda di serie del ladder (aiSerie), NON node.ai', () => {
  writeFileSync(file, templateOf(5));
  const r = buildGridMessage({ ladder: ladderConAiSerie, nodeId: 'coppa_test_banda', roundIndex: 0, file });
  assert.match(r.report.ai, /84-85/);
  assert.match(r.report.ai, /banda di serie \(ladder\)/);
});

test('senza aiSerie né aiBandSerie: il ripiego resta il vecchio node.ai (comportamento invariato)', () => {
  writeFileSync(file, templateOf(5));
  const r = buildGridMessage({ ladder: { nodes: [{ ...ladderConAiSerie.nodes[0], aiSerie: undefined }] }, nodeId: 'coppa_test_banda', roundIndex: 0, file });
  assert.match(r.report.ai, /82-92/);
  assert.match(r.report.ai, /dal ladder/);
});

test('bandaSerieLadder: nodo > ladder > null', () => {
  const lz = { bandaSerie: [82, 83], nodes: [{ nodeId: 'a', aiSerie: [84, 85] }, { nodeId: 'b' }] };
  assert.deepEqual(bandaSerieLadder(lz, lz.nodes[0]), [84, 85]); // il nodo vince
  assert.deepEqual(bandaSerieLadder(lz, lz.nodes[1]), [82, 83]); // poi il ladder
  assert.equal(bandaSerieLadder({ nodes: [{ nodeId: 'c' }] }, { nodeId: 'c' }), null); // niente → null (chi chiama decide)
  // valori incompleti o non numerici non passano come banda
  assert.equal(bandaSerieLadder({ nodes: [] }, { nodeId: 'd', aiSerie: [84] }), null);
  assert.equal(bandaSerieLadder({ nodes: [] }, { nodeId: 'e', aiSerie: ['84', 'x'] }), null);
});

/** GUARDIA: il ladder VERO del repo (config/career.evo.ladder.json) porta
 *  aiSerie [84, 85] su OGNI nodo — se una release cambia il default e
 *  riscrive i nodi deve coprirli TUTTI, altrimenti il ripiego tornerebbe
 *  preistorico per le serie rimaste indietro. */
test('ladder vero: ogni nodo porta la banda di serie compilata alla release', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const qui = dirname(fileURLToPath(import.meta.url));
  const vero = JSON.parse(readFileSync(join(qui, '..', 'config', 'career.evo.ladder.json'), 'utf8'));
  const nodi = vero.nodes ?? [];
  assert.ok(nodi.length > 0, 'il ladder vero ha nodi');
  const nudi = nodi.filter((n) => !bandaSerieLadder(vero, n));
  assert.deepEqual(nudi.map((n) => n.nodeId), [], 'ogni nodo porta aiSerie (o bandaSerie a livello ladder)');
  for (const n of nodi) {
    const [mi, ma] = bandaSerieLadder(vero, n);
    assert.ok(mi >= 0 && ma <= 100 && ma >= mi, `${n.nodeId}: banda di serie sensibile (${mi}–${ma})`);
  }
});

/** ALLINEAMENTO F10 (1/11 — forma del GENERA sul vivo odierno ore 18:07): nel
 *  customgrid scritto dal gioco OGNI driver ha il f4 esterno = pacchetto skill
 *  interno f10 (f10.f1=f10.f2=f10.f4=f10.f5=f10.f6, con f3 interno fisso 0.1 e
 *  f7 varint 1): il builder scalava SOLO il f4 lasciando il pack al valore del
 *  template — banda dichiarata ma AI con il vecchio livello dentro il pack.
 *  Da qui ogni scrittura del f4 trascina il pack con lo stesso valore. */
test('la banda scalata trascina con sé il pack f10: f4 esterno = skill pack interno (forma GIOCO)', () => {
  const ff = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; };
  // driver a forma GIOCO ma con pack VOLUTAMENTE sfasato dal f4 (l'eredità
  // che aveva il template nel vivo): il builder deve ripararla scrivendo
  const driverPack = (skill, pack) => encodeMsg([
    { field: 4, wire: 5, bytes: ff(skill) },
    { field: 10, wire: 2, bytes: encodeMsg([
      { field: 1, wire: 5, bytes: ff(pack) },
      { field: 2, wire: 5, bytes: ff(pack) },
      { field: 3, wire: 5, bytes: ff(0.1) },
      { field: 4, wire: 5, bytes: ff(pack) },
      { field: 5, wire: 5, bytes: ff(pack) },
      { field: 6, wire: 5, bytes: ff(pack) },
      { field: 7, wire: 0, varint: 1n },
    ]) },
  ]);
  const tpl = encodeMsg([
    ...Array.from({ length: 5 }, (_, i) => ({ field: 1, wire: 2, bytes: cella('preset_banda_finta_visual_' + i) })),
    { field: 2, wire: 2, bytes: driverPack(0.40, 0.95) },
    { field: 2, wire: 2, bytes: driverPack(0.60, 0.80) },
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(5) }]) },
  ]);
  writeFileSync(file, tpl);
  const r = buildGridMessage({ ladder, nodeId: 'coppa_test_banda', roundIndex: 0, file, aiBand: [88, 93] });
  const out = ev.decodeMsg(r.buffer);
  const driverOut = out.filter((x) => x.field === 2);
  assert.equal(driverOut.length, 5, '5 driver scritti');
  for (const d of driverOut) {
    const inner = ev.decodeMsg(d.bytes);
    const f4 = Buffer.from(inner.find((g) => g.field === 4).bytes).readFloatLE(0);
    // bordo float como il GENERA: 0.88 in float LE porta 0.87999999… — tolleranza 1e-6
    assert.ok(f4 >= 0.88 - 1e-6 && f4 <= 0.93 + 1e-6, `f4 in banda: ${f4}`);
    const pack = ev.decodeMsg(inner.find((g) => g.field === 10).bytes);
    const floats = pack.filter((x) => x.wire === 5).map((x) => Buffer.from(x.bytes).readFloatLE(0));
    assert.equal(floats.length, 6, 'il pack ha 6 float');
    for (const k of [0, 1, 3, 4, 5]) assert.ok(Math.abs(floats[k] - f4) < 1e-6, `f10 slot ${k + 1} allineato al f4 (${floats[k]} ≠ ${f4})`);
    assert.ok(Math.abs(floats[2] - 0.1) < 1e-6, 'f10.f3 resta il fisso 0.1 del GENERA');
    const f7 = pack.find((x) => x.field === 7);
    assert.equal(Number(f7.varint), 1, 'f10.f7 varint resta 1');
  }
});

