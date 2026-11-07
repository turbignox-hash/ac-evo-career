// dedupe-piloti-nome.test.mjs — l'identità di un pilota è ID **E** nome (7/11).
//
// Il guasto vero, letto in data/errors.jsonl: nei file risultato il gioco
// scrive lo stesso `driver_id` segnaposto per TUTTI (`{a:0,b:0}`), e il dedupe
// che si fidava del solo id fondeva 15 piloti in uno — «14 doppie: tenute 1 di
// 15». Da lì rivali, podi, classifiche e forma leggevano una gara con un solo
// pilota.
//
// Qui si prova la regola nuova nel suo punto esatto: due righe sono la stessa
// persona solo con lo STESSO id e lo STESSO nome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// il registro deve restare fuori dai dati veri (regola EVO_DATA_DIR della casa)
const dataDir = mkdtempSync(join(tmpdir(), 'evo-dedupe-'));
process.env.EVO_DATA_DIR = dataDir;

const { dedupeDriverDiRiga } = await import('../src/results.mjs');

const riga = (n, nome, cognome, id = { a: 0, b: 0 }) => ({
  position: n, driver_name: nome, driver_surname: cognome, driver_id: id,
});

test('id segnaposto uguale per tutti: i piloti restano TUTTI (niente fusione)', () => {
  // quindici piloti diversi, tutti con lo stesso `driver_id {a:0,b:0}`: è il
  // caso vero del registro. Nessuna riga deve sparire.
  const drivers = Array.from({ length: 15 }, (_, i) => riga(i + 1, `Pilota${i + 1}`, 'Prova'));
  const esito = dedupeDriverDiRiga({ session: 'Race', drivers });
  assert.equal(esito.drivers.length, 15, `tenuti ${esito.drivers.length} di 15`);
  assert.equal(esito._driverDuplicati, undefined, 'nessuna doppia da dichiarare');
  assert.equal(esito, esito, 'il risultato resta leggibile');
});

test('long protobuf: si legge da low/high, non collassa tutto su «[object Object]»', () => {
  // il long del protobuf arriva come oggetto: String() darebbe "[object Object]"
  // per tutti, cioè la stessa identità per gente diversa. Ora il long si legge.
  const uno = { a: { low: 1, high: 0 }, b: { low: 2, high: 0 } };
  const due = { a: { low: 9, high: 0 }, b: { low: 2, high: 0 } };
  const drivers = [riga(1, 'Alfa', 'Uno', uno), riga(2, 'Beta', 'Due', due)];
  const esito = dedupeDriverDiRiga({ drivers });
  assert.equal(esito.drivers.length, 2, 'due long diversi = due piloti');
  // e lo STESSO long resta la stessa persona anche con un nickname diverso
  const terzo = dedupeDriverDiRiga({ drivers: [riga(1, 'Alfa', 'Uno', uno), riga(2, 'Alfa', 'Uno (nick)', uno)] });
  assert.equal(terzo.drivers.length, 1, 'stesso id = stessa persona, nickname o no');
});

test('la doppia vera (stesso id E stesso nome) si fonde: resta la prima posizione', () => {
  // il caso di Brands Hatch: lo stesso pilota su P0, P1 e P2.
  const id = { a: 123456, b: 0 };
  const drivers = [
    riga(1, 'Adrian', 'Palmer', id),
    riga(2, 'Adrian', 'Palmer', id),
    riga(3, '• Adrian', 'Palmer', id),   // la stessa persona con la pallina degli AI
    riga(4, 'Bruno', 'Verdi', { a: 777, b: 0 }),
  ];
  const esito = dedupeDriverDiRiga({ drivers });
  assert.equal(esito.drivers.length, 2, `tenute ${esito.drivers.length} righe (Adrian + Bruno)`);
  assert.equal(esito.drivers[0].position, 1, 'resta la riga alla posizione migliore');
  assert.equal(esito._driverDuplicati, 2, 'due righe doppie dichiarate');
});

test('stesso id VERO con due nickname = un pilota solo (regola di casa)', () => {
  // l'identità del gioco sopravvive al cambio nickname: un id vero non si
  // mette in discussione. È il motivo per cui il rimedio non è «id + nome».
  const id = { a: 42, b: 7 };
  const drivers = [riga(1, 'Carlo', 'Rossi', id), riga(2, 'Dario', 'Bianchi', id)];
  const esito = dedupeDriverDiRiga({ drivers });
  assert.equal(esito.drivers.length, 1, 'stesso id = stessa persona');
});

test('righe senza id e senza nome restano tutte', () => {
  const drivers = [riga(1, '', ''), riga(2, '', '')];
  const esito = dedupeDriverDiRiga({ drivers });
  assert.equal(esito.drivers.length, 2, 'senza identità non si taglia niente');
});

test('file risultato vero: si legge dal disco e i 15 piloti restano', async () => {
  const { readSessionResult } = await import('../src/results.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'evo-result-'));
  const file = join(dir, 'prova.sessionresults.json');
  const drivers = Array.from({ length: 15 }, (_, i) => riga(i + 1, `Pilota${i + 1}`, 'Cup'));
  writeFileSync(file, JSON.stringify({ session: 'Race', track: 'Monza', drivers }), 'utf8');
  const letto = readSessionResult(file);
  assert.equal(letto.drivers.length, 15, `dal disco: ${letto.drivers.length} piloti`);
});
