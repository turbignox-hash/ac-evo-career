// 25/10 — installazione pulita: il dizionario personale delle auto (map.json)
// era stato azzerato e il Prepara non scriveva più l'auto. L'apprendimento a
// fine gara (learnCar) lo ricostruisce da solo; qui lo proviamo come vengono
// usati: non tocca MAI il data/ reale (mapFile e garage sono file di test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { garageBuf } from '../tools/set-driver-car.mjs';
import { decodeGarage, learnCar, learnCarFromLogs, soloRaddoppio } from '../tools/set-car-sample.mjs';

function casa() {
  const dir = mkdtempSync(join(tmpdir(), 'learn-car-'));
  return {
    garage: join(dir, 'garage.drivergarage'),
    map: join(dir, 'map.json'),
  };
}

test('learnCar: coppio del garage riconosciuta col nome dal file risultati', () => {
  const { garage, map } = casa();
  writeFileSync(garage, garageBuf('0x1234', '0x5678'));
  const out = learnCar('Abarth 695 Biposto', { garage, mapFile: map });
  assert.equal(out?.learned, true);
  // la chiave è quella di decodeGarage: hash e guid2 sistimati su 16 cifre hex
  const { carHash, guid2 } = decodeGarage(readFileSync(garage));
  assert.equal(out.key, `${carHash}|${guid2}`);
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.equal(entries[`${carHash}|${guid2}`], 'Abarth 695 Biposto');
});

test('learnCar: NON riscrive una coppia già mappata (idempotente)', () => {
  const { garage, map } = casa();
  writeFileSync(garage, garageBuf('0xdead', '0xbeef'));
  assert.equal(learnCar('Opel Corsa', { garage, mapFile: map })?.learned, true);
  assert.equal(learnCar('Opel Corsa', { garage, mapFile: map }), null);
  const { carHash, guid2 } = decodeGarage(readFileSync(garage));
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.deepEqual(entries[`${carHash}|${guid2}`], 'Opel Corsa');
});

test('learnCar: garage vergine o assente → non impara niente, non esplode', () => {
  const { garage, map } = casa();
  assert.equal(learnCar('Fiat 500', { garage, mapFile: map }), null);   // file assente
  assert.equal(learnCar('Fiat 500', { garage, mapFile: map }), null);   // e di nuovo senza ingorghi
});

test('learnCar: nome mancante → nulla da mappare', () => {
  const { garage, map } = casa();
  writeFileSync(garage, garageBuf('0x1', '0x2'));
  assert.equal(learnCar(null, { garage, mapFile: map }), null);
  assert.equal(learnCar('', { garage, mapFile: map }), null);
  assert.equal(learnCar('', { garage, mapFile: map }), null);
});

// 31/10 — formato 3: lo spawn del player dichiara la coppia del garage
// ("[ServerVehicleSystem][coppia] Creating Car (Mauro …") e la stessa coppia
// sale su "Loaded car <coppia> (ks_…)": deve impararla anche se la coppia NON
// è in data/car-guids.json (le uniche Mini/911 del gioco non ci sono mai state).
test('learnCarFromLogs: spawn player viene dimenticata anche se fuori tabella ufficiale', () => {
  const { map } = casa();
  const dir = mkdtempSync(join(tmpdir(), 'learn-logs-'));
  writeFileSync(join(dir, 'log-prova.txt'),
    '[2026-10-31 16:00:00.000] [server] [info] [C:1|G:0] [ServerVehicleSystem][deadbeefcafe0001-feedface12340001] Creating Car (Mauro Turbigno\t76561198040513102)\r\n' +
    '[2026-10-31 16:00:01.000] [dataUtils] [info] Loaded car deadbeefcafe0001-feedface12340001 (ks_mini_jcs_1990)\r\n');
  const out = learnCarFromLogs({ logsDir: dir, mapFile: map });
  assert.equal(out.added, 1);
  assert.deepEqual(out.voci, [{ label: 'Mini Jcs 1990', key: '0xDEADBEEFCAFE0001|0xFEEDFACE12340001' }]);
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.equal(entries['0xDEADBEEFCAFE0001|0xFEEDFACE12340001'], 'Mini Jcs 1990');
  // idempotente: secondo giro non aggiunge nulla
  assert.equal(learnCarFromLogs({ logsDir: dir, mapFile: map }).added, 0);
});

// 3/11 — auto-correzione: una voce già in dizionario che i log CONTRADDICONO
// (nessun token in comune, come la Audi R8 GT4 firmata «Kunos Abarth 695 Biposto»
// dal campionatore a mano) viene rietichettata col nome vero dai log; i sinonimi
// legittimi (stessa auto, etichetta diversa ma con token in comune) restano com'erano.
test('learnCarFromLogs: etichetta contraddetta dai log viene corretta, il sinonimo resta', () => {
  const { map } = casa();
  const dir = mkdtempSync(join(tmpdir(), 'learn-logs-'));
  const chiave = '0x47E9D2CE3DC1C366|0x432F24BD6F41ED82';   // Audi R8 LMS GT4 Evo
  writeFileSync(map, JSON.stringify({ entries: { [chiave]: 'Kunos Abarth 695 Biposto' } }));
  writeFileSync(join(dir, 'log-prova.txt'),
    '[2026-11-02 15:23:00.000] [dataUtils] [info] Loaded car 47e9d2ce3dc1c366-432f24bd6f41ed82 (ks_audi_r8_lms_gt4_evo)\r\n');
  const out = learnCarFromLogs({ logsDir: dir, mapFile: map });
  assert.equal(out.added, 0);
  assert.equal(out.corrette, 1);
  assert.deepEqual(out.voci, [{ label: 'Audi R8 Lms Gt4 Evo', key: chiave, correttaDa: 'Kunos Abarth 695 Biposto' }]);
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.equal(entries[chiave], 'Audi R8 Lms Gt4 Evo');
  // il sinonimo legittimo NON si tocca: stessa auto nei log, etichetta a token in comune
  writeFileSync(map, JSON.stringify({ entries: { [chiave]: 'Audi R8 LMS GT4 Evo' } }));
  assert.equal(learnCarFromLogs({ logsDir: dir, mapFile: map }).corrette, 0);
});

/* ---------- 3/11 — la regola del raddoppio ----------
 * Il gioco scrive IN CHIARO <Saved Games>\ACE\ui_storage.uistorage con il
 * registro delle auto: per ogni auto toccata dal menu car_guid (la GUID
 * stabile SDOPPIATA = chiave del garage) + display_name (il nome UFFICIALE).
 * Le fixture ricostruiscono il protobuf con encodeMsg sullo stesso formato:
 * entry { 1: chiave, 2: valore } ripetute al top level.
 */
test('soloRaddoppio: raddoppio sì, rumore no, già pulita no', () => {
  assert.equal(soloRaddoppio('Mazda MX-5 ND Cup', 'Mazda Mazda MX-5 ND Cup'), true);
  assert.equal(soloRaddoppio('Abarth 695 Biposto', 'Kunos Abarth 695 Biposto'), false); // fogna: token estraneo
  assert.equal(soloRaddoppio('Mazda MX-5 ND Cup', 'Mazda MX-5 ND Cup'), false);           // già pulita
});
