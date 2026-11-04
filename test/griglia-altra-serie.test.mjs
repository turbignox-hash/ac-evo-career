// Regressione P0.3 (4/11, richiesta Mauro: «procedi» dopo la scansione —
// «Griglia fuori serie: Hyper_road a Imola, GT3 RS contro Hyundai/GR86/MX-5»).
// La vigia della card e il preflight del Prepara usano UNA funzione sola:
// torna i nomi sul disco quando NESSUNA auto è nel parco ammesso della ronda.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'altra-serie-'));
const ev = await import('../tools/evo-grid.mjs');
const { grigliaDiAltraSerie } = await import('../src/grid-apply.mjs');
const { encodeMsg } = ev;
const B = (s) => Buffer.from(String(s), 'utf8');
const cella = (carId, nome, i) => encodeMsg([
  { field: 3, wire: 2, bytes: B(carId) },
  { field: 4, wire: 2, bytes: B(nome) },
  { field: 7, wire: 0, varint: BigInt(i + 1) },
]);
const griglia = (auto) => encodeMsg(auto.map(([id, nome], i) => ({ field: 1, wire: 2, bytes: cella(id, nome, i) })));
const scrivi = (auto) => {
  const f = join(TMP, 'g.customgrid');
  writeFileSync(f, griglia(auto));
  return f;
};

test('nessuna auto del parco: torna i nomi sul disco (la vigia parla)', () => {
  const f = scrivi([['ks_mazda_mx5_nd', 'Mazda MX-5 ND'], ['ks_audi_rs_3_sportback', 'Audi RS 3 Sportback']]);
  assert.deepEqual(grigliaDiAltraSerie(f, ['Hyundai i30 N', 'Toyota GR86']), ['Mazda MX-5 ND', 'Audi RS 3 Sportback']);
});

test('una sola auto del parco basta: silenzio', () => {
  const f = scrivi([['ks_mazda_mx5_nd', 'Mazda MX-5 ND'], ['ks_audi_rs_3_sportback', 'Audi RS 3 Sportback']]);
  assert.equal(grigliaDiAltraSerie(f, ['Audi RS 3 Sportback']), null);
});

test('confronto senza maiuscole e spazi: la stessa auto non allarma', () => {
  const f = scrivi([['ks_mazda_mx5_nd', '  Mazda MX-5 ND ']]);
  assert.equal(grigliaDiAltraSerie(f, ['mazda mx-5 nd']), null);
});

test('file assente, parco vuoto o griglia vuota: nessun blocco', () => {
  assert.equal(grigliaDiAltraSerie(join(TMP, 'manca.customgrid'), ['Audi RS 3 Sportback']), null);
  const f = scrivi([['ks_mazda_mx5_nd', 'Mazda MX-5 ND']]);
  assert.equal(grigliaDiAltraSerie(f, []), null);
  const v = join(TMP, 'vuota.customgrid');
  writeFileSync(v, encodeMsg([]));
  assert.equal(grigliaDiAltraSerie(v, ['Audi RS 3 Sportback']), null);
});

after(() => rmSync(TMP, { recursive: true, force: true }));
