// 4/11 — IL REGISTRO DELLE SCRITTURE DEL BOLLETTINO. src/wx-registro.mjs tiene
// su data/wx-auto.jsonl UNA voce per scrittura riuscita (quando, perché, che
// cosa) e la API/GUI la legge dal più recente. Qui niente disco vero:
// EVO_DATA_DIR redirige data/ verso un tmpdir (stessa via dei test wx-auto).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-wxreg-data-'));
const { registra, leggi } = await import('../src/wx-registro.mjs');

test('senza registro: leggi torna vuoto, non lancia', () => {
  assert.deepEqual(leggi(), { voci: [], total: 0 });
});

test('una scrittura riuscita: UNA voce, dal più recente', () => {
  registra({ at: '2026-11-04T10:00:00.000Z', via: 'cambio-ronda', sessione: 'Practice', preset: 2, label: 'Nuvoloso', from: 4, file: null });
  const r = leggi();
  assert.equal(r.total, 1);
  assert.equal(r.voci[0].via, 'cambio-ronda');
  assert.equal(r.voci[0].sessione, 'Practice');
  assert.equal(r.voci[0].preset, 2);
});

test("due voci: la prima letta È l'ultima scritta (ordine dal più recente)", () => {
  registra({ at: '2026-11-04T10:05:00.000Z', via: 'fine-sessione', sessione: 'Qualifying', preset: 3, label: 'Coperto', from: 2, file: '261104-103000_SP_Practice.sessionresults.json' });
  const r = leggi();
  assert.equal(r.total, 2);
  assert.equal(r.voci[0].via, 'fine-sessione', 'la più recente in cima');
  assert.equal(r.voci[1].via, 'cambio-ronda');
  assert.equal(r.voci[0].file?.startsWith('261104'), true, 'il file che ha innescato');
});

test('il taglio oltre cap: le vecchie vanno, il total si restringe', () => {
  for (let i = 0; i < 320; i++) registra({ at: new Date(2026, 10, 4, 10, i).toISOString(), via: 'fine-sessione', sessione: 'Qualifying', preset: 3, label: 'Coperto', from: 2, file: null });
  const r = leggi();
  assert.ok(r.total <= 300, `il cap taglia: ${r.total}`);
  assert.equal(r.voci[0].via, 'fine-sessione', 'le ultime restano');
});

test('voce rotta sul disco: si salta, la lettura tace', async () => {
  // appende una riga non-JSON direttamente sul file del registro
  const { appendFileSync } = await import('node:fs');
  appendFileSync(join(process.env.EVO_DATA_DIR, 'wx-auto.jsonl'), '{riga rotta\n', 'utf8');
  const r = leggi({ n: 15 });
  assert.ok(r.voci.length >= 1, 'le voci buone restano leggibili');
  assert.equal(r.voci.some((v) => !v || typeof v !== 'object' || !v.via), false, 'la riga rotta non entra nelle voci');
});
