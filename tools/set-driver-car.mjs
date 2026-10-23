// set-driver-car.mjs — CAMBIO AUTO SELEZIONATA a gioco APERTO.
//
// Il terzo strumento della famiglia set-track/set-car: il file è
// ProfileData/<profilo>/OpenData/garage.drivergarage (~25 byte protobuf):
//   campo 4 = { 1: carHash (0x...), 2: guid2 (0x...) }   → auto + assetto
//   campo 10 = 7                                          → costante osservata
// La mappa nome→hash si costruisce empiricamente col catturatore
// (set-car-sample.mjs --map): al 20/10 ha 6 auto etichettate.
// La pista e l'auto selezionata insieme = il weekend preparato da un click.
//
// uso:
//   node tools/set-driver-car.mjs --list
//   node tools/set-driver-car.mjs --car "Audi RS 6 Avant" [--dry] [--force]
import { readFileSync, writeFileSync, renameSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMsg, encodeMsg, gameRunning, openDataDir, GAME_SAVEDIR } from './evo-grid.mjs';
import { decodeGarage, readMap } from './set-car-sample.mjs';

// il profilo attivo si SCOPRE su disco (ProfileData/<guid>/OpenData): la GUID
// cambia per installazione, il percorso fisso valeva solo sul PC di sviluppo
export const GARAGE_FILE = join(openDataDir() ?? join(GAME_SAVEDIR, 'ProfileData', '_noprofile', 'OpenData'), 'garage.drivergarage');
export const GARAGE_FLAG = 7;   // costante osservata su tutti i campioni (20/10/2026)

export function garageCurrent(file = GARAGE_FILE) {
  const raw = decodeGarage(readFileSync(file));
  const map = readMap().entries;
  const key = raw.carHash + '|' + raw.guid2;
  return { ...raw, name: map[key] ?? null, mtime: new Date(statSync(file).mtimeMs).toISOString() };
}

/**
 * Struttura il buffer del garage per la coppia (carHash, guid2).
 * Il top-level osservato è: campo 4 (w2, inner {1: carHash, 2: guid2}) + campo 10 (w0).
 */
export function garageBuf(carHash, guid2) {
  const inner = encodeMsg([
    { field: 1, wire: 0, varint: BigInt(carHash) },
    { field: 2, wire: 0, varint: BigInt(guid2) },
  ]);
  return encodeMsg([
    { field: 4, wire: 2, bytes: inner },
    { field: 10, wire: 0, varint: BigInt(GARAGE_FLAG) },
  ]);
}

/** Cerca nel dizionario per nome (substring case-insensitive) → { carHash, guid2, name }. */
export function findCar(name) {
  const entries = readMap().entries;
  const want = String(name).toLowerCase();
  for (const [key, label] of Object.entries(entries)) {
    if (label.toLowerCase().includes(want)) {
      const [carHash, guid2] = key.split('|');
      return { name: label, carHash, guid2 };
    }
  }
  return null;
}

/**
 * Scrive l'auto selezionata nel garage a gioco aperto (backup automatico).
 * opts: { file, dry }.
 */
export function setDriverCar(name, { file = GARAGE_FILE, dry = false } = {}) {
  const car = findCar(name);
  if (!car) throw Object.assign(new Error(`"${name}" non nel dizionario: aggiungi un campione con set-car-sample.mjs --map`), { code: 'UNKNOWN_CAR' });
  const out = garageBuf(car.carHash, car.guid2);
  if (dry) return { ...car, written: false };
  const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  writeFileSync(`${file}.tmp`, out);
  renameSync(`${file}.tmp`, file);
  return { ...car, written: true, backup };
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const has = (k) => args.includes(k);
  if (has('--list')) {
    const cur = garageCurrent();
    console.log(`attuale: ${cur.name ?? '(non nel dizionario)'} (${cur.carHash} ${cur.guid2})`);
    console.log('dizionario:');
    for (const [key, label] of Object.entries(readMap().entries)) console.log(`  ${label} → ${key}`);
    process.exit(0);
  }
  const name = getArg('--car');
  if (!name) { console.error('serve --car "<nome nel dizionario>"'); process.exit(1); }
  try {
    const r = setDriverCar(name, { dry: has('--dry') });
    console.log(`${r.name} (${r.carHash} ${r.guid2})`);
    if (!r.written) console.log('DRY: niente scritta.');
    else console.log(`scritto ${GARAGE_FILE} · backup ${r.backup.split('\\').pop()}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
