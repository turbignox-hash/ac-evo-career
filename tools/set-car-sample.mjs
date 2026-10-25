// set-car-sample.mjs — catturatore di campioni per il file del garage.
//
// Il cambio "con quale auto corro" vive in ProfileData/<profilo>/OpenData/
// garage.drivergarage (25 byte: coppia hash 64-bit dell'auto + campo 10).
// L'hash non è crackato a algoritmo (FNV/xxH64/Murmur su nome e carId non
// matchano) MA esiste la tabella ufficiale del gioco: guid_map.carhashguid
// ha 468 voci {guid → {carHash, guid2}} e ALMENO una coppia (quella dell'Audi
// RS 6 Avant selezionata in test) è saltata fuori lì dentro.
//
// Strategia campione-per-campione: ogni secondo copia il garage in
// data/samples/garage/<mtime>.hex QUANDO cambia (con il byte-diff rispetto
// all'ultima snapshot). Poi l'utente dice che auto ha selezionato e in che
// momento: i timestamp della spia li lega noi. Le coppie campionati diventano
// la tabella auto→hash del tool set-driver-car.
//
// uso:
//   node tools/set-car-sample.mjs            (fa il sampling mentre provi auto in gioco)
//   node tools/set-car-sample.mjs --dump     (mostra i campioni legati ai timestamp spia)
//   node tools/set-car-sample.mjs --map "<nome auto>=<file>"  (assegna un nome a un campione)
//   node tools/set-car-sample.mjs --clear
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMsg } from './evo-grid.mjs';

export const HERE = join(import.meta.dirname);
const SAMPLES = join(HERE, '..', 'data', 'samples', 'garage');
const MAP_FILE = join(SAMPLES, 'map.json');
// IL PROFILO NON È FISSO: la GUID cambia per installazione (25/10, installazione
// pulita di Mauro: 49057b82-… al posto del vecchio 4e119186-…). Il sampler
// resta sul percorso scoperto a disco (openDataDir di evo-grid): nulla più
// da ritoccare a ogni PC.
import { openDataDir, GAME_SAVEDIR } from './evo-grid.mjs';
export function currentGarageFile() {
  const od = openDataDir()
    ?? join(GAME_SAVEDIR, 'ProfileData', '_noprofile', 'OpenData');
  return join(od, 'garage.drivergarage');
}

/** decodifica il garage: { carHash, guid2, flag } — i campi 4.1/4.2 e 10. */
export function decodeGarage(buf) {
  const fields = decodeMsg(buf);
  const out = { carHash: null, guid2: null, flag: null, guid: null };
  for (const f of fields) {
    if (f.field === 4) { for (const g of decodeMsg(f.bytes)) { if (g.field === 1) out.carHash = '0x' + BigInt(g.varint).toString(16).toUpperCase().padStart(16, '0'); else if (g.field === 2) out.guid2 = '0x' + BigInt(g.varint).toString(16).toUpperCase().padStart(16, '0'); } }
    else if (f.field === 10) out.flag = Number(f.varint);
    else if (f.field === 2) out.guid = '0x' + BigInt(f.varint).toString(16).toUpperCase().padStart(16, '0');
  }
  return out;
}

/** La mappa hash→nome appresa dai campioni (carKey = carHash+guid2). */
export function readMap() {
  try { return JSON.parse(readFileSync(MAP_FILE, 'utf8')); } catch { return { entries: {} }; }
}

/**
 * APPRENDIMENTO SILENZIOSO a fine gara (25/10, dizionario azzerato
 * dall'installazione pulita): se la coppia (carHash|guid2) attualmente nel
 * garage non è mappata e conosciamo il nome dell'auto CORSA (dal file
 * risultati), impariamo la coppia — dalla gara dopo il Prepara seleziona
 * l'auto da solo, senza sampler a mano.
 * Torna { learned: true, name, key } o null se non c'era nulla da imparare.
 */
export function learnCar(name, { garage = currentGarageFile(), mapFile = MAP_FILE, dry = false } = {}) {
  if (!name) return null;
  if (!existsSync(garage)) return null;   // garage vergine: niente da mappare
  let raw;
  try { raw = decodeGarage(readFileSync(garage)); }
  catch { return null; }                  // file a metà scrittura dal gioco: l'import dopo riprova
  if (!raw?.carHash || raw.carHash === '0x0' || !raw?.guid2) return null;
  const key = `${raw.carHash}|${raw.guid2}`;
  const map = (function () {
    try { return JSON.parse(readFileSync(mapFile, 'utf8')); } catch { return { entries: {} }; }
  })();
  if (map.entries?.[key]) return null;    // già a dizionario
  if (dry) return { learned: false, dry: true, name, key };
  try {
    mkdirSync(SAMPLES, { recursive: true });
    map.entries = map.entries ?? {};
    map.entries[key] = String(name);
    writeFileSync(mapFile, JSON.stringify(map, null, 1));
    return { learned: true, name: String(name), key };
  } catch { return null; }                // data senza permessi: non deve rompere l'import
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  mkdirSync(SAMPLES, { recursive: true });
  if (args.includes('--dump')) {
    const files = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => f.endsWith('.hex') && f !== 'map.json').sort() : [];
    for (const f of files) {
      const hex = readFileSync(join(SAMPLES, f), 'utf8');
      const { carHash, guid2, flag } = decodeGarage(Buffer.from(hex, 'hex'));
      const map = readMap().entries;
      const key = carHash + '|' + guid2;
      console.log(`${f}  carHash=${carHash} guid2=${guid2} flag=${flag}${map[key] ? '  ← ' + map[key] : ''}`);
    }
    process.exit(0);
  }
  if (args.includes('--clear')) { try { rmSync(SAMPLES, { recursive: true, force: true }); } catch {} console.log('campioni azzerati.'); process.exit(0); }
  const mapIdx = args.indexOf('--map');
  if (mapIdx >= 0) {
    const [name, file] = String(args[mapIdx + 1]).split('=');
    const hex = readFileSync(join(SAMPLES, file.endsWith('.hex') ? file : file + '.hex'), 'utf8');
    const { carHash, guid2 } = decodeGarage(Buffer.from(hex, 'hex'));
    const map = readMap();
    map.entries[carHash + '|' + guid2] = name;
    writeFileSync(MAP_FILE, JSON.stringify(map, null, 1));
    console.log(`appeso al dizionario: ${name} → carHash=${carHash} guid2=${guid2}`);
    process.exit(0);
  }

  console.log('campiono il garage ogni 700ms — cambia auto in gioco quando vuoi (ctrl+c per fermare):');
  let last = null;
  const GARAGE_LIVE = currentGarageFile();
  setInterval(() => {
    try {
      const buf = readFileSync(GARAGE_LIVE);
      const mtime = Math.round(statSync(GARAGE_LIVE).mtimeMs);
      const hex = buf.toString('hex');
      if (hex !== last) {
        if (last !== null) {
          const f = join(SAMPLES, `gar-${mtime}.hex`);
          writeFileSync(f, hex);
          const { carHash, guid2 } = decodeGarage(buf);
          console.log(`${new Date().toLocaleTimeString('it-IT')}  CATTURATO → data/samples/garage/${f.split('/').pop()} ${carHash} ${guid2}`);
        } else {
          const { carHash, guid2 } = decodeGarage(buf);
          console.log(`[base] ${carHash} ${guid2}`);
        }
        last = hex;
      }
    } catch { /* garage assente o readonly momentaneo: riprova al giro dopo */ }
  }, 700);
}
