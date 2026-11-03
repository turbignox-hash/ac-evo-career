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
//   node tools/set-car-sample.mjs --from-logs (impara le coppie dai log di gioco)
//   node tools/set-car-sample.mjs --from-paddock (impara dall'iscrizione paddock)
//   node tools/set-car-sample.mjs --from-storage (impara da ui_storage.uistorage, la fonte del dizionario)
//   node tools/set-car-sample.mjs --dump     (mostra i campioni legati ai timestamp spia)
//   node tools/set-car-sample.mjs --map "<nome auto>=<file>"  (assegna un nome a un campione)
//   node tools/set-car-sample.mjs --clear
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMsg, GAME_SAVEDIR } from './evo-grid.mjs';
// Il journal pd-calendar dell'app del gioco: la SORGENTE del nome dell'auto
// della serie AD ISCRIZIONE. appRoot (src/app-carriera) la scopre già su disco
// (APP_JOURNAL_DIR o uiresources di Saved Games): niente percussioni nuove.
import { appRoot } from '../src/app-carriera.mjs';

export const HERE = join(import.meta.dirname);
const SAMPLES = join(HERE, '..', 'data', 'samples', 'garage');
const MAP_FILE = join(SAMPLES, 'map.json');
// l'archivio ufficiale delle 468 coppie (22/10): k1/k2 sono le metà BE della
// GUID stabile dell'auto, uguali a carHash/guid2 del garage → il legame dai
// log non tocca mai il gioco: solo lettura/scrittura della mappa nostra.
const GUIDS_FILE = join(HERE, '..', 'data', 'car-guids.json');
const LOGS_DIR = join(GAME_SAVEDIR, 'Logs');
// LA FATTORIA DEL DIZIONARIO (3/11, ore 02:41): il gioco scrive IN CHIARO
// <Saved Games>\ACE\ui_storage.uistorage — protobuf SENZA cifratura — con
// dentro il registro `paddock.skins`: per ogni auto toccata dal menu (vista,
// scelta, iscrizione) un'entry { carId → { car_guid, display_name, pack } }.
// CAR_GUID è la GUID stabile dell'auto, già SPEZZATA in due metà protobuf che
// BATE con carHash|guid2 del garage ('0x47E9D2CE3DC1C366|0x432F24BD6F41ED82'
// = Audi R8 LMS GT4 Evo, la STESSA chiave del test): il legame guid↔auto è
// completo e scritto DAL GIOCO STESSO. display_name è il nome umano ufficiale
// ("Mini John Cooper S", "Audi R8 LMS GT4 Evo"): niente ricostruzioni da
// "ks_…". La kspkg cifrata non serviva più: la sorgente era qui accanto,
// nel Saved Games, e si aggiorna SOLA ad ogni uso del menu.
const UI_STORAGE = join(GAME_SAVEDIR, 'ui_storage.uistorage');
// IL PROFILO NON È FISSO: la GUID cambia per installazione (25/10, installazione
// pulita di Mauro: 49057b82-… al posto del vecchio 4e119186-…). Il sampler
// resta sul percorso scoperto a disco (openDataDir di evo-grid): nulla più
// da ritoccare a ogni PC.
import { openDataDir } from './evo-grid.mjs';
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

/** Regola del TAGLIANDO (3/11): la voce a dizionario è SOLO il nome ufficiale
 *  scritto DUE volte («Mazda Mazda MX-5 ND Cup»)? true quando il multiset del
 *  nome ufficiale è tutto dentro quello della voce e ogni token in eccesso è
 *  una copia doppia di token che il gioco ha già — mentre i token ESTRANEI
 *  («Kunos», «992», «MXM») lasciano la voce COM'ERA. Condiviso dai tre
 *  apprenditori (ui_storage, log, paddock). */
export function soloRaddoppio(label, corrente) {
  const multi = (s) => { const m = new Map(); for (const t of String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []) m.set(t, (m.get(t) ?? 0) + 1); return m; };
  const curM = multi(corrente), offM = multi(label);
  let dentro = true, raddoppi = false;
  for (const [t, n] of offM) if ((curM.get(t) ?? 0) < n) dentro = false;
  for (const [t, n] of curM) if (n > (offM.get(t) ?? 0)) { raddoppi = (offM.get(t) ?? 0) >= 1 && n >= 2; if (!raddoppi) break; }
  return dentro && raddoppi;
}

/** La mappa hash→nome appresa dai campioni (carKey = carHash+guid2). */
export function readMap() {
  try { return JSON.parse(readFileSync(MAP_FILE, 'utf8')); } catch { return { entries: {} }; }
}

const _logLearned = false;
/**
 * DIZIONARIO DAI LOG (31/10, richiesta Mauro «paddock riesce, controlla come fa»):
 * il PC dell'amico non campiona auto a mano, ma i LOG del gioco scrivono da
 * soli la coppia GUID↔carId ad ogni auto caricata:
 *   "Loaded car <hex>-<hex> (ks_…)" / "Set new car <guid-dashed> content\cars\<ks_…>"
 * La GUID stabile dell'auto batte in data/car-guids.json (k1/k2 = le due metà
 * BIG-ENDIAN ottali della GUID = carHash/guid2 del garage): collega carId →
 * coppia hash etichettata con il nome leggibile. Scansione dei log STORICI:
 * ogni auto mai caricata in gioco entra anche senza un cambio manuale.
 * AUTO-CORREZIONE (3/11, la Endurance GT4 firmata «Kunos Abarth 695 Biposto»):
 * se i log CONTRADDICONO una voce già in dizionario (nessun token in comune
 * tra le due etichette: la vecchia era un errore di campionatura) l'etichetta
 * viene corretta, così la contraddizione non blocca per sempre l'auto giusta.
 * Sinonimi finii ('Kunos Abarth 695 Biposto' per ks_abarth_695_biposto, firma
 * manine) hanno token in comune: restano COM'ERANO.
 * Ritorna { added, corrette, scanned, voci: [...] }. Le voci messe a mano
 * (sample --map) NON si sovrascrivono.
 */
export function learnCarFromLogs({ logsDir = LOGS_DIR, mapFile = MAP_FILE, dry = false } = {}) {
  const out = { added: 0, corrette: 0, scanned: 0, voci: [] };
  const guids = (() => {
    try { return JSON.parse(readFileSync(GUIDS_FILE, 'utf8')).cars ?? []; } catch { return []; }
  })();
  if (!guids.length) return out;
  const logFiles = (function () {
    try { return readdirSync(logsDir).filter((f) => f.startsWith('log-')).sort(); } catch { return []; }
  })();
  if (!logFiles.length) return out;
  const found = new Map(); // carHash|guid2 → label carId
  const playerKeys = new Set(); // coppie dichiarate allo SPAWN del player (formato 3)
  for (const f of logFiles) {
    let s;
    try { s = readFileSync(join(logsDir, f)).toString('latin1'); } catch { continue; }
    out.scanned++;
    // formato 1: "Loaded car 487dcdc569318269-a85ea3bd5fb347b2 (ks_…_id)"
    for (const m of s.matchAll(/Loaded car ([0-9a-fA-F]{16})-([0-9a-fA-F]{16}) \((ks_[a-z0-9_]+)\)/g)) found.set(`${m[1]}|${m[2]}`, m[3]);
    // formato 2: "Set new car 487dcdc5-6931-8269-a85e-a3bd5fb347b2 content\cars\<id>…"
    for (const m of s.matchAll(/Set new car ([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})[^\n]{0,200}?ks_([a-z0-9_]+)/gi)) {
      const a = `${m[1]}${m[2]}${m[3]}`.slice(0, 16), b = `${m[4]}${m[5]}`.replace(/-/g, '');
      if (a.length === 16 && b.length === 16) found.set(`${a}|${b}`, m[6]);
    }
    // formato 3 (31/10, «mi rimette sempre il porsche»): lo SPAWN del pilota
    // dichiara la coppia del garage: "[ServerVehicleSystem][carHash-guid2]
    // Creating Car (Mauro Turbigno\t…)". La stessa coppia sale anche su
    // "Loaded car <coppia> (ks_…)": la lego al carId e NON passa dalla
    // tabella ufficiale (car-guids): è la coppia reale del pilota, che lì
    // spesso manca (Mini, 911 GT3…).
    for (const m of s.matchAll(/\[ServerVehicleSystem\]\[([0-9a-fA-F]{16})-([0-9a-fA-F]{16})\] Creating Car \(Mauro/g)) {
      const pair = `${m[1].toUpperCase()}|${m[2].toUpperCase()}`;
      playerKeys.add(pair);
      if (found.get(pair)) continue; // già risolta da format 1/2
      const cm = s.match(new RegExp(`Loaded car ${m[1]}-${m[2]} \\((ks_[a-z0-9_]+)\\)`));
      found.set(pair, cm ? cm[1] : null); // serve per appendere la label
    }
  }
  if (!found.size) return out;
  const map = (function () { try { return JSON.parse(readFileSync(mapFile, 'utf8')); } catch { return { entries: {} }; } })();
  const entries = map.entries ?? {};
  const byk1 = new Map(guids.map((c) => [String(c.k1), c]));
  for (const [hexpair, carId] of found) {
    if (!carId) continue;                     // spawn del player senza "Loaded car" nello stesso log: niente label
    const [a, b] = hexpair.split('|');
    let k1, k2;
    try { k1 = BigInt('0x' + a).toString(); k2 = BigInt('0x' + b).toString(); } catch { continue; }
    const c = byk1.get(k1);
    if (!playerKeys.has(hexpair) && (!c || String(c.k2) !== k2)) continue; // guid istanza o non in tabella: scarta
    try { k1 = BigInt('0x' + a).toString(); k2 = BigInt('0x' + b).toString(); } catch { continue; }
    const carHash = '0x' + BigInt('0x' + a).toString(16).toUpperCase().padStart(16, '0');
    const guid2 = '0x' + BigInt('0x' + b).toString(16).toUpperCase().padStart(16, '0');
    const key = `${carHash}|${guid2}`;
    if (entries[key]) {
      // già mappata (la manine resta) — SOLO una contraddizione secca dei log
      // la corregge: nessun token in comune tra etichetta vecchia e nuova.
      const vero = labelDaCarId(carId);
      const nuovi = new Set(String(vero).toLowerCase().match(/[a-z0-9]+/g) ?? []);
      const vecchi = new Set(String(entries[key]).toLowerCase().match(/[a-z0-9]+/g) ?? []);
      if ([...nuovi].some((t) => vecchi.has(t))) continue;   // sinonimo: com'era
      const prima = entries[key];
      if (dry) { out.voci.push({ label: vero, key, correttaDa: prima }); out.corrette++; continue; }
      entries[key] = vero;
      out.corrette++; out.voci.push({ label: vero, key, correttaDa: prima });
      continue;
    }
    const label = labelDaCarId(carId);
    if (dry) { out.voci.push({ label, key }); continue; }
    entries[key] = label;
    out.added++; out.voci.push({ label, key });
  }
  // 3/11: il salvataggio doveva SOLE ad added: le CORREZIONI da sole
  // (added=0, corrette=1: la sera dell'Endurance GT4) stavano sul posto e
  // l'etichetta sbagliata non moriva mai. Ora il disco riceve anche solo correzioni.
  if (!dry && (out.added || out.corrette)) {
    try {
      map.entries = entries;
      mkdirSync(SAMPLES, { recursive: true });
      writeFileSync(mapFile, JSON.stringify(map, null, 1));
    } catch { out.added = 0; out.errore = 'mappa non scrivibile (data read-only?): cambio auto resta manuale finché non riprova'; }
  }
  return out;
}

/**
 * APPRENDIMENTO DALL'ISCRIZIONE PADDOCK (3/11, «oggi l'auto era a griglia senza
 * che fosse mai apparsa in gioco»): quando si ISCRIVE un campionato nell'app
 * del gioco, il gioco stesso scrive L'auto della serie nel garage del profilo
 * (visto di notte: la Mazda MX-5 ND Cup scritta dall'iscrizione alla MX-5 Cup,
 * la coppia cambiata dal gioco a gara MAI girata). Io non devo assolutamente
 * tentare di inferire il carId: BASTA confrontare i due tocchi di disco che il
 * flusso d'iscrizione fa a un secondo l'una dall'altra:
 *   · `pd-calendar-<hash>.json` — il calendario dell'app: la serie attiva, la
 *     `car` col nome UMANO della serie («Mazda MX-5 ND Cup»);
 *   · `garage.drivergarage`   — la coppia (carHash|guid2) che il gioco ha
 *     appena scritto per l'auto della serie.
 * Se i due mtimi chiudono dentro una FINESTRA corta (default 10 minuti) e la
 * coppia non è già a dizionario (o la sua etichetta è CONTRADDITTA, come la
 * Audi R8 GT4 firmata «Kunos Abarth 695 Biposto»: le regole sono quelle dei
 * log di gioco con `learnCarFromLogs`), la coppia si mappa al nome umano —
 * dal Prepa SEGUENTE la serie è già selezionabile, senza un solo giro in
 * pista, senza catturatore, senza log.
 * La soglia di sicurezza è la CROCE delle due finestre: un mtime del garage
 * lontano dal pd-calendar del gioco (o viceversa) NON insegna niente, così le
 * scritture del Prepa nostro (eventi, gare veloci) non vengono mispregiate.
 * Ritorna { added, corrette, voci, checked, nota? } — checked = 1 quando c'era
 * davvero un candidato da valutare.
 */
export function learnCarFromPaddock({ paddockDir = null, garage = currentGarageFile(), mapFile = MAP_FILE, windowMs = 10 * 60 * 1000, dry = false } = {}) {
  const out = { added: 0, corrette: 0, aggiornate: 0, voci: [], checked: false };
  const dir = paddockDir ?? appRoot(process.env);
  if (!dir) { out.nota = 'paddock installato: nessun journal da leggere'; return out; }
  // 1. il pd-calendar PIÙ RECENTE (i nome cambiano hash ad ogni riscrittura)
  let calAt = 0;
  let cal = null;
  try {
    for (const f of readdirSync(dir).filter((x) => x.startsWith('pd-calendar-') && x.endsWith('.json'))) {
      const at = statSync(join(dir, f)).mtimeMs;
      if (at > calAt) {
        calAt = at;
        cal = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      }
    }
  } catch { return { ...out, nota: 'pd-calendar illeggibile' }; }
  if (!cal) { out.nota = 'nessun pd-calendar nella cartella del paddock'; return out; }
  const label = String(cal?.car ?? '').trim();
  if (!label) { out.nota = 'calendario senza auto: iscrizione non ancora chiusa'; return out; }
  // 2. la coppia scritta dal gioco, FRESCA
  let garageAt = 0;
  let raw = null;
  try { garageAt = statSync(garage).mtimeMs; raw = decodeGarage(readFileSync(garage)); }
  catch { return { ...out, nota: 'garage illeggibile (a metà scrittura dal gioco?)' }; }
  if (!raw?.carHash || raw.carHash === '0x0' || !raw?.guid2) return { ...out, nota: 'garage vergine' };
  const key = `${raw.carHash}|${raw.guid2}`;
  // 3. the crocke delle finestre: garage e calendario misurati insieme AL CLIC
  //    d'iscrizione; un mtime lontano dall'altro non insegna niente (e non appena
  //    scritture del Prepa nostro: eventi, gare veloce, uso del selettore).
  out.checked = true;
  if (Math.abs(garageAt - calAt) > windowMs) { out.nota = 'garage e pd-calendar non si toccano (clic lontani: niente da imparare)'; return out; }
  if (Math.abs(Date.now() - garageAt) > windowMs) { out.nota = 'scrittura garage troppo vecchia per essere l\'iscrizione di oggi'; return out; }
  // 4. l'etichetta: stessa regola dei log — la coppia nuova entra, quella già
  //    mappata resta SE la nuov iscrizione conferma (tokens in comune), e viene
  //    RICHIAMATA solo se porta un nome totalmente diverso (firma a mano vecchi).
  const map = (function () { try { return JSON.parse(readFileSync(mapFile, 'utf8')); } catch { return { entries: {} }; } })();
  const entries = map.entries ?? {};
  const corrente = entries[key];
  const comuni = new Set(String(corrente ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []);
  if (comuni.size && [...new Set(String(label).toLowerCase().match(/[a-z0-9]+/g) ?? [])].some((t) => comuni.has(t))) {
    // l'iscrizione CONFERMA la coppia: normalmente COM'ERA. Ma se la voce era
    // solo il nome ufficiale scritto DUE volte («Mazda Mazda»), la regola del
    // tagliando la riporta pulita col nome del gioco — come ui_storage.
    if (!soloRaddoppio(label, corrente)) return { ...out, nota: "già a dizionario (l'iscrizione conferma)" };
    if (!dry) {
      entries[key] = label;
      map.entries = entries;
      try {
        mkdirSync(SAMPLES, { recursive: true });
        writeFileSync(mapFile, JSON.stringify(map, null, 1));
      } catch { out.errore = 'mappa non scrivibile (data read-only?)'; return out; }
    }
    out.aggiornate += 1;
    out.voci.push({ label, key, insiemeDa: corrente });
    return out;
  }
  if (dry) { out.added += 1; out.voci.push({ label, key, correttaDa: corrente ?? null }); return out; }
  entries[key] = label;
  out.voci.push({ label, key, correttaDa: corrente ?? null });
  if (corrente) out.corrette += 1; else out.added += 1;
  map.entries = entries;
  try {
    mkdirSync(SAMPLES, { recursive: true });
    writeFileSync(mapFile, JSON.stringify(map, null, 1));
  } catch { out.added = 0; out.corrette = 0; out.errore = 'mappa non scrivibile (data read-only?)'; }
  return out;
}

/** Lettore di ui_storage.uistorage: il top level è una lista di entry
 *  { campo 1: chiave, campo 2: valore } entrambe stringhe. Torna [{key, value}]. */
export function readUiStorage(file = UI_STORAGE) {
  const out = [];
  let buf;
  try { buf = readFileSync(file); } catch { return out; }
  let fields;
  try { fields = decodeMsg(buf); } catch { return out; }
  for (const f of fields) {
    if (f.field !== 1 || !f.bytes) continue;
    let key = null, value = null;
    try {
      const inner = decodeMsg(Buffer.from(f.bytes));
      for (const g of inner) {
        if (g.field === 1 && g.bytes) key = Buffer.from(g.bytes).toString('utf8');
        else if (g.field === 2 && g.bytes) value = Buffer.from(g.bytes).toString('utf8');
      }
    } catch { continue; }
    if (key != null) out.push({ key, value });
  }
  return out;
}

/** Dalla GUID tratteggiata del CarModel («47e9d2ce-3dc1-c366-432f-24bd6f41ed82»)
 *  alla chiave del dizionario, le due metà del garage:
 *  0x47E9D2CE3DC1C366|0x432F24BD6F41ED82. null se non è una GUID. */
export function pairDaGuid(guid) {
  const h = String(guid ?? '').replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(h)) return null;
  return '0x' + h.slice(0, 16).toUpperCase() + '|0x' + h.slice(16).toUpperCase();
}

/**
 * APPRENDIMENTO DALLA FATTORIA (3/11, ultima sorgente e definitiva): il gioco
 * mantiene <Saved Games>\ACE\ui_storage.uistorage con il registro
 * `paddock.skins`: per ogni auto TOCCATA DAL MENU (vista nel deposito, scelta,
 * iscrizione) porta già car_guid + display_name. La coppia batte con la
 * chiave del garage e il nome è quello UFFICIALE: niente kspkg cifrata,
 * niente inferenze. Aggiunge le coppie nuove, CORRIGGE quelle contraddette
 * (stessa regola dei log: niente token in comune fra le due etichette), lascia i
 * sinonimi com'erano. Chiamata dal boot dizionario insieme ai log e in CLI
 * con --from-storage. Ritorna { added, corrette, voci, checked, nota }.
 */
export function learnCarFromStorage({ storageFile = UI_STORAGE, mapFile = MAP_FILE, dry = false } = {}) {
  const out = { added: 0, corrette: 0, aggiornate: 0, voci: [], checked: false, nota: null };
  const voce = readUiStorage(storageFile).find((e) => e.key === 'paddock.skins');
  if (!voce) { out.nota = 'paddock.skins non in ui_storage (nessuna auto ancora toccata dal menu)'; return out; }
  let skins;
  try { skins = JSON.parse(voce.value); } catch { out.nota = 'paddock.skins illeggibile'; return out; }
  const tok = (s) => new Set(String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const map = (function () { try { return JSON.parse(readFileSync(mapFile, 'utf8')); } catch { return { entries: {} }; } })();
  const entries = map.entries ?? {};
  for (const [carId, entry] of Object.entries(skins)) {
    let pack = entry?.pack;
    if (typeof pack === 'string') { try { pack = JSON.parse(pack); } catch { pack = null; } }
    const key = pairDaGuid(pack?.car_guid);
    if (!key) continue;
    out.checked = true;
    // display_name del gioco ("Mini John Cooper S"): priorità al nome ricostruito dal carId
    const label = (String(pack?.display_name ?? '').trim() || labelDaCarId(carId));
    const corrente = entries[key];
    if (corrente) {
      const nuovi = tok(label), vecchi = tok(corrente);
      if ([...nuovi].some((t) => vecchi.has(t))) {
        // SINONIMO: normalmente com'era. Ma il nome del GIOCO è quello
        // UFFICIALE: la regola del tagliando (soloRaddoppio, sopra) ripulisce
        // l'etichetta raddoppiata e lascia intatti i sinonimi con rumore.
        if (soloRaddoppio(label, corrente)) {
          if (!dry) entries[key] = label;
          out.aggiornate++; out.voci.push({ label, key, insiemeDa: corrente });
        }
        continue;
      }
      if (!dry) entries[key] = label;                         // contraddizione: corregge
      out.corrette++; out.voci.push({ label, key, correttaDa: corrente });
      continue;
    }
    if (!dry) entries[key] = label;
    out.added++; out.voci.push({ label, key });
  }
  if (!dry && (out.added || out.corrette || out.aggiornate)) {
    try {
      map.entries = entries;
      mkdirSync(SAMPLES, { recursive: true });
      writeFileSync(mapFile, JSON.stringify(map, null, 1));
    } catch { out.added = 0; out.corrette = 0; out.aggiornate = 0; out.errore = 'mappa non scrivibile (data read-only?)'; }
  }
  return out;
}

/** «ks_alfa_romeo_75_turbo_evo» → «Alfa Romeo 75 Turbo Evo»: solo etichetta,
 *  il confronto reale è a token (findCar), una scrittura in meno da correggere. */
export function labelDaCarId(carId) {
  return String(carId ?? '').replace(/^ks_/, '')
    .split('_')
    .filter(Boolean)
    .map((p) => (/^[\d]+$/.test(p) ? p : p[0].toUpperCase() + p.slice(1)))
    .join(' ');
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

  if (args.includes('--from-logs')) {
    const res = learnCarFromLogs();
    for (const v of res.voci) console.log(v);
    console.log(`imparate ${res.added} coppie da ${res.scanned} log di gioco (storicamente: ogni auto mai caricata entra, anche senza cambi a mano).`);
    if (res.corrette) console.log(`corrette ${res.corrette} etichette contraddette dai log (le stesse coppie, il nome vero: le auto sbloccate tornano selezionabili).`);
    process.exit(0);
  }
  if (args.includes('--from-paddock')) {
    const res = learnCarFromPaddock();
    console.log(JSON.stringify(res, null, 1));
    process.exit(0);
  }
  if (args.includes('--from-storage')) {
    const res = learnCarFromStorage();
    for (const v of res.voci) console.log(JSON.stringify(v));
    if (res.nota) console.log('( ' + res.nota + ' )');
    console.log(`imparate ${res.added} coppie dal ui_storage del gioco` + (res.corrette ? ` (e corrette ${res.corrette} etichette)` : '') + (res.aggiornate ? ` (e ripulite ${res.aggiornate} etichette col nome ufficiale)` : '') + ` — auto toccate dal menu: ${res.voci.length}.`);
    process.exit(0);
  }
  console.log('campiono il garage ogni 700ms — cambia auto in gioco quando vuoi (ctrl+c per fermare, oppure --from-logs per imparare dai log di gioco):');
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
