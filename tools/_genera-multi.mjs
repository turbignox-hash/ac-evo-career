// tools/_genera-multi.mjs — GENERATORE dei template multiclasse (24/10).
//
// Problema: 26 serie multiclasse senza template di fabbrica. Fotografarle in
// EVO una a una = 29 sessioni. Qui invece costruiamo il DONOR della serie in
// codice: l'UNIONE delle celle REALI fotografate (fabbrica + magazzino +
// grezze, tutte decodificate dal guardiano) limitatamente alle auto del pool,
// più piloti e config da un donor vero di riferimento. La scrittura completa
// resta a buildGridMessage (celle byte-univoche, bilancio, AI, finestra PI,
// meteo del calendario) — la stessa funzione che prepara le gare: zero nuovi
// formati, zero celle inventate.
//
// Esito: <nodeId>.customgrid in data/grid-templates E config/griglie-fabbrica
// (l'ordine di corsa dei candidati di grid-apply è magazzino → fabbrica).
// Le monomarca non sono qui: quelle si fotografano col loro round o restano
// alla EVO (i pool a 1 auto escono dalla nuova fonte solo se il builder accetta).
//
// uso: node tools/_genera-multi.mjs              → genera e scrive (con backup)
//      node tools/_genera-multi.mjs --dry        → solo il piano, niente scritture
//      node tools/_genera-multi.mjs --solo <nodeId> → una serie sola
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gridFileOf, encodeMsg, decodeMsg } from './evo-grid.mjs';
import { buildGridMessage, loadClasses } from '../src/gridbuilder.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAGAZZINO = join(HERE, '..', 'data', 'grid-templates');
const FABBRICA = join(HERE, '..', 'config', 'griglie-fabbrica');
const GREZZE = join(HERE, '..', 'data', 'griglie-grezz');
const LADDER_FILE = join(HERE, '..', 'config', 'career.evo.ladder.json');
const DRY = process.argv.includes('--dry');
const SOLO = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null;
const MAX_CELLE_DONOR = 34;   // margine sopra le serie da 20: il builder sceglie le prime target

const ladder = JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
const classi = loadClasses().classi ?? {};
const nomeAuto = (id) => ladder.contentNames?.cars?.[id] ?? id;
const nodeIdSan = (n) => String(n).replace(/[^a-zA-Z0-9_.-]/g, '_');
const poolOf = (n) => (Array.isArray(classi[n.nodeId]?.poolAuto) ? classi[n.nodeId].poolAuto : (n.cars ?? []));
const coperta = (n) => existsSync(join(MAGAZZINO, nodeIdSan(n.nodeId) + '.customgrid')) || existsSync(join(FABBRICA, nodeIdSan(n.nodeId) + '.customgrid'));

/** carId di una cella (solo il campo 3, senza decodificare tutto il file). */
function carIdOf(raw) {
  try {
    for (const g of decodeMsg(raw instanceof Uint8Array ? raw : Uint8Array.from(raw))) {
      if (g.field === 3 && g.wire === 2) return Buffer.from(g.bytes).toString('utf8');
    }
  } catch { /* cella mutila: l'inclusione nei pool non la giudica */ }
  return null;
}

/* ---------- raccolta delle fonti: celle reali fotografate ---------- */
const fonti = [];   // { file, dir, cells, drivers, config, weather }
for (const dir of [FABBRICA, MAGAZZINO, GREZZE]) {
  if (!existsSync(dir)) continue;
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.customgrid')); } catch { continue; }
  for (const f of files) {
    let g = null;
    try { g = gridFileOf(readFileSync(join(dir, f))); } catch { continue; }
    if (g?.cells?.length) fonti.push({
      file: f, dir: dir.split(/[\\/]/).pop(),
      cells: g.cells.map((c) => c.raw).filter(Boolean),
      drivers: g.drivers.map((d) => d.raw).filter(Boolean),
      config: g.config?.raw ?? null, weather: g.config?.weather ?? null,
    });
  }
}
console.log(`fonti leggibili: ${fonti.length} file con celle`);

/* ---------- i target:⬜ multiclasse========== ---------- */
const bersagli = ladder.nodes.filter((n) => poolOf(n).length >= 2
  && (!SOLO || n.nodeId === SOLO)
  && (SOLO || !coperta(n)));   // senza --solo: solo le non coperte

let ok = 0, ko = 0;
const fallite = [];
for (const n of bersagli) {
  const pool = poolOf(n);
  const poolSet = new Set(pool);
  const target = n.gridSize ?? 14;

  // celle del pool (byte-distinte — lo stesso giudizio del builder) da TUTTE le fonti,
  // raggruppate per auto e poi INTERLACCIATE: il builder prende le prime N uniche del
  // donor, con l'interlacciamento la griglia costruita alterna i modelli del pool
  // (prima versione: erano 12× la prima auto del pool — serie multiclasse che usciva monomarca).
  const viste = new Set(); const perAuto = new Map();
  for (const s of fonti) {
    for (const raw of s.cells) {
      const id = carIdOf(raw);
      if (!id || !poolSet.has(id)) continue;
      const k = Buffer.from(raw).toString('hex');
      if (viste.has(k)) continue;
      viste.add(k);
      if (!perAuto.has(id)) perAuto.set(id, []);
      perAuto.get(id).push(raw);
    }
  }
  const cellePool = [];
  const ordine = [...perAuto.keys()];
  for (let giro = 0; giro < MAX_CELLE_DONOR; giro++) {
    for (const id of ordine) {
      const b = (perAuto.get(id) ?? [])[giro];
      if (!b) continue;
      cellePool.push(b);
      if (cellePool.length >= MAX_CELLE_DONOR) break;
    }
    if (cellePool.length >= MAX_CELLE_DONOR) break;
  }
  const uniche = cellePool.length;   // già deduplicate per byte

  // donor: piloti+config dalla fonte con più celle totali (griglia EVO vera)
  const fonteBase = [...fonti].sort((a, b) => b.cells.length - a.cells.length).find((s) => s.drivers.length >= Math.min(target, 8))
    ?? [...fonti].sort((a, b) => b.drivers.length - a.drivers.length)[0];

  if (!fonteBase || uniche < target) {
    ko++; fallite.push(`❌ ${n.display} [${n.nodeId}]: ${uniche} celle uniche del pool sulle fonti (servono ${target}).${cellePool.length ? ' Servono più varianti (liverie/varianti) delle auto del pool.' : ' Nessuna auto del pool è mai stata fotografata.'}`);
    continue;
  }

  // file donor temporaneo: celle del pool + piloti/config/meteo della fonte base
  const tmp = mkdtempSync(join(tmpdir(), 'evo-donor-'));
  try {
    const donorPath = join(tmp, nodeIdSan(n.nodeId) + '.customgrid');
    const topFields = [];
    for (const b of cellePool) topFields.push({ field: 1, wire: 2, bytes: b });
    for (const b of fonteBase.drivers) topFields.push({ field: 2, wire: 2, bytes: b });
    if (fonteBase.config) topFields.push({ field: 3, wire: 2, bytes: fonteBase.config });
    if (fonteBase.weather != null) topFields.push({ field: 4, wire: 0, varint: BigInt(fonteBase.weather) });
    writeFileSync(donorPath, encodeMsg(topFields));

    const { buffer, report } = buildGridMessage({ ladder, nodeId: n.nodeId, roundIndex: 0, file: donorPath });
    const g = gridFileOf(buffer);
    const modelli = [...new Set(g.cells.map((c) => c.carId))];
    if (g.cells.length !== target) throw new Error(`builder ha scritto ${g.cells.length} celle, servono ${target}`);

    if (!DRY) {
      for (const dir of [MAGAZZINO, FABBRICA]) {
        mkdirSync(dir, { recursive: true });
        const dest = join(dir, nodeIdSan(n.nodeId) + '.customgrid');
        if (existsSync(dest)) copyFileSync(dest, dest + '.bak-gen-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16));
        writeFileSync(dest, buffer);
      }
    }
    ok++;
    console.log(`${DRY ? '[dry] ✅' : '✅'} ${n.display} [${n.nodeId}] — donor ${uniche} uniche (${modelli.length} modelli: ${modelli.map(nomeAuto).join(', ')}) · griglia ${g.cells.length}/${target} · AI ${report.ai ?? 'del template'}· ${report.origine ?? ''}`.trim());
  } catch (e) {
    ko++; fallite.push(`❌ ${n.display} [${n.nodeId}]: builder rifiuta — ${String(e.message).split('\n')[0].slice(0, 140)}`);
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { }
  }
}

console.log('====================================');
console.log(`generate: ${ok} · fallite: ${ko}`);
for (const f of fallite) console.log(f);
