// test/gridbuilder-tinte.test.mjs — TINTE RIVALI nel builder (DA-10,
// «controlla perché gli avversari hanno auto monocolore», 30/10): se il
// template porta PIÙ liveries della stessa auto, la griglia scritta deve
// portarle (round-robin per modello) e il report deve CONTARLE; se un
// modello esce con più vetture e una sola tinta, il report lo dice
// «MONOCOLORE» con il gesto (più LIVERIES + APPLICA in EVO). La stessa
// costruzione minimale di gridbuilder-uniche.test.mjs (quello parla di
// anti-crash: celle byte-uniche; questo di livree: campo 11).
// Niente file di gioco: template e classi vivono in tmp, classi vuote.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const g = await import('../src/gridbuilder.mjs');
const ev = await import('../tools/evo-grid.mjs');
const { encodeMsg, decodeMsg } = ev;

const TMP = mkdtempSync(join(tmpdir(), 'grid-tinte-test-'));
const B = (s) => Buffer.from(String(s), 'utf8');

const cella = (id, nome, preset, visual) => {
  const f = Buffer.alloc(4); f.writeFloatLE(10.000019073486328, 0);
  return encodeMsg([
    { field: 3, wire: 2, bytes: B(id) },
    { field: 4, wire: 2, bytes: B(nome) },
    { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B(preset) }]) },
    { field: 11, wire: 2, bytes: B('\x12' + String.fromCharCode(visual.length + 0x10) + visual) },
    { field: 42, wire: 5, bytes: f },
  ]);
};
const driverSkill = (skill) => {
  const f = Buffer.alloc(4); f.writeFloatLE(skill, 0);
  return encodeMsg([{ field: 4, wire: 5, bytes: f }]);
};
const templateOf = (celle) => {
  const fields = [];
  for (const c of celle) fields.push({ field: 1, wire: 2, bytes: c });
  fields.push({ field: 2, wire: 2, bytes: driverSkill(0.60) });
  fields.push({ field: 2, wire: 2, bytes: driverSkill(0.40) });
  fields.push({ field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(2) }]) });
  return encodeMsg(fields);
};
const f40 = (visual) => cella('ks_f40_lm', 'Ferrari F40 LM', 'preset_f40lm_mech_1', 'preset_f40lm_visual_' + visual);
const nodo = (gridSize) => ({
  nodeId: 'evento_tinta', display: 'Evento TINTA', gridSize,
  cars: ['ks_f40_lm'],
  calendar: [{ name: 'prova', track: 'Pista Di Prova', weather: 0, laps: 3 }],
});

const CO = join(TMP, 'classi-tinte.json');
writeFileSync(CO, JSON.stringify({ classi: {} }));
process.env.EVO_CLASSES_FILE = CO;

const costruisce = (celle, gridSize) => {
  const file = join(TMP, `tpl-${celle.length}-${gridSize}.customgrid`);
  writeFileSync(file, templateOf(celle));
  return g.buildGridMessage({ ladder: { nodes: [nodo(gridSize)] }, nodeId: 'evento_tinta', roundIndex: 0, file, noBalance: true });
};

/** le tinte (field 11) delle CELLE SCRITTE, nello stesso modo del builder */
const tinteScritte = (buffer) => {
  const out = [];
  for (const f of ev.decodeMsg(buffer)) {
    if (f.field !== 1) continue;
    let v = '(default)';
    for (const g2 of ev.decodeMsg(f.bytes)) {
      if (g2.field !== 11) continue;
      const t = Buffer.from(g2.bytes).toString('utf8');
      const k = t.indexOf('\x12');
      v = k >= 0 ? t.slice(k + 1).split('\x18')[0] : (t || '(default)');
    }
    out.push(v || '(default)');
  }
  return out;
};

test('3 liveries del template → la griglia scritta porta 3 TINTE DIVERSE', () => {
  const out = costruisce([f40('v1'), f40('v2'), f40('v3')], 4);   // 3 uniche + 1 clone armonico
  const scritte = tinteScritte(out.buffer);
  assert.equal(scritte.length, 4, '4 vetture scritte');
  assert.equal(new Set(scritte).size, 3, '3 TINTE distinte sul via (le varianti del template girano tutte)');
  // il frame del campo 11 porta davanti al preset la sua lunghezza: si
  // confronta il SUFFISSO (stessa tinta del template, non altre)
  const netto = [...new Set(scritte)].map((v) => (/preset_f40lm_visual_(v\d)$/.exec(v)?.[1])).sort();
  assert.deepEqual(netto, ['v1', 'v2', 'v3'], 'le tinte del template, non altre');
  const riga = out.report.tinte.find((s) => s.includes('ks_f40_lm'));
  assert.match(riga, /×4/, '4 istanze nel report');
  assert.match(riga, /3 tint/, '3 tint(e) dichiarate');
  assert.doesNotMatch(riga, /MONOCOLORE/, 'con 3 tinte non grida monocolore');
});

test('1 sola livery nel template, 3 vetture → il report GRIDA monocolore col gesto', () => {
  const out = costruisce([f40('v4')], 3);   // 1 reale + 2 cloni armonici, stessa tinta
  const scritte = tinteScritte(out.buffer);
  assert.equal(scritte.length, 3);
  assert.equal(new Set(scritte).size, 1, 'una sola tinta scritta (il template ne offre una sola: niente invenzioni)');
  const riga = out.report.tinte.find((s) => s.includes('ks_f40_lm'));
  assert.match(riga, /×3 · 1 tinta \(MONOCOLORE: più liveries in EVO \+ APPLICA per le varianti\)/);
});

/* ---- DA-10 secondo passo: TINTE PRESTATE + BILANCIO PER FAMIGLIA (31/10) ---- */

/** kg e % restrictor scritti su OGNI cella del buffer (f24 varint, f25 float):
 *  la lente per provare che le regole mordano anche le varianti mech_2/3 del
 *  match per FAMIGLIA (27/10 esteso 31/10). */
const bilanciScritte = (buffer) => [...decodeMsg(buffer)]
  .filter((f) => f.field === 1)
  .map((f) => {
    const b = { kg: 0, pct: 0 };
    for (const g of decodeMsg(f.bytes)) {
      if (g.field === 24) b.kg = Number(g.varint);
      else if (g.field === 25 && g.bytes?.length >= 4) b.pct = Math.round(Buffer.from(g.bytes).readFloatLE(0) * 100);
    }
    return b;
  });

/** build senza noBalance: le regole della classe scritta in CO mordono le celle. */
const buildFamiglia = (celle, gridSize) => {
  const file = join(TMP, `tpl-fam-${celle.length}.customgrid`);
  writeFileSync(file, templateOf(celle));
  return g.buildGridMessage({ ladder: { nodes: [nodo(gridSize)] }, nodeId: 'evento_tinta', roundIndex: 0, file });
};

/** build con DIR dedicata (prestate): i template che PRESTATO i modelli */
const buildPrestate = (file) => g.buildGridMessage({ ladder: { nodes: [nodo(3)] }, nodeId: 'evento_tinta', roundIndex: 0, file, noBalance: true });

test('BILANCIO PER FAMIGLIA: regola del preset mech_1 pesa anche mech_2 (lezione 27/10 estesa al match)', () => {
  writeFileSync(CO, JSON.stringify({ classi: { evento_tinta: { regole: [{ preset: 'preset_f40lm_mech_1', ballastKg: 50 }] } } }));
  // il template porta DUE varianti meccaniche della STESSA auto: quando il
  // template si RINUMERA (mech_2 dopo un'era di mech_1), il match esatto per
  // preset smetteva di mordere e la variante usciva a 0 kg.
  const out = buildFamiglia([
    cella('ks_f40_lm', 'Ferrari F40 LM', 'preset_f40lm_mech_1', 'preset_f40lm_visual_v1'),
    cella('ks_f40_lm', 'Ferrari F40 LM', 'preset_f40lm_mech_2', 'preset_f40lm_visual_v2'),
  ], 2);
  const b = bilanciScritte(out.buffer);
  assert.equal(b.length, 2);
  assert.deepEqual(b, [{ kg: 50, pct: 0 }, { kg: 50, pct: 0 }], 'ENTRAMBE le varianti portano il ballast della regola mech_1');
});

test('TINTE PRESTATE: senza il flag per serie il builder NON cambia un passo (default SPENTO)', () => {
  writeFileSync(CO, JSON.stringify({ classi: {} }));
  const dir = join(TMP, 'prestate-off');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tpl-main.customgrid'), templateOf([f40('v1')]));
  writeFileSync(join(dir, 'tpl-alt.customgrid'), templateOf([f40('v2'), f40('v3')]));
  const out = buildPrestate(join(dir, 'tpl-main.customgrid'));
  const scritte = tinteScritte(out.buffer);
  assert.equal(new Set(scritte).size, 1, 'off: il pool resta monocolore');
  assert.equal(out.report.tintePrestate ?? null, null, 'off: il report NON dichiara prestate');
});

test('TINTE PRESTATE: con tintePrestate=true il pool prende le celle VERE degli altri template', () => {
  const dir = join(TMP, 'prestate-on');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tpl-main.customgrid'), templateOf([f40('v1')]));
  writeFileSync(join(dir, 'tpl-alt.customgrid'), templateOf([f40('v2'), f40('v3')]));
  writeFileSync(CO, JSON.stringify({ classi: { evento_tinta: { tintePrestate: true } } }));
  const out = buildPrestate(join(dir, 'tpl-main.customgrid'));
  const scritte = tinteScritte(out.buffer);
  assert.equal(scritte.length, 3, '3 vetture a giro: le prestate allargano il pool');
  const netto = [...new Set(scritte)].map((v) => (/preset_f40lm_visual_(v\d)$/.exec(v)?.[1])).sort();
  assert.deepEqual(netto, ['v1', 'v2', 'v3'], 'le tinte PRESTATE sono le CELLE VERE del parco — zero inventate');
  assert.equal(out.report.tintePrestate, 2, '2 celle prestate dichiarate nel report');
  // nessuna cella scritta DUPLICATA: la lezione zero-crash resta intatta
  const hexScritte = new Set();
  for (const f of decodeMsg(out.buffer)) {
    if (f.field === 1) hexScritte.add(Buffer.from(f.bytes).toString('hex'));
  }
  assert.equal(hexScritte.size, 3, '3 CELLE byte-unche: la lezione 20/10 (zero crash) regge anche coi prestate');
});

