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

/** cella minima come la scrive il gioco: 3 id + 4 nome + 10 preset mec + 11 visual.
 *  Il f42 float (10.x) è il campo faro dell'ARMONICA: le celle reali della CSL
 *  lo hanno (dump: 10.0000191) — per i cloni matematici serve un bersaglio float. */
const cella = (id, nome, preset, visual) => {
  const f = Buffer.alloc(4); f.writeFloatLE(10.000019073486328, 0);
  return encodeMsg([
    { field: 3, wire: 2, bytes: B(id) },
    { field: 4, wire: 2, bytes: B(nome) },
    { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B(preset) }]) },
    { field: 11, wire: 2, bytes: B('\n' + String.fromCharCode(visual.length + 0x10) + visual) },
    { field: 42, wire: 5, bytes: f },
  ]);
};
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
  // con l'armonica di default il rifiuto resta solo per il nodo dichiarato
  // "armonica": false (o senza float utile nel template): qui il primo caso
  const fixtureCls = join(TMP, 'grid-classes-off-rifiuto.json');
  writeFileSync(fixtureCls, JSON.stringify({ classi: { evento_test: { armonica: false } } }));
  const primaEnv = process.env.EVO_CLASSES_FILE;
  process.env.EVO_CLASSES_FILE = fixtureCls;
  try {
    let err = null;
    try { costruisce([4], 3); } catch (e) { err = e; }
    assert.ok(err, 'il template con 1 sola variante per 3 vetture è rifiutato');
    assert.match(err.message, /APPLICA/, 'il messaggio deve dire COME si sblocca');
  } finally {
    if (primaEnv === undefined) delete process.env.EVO_CLASSES_FILE; else process.env.EVO_CLASSES_FILE = primaEnv;
  }
});

test('ARMONICA (default per tutte le serie): pool corto senza voce in grid-classes.json → cloni byte-distinti', async () => {
  // il nodo NON è in classi: con l'armonica di default (24/10 sera, «applica
  // dappertutto») il pool corto si completa con cloni, senza alcuna config
  const fixtureCls = join(TMP, 'grid-classes-armonica.json');
  writeFileSync(fixtureCls, JSON.stringify({ classi: {} }));
  const primaEnv = process.env.EVO_CLASSES_FILE;
  process.env.EVO_CLASSES_FILE = fixtureCls;
  try {
    const out = costruisce([1, 2], 4);   // 2 reali + 2 cloni armonici
    const ev = await import('../tools/evo-grid.mjs');
    const top = ev.decodeMsg(out.buffer);
    const celle = top.filter((f) => f.field === 1).map((f) => Buffer.from(f.bytes).toString('hex'));
    assert.equal(celle.length, 4, 'campo pieno a 4');
    assert.equal(new Set(celle).size, 4, 'cloni REQUIRED byte-distinti: niente paia identiche (crash 23/10)');
    assert.equal(out.report.armonica, 2, 'nel report contati i cloni');
    // il clono resta la STESSA vettura (carId e preset invariati)
    const hexOf = (h) => Buffer.from(h, 'hex');
    const carIdOf = (b) => { for (const g of ev.decodeMsg(b)) if (g.field === 3) return g.bytes.toString(); return null; };
    const ids = celle.map((h) => carIdOf(hexOf(h)));
    assert.ok(ids.every((x) => x === 'ks_f40_lm'), 'i cloni restano nella serie');
  } finally {
    if (primaEnv === undefined) delete process.env.EVO_CLASSES_FILE; else process.env.EVO_CLASSES_FILE = primaEnv;
  }
});

test('ARMONICA spenta PER SERIE con "armonica": false: il rifiuto col gesto APPLICA resta', () => {
  // l'opt-out è l'unico modo per tornare al comportamento vecchio
  const fixtureCls = join(TMP, 'grid-classes-off.json');
  writeFileSync(fixtureCls, JSON.stringify({ classi: { evento_test: { armonica: false } } }));
  const primaEnv = process.env.EVO_CLASSES_FILE;
  process.env.EVO_CLASSES_FILE = fixtureCls;
  try {
    let err = null;
    try { costruisce([4], 5); } catch (e) { err = e; }
    assert.ok(err, 'armonica:false esplicito + 1 sola variante → rifiuto');
    assert.match(err.message, /APPLICA/);
  } finally {
    if (primaEnv === undefined) delete process.env.EVO_CLASSES_FILE; else process.env.EVO_CLASSES_FILE = primaEnv;
  }
});
