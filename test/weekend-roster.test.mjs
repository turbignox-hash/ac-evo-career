// weekend-roster.test.mjs — IL TRAPIANTO DELLE CELLE NEL WEEKEND (29/10).
// Fixture sintetica del gamemodesave RACE_WEEKEND (stessi encoder del progetto):
// un blocco sessione «Practice» con N slot-cella (sub 10, stessa forma reale:
// sub 3 carId + sub 10 preset) e un blocco «Race» SENZA celle (come osservato
// nel file vero: il gioco se le fabbrica da solo). Verifica:
//   1. syncRoster monta le prime slot celle del pool nei blocchi-celle,
//      mantenendo il numero di slot e non toccando i blocchi senza celle
//   2. idempotenza (già uguali → written:false)
//   3. celle < slot → niente ripetizioni (lezione crash): non toccato
//   4. dry: solo report, file intatto
//   5. rosterInfo legge lo stato (null senza roster)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { encodeMsg } from '../tools/evo-grid.mjs';
import { syncRoster, rosterInfo, celleDiGrid } from '../src/weekend-roster.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'evo-roster-'));

const cella = (carId, preset) => encodeMsg([
  { field: 3, wire: 2, bytes: Buffer.from(carId, 'utf8') },
  { field: 4, wire: 2, bytes: Buffer.from(carId.toUpperCase(), 'utf8') },
  { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: Buffer.from(preset, 'utf8') }]) },
]);
const bloccoSessione = (nome, slot = [], declared = 14) => encodeMsg([
  { field: 1, wire: 2, bytes: Buffer.from(nome, 'utf8') },
  { field: 7, wire: 0, varint: BigInt(declared) },
  ...slot.map((c) => ({ field: 10, wire: 2, bytes: c })),
]);

const mkWeekend = ({ slot = 3 } = {}) => {
  const roster = bloccoSessione('Practice', Array.from({ length: slot }, () => cella('ks_caterham_485_csr', 'preset_cat_mech_1')), 14);
  const race = bloccoSessione('Race', [], 15);
  const file = join(TMP, `wk-${Math.random().toString(36).slice(2)}.gamemodesave`);
  writeFileSync(file, encodeMsg([
    { field: 2, wire: 0, varint: BigInt(3) },   // campo extra di primo livello: non è un roster
    { field: 3, wire: 2, bytes: roster },
    { field: 3, wire: 2, bytes: race },
  ]));
  return file;
};
const pool = [
  cella('ks_ford_escort_rs_cosworth', 'preset_escortrs_mech_1'),
  cella('ks_renault_5_gt_turbo', 'preset_r5gt_mech_1'),
  cella('ks_ford_escort_rs_cosworth', 'preset_escortrs_mech_2'),
];

const carIdDi = (file, nome) => rosterInfo(file)?.blocchi?.find((b) => b.nome === nome)?.carId ?? [];
// nel test il gioco può essere APERTO (come nel vero EVO di Mauro): tutte le
// scritture passano da force:true, lo stesso schema delle prove istant-race

test('syncRoster monta le prime slot celle del pool nei blocchi-celle, gli altri blocchi restano', () => {
  const file = mkWeekend({ slot: 3 });
  const r = syncRoster(pool, { file, force: true });
  assert.equal(r.written, true);
  assert.ok(r.backup?.includes('bak-roster-'), 'backup datato scritto');
  assert.deepEqual(carIdDi(file, 'Practice'), [
    'ks_ford_escort_rs_cosworth', 'ks_renault_5_gt_turbo', 'ks_ford_escort_rs_cosworth',
  ]);
  // il blocco Race (0 celle): non toccato, non è comparso un roster spurio
  assert.equal(carIdDi(file, 'Race').length, 0);
  // i blocchi-celle restano decodificabili col conteggio invariato
  assert.deepEqual(rosterInfo(file).blocchi.map((b) => b.slot), [3]);
});

test('syncRoster è idempotente: già allineato → written:false, nessun backup nuovo', () => {
  const file = mkWeekend({ slot: 3 });
  syncRoster(pool, { file, force: true });
  const prima = readdirSync(TMP).length;
  const secondo = syncRoster(pool, { file, force: true });
  assert.equal(secondo.written, false);
  assert.ok(secondo.nota?.includes('idempotente'));
  assert.equal(readdirSync(TMP).length, prima, 'nessun backup aggiuntivo');
});

test('syncRoster con meno celle degli slot NON ripete celle (lezione crash): blocco intatto', () => {
  const file = mkWeekend({ slot: 3 });
  const before = readFileSync(file);
  const due = pool.slice(0, 2);
  const r = syncRoster(due, { file, force: true });
  assert.equal(r.written, false);
  assert.ok(r.blocchi?.some((b) => b.nota?.includes('non toccato')));
  assert.deepEqual(readFileSync(file), before, 'file intatto');
});

test('dry: solo report, niente scrittura né backup', () => {
  const file = mkWeekend({ slot: 3 });
  const before = readFileSync(file);
  const r = syncRoster(pool, { file, dry: true });
  assert.equal(r.written, false);
  assert.deepEqual(readFileSync(file), before, 'file intatto');
  // i bak-roster di ALTRI test nella stessa cartella non contano: vale il basename di QUESTO file
  assert.ok(!readdirSync(TMP).some((n) => n.startsWith(basename(file) + '.bak-roster-')));
});

test('rosterInfo: null su un weekend senza blocchi-celle', () => {
  const file = join(TMP, `vuoto-${Math.random().toString(36).slice(2)}.gamemodesave`);
  writeFileSync(file, bloccoSessione('Practice', [], 14)); // 0 slot: nessun roster
  assert.equal(rosterInfo(file), null);
});

test('celleDiGrid estrae le celle (field 1 ripetuto) di un customgrid', () => {
  const buf = encodeMsg([
    { field: 1, wire: 2, bytes: cella('ks_a', 'preset_a1') },
    { field: 1, wire: 2, bytes: cella('ks_b', 'preset_b1') },
    { field: 9, wire: 0, varint: BigInt(1) },
  ]);
  assert.equal(celleDiGrid(buf).length, 2);
});

test('syncRoster rifiuta celle assenti o file illeggibile senza toccare nulla', () => {
  const file = mkWeekend({ slot: 3 });
  const before = readFileSync(file);
  assert.throws(() => syncRoster([], { file }), /servono le celle/);
  assert.throws(() => syncRoster(pool, { file: join(TMP, 'inesistente.gamemodesave'), force: true }), /weekend illeggibile|ENOENT/);
  assert.deepEqual(readFileSync(file), before, 'file intatto');
});
