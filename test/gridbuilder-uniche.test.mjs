// test/gridbuilder-uniche.test.mjs — regressione del crash 23/10 (19:32), Gran
// Finale: la griglia evento 5×F40 scritta col pool del template aveva solo 3
// CELLE UNICHE (visual 5/4/6 a giro → due paia byte-identiche) e EVO 0.9.1
// è morto alla prima "avvia sessione" in gara personalizzata — la stessa lezione
// delle 7-8 crashate a Suzuka (20/10): celle identiche ripetute crashano.
// Il builder ora NON scrive più niente quando le celle uniche del template sono
// meno delle vetture richieste, e lo dice col gesto di r_invio (più liveries in
// EVO + APPLICA, seriamente: servono > varianti, non è un problema di "minimo".
// La vecchia alternanza visual_1↔2 diceva di alternare guardando il NOME del
// visual (campo dopo \x12), ma il preset sta nel PRIMO segmento del campo 11:
// mai eseguita in pratica, le F40 "F40 LM Visual 4" non hanno underscores)

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const g = await import('../src/gridbuilder.mjs');
const ev = await import('../tools/evo-grid.mjs');
const { encodeMsg } = ev;

const TMP = mkdtempSync(join(tmpdir(), 'grid-uniche-test-'));
const B = (s) => Buffer.from(String(s), 'utf8');

/** cella minima come la scrive il gioco: 3 id + 4 nome + 10 preset mec + 11 visual */
const cella = (id, nome, preset, visual) => encodeMsg([
  { field: 3, wire: 2, bytes: B(id) },
  { field: 4, wire: 2, bytes: B(nome) },
  { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B(preset) }]) },
  { field: 11, wire: 2, bytes: B('\n' + String.fromCharCode(visual.length + 0x10) + visual) },
]);
/** driver minimo con skill (campo 4 float) distinta per posizione */
const driverSkill = (skill) => {
  const f = Buffer.alloc(4); f.writeFloatLE(skill, 0);
  return encodeMsg([{ field: 4, wire: 5, bytes: f }]);
};

/** template customgrid: n celle F40 con visual diversi (o ripetuti) + config */
const templateOf = (visuals) => {
  const fields = [];
  for (const v of visuals) fields.push({ field: 1, wire: 2, bytes: cella('ks_f40_lm', 'Ferrari F40 LM', 'preset_f40lm_mech_1', 'preset_f40lm_visual_' + v) });
  fields.push({ field: 2, wire: 2, bytes: driverSkill(0.60) });
  fields.push({ field: 2, wire: 2, bytes: driverSkill(0.40) });
  fields.push({ field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(2) }]) });
  return encodeMsg(fields);
};

const nodo = (gridSize) => ({
  nodeId: 'evento_test', display: 'Evento TEST', gridSize,
  cars: ['ks_f40_lm'],
  calendar: [{ name: 'prova', track: 'Pista Di Prova', weather: 0, laps: 3 }],
});
const costruisce = (visuals, gridSize) => {
  const file = join(TMP, `tpl-${visuals.join('')}.customgrid`);
  writeFileSync(file, templateOf(visuals));
  return g.buildGridMessage({ ladder: { nodes: [nodo(gridSize)] }, nodeId: 'evento_test', roundIndex: 0, file, noBalance: true });
};

test('griglia al numero esatto delle varianti uniche: 5 uniche → 5 celle DISTINTE', async () => {
  const out = costruisce([1, 2, 3, 4, 5], 5);
  const { decodeMsg } = g; // il builder non esporta decodeMsg: usiamo evo-grid
  const ev = await import('../tools/evo-grid.mjs');
  const top = ev.decodeMsg(out.buffer);
  const cells = top.filter((f) => f.field === 1).map((f) => Buffer.from(f.bytes).toString('hex'));
  assert.equal(cells.length, 5);
  assert.equal(new Set(cells).size, 5, '5 celle scritte: tutte BYTE-UNICHE');
  const cfg = top.filter((f) => f.field === 3)[0];
  assert.equal(Number(ev.decodeMsg(cfg.bytes).find((x) => x.field === 1).varint), 5, 'config.count = 5');
});

test('pool più ricco del necessario: celle non ripetute e count pescata dal target', async () => {
  const out = costruisce([1, 2, 3, 4, 5, 6], 5);
  const ev = await import('../tools/evo-grid.mjs');
  const top = ev.decodeMsg(out.buffer);
  const cells = top.filter((f) => f.field === 1).map((f) => Buffer.from(f.bytes).toString('hex'));
  assert.equal(cells.length, 5, 'target rispettato anche con pool da 6');
  assert.equal(new Set(cells).size, 5, 'nessuna coppia identica anche a giro del pool');
});

test('il rifiuto porta il gesto adeguato (liveries + APPLICA) nel messaggio', () => {
  let err = null;
  try { costruisce([4], 3); } catch (e) { err = e; }
  assert.ok(err, 'il template con 1 sola variante per 3 vetture è rifiutato');
  assert.match(err.message, /APPLICA/, 'il messaggio deve dire COME si sblocca');
});
