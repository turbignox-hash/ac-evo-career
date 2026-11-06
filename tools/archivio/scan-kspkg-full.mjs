// scan-kspkg-full.mjs — passata COMPLETA su content.kspkg (69 GB, 31/10).
//
// Il pacchetto è cifrato (DirectStorage) e NON si decodifica senza le chiavi
// del gioco, ma dentro restano regioni in chiaro: questa passata legge TUTTO il
// file in streaming e conserva su disco ogni stringa utile trovata:
//   1. carId_GUID — il GUID manifest COMPLETO (la chiave del dizionario auto!)
//   2. carId nudi — le etichette content (ladder e griglie le chiamano così)
//   3. path content — cars/…, tracks/… (tocchi della struttura del pacchetto)
// Output: data/kspkg-manifest.json (+ data/kspkg-manifest.progress.log)
// Un pass dai 5 ai 15 minuti a seconda del disco: si fa UNA volta, poi l'indice
// vive e basta rileggerlo (--report).
//
// uso:  node tools/scan-kspkg-full.mjs            (scansione completa)
//       node tools/scan-kspkg-full.mjs --report   (riellegge l'indice e lo riassume)
import { openSync, readSync, closeSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const KSPKG = process.env.KSPKG_FILE ?? 'E:/SteamLibrary/steamapps/common/Assetto Corsa EVO/content.kspkg';
const OUT = join(RADICE, 'data', 'kspkg-manifest.json');
const OUT_LOG = join(RADICE, 'data', 'kspkg-manifest.progress.log');

const GUID_RE = /(ks_[a-z0-9_]+)_([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})/g;
const CAR_RE = /(ks_[a-z0-9_]{3,60})/g;
const PATH_RE = /(?:cars|tracks)[\\/]([a-z0-9_\\/.-]{3,120})/g;
const CH = 32 * 1024 * 1024;
const OVERLAP = 4096; // coda riportata su ogni chunk: i match al confine non si perdono

function scanFull() {
  const fd = openSync(KSPKG, 'r');
  const buf = Buffer.alloc(CH);
  const guid = new Map();   // carId → Set(guid)
  const carIds = new Set();
  const paths = new Map();  // path → contatore
  let bytes = 0, pos = 0, more = true;
  console.log(`[kspkg] scan completo di ${KSPKG} (progresso su ${OUT_LOG}; Ctrl+C respinge senza salvare)`);
  const t0 = Date.now();
  while (more) {
    const n = readSync(fd, buf, 0, CH, pos);
    if (n <= 0) break;
    const s = buf.toString('latin1');
    for (const m of s.matchAll(GUID_RE)) {
      const car = m[1].toLowerCase();
      const set = guid.get(car) ?? guid.set(car, new Set()).get(car);
      set.add(`${m[2]}-${m[3]}-${m[4]}-${m[5]}-${m[6]}`.toLowerCase());
    }
    for (const m of s.matchAll(CAR_RE)) carIds.add(m[1].toLowerCase());
    for (const m of s.matchAll(PATH_RE)) {
      const p = m[0].toLowerCase().replace(/\\/g, '/');
      paths.set(p, (paths.get(p) ?? 0) + 1);
    }
    bytes += n;
    pos += n - OVERLAP;
    if (n < CH) more = false;
    if ((bytes / CH) % 4 < 1) { // ogni ~128 MB di letti: un rigo di battito
      const msg = `[${new Date().toISOString()}] ${(bytes / 1073741824).toFixed(2)} GB · guid ${guid.size} · carId ${carIds.size} · path ${paths.size} · ${((Date.now() - t0) / 1000).toFixed(0)}s`;
      console.log(msg);
      try { writeFileSync(OUT_LOG, msg + '\n', { flag: 'a' }); } catch { /* battito perso */ }
    }
  }
  closeSync(fd);
  const guidOut = {};
  for (const [car, g] of guid) guidOut[car] = [...g];
  const out = {
    scannedAt: new Date().toISOString(),
    kspkg: KSPKG,
    bytes,
    stats: { carGuid: guid.size, carIds: carIds.size, paths: paths.size },
    guid: guidOut,
    carIds: [...carIds].sort(),
    paths: Object.fromEntries(paths),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\n[kspkg] FINE in ${((Date.now() - t0) / 60000).toFixed(1)} min → ${OUT}`);
  console.log(`[kspkg] riepilogo: ${out.stats.carGuid} carId con GUID manifest · ${out.stats.carIds} carId nudi · ${out.stats.paths} path content`);
}

function report() {
  if (!existsSync(OUT)) { console.log('indice non ancora estratto: lancia senza --report'); process.exit(1); }
  const d = JSON.parse(readFileSync(OUT, 'utf8'));
  console.log(`estrazione del ${d.scannedAt} · ${((d.bytes ?? 0) / 1073741824).toFixed(1)} GB letti`);
  console.log(`carId con GUID manifest: ${Object.keys(d.guid).length}`);
  const evidenzia = /(clio|f40|maserati|golf|abarth|alfa)/i;
  for (const [car, gs] of Object.entries(d.guid).filter(([k]) => evidenzia.test(k)).slice(0, 30))
    console.log(`  ${car} : ${gs.join(', ')}`);
  console.log(`carId nudi: ${d.carIds.length} — i primi 20: ${d.carIds.slice(0, 20).join(', ')}`);
}

const args = process.argv.slice(2);
if (args.includes('--report')) report(); else scanFull();
