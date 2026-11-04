// cura-livree.mjs — LA CURA DELLE LIVERIE CHE EVO NON HA MAI SCRITTO (2/11;
// promosso a tool permanente dalla cura-chimera monouso della serata 1/11).
//
// IL PRINCIPIO (principio): il builder non inventa niente. Nomi (carId,
// mech_N, visual_N) e soprattutto l'INTERO blocco f14 — la livrea vera con i
// suoi colori interni, non l'etichetta — esistono SOLO dentro le celle che EVO
// scrive lui. Quando in un file griglia finisce una cella con una coppia mai
// assemblata da EVO, l'anteprima in Personalizzazione Griglia resta vuota e
// quella zona fa crash Gameface (caso del 1/11, 16:51). Il cancellaio del
// builder (src/gridbuilder.mjs, hoistato 2/11) impedisce di GENERARNE di
// nuove; questo tool GUARISCE le celle già scritte male sul disco.
//
// LA CURA: per ogni cella bersaglio cerca nella pila di last_grid
// (GameModes/last_grid.customgrid e i suoi .bak-*: le versioni del parco) una
// cella che dichiara la STESSA identità — stesso carId (f3), stesso modulo
// meccanico (f10) e stesso modulo visual (f11), byte per byte — e fotocopia
// INTERO il suo run di f14 (le livree in fila). f10 e f11 restano intatti:
// PI e skill non cambiano. Cella senza donore: segnalata e NON toccata —
// niente numeri inventati; il cancellaio del builder la rifiuterebbe comunque
// al primo irrigidimento del template.
//
// BERSAGLI: data/grid-templates/*.customgrid + GameModes/last_grid.customgrid
// (oppure percorsi extra passati a riga di comando). Dopo la scrittura di
// last_grid il roster del weekend viene riscritto, come per ogni altro tool
// della griglia.
//
// Uso:
//   node tools/cura-livree.mjs              → DRY RUN: quadro, niente scritto
//   node tools/cura-livree.mjs --scrivi     → scrive (EVO CHIUSO obbligatorio)
//   node tools/cura-livree.mjs --scrivi /percorso/extra.customgrid → bersaglio a parte
//
// Backup *.bak-livree-* su ogni file scritto.
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg, encodeMsg, bakName, gameRunning, GAME_MODES_DIR } from './evo-grid.mjs';
import { syncRoster, celleDiGrid } from '../src/weekend-roster.mjs';

const RADICE = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIVI = process.argv.includes('--scrivi');
const EXTRA = process.argv.filter((a) => a.endsWith('.customgrid') && existsSync(a));

// f11/f10 arrivano wire 2 (bytes), f14 in fila: sempre Buffer coerente.
const ifB = (g) => { const b = g?.bytes; return b == null ? null : Buffer.isBuffer(b) ? b : Buffer.from(b); };
const hex = (b) => (b ? b.toString('hex') : null);

/* il NOME del preset dichiarato dal modulo (mech o visual): 'preset_…', come
   lo legge anche il builder. L'identità è quella, non i byte del modulo (che
   possono cambiare dettagli senza cambiare livrea). */
const nomePreset = (mod) => {
  if (!mod) return null;
  const m = mod.toString('utf8').match(/preset_[A-Za-z0-9_]+/);
  if (m) return m[0];
  const q = mod.toString('utf8').match(/[\x20-\x7e]{3,24}/);
  return q ? q[0] : null;
};

/* L'identità della cella (carId + i due moduli, byte esatti) e il run di f14
   (la livrea vera, in fila): la chiave è GUARDIA contro le chimere residue. */
function analizza(cella) {
  let carId = null;
  let meBi = null;
  let biVis = null;
  const f14 = [];
  for (const g of decodeMsg(cella)) {
    if (g.field === 3) carId = ifB(g).toString('utf8');
    else if (g.field === 10) meBi = ifB(g);
    else if (g.field === 11) biVis = ifB(g);
    else if (g.field === 14) f14.push(ifB(g));
  }
  const parti = f14.map(hex);
  const chiave = `${carId}|${nomePreset(meBi)}|${nomePreset(biVis)}`;
  return { chiave, parti, run: parti.join('|') };
}

/* ---- 1. I DONORI: la pila di last_grid in GameModes (parco gioco-autore).
   SCOPERTA DELLA SONDA (tmp/_sonda-donori.mjs, 2/11): per la STESSA identità
   dichiarata EVO scrive PIÙ varianti di f14 (livree generata per griglia):
   la variante certa è la PIÙ FREQUENTE nel parco — la scelta del "primo
   donore visto" sarebbe una lotteria. ---- */
const donori = new Map(); // identità → Map(run → quante celle ce l'hanno)
function raccogliDonori(file) {
  try {
    const celle = decodeMsg(readFileSync(file)).filter((f) => f.field === 1 && f.wire === 2).map((f) => ifB(f));
    for (const cella of celle) {
      const r = analizza(cella);
      if (r.chiave.includes('null') || !r.parti.length) continue; // identità incompleta o senza livree
      const varie = donori.get(r.chiave) ?? donori.set(r.chiave, new Map()).get(r.chiave);
      varie.set(r.run, (varie.get(r.run) ?? 0) + 1);
    }
  } catch (e) { console.log(`  (${basename(file)}) non letto: ${e.message}`); }
}

const pilaDonori = [];
const LIVE = join(GAME_MODES_DIR, 'last_grid.customgrid');
if (existsSync(LIVE)) pilaDonori.push(LIVE);
try {
  for (const n of readdirSync(GAME_MODES_DIR)) {
    if (n.startsWith(basename(LIVE) + '.bak-')) pilaDonori.push(join(GAME_MODES_DIR, n));
  }
} catch { /* niente GameModes: sandbox dei test */
}
for (const f of pilaDonori) raccogliDonori(f);
// dalle varianti frequenti alla scelta: il run col più alto quorum per identità
const donoriScelti = new Map(); // identità → { run, varianti, quorum }
for (const [chiave, varie] of donori) {
  let run = null, quorum = 0, varianti = 0;
  for (const [r, n] of varie) { varianti++; if (n > quorum) { run = r; quorum = n; } }
  donoriScelti.set(chiave, { run, varianti, quorum });
}
console.log(`donori gioco-AUTORE: ${donoriScelti.size} identità (carId+mech+visual) — varianti f14 nel parco: ${[...donori.values()].reduce((s, m) => s + m.size, 0)}`);

/* ---- 2. I BERSAGLI: template della casa + last_grid + eventuali extra ---- */
const bersagli = [];
const dirT = join(RADICE, 'data', 'grid-templates');
try {
  for (const n of readdirSync(dirT)) if (n.endsWith('.customgrid')) bersagli.push(join(dirT, n));
} catch { /* niente dir template: sandbox */ }
bersagli.push(LIVE);
bersagli.push(...EXTRA);

function cura(file) {
  if (!existsSync(file)) return 0;
  const fields = decodeMsg(readFileSync(file));
  const idx = [];
  const celle = [];
  fields.forEach((f, i) => { if (f.field === 1 && f.wire === 2) { idx.push(i); celle.push(ifB(f)); } });
  let tocchi = 0;
  let senza = 0;
  const nuovi = celle.map((cella) => {
    const r = analizza(cella);
    const d = donoriScelti.get(r.chiave);
    if (!d) { senza++; return cella; }
    if (r.run === d.run) return cella; // già la variante dominante del parco
    const dentro = decodeMsg(cella);
    const nuovo = [];
    let messo = false;
    for (const g of dentro) {
      if (g.field === 14 && !messo) {
        messo = true;
        // il RUN INTERO del donore maggioritario: livree in fila, ordine di EVO
        for (const h of d.run.split('|')) nuovo.push({ field: 14, wire: 2, bytes: Buffer.from(h, 'hex') });
        continue;
      }
      if (g.field === 14) continue;
      nuovo.push(g);
    }
    tocchi++;
    return encodeMsg(nuovo);
  });
  if (!tocchi) {
    console.log(`${basename(file)}: nessuna cella da curare${senza ? ` — attenzione: ${senza} senza donore, restano` : ''}`);
    return 0;
  }
  nuovi.forEach((b, i) => { fields[idx[i]].bytes = b; });
  if (SCRIVI && !gameRunning()) {
    const bak = bakName(file, 'livree');
    copyFileSync(file, bak);
    writeFileSync(file + '.tmp', encodeMsg(fields));
    renameSync(file + '.tmp', file);
    console.log(`${basename(file)}: ${tocchi} celle curate (backup ${basename(bak)})`);
  } else if (SCRIVI) {
    console.log(`${basename(file)}: EVO APERTO, niente scritta — rilancia a gioco chiuso`);
    return 0;
  } else {
    console.log(`${basename(file)}: DRY RUN — ${tocchi} celle da curare${senza ? ` (e ${senza} senza donore)` : ''}`);
  }
  return tocchi;
}

let totale = 0;
for (const file of [...new Set(bersagli)]) totale += cura(file);

/* ---- 3. Dopo la scritta di last_grid: roster del weekend ritoccato ---- */
if (SCRIVI && totale) {
  try {
    const r = syncRoster(celleDiGrid(readFileSync(LIVE)), { file: join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave') });
    console.log(`roster del weekend riscritto: ${JSON.stringify({ scritti: r.written ?? r })}`);
  } catch (e) { console.log(`  (roster non riscritto: ${e.message})`); }
}

console.log(SCRIVI ? 'curata finita.' : 'DRY RUN: niente toccato. Rilancia con --scrivi.');
if (!SCRIVI && totale) process.exitCode = 3; // il dry run che trova anomalia esce non-zero: i wrapper lo vedono
