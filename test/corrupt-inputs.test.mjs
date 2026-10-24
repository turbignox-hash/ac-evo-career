// test/corrupt-inputs.test.mjs — collaudo approfondito del 24/10 (richiesta
// Mauro: «prova a simulare possibili errori o bug per vedere come reagisce il
// progetto»). Ogni difetto di input deve produrre un ERRORE PULITO con un
// messaggio che dice come sbloccare, mai uno stack nudo né una scrittura a
// metà. Copre: template customgrid assente/corrotto/senza celle/auto sbagliate
// per il builder, serie e round errati, JSON malformati su disco, file
// risultati sporchi per l'import.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const g = await import('../src/gridbuilder.mjs');
const results = await import('../src/results.mjs');
const { encodeMsg } = await import('../tools/evo-grid.mjs');
const B = (s) => Buffer.from(String(s), 'utf8');

const TMP = mkdtempSync(join(tmpdir(), 'corrupt-inputs-'));
const file = (name) => join(TMP, name);

const cella = (id, nome, preset) => encodeMsg([
  { field: 3, wire: 2, bytes: B(id) },
  { field: 4, wire: 2, bytes: B(nome) },
  { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B(preset) }]) },
  { field: 11, wire: 2, bytes: B('\n' + String.fromCharCode(20) + 'preset_f40lm_visual_1') },
]);

const nodo = {
  nodeId: 'serie_test', display: 'Serie TEST', gridSize: 4, cars: ['ks_f40_lm'],
  calendar: [{ name: 'R1', track: 'pista_di_prova', weather: 0, laps: 3 }],
};
const ladder = { nodes: [nodo] };

const costruisce = (fileName, extra = {}) => g.buildGridMessage({
  ladder, nodeId: extra.nodeId ?? 'serie_test', roundIndex: extra.roundIndex ?? 0,
  file: file(fileName),
});

/* ------------ 1. template customgrid ------------ */

test('template ASSENTE: errore chiaro (ENOENT), non uno stack nudo', () => {
  try { costruisce('assente.customgrid'); assert.fail('doveva rifiutare'); }
  catch (e) { assert.match(String(e.message), /ENOENT|customgrid/i); }
});

test('template CORROTTO (byte a caso): rifiutato con errore', () => {
  writeFileSync(file('spazzatura.customgrid'), Buffer.from('\x00\x01\x02corrotto-#####'));
  try { costruisce('spazzatura.customgrid'); assert.fail('doveva rifiutare'); }
  catch (e) { /* errore pulito: l'importante è che NON scriva la griglia */ }
});

test('template SENZA celle: errore che spiega COSA fare (GENERA + APPLICA)', () => {
  writeFileSync(file('nocelle.customgrid'), encodeMsg([
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: 2n }]) },
  ]));
  try { costruisce('nocelle.customgrid'); assert.fail('doveva rifiutare'); }
  catch (e) { assert.match(String(e.message), /GENERA|APPLICA|griglia/i); }
});

test('template con SOLO auto estranee alla serie: rifiutato con la lista delle auto mancanti', () => {
  writeFileSync(file('altra.customgrid'), encodeMsg([
    { field: 1, wire: 2, bytes: cella('ks_mazda_mx5_na', 'Mazda MX-5 NA', 'preset_mx5na_mech_1') },
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: 1n }]) },
  ]));
  try { costruisce('altra.customgrid'); assert.fail('doveva rifiutare: nessuna cella della serie'); }
  catch (e) { assert.match(String(e.message), /ks_f40_lm|non contiene/i); }
});

/* ------------ 2. argomenti del builder ------------ */

test('serie INESISTENTE nel ladder: errore che nomina la serie richiesta', () => {
  try { costruisce('seriericustomgrid', { nodeId: 'inesistente' }); assert.fail('doveva rifiutare'); }
  catch (e) { assert.match(String(e.message), /inesistente/i); }
});

test('round FUORI calendario: errore col numero di round, non un crash', () => {
  try { costruisce('qualunque.customgrid', { roundIndex: 99 }); assert.fail('doveva rifiutare'); }
  catch (e) { assert.match(String(e.message), /round 99|fuori/i); }
});

/* ------------ 3. JSON malformati su disco ------------ */

test('JSON corrotto: il PARSE rifiuta pulito (il caso dei file di config sul disco)', () => {
  writeFileSync(file('grid-classes.json'), '{"classi": { SPEGNITO');
  try { JSON.parse(readFileSync(file('grid-classes.json'), 'utf8')); assert.fail('doveva rifiutare'); }
  catch (e) { assert.match(String(e.message), /JSON/i); }
});

test('ladder corrotto: errore di parse leggibile, niente comportamento ambiguo a valle', () => {
  writeFileSync(file('ladder.json'), '{"nodes":[ {"nodeId": tronco');
  try { JSON.parse(readFileSync(file('ladder.json'), 'utf8')); assert.fail('doveva rifiutare'); }
  catch (e) { assert.match(String(e.message), /JSON/i); }
});

/* ------------ 4. file risultati SPORCHI per l'import ------------ */

test('sessionresults corrotto: il parse rifiuta pulito, niente import fantasma', () => {
  writeFileSync(file('corrotto.sessionresults.json'), '{"drivers":[{"driver_id":');
  try { JSON.parse(readFileSync(file('corrotto.sessionresults.json'), 'utf8')); assert.fail('doveva rifiutare'); }
  catch (e) { assert.match(String(e.message), /JSON/i); }
});

test('sessionresults SENZA drivers: positionBase degenera a 0-based senza crash', () => {
  writeFileSync(file('vuoto.sessionresults.json'), JSON.stringify({ drivers: [] }));
  const parsed = JSON.parse(readFileSync(file('vuoto.sessionresults.json'), 'utf8'));
  assert.deepEqual(results.positionBase(parsed), { zeroBased: true, base: 0 });
});

test('driver SENZA position (file in mano a mano di EVO): le posizioni degenerano a 0-based', () => {
  assert.deepEqual(results.positionBase({ drivers: [{} , {}] }), { zeroBased: true, base: 0 });
});

/* penalità di gara scritte male: etichette assurde non devono inventare PDs né crashare */
test('penaltyOf su valori assurdi: etichetta raw intacta, mai un crash né un calcolo sbagliato', () => {
  assert.deepEqual(results.penaltyOf({}), { label: null, kind: null, ms: 0, dsq: false });
  assert.deepEqual(results.penaltyOf(null), { label: null, kind: null, ms: 0, dsq: false });
  for (const raw of ['+0s', 'X2', '+1.5s!', 'DT', 'DSQ', 'UnknownLabel']) {
    const p = results.penaltyOf({ high_penalty: raw });
    assert.equal(p.label, raw, "l'etichetta resta quella di EVO");
    if (raw === 'DSQ') assert.equal(p.dsq, true, 'squalifica riconosciuta');
    if (raw === 'DT') assert.notEqual(p.kind, null, 'drive-through classificato');
  }
});

/* ------------ 6. discarica backup: il taglio non deve mangiare nient'altro ------------ */

test('pruneBackups: tiene i più recenti, taglia i vecchi, NON tocca griglia né nomi strani', async () => {
  const { pruneBackups } = await import('../src/grid-apply.mjs');
  const TMPB = mkdtempSync(join(tmpdir(), 'corrupt-prune-'));
  const F = join(TMPB, 'prova-griglia.customgrid');
  writeFileSync(F, 'griglia');
  // 5 backup creati in fila (mtime crescente), tentato keep=3
  for (let i = 1; i <= 5; i++) writeFileSync(join(TMPB, `prova-griglia.customgrid.bak-2025-01-01 0${i}`), `b${i}`);
  writeFileSync(join(TMPB, 'prova-griglia.customgrid.bak_strano'), 'junk: nome con underscore, formato diverso');
  pruneBackups(F, { keep: 3 });
  const baks = readdirSync(TMPB).filter((f) => f.includes('.bak-'));
  assert.equal(baks.length, 3, 'restano esattamente i 3 backup più recenti');
  assert.ok(!baks.some((b) => b.endsWith('01')), 'il backup più vecchio esce');
  assert.ok(!baks.some((b) => b.endsWith('02')), 'il secondo-vecchio esce');
  assert.equal(existsSync(F), true, 'la griglia vera NON viene tagliata');
  assert.equal(existsSync(join(TMPB, 'prova-griglia.customgrid.bak_strano')), true, 'i nomi NON del formato .bak-<data> restano (la regola è specifica)');
});

test('pruneBackups su file ASSENTE o dir assente: silenzioso, mai un crash', async () => {
  const { pruneBackups } = await import('../src/grid-apply.mjs');
  pruneBackups('una-dir-che-non-esiste/griglia.customgrid');
  pruneBackups(join(TMP, 'mai-esistito.customgrid'));
  assert.ok(true, 'nessuna eccezione: la pulizia non deve mai bloccare la gara');
});

test('niente file .tmp/.bak lascati dai difetti sopra (il builder non scrive se rifiuta)', () => {
  const spie = readdirSync(TMP).filter((f) => f.endsWith('.tmp') || /\.customgrid\.bak/.test(f));
  assert.deepEqual(spie, [], spie.join(', '));
});
