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
import { encodeMsg } from '../tools/evo-grid.mjs';
import { decodeGarage, learnCar, learnCarFromLogs, learnCarFromPaddock, learnCarFromStorage, soloRaddoppio } from '../tools/set-car-sample.mjs';

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

/* ---------- 3/11 — la FATTORIA: ui_storage.uistorage ----------
 * Il gioco scrive IN CHIARO <Saved Games>\ACE\ui_storage.uistorage con il
 * registro `paddock.skins`: per ogni auto toccata dal menu car_guid (la GUID
 * stabile SDOPPIATA = chiave del garage) + display_name (il nome UFFICIALE).
 * Le fixture ricostruiscono il protobuf con encodeMsg sullo stesso formato:
 * entry { 1: chiave, 2: valore } ripetute al top level.
 */
function scriviStorage(dir, skinsObj) {
  const pack = JSON.stringify({ __Type: 'CarModel', car_guid: skinsObj.car_guid, display_name: skinsObj.display_name });
  const carrozza = JSON.stringify({ [skinsObj.carId]: { name: skinsObj.carId, preset: skinsObj.preset ?? 'preset_x_1', pack } });
  const voce = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('paddock.skins') },
    { field: 2, wire: 2, bytes: Buffer.from(carrozza, 'utf8') },
  ]);
  const file = join(dir, 'ui_storage.uistorage');
  writeFileSync(file, encodeMsg([{ field: 1, wire: 2, bytes: voce }]));
  return file;
}

test('learnCarFromStorage: la fattoria insegna le coppie COL NOME UFFICIALE del gioco', () => {
  const { map } = casa();
  const dir = mkdtempSync(join(tmpdir(), 'learn-storage-'));
  const file = scriviStorage(dir, { carId: 'ks_mini_jcs_1990', car_guid: '4b469bb0-95b3-9c00-2504-2e0de6e573ba', display_name: 'Mini John Cooper S' });
  const out = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.equal(out.checked, true);
  assert.equal(out.added, 1);
  assert.deepEqual(out.voci, [{ label: 'Mini John Cooper S', key: '0x4B469BB095B39C00|0x25042E0DE6E573BA' }]);
  const entries = JSON.parse(readFileSync(map, 'utf8')).entries;
  assert.equal(entries['0x4B469BB095B39C00|0x25042E0DE6E573BA'], 'Mini John Cooper S');
  // idempotente: al secondo giro la voce c'è già, niente da aggiungere
  const dopo = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.equal(dopo.added, 0);
  assert.equal(dopo.corrette, 0);
  assert.deepEqual(dopo.voci, []);
});

test('learnCarFromStorage: l\'etichetta di test (Audi firmata «Kunos Abarth 695 Biposto») viene corretta COL NOME DEL GIOCO, il sinonimo resta', () => {
  const { map } = casa();
  const dir = mkdtempSync(join(tmpdir(), 'learn-storage-audi-'));
  const file = scriviStorage(dir, { carId: 'ks_audi_r8_lms_gt4_evo', car_guid: '47e9d2ce-3dc1-c366-432f-24bd6f41ed82', display_name: 'Audi R8 LMS GT4 Evo' });
  // 1) contraddizione: etichetta a mano senza token in comune → corretta
  const chiave = '0x47E9D2CE3DC1C366|0x432F24BD6F41ED82';
  writeFileSync(map, JSON.stringify({ entries: { [chiave]: 'Kunos Abarth 695 Biposto' } }));
  const out = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.equal(out.added, 0);
  assert.equal(out.corrette, 1);
  assert.deepEqual(out.voci, [{ label: 'Audi R8 LMS GT4 Evo', key: chiave, correttaDa: 'Kunos Abarth 695 Biposto' }]);
  assert.equal(JSON.parse(readFileSync(map, 'utf8')).entries[chiave], 'Audi R8 LMS GT4 Evo');
  // 2) sinonimo legittimo (stessa auto, stessi token nel nome): resta COM'ERA
  writeFileSync(map, JSON.stringify({ entries: { [chiave]: 'Audi R8 LMS GT4 Evo' } }));
  const ripeto = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.equal(ripeto.corrette, 0);
  assert.deepEqual(ripeto.voci, []);
});

test('learnCarFromStorage: il nome ufficiale RIPULISCE il token raddoppiato (Mazda Mazda → Mazda)', () => {
  const { map } = casa();
  const dir = mkdtempSync(join(tmpdir(), 'learn-storage-doppio-'));
  const file = scriviStorage(dir, { carId: 'ks_mazda_mx5_nd_cup', car_guid: '4d7192d1-ddfe-4587-06a7-bd12616e7d90', display_name: 'Mazda MX-5 ND Cup' });
  // la voce vecchia portava il marchio DOPPIO (firma del necessario a mano)
  writeFileSync(map, JSON.stringify({ entries: { '0x4D7192D1DDFE4587|0x06A7BD12616E7D90': 'Mazda Mazda MX-5 ND Cup' } }));
  const out = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.equal(out.checked, true);
  assert.equal(out.added, 0);
  assert.equal(out.corrette, 0);
  assert.equal(out.aggiornate, 1);
  assert.deepEqual(out.voci, [{ label: 'Mazda MX-5 ND Cup', key: '0x4D7192D1DDFE4587|0x06A7BD12616E7D90', insiemeDa: 'Mazda Mazda MX-5 ND Cup' }]);
  assert.equal(JSON.parse(readFileSync(map, 'utf8')).entries['0x4D7192D1DDFE4587|0x06A7BD12616E7D90'], 'Mazda MX-5 ND Cup');
  // idempotente: al secondo giro l'etichetta è già quella ufficiale
  const dopo = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.equal(dopo.aggiornate, 0);
  assert.deepEqual(dopo.voci, []);
});

test('learnCarFromStorage: il rumore che il gioco non ha (es. «Kunos») NON tocca l\'etichetta', () => {
  const { map } = casa();
  const dir = mkdtempSync(join(tmpdir(), 'learn-storage-rumore-'));
  const file = scriviStorage(dir, { carId: 'ks_abarth_695_biposto', car_guid: '4234eca9-2f96-742a-56ce-d7fb06ab0e8a', display_name: 'Abarth 695 Biposto' });
  // «Kunos» è un token che solo la voce a mano ha: non è un raddoppio,
  // la voce resta COM'ERA (solo la contraddizione secca dai log la corregge).
  writeFileSync(map, JSON.stringify({ entries: { '0x4234ECA92F96742A|0x56CED7FB06AB0E8A': 'Kunos Abarth 695 Biposto' } }));
  const out = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.equal(out.added, 0);
  assert.equal(out.corrette, 0);
  assert.equal(out.aggiornate, 0);
  assert.deepEqual(out.voci, []);
  assert.equal(JSON.parse(readFileSync(map, 'utf8')).entries['0x4234ECA92F96742A|0x56CED7FB06AB0E8A'], 'Kunos Abarth 695 Biposto');
});

test('learnCarFromStorage: file assente, brutto o senza paddock.skins → nota, nessun crash', () => {
  const { map, garage } = casa();
  // assente
  const manco = learnCarFromStorage({ storageFile: join(garage, 'iniziato-nope.uistorage'), mapFile: map });
  assert.ok(String(manco.nota).includes('paddock.skins'));
  assert.equal(manco.added, 0);
  assert.deepEqual(manco.voci, []);
  // brutto: byte a caso
  const brutto = mkdtempSync(join(tmpdir(), 'learn-storage-rotto-'));
  writeFileSync(join(brutto, 'ui_storage.uistorage'), Buffer.from([0xff, 0xff, 0xff, 0x07]));
  const rotto = learnCarFromStorage({ storageFile: join(brutto, 'ui_storage.uistorage'), mapFile: map });
  assert.ok(String(rotto.nota).length > 0);
  assert.equal(rotto.added, 0);
  // senza paddock.skins (solo un'altra chiave di storage del gioco)
  const solo = mkdtempSync(join(tmpdir(), 'learn-storage-altro-'));
  const file = join(solo, 'ui_storage.uistorage');
  const voce = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('hudlayout') },
    { field: 2, wire: 2, bytes: Buffer.from('"visibility":false') },
  ]);
  writeFileSync(file, encodeMsg([{ field: 1, wire: 2, bytes: voce }]));
  const altro = learnCarFromStorage({ storageFile: file, mapFile: map });
  assert.ok(String(altro.nota).includes('paddock.skins'));
  assert.equal(altro.checked, false);
});

// 3/11 — la regola del tagliando condivisa: un'iscrizione paddock che conferma
// una voce solo RADDOPPIATA la ripulisce; un sinonimo CON RUMORE resta COM'ERA.
test('soloRaddoppio: raddoppio sì, rumore no, già pulita no', () => {
  assert.equal(soloRaddoppio('Mazda MX-5 ND Cup', 'Mazda Mazda MX-5 ND Cup'), true);
  assert.equal(soloRaddoppio('Abarth 695 Biposto', 'Kunos Abarth 695 Biposto'), false); // fogna: token estraneo
  assert.equal(soloRaddoppio('Mazda MX-5 ND Cup', 'Mazda MX-5 ND Cup'), false);           // già pulita
});

test('learnCarFromPaddock: iscrizione che conferma una voce RADDOPPIATA la ripulisce', () => {
  const { garage, map } = casa();
  const dirPad = mkdtempSync(join(tmpdir(), 'learn-paddock-'));
  writeFileSync(garage, garageBuf('0x1234', '0x5678'));
  // pd-calendar e garage scritti insieme: la finestra (1h) chiude
  writeFileSync(join(dirPad, 'pd-calendar-abc.json'), JSON.stringify({ car: 'Mazda MX-5 ND Cup' }));
  const { carHash, guid2 } = decodeGarage(readFileSync(garage));
  writeFileSync(map, JSON.stringify({ entries: { [`${carHash}|${guid2}`]: 'Mazda Mazda MX-5 ND Cup' } }));
  const out = learnCarFromPaddock({ paddockDir: dirPad, garage, mapFile: map, windowMs: 60 * 60 * 1000 });
  assert.equal(out.aggiornate, 1);
  assert.equal(JSON.parse(readFileSync(map, 'utf8')).entries[`${carHash}|${guid2}`], 'Mazda MX-5 ND Cup');
});

test('learnCarFromPaddock: iscrizione che conferma un sinonimo CON RUMORE non lo tocca', () => {
  const { garage, map } = casa();
  const dirPad = mkdtempSync(join(tmpdir(), 'learn-paddock-noise-'));
  writeFileSync(garage, garageBuf('0x1234', '0x5678'));
  writeFileSync(join(dirPad, 'pd-calendar-abc.json'), JSON.stringify({ car: 'Abarth 695 Biposto' }));
  const { carHash, guid2 } = decodeGarage(readFileSync(garage));
  writeFileSync(map, JSON.stringify({ entries: { [`${carHash}|${guid2}`]: 'Kunos Abarth 695 Biposto' } }));
  const out = learnCarFromPaddock({ paddockDir: dirPad, garage, mapFile: map, windowMs: 60 * 60 * 1000 });
  assert.equal(out.added, 0);
  assert.equal(out.corrette, 0);
  assert.equal(out.aggiornate, 0);
  assert.ok(String(out.nota).includes('già a dizionario'));
  assert.equal(JSON.parse(readFileSync(map, 'utf8')).entries[`${carHash}|${guid2}`], 'Kunos Abarth 695 Biposto');
});
