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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const g = await import('../src/gridbuilder.mjs');
const ev = await import('../tools/evo-grid.mjs');
const { encodeMsg } = ev;

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
