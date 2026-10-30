// set-driver-car.mjs — CAMBIO AUTO SELEZIONATA a gioco APERTO.
//
// Il terzo strumento della famiglia set-track/set-car: il file è
// ProfileData/<profilo>/OpenData/garage.drivergarage (~24-25 byte protobuf):
//   campo 4 = { 1: carHash (0x...), 2: guid2 (0x...) }   → auto + assetto
//   campo 10 = 7 (GARAGE_FLAG)                           → costante osservata
// La mappa nome→hash si costruisce empiricamente col catturatore
// (set-car-sample.mjs --map): le auto etichettate in fondo al file.
// La pista e l'auto selezionata insieme = il weekend preparato da un click.
import { readFileSync, writeFileSync, renameSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { encodeMsg, openDataDir, GAME_SAVEDIR, pruneBackups } from './evo-grid.mjs';
import { decodeGarage, readMap, learnCarFromLogs } from './set-car-sample.mjs';

// BOOT DIZIONARIO automatico (31/10): alla PRIMA ricerca auto in un processo
// proviamo una volta a imparare le coppie dai log di gioco (learnCarFromLogs):
// così le auto mai campionate (es. la Clio R5 firmata dall'amico) entrano nel
// dizionario da sole e il Prepara cambia auto senza sampler a mano. Una volta
// sola per processo: i log crescono, non serve riscandarli a ogni chiamata.
let _dizionarioBoot = false;
function dizionarioBoot() {
  if (_dizionarioBoot) return;
  _dizionarioBoot = true;
  try { learnCarFromLogs(); } catch { /* log assenti o illeggibili: si va col dizionario a campioni */ }
}

// il profilo attivo si SCOPRE su disco (ProfileData/<guid>/OpenData): la GUID
// cambia per installazione, il percorso fisso valeva solo sul PC di sviluppo
export const GARAGE_FILE = join(openDataDir() ?? join(GAME_SAVEDIR, 'ProfileData', '_noprofile', 'OpenData'), 'garage.drivergarage');
export const GARAGE_FLAG = 7;   // costante osservata su tutti i campioni (20/10/2026)

/** Aggregato minusculo alfanumerico: "Mercedes-Benz 190E 2.5-16 Evo II"
 *  → "mercedesbenz190e2516evoii" — i segni d'ortografia a caso fra i nomi
 *  dell'app e quelli reali non devono mangiarsi una scrittura. */
const normCar = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Parole del nome: i token che DEVONO tutti trovarsi nell'altro nome
 *  («Mercedes 190E Evo II» vs «Mercedes-Benz 190E 2.5-16 Evo II»). Per i token
 *  LUNGHI basta il containment, per i CORTI (≤2: «75» dell'Alfa 75, il «R5» della
 *  Clio, «F40») serve la corrispondenza a PAROLA INTERA — lezione 31/10, Prima
 *  con l'≥3 il «75» veniva BUTTATO e «Alfa 75» firmava la prima auto con «alfa»
 *  nel nome (la Giulia GTAm!) invece della 75 vera. */
function tokenMatching(label, want) {
  const hay = normCar(label);
  const words = String(want ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!words.length) return false;
  const hayWords = new Set(String(label ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return words.every((t) => (t.length >= 3 ? hay.includes(t) : hayWords.has(t)));
}
const tokenCar = (s) => (String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []);

export function garageCurrent(file = GARAGE_FILE) {
  dizionarioBoot();
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

/**
 * Cerca nel dizionario:
 *   1) sottostringa secca case-insensitive («Abarth 695» ⊂ «Kunos Abarth
 *      695 Biposto») — com'era dal 20/10;
 *   2) a TOKEN (31/10, la lezione della Coppa Mercedes: il ladder chiama
 *      «Mercedes 190E Evo II», il gioco «Mercedes-Benz 190E 2.5-16 Evo II»
 *      e l'includes NON trovava niente: il Prepara lasciava in box l'auto
 *      vecchia). Ogni token (≥3 caratteri) del nome richiesto deve comparire
 *      nel nome del dizionario, in qualunque ordine e con segni orphaned.
 * → { carHash, guid2, name } | null.
 */
export function findCar(name) {
  dizionarioBoot();
  const entries = readMap().entries;
  const want = String(name ?? '').toLowerCase().trim();
  for (const [key, label] of Object.entries(entries)) {
    if (label.toLowerCase().includes(want)) return { name: label, carHash: key.split('|')[0], guid2: key.split('|')[1] };
  }
  const tokens = tokenCar(want);
  if (!tokens.length) return null;
  for (const [key, label] of Object.entries(entries)) {
    if (tokenMatching(label, want)) {
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
  pruneBackups(file);   // rotazione bak automatica (tetto 25, comune 31/10)
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
