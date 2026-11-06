// pulizia-celle.mjs — PULIZIA-CELLE: via i doppioni byte e — su richiesta con
// --monocolore — variare i modelli usciti a tinta unica. (2/11, richiesta Mauro
// sul trofeo_mx5: il bagno della cura-livree delle 20:41 fotocopiò lo STESSO
// donore su 4 celle ND Cup (1/3/5/9) e su 2 (7/11): il template ripresenta
// celle byte-identiche, che il builder rifiuta per lezione 20/10 e crash 23/10.)
//
// LA CURA (lezioni di casa, tutte rispettate):
//   - per ogni gruppo di celle BYTE-IDENTICHE la prima resta com'è, le altre
//     ricevono INTERO il run di f14 (livree in fila, ordine di EVO) di un
//     donore VERO del parco di last_grid (il file vivo e i suoi .bak-*: tutto
//     scritto da EVO) con la STESSA identità (carId + mech + visual) e un run
//     ANCORA NON USATO nel file: mai chimere, mai numeri inventati.
//   - la guardia byte-uniche ricontrolla DOPO la cura: se un gruppo resta
//     doppione per mancanza di varianti reali viene dichiarato e il file NON
//     si scrive (il parco dà il limite, non l'immaginazione).
//   - --monocolore: quando le TUTTE le celle di un modello portano lo STESSO
//     run di f14 (uscite monocolore), le celle extra pescano le ALTRE varianti
//     reali del parco (stessa identità). Il default resta prudente: senza flag
//     una griglia monocolore legittima (un modello = una tinta) non viene toccata.
//   - f10, f11, skill, driver e tutti gli altri campi restano intatti: si cambia
//     SOLO il run di f14, come cura-livree.
//
// DONORI: le varianti in ordine di QUORUM decrescente (dominante prima, la
// lezione sonda-donori del 2/11: la variante certa è la più frequente del parco).
//
// BERSAGLI: data/grid-templates/*.customgrid + GameModes/last_grid.customgrid
// (quest'ultimo SOLO con EVO CHIUSO); passando un percorso .customgrid esplicito
// a riga di comando la cura mira SOLO a QUEL file (cure mirate, mai in blocco).
// Scrittura SOLO con --scrivi e EVO chiuso; backup *.bak-pulizia-* su ogni file
// toccato; dopo la scritta di last_grid il roster del weekend viene riscritto,
// come per ogni altro tool della griglia.
//
// Uso:
//   node tools/pulizia-celle.mjs               → DRY RUN: quadro, niente scritto
//   node tools/pulizia-celle.mjs --scrivi      → scrive (EVO CHIUSO obbligatorio)
//   node tools/pulizia-celle.mjs --monocolore  → DRY RUN anche dei monocolore
//   node tools/pulizia-celle.mjs --scrivi --monocolore /percorso/extra.customgrid
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg, encodeMsg, bakName, gameRunning, GAME_MODES_DIR } from '../../src/evo-grid.mjs';
import { syncRoster, celleDiGrid } from '../../src/weekend-roster.mjs';

const RADICE = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIVI = process.argv.includes('--scrivi');
const MONOCOLORE = process.argv.includes('--monocolore');
const EXTRA = process.argv.filter((a) => a.endsWith('.customgrid') && existsSync(a));

const ifB = (g) => { const b = g?.bytes; return b == null ? null : Buffer.isBuffer(b) ? b : Buffer.from(b); };
const hex = (b) => (b ? b.toString('hex') : null);

const nomePreset = (mod) => {
  if (!mod) return null;
  const m = mod.toString('utf8').match(/preset_[A-Za-z0-9_]+/);
  if (m) return m[0];
  const q = mod.toString('utf8').match(/[\x20-\x7e]{3,24}/);
  return q ? q[0] : null;
};

/* identità della cella (carId + mech + visual per NOME preset, come il builder):
   la chiave dichiara la stessa livrea-famiglia anche se i byte dei moduli
   cambiano dettaglio non visibile, e tiene la cura dentro la stessa serie. */
function identita(cella) {
  let carId = null;
  let mech = null;
  let vis = null;
  const f14 = [];
  for (const g of decodeMsg(cella)) {
    if (g.field === 3) carId = ifB(g).toString('utf8');
    else if (g.field === 10) mech = nomePreset(ifB(g));
    else if (g.field === 11) vis = nomePreset(ifB(g));
    else if (g.field === 14) f14.push(hex(ifB(g)));
  }
  return { chiave: `${carId}|${mech}|${vis}`, run: f14.join('|'), f14: f14.length };
}

/* ---- 1. I DONORI: parco di last_grid (vivo + bak-*), identità → varianti ---- */
const donori = new Map(); // identità → Map(run → quorum)
function raccogliDonori(file) {
  try {
    const celle = decodeMsg(readFileSync(file)).filter((f) => f.field === 1 && f.wire === 2).map((f) => ifB(f));
    for (const cella of celle) {
      const r = identita(cella);
      if (!r.f14 || r.chiave.includes('null')) continue; // identità incompleta o senza livree
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
} catch { /* niente GameModes: sandbox dei test */ }
for (const f of [...new Set(pilaDonori)]) raccogliDonori(f);

/* varianti di un'identità in ordine di quorum decrescente: deterministico,
   la stessa risposta a ogni avvio con lo stesso parco. */
const variantiDi = (chiave) => {
  const varie = donori.get(chiave);
  if (!varie) return [];
  return [...varie.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([r]) => r);
};
const conteggioDonori = [...donori.values()].reduce((s, m) => s + m.size, 0);
console.log(`donori gioco-AUTORE: ${donori.size} identità — varianti f14 reali nel parco: ${conteggioDonori}`);

/* ---- 2. la cura di un file: doppioni + (opz.) monocolore, SOLO dentro la regola ---- */
const cura = (file) => {
  if (!existsSync(file)) return 0;
  const fields = decodeMsg(readFileSync(file));
  const idx = [];
  const celle = [];
  fields.forEach((f, i) => { if (f.field === 1 && f.wire === 2) { idx.push(i); celle.push(ifB(f)); } });

  /* le identità nel file, con le celle in ordine e i run già in uso */
  const perFile = new Map(); // chiave → { celle: [indice], runs: Map(run → primo indice) }
  celle.forEach((b, i) => {
    const r = identita(b);
    const g = perFile.get(r.chiave) ?? perFile.set(r.chiave, { celle: [], runs: new Map() }).get(r.chiave);
    g.celle.push(i);
    if (!g.runs.has(r.run)) g.runs.set(r.run, i);
  });

  /* bersaglio 1 — DOPPIONI byte: identità con la STESSA livrea su più celle.
     Bersaglio 2 — MONOCOLORE (solo con --monocolore): tutte le celle di un
     modello su UNA sola variante. In entrambi i casi si ricurano le celle
     dalla seconda in avanti, LA PRIMA resta come campione. */
  const bersaglio = [];
  for (const [chiave, g] of perFile) {
    for (const [run, primo] of g.runs) {
      const extra = g.celle.filter((i) => i !== primo);
      if (g.runs.size === 1 && g.celle.length > 1) {
        // una sola variante su tutte le celle: doppione se sono identiche,
        // monocolore altrimenti — il flag guida la cura
        const tag = extra.some((i) => hex(celle[i]) === hex(celle[primo])) ? 'doppione' : 'monocolore';
        if (tag === 'doppione') bersaglio.push(...extra.map((i) => ({ i, chiave, run, tag })));
        else if (MONOCOLORE) bersaglio.push(...extra.map((i) => ({ i, chiave, run, tag: 'monocolore' })));
      } else {
        bersaglio.push(...extra.filter((i) => hex(celle[i]) === hex(celle[primo])).map((i) => ({ i, chiave, run, tag: 'doppione' })));
      }
    }
  }
  /* i gruppi con DUE varianti non sono né doppioni (run diversi) né
     monocolore in senso stretto ma se c'è un doppione nel gruppo viene curato;
     il caso "2 varianti × 2 doppioni" (7/11 del trofeo) arriva dal ramo sopra. */

  const nDoppi = bersaglio.filter((b) => b.tag === 'doppione').length;
  const nMono = bersaglio.length - nDoppi;
  if (!bersaglio.length) {
    console.log(`${basename(file)}: niente da curare (celle ${celle.length}, doppioni 0${MONOCOLORE ? ', monocolore 0' : ''})`);
    return 0;
  }
  console.log(`${basename(file)}: celle ${celle.length} · doppioni da curare ${nDoppi}${MONOCOLORE ? ` · monocolore da variare ${nMono}` : ''}`);

  /* SCELTA DEI DONORI: per ogni cella da curare un run REALE dell'identità che
     non sia già in uso nel file (né fra quelli appena assegnati). Doppioni
     prima, monocolore dopo: le varianti libere partono dai gruppi incriminati. */
  const usiOra = new Set();
  for (const [, g] of perFile) for (const run of g.runs.keys()) usiOra.add(run);
  const piano = [];
  const senza = [];
  for (const b of bersaglio) {
    const libere = variantiDi(b.chiave).filter((v) => !usiOra.has(v));
    if (!libere.length) { senza.push(b); continue; }
    const nuovoRun = libere[0];
    usiOra.add(nuovoRun);
    piano.push({ i: b.i, run: nuovoRun, tag: b.tag });
  }
  if (senza.length) {
    for (const s of senza) {
      console.log(`  ⚠ ${s.tag} cella ${s.i} (${s.chiave}): il parco offerisce ${variantiDi(s.chiave).length} varianti, tutte già in uso nel file — serve una livrea REALE in più (EVO: più LIVERIES + APPLICA). NON toccata.`);
    }
    if (!piano.length) return senza.length;
  }

  /* SCAMBIO: si riscrive SOLO il run di f14 (intero, ordine di EVO) — la stessa
     prostesi di cura-livree: f10/f11/skill/driver restano intatti. */
  const nuovaCella = (cella, run) => {
    const dentro = decodeMsg(cella);
    const nuovo = [];
    let messo = false;
    for (const g of dentro) {
      if (g.field === 14 && !messo) {
        messo = true;
        for (const h of run.split('|')) nuovo.push({ field: 14, wire: 2, bytes: Buffer.from(h, 'hex') });
        continue;
      }
      if (g.field === 14) continue;
      nuovo.push(g);
    }
    return encodeMsg(nuovo);
  };
  const usati = new Map(idx.map((o, i) => [o, celle[i]]));
  const scambioLoc = (loc, run) => { usati.set(loc, nuovaCella(usati.get(loc), run)); };
  for (const p of piano) scambioLoc(idx[p.i], p.run);

  /* GUARDIA BYTE-UNICHE post-cura: niente scritta se il risultato avrebbe
     ancora doppioni — l'anomalia si cura prima, nel dry-run, non a gara. */
  const visti = new Set();
  let residui = 0;
  for (const c of usati.values()) { const k = hex(c); if (visti.has(k)) residui++; visti.add(k); }
  if (residui) {
    console.log(`  ⚠ ${basename(file)}: dopo la cura resterebbero ${residui} doppioni (parco senza varianti a bastanza) — file NON scritto. Rifai GENERA con più LIVERIES → APPLICA e riporta il parco ricco.`);
    return senza.length + residui;
  }

  for (const [loc, c] of usati) fields[loc].bytes = c;
  if (SCRIVI && !gameRunning()) {
    const bak = bakName(file, 'pulizia');
    copyFileSync(file, bak);
    writeFileSync(file + '.tmp', encodeMsg(fields));
    renameSync(file + '.tmp', file);
    console.log(`  ✅ ${basename(file)}: scritto (backup ${basename(bak)}) — ${piano.length} celle curate`);
  } else if (SCRIVI) {
    console.log(`  ✋ EVO APERTO: niente scritto su ${basename(file)} — rilancia a gioco chiuso.`);
    return 0;
  } else {
    console.log(`  DRY RUN — ${piano.length} celle sarebbero curate (${piano.map((p) => `${p.tag} ${p.i}`).join(', ')})`);
  }
  return piano.length;
};

/* ---- 3. bersagli e giro ---- */
const bersagli = EXTRA.length ? EXTRA : [];
if (!bersagli.length) {
  const dirT = join(RADICE, 'data', 'grid-templates');
  try { for (const n of readdirSync(dirT)) if (n.endsWith('.customgrid')) bersagli.push(join(dirT, n)); } catch { /* sandbox */ }
  bersagli.push(LIVE);
}

let totale = 0;
for (const file of [...new Set(bersagli)]) totale += cura(file);

if (SCRIVI && totale) {
  try {
    const r = syncRoster(celleDiGrid(readFileSync(LIVE)), { file: join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave') });
    console.log(`roster del weekend riscritto: ${JSON.stringify({ scritti: r.written ?? r })}`);
  } catch (e) { console.log(`  (roster non riscritto: ${e.message})`); }
}

console.log(SCRIVI ? 'pulizia-celle finita.' : `DRY RUN: niente toccato${totale ? ` — rilancia con --scrivi${MONOCOLORE ? ' (+ --monocolore già attivo per i modelli a tinta unica)' : ''}` : ''}.`);
if (!SCRIVI && totale) process.exitCode = 3; // dry run che trova anomalia: i wrapper lo vedono
