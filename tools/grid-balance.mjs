// grid-balance.mjs — BILANCIAMENTO MULTI-MARCA del customgrid, per AUTO.
//
// Scoperta del 19/10/2026 (griglia 8–9 PI di Mauro: GR86 / R5 GT Turbo / Escort):
// dentro ogni CELLA del customgrid:
//   campo 24 (varint) = BALLAST in kg        (100 = 100kg — come lo slider UI)
//   campo 25 (float32) = RESTRICTOR 0..1     (0.10 = penalità 10%)
// Le celle senza penalità NON hanno i campi (default 0). La UI e la gara
// li leggono dal file: scrivendoli NOI possiamo mettere valori che il menu
// non offre (es. 8%), e in automatico per ogni classe del file convenzioni.
//
// uso:
//   node tools/grid-balance.mjs                       → dump ballast/restrictor attuali
//   node tools/grid-balance.mjs --serie <id> --dry    → anteprima dalla convenzione
//   node tools/grid-balance.mjs --serie <id> --track "Circuit Of The Americas" --apply
//                                                     → traccia = supplementi perTraccia
//   node tools/grid-balance.mjs --rule "Ford Escort RS Cosworth=100,8" --apply
//       (override a mano; formato "Nome auto=kg,penalità%", regole ripetibili)
//   node tools/grid-balance.mjs --drop preset_mk8gti_mech_1 --drop "Nome auto" --apply
//       (RIMUOVE le celle di quell'auto — e il pilota legato alla stessa posizione
//        ordinale — e aggiorna il conteggio nel config: l'unico modo per togliere
//        un'auto a un customgrid costruito dal menu di EVO)
//   node tools/grid-balance.mjs --ai 94-99 --apply    → riscrive l'intervallo AI (21/22)
//
// Il modulo è import-safe: la CLI gira solo quando eseguito direttamente
// (lezione 19/10: il primo import da webui/grid-apply eseguiva la CLI e leggeva
// il file reale inutilmente).
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodeMsg, encodeMsg, gridFileOf, gameRunning, GAME_MODES_DIR } from './evo-grid.mjs';
import { patchPerTrack } from '../src/gridbuilder.mjs';   // supplementi per-traccia della classe (cls.perTraccia)

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FILE = join(GAME_MODES_DIR, 'last_grid.customgrid');
const CLASSES_FILE = () => process.env.EVO_CLASSES_FILE ?? join(HERE, '..', 'data', 'grid-classes.json');

const f32 = (b) => (b && b.length >= 4) ? Buffer.from(b.slice?.() ?? b).readFloatLE(0) : null;
const setF32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; };
const utf8 = (b) => Buffer.from(b).toString('utf8');

/* ---------- lettura convenzioni classi ---------- */
export function loadClasses() {
  return JSON.parse(readFileSync(CLASSES_FILE(), 'utf8'));
}

/* ---------- lettura celle (per dump/DROP/GUI) ---------- */
export function readCells(buf) {
  const g = gridFileOf(buf);
  const out = [];
  g.cells.forEach((c, i) => {
    let preset = null, kg = 0, pct = 0;
    for (const f of decodeMsg(c.raw)) {
      if (f.field === 10) preset = decodeMsg(f.bytes).filter((x) => x.field === 1).map((x) => utf8(x.bytes))[0] ?? null;
      else if (f.field === 24) kg = Number(f.varint);
      else if (f.field === 25) pct = (f32(f.bytes) ?? 0) * 100;
    }
    out.push({ idx: i, name: c.carName ?? c.carId ?? '?', preset, kg, pct });
  });
  const cfg = g.config ?? {};
  return { cells: out, count: cfg.count ?? g.cells.length, aiMin: cfg.aiMin ?? null, aiMax: cfg.aiMax ?? null, piMin: cfg.piMin ?? null, piMax: cfg.piMax ?? null, drivers: g.drivers.length };
}

/* ---------- kernel: applica un piano di bilanciamento al buffer ---------- */
/**
 * plan = { rules: [{match: {carId?|carName?|preset}, ballastKg, restrictorPct}] }
 * Regole con match su preset/carName/carId (esatto). Ritorna un report.
 */
export function balanceCells(buf, plan) {
  const fields = decodeMsg(buf);
  const rules = plan.rules ?? [];
  const hit = new Array(rules.length).fill(0);
  const report = [];
  let cleared = 0;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].field !== 1) continue;
    const inner = decodeMsg(fields[i].bytes);
    const cell = { carId: null, carName: null, preset: null, ballast: null, restrictor: null };
    for (const g of inner) {
      if (g.field === 3) cell.carId = utf8(g.bytes);
      else if (g.field === 4) cell.carName = utf8(g.bytes);
      else if (g.field === 10) { cell.preset = decodeMsg(g.bytes).filter((x) => x.field === 1).map((x) => utf8(x.bytes))[0] ?? null; }
      else if (g.field === 24) cell.ballast = Number(g.varint);
      else if (g.field === 25) cell.restrictor = f32(g.bytes);
    }
    const rule = rules.findIndex((r) => {
      const m = r.match ?? r;
      if (m.carId != null && m.carId !== cell.carId) return false;
      if (m.carName != null && m.carName !== cell.carName) return false;
      if (m.preset != null && m.preset !== cell.preset) return false;
      return true;
    });
    let newInner;
    if (rule >= 0) {
      const r = rules[rule];
      hit[rule]++;
      const kg = Math.round(r.ballastKg ?? 0);
      const pct = r.restrictorPct ?? (r.restrictor != null ? r.restrictor * 100 : 0);
      newInner = inner.filter((g) => g.field !== 24 && g.field !== 25);
      if (kg > 0) newInner.push({ field: 24, wire: 0, varint: BigInt(kg) });
      if (pct > 0) newInner.push({ field: 25, wire: 5, bytes: setF32(pct / 100) });
      report.push({ car: cell.preset ?? cell.carName, kg, pct, changed: kg !== (cell.ballast ?? 0) || Math.abs(pct - (cell.restrictor ?? 0) * 100) > 0.05 });
    } else {
      // niente regola: azzera (rimuove i campi) — coerente col default del gioco
      newInner = inner.filter((g) => g.field !== 24 && g.field !== 25);
      if ((cell.ballast ?? 0) > 0 || (cell.restrictor ?? 0) > 0) { cleared++; report.push({ car: cell.preset ?? cell.carName, kg: 0, pct: 0, changed: true }); }
      else report.push({ car: cell.preset ?? cell.carName, kg: 0, pct: 0, changed: false });
    }
    fields[i].bytes = encodeMsg(newInner);
  }
  const unused = rules.map((r, i) => hit[i] === 0 ? (r.match?.carName ?? r.match?.carId ?? JSON.stringify(r.match)) : null).filter(Boolean);
  return { fields, report, cleared, unused };
}

/* ---------- rimozione di auto (drop) ---------- */
/**
 * Rimuove le CELLE che combaciano i matchers (+ il PILOTA legato alla stessa
 * posizione ordinale) e aggiorna il conteggio nel config (f1). Il menu di EVO
 * legge il file al volo: celle e piloti togliuti a coppie non lo rompono.
 * matchers = [{preset?}, {carName?}]   → ritorna { fields, droppate:[names] }
 */
export function dropCells(buf, matchers) {
  const fields = decodeMsg(buf);
  const cellsOrd = [], driversOrd = [];   // posizioni ordinali (non indici nel buffer)
  const cellMeta = new Map();
  fields.forEach((f) => {
    if (f.field === 1) cellsOrd.push(f);
    else if (f.field === 2) driversOrd.push(f);
  });
  cellsOrd.forEach((f, ord) => {
    const inner = decodeMsg(f.bytes);
    let preset = null, carName = null;
    for (const g of inner) {
      if (g.field === 4) carName = utf8(g.bytes);
      else if (g.field === 10) preset = decodeMsg(g.bytes).filter((x) => x.field === 1).map((x) => utf8(x.bytes))[0] ?? null;
    }
    cellMeta.set(f, { ord, preset, carName });
  });
  const kill = new Set();
  const droppate = [];
  for (const f of fields) {
    if (f.field !== 1) continue;
    const m = cellMeta.get(f);
    if (!matchers.some((mt) => (mt.preset != null && mt.preset === m.preset) || (mt.carName != null && mt.carName === m.carName))) continue;
    kill.add(f);
    droppate.push(m.carName ?? m.preset ?? '?');
    if (driversOrd[m.ord]) kill.add(driversOrd[m.ord]);
  }
  if (!kill.size) return { fields, droppate, empty: true };
  const kept = fields.filter((f) => !kill.has(f));
  // aggiorna il conteggio nel config (f3 → f1)
  const f3 = kept.find((f) => f.field === 3 && f.wire === 2);
  if (f3) {
    const inner = decodeMsg(f3.bytes);
    const i = inner.findIndex((g) => g.field === 1);
    const newCount = cellsOrd.length - droppate.length;
    if (i >= 0) inner[i] = { ...inner[i], varint: BigInt(newCount) };
    else inner.push({ field: 1, wire: 0, varint: BigInt(newCount) });
    f3.bytes = encodeMsg(inner);
  }
  return { fields: kept, droppate, empty: false };
}

/* ---------- intervallo AI (config 21/22) ---------- */
/** Riscrive aiMin/aiMax nel config — la mano sul cruscotto anche da file. */
export function setAiRange(buf, min, max) {
  const fields = decodeMsg(buf);
  const f3 = fields.find((f) => f.field === 3 && f.wire === 2);
  if (!f3) throw new Error('config (campo 3) non trovato nel customgrid');
  const inner = decodeMsg(f3.bytes);
  for (const [num, val] of [[21, min], [22, max]]) {
    const i = inner.findIndex((g) => g.field === num);
    if (i >= 0) inner[i] = { ...inner[i], varint: BigInt(val) };
    else inner.push({ field: num, wire: 0, varint: BigInt(val) });
  }
  f3.bytes = encodeMsg(inner);
  return { fields };
}

/* ---------- piano dalla convenzione di classe ---------- */
export function planFromClass(classes, serieId, trackRef) {
  const c = classes.classi?.[serieId];
  if (!c) throw new Error(`classe "${serieId}" non in data/grid-classes.json (ci sono: ${Object.keys(classes.classi ?? {}).join(', ')})`);
  const rules = c.regole.map((r) => ({ match: r.preset ? { preset: r.preset } : { carName: r.auto }, ballastKg: r.ballastKg ?? 0, restrictorPct: r.restrictorPct ?? 0 }));
  // supplementi per-traccia (cls.perTraccia): le regole di Brands non tengono
  // sulle piste con rettilinei lunghi — vedi COTA 19/10. Per risultato:
  //   node tools/grid-balance.mjs --serie <id> --track "Circuit Of The Americas"
  let trkMsg = '';
  if (trackRef) {
    const flat = rules.map((r) => ({ rule: r.match, kg: r.ballastKg, pct: r.restrictorPct }));
    const trk = patchPerTrack(flat, c, trackRef);
    if (trk) { for (let i = 0; i < rules.length; i++) rules[i].restrictorPct = flat[i].pct; trkMsg = ` · per-traccia "${trk}"`; }
    else trkMsg = ` · nessun supplemento per-traccia per "${trackRef}"`;
  }
  return { rules, trkMsg };
}

/* ---------- CLI (solo quando eseguito direttamente) ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\\\/g, '/')}`).href;
if (isMain) {
const argv = process.argv.slice(2);
const getArg = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };
const has = (name) => argv.includes('--' + name);
let FILE = getArg('file') ?? DEFAULT_FILE;

const buf = readFileSync(FILE);
const dump = () => {
  const g = gridFileOf(buf);
  console.log(`${FILE} — ${buf.length} byte, ${g.cells.length} celle`);
  for (let i = 0; i < g.cells.length; i++) {
    const inner = decodeMsg(g.top.filter((f) => f.field === 1)[i].bytes);
    let name = '(?)', kg = 0, pct = 0;
    for (const g3 of inner) {
      if (g3.field === 4) name = Buffer.from(g3.bytes).toString('utf8');
      else if (g3.field === 24) kg = Number(g3.varint);
      else if (g3.field === 25) pct = f32(g3.bytes) * 100;
    }
    console.log(`${String(i + 1).padStart(3)}  ${name.padEnd(52)} ballast ${String(kg).padStart(4)}kg  restrictor ${pct.toFixed(1).replace(/\\.0$/, '')}%`);
  }
};
const hasAction = has('serie') || argv.includes('--rule') || has('drop') || has('ai') || has('apply') || has('dry');
if (argv.length === 0 || !hasAction) { dump(); process.exit(0); }

// collezione azioni
const drops = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--drop') continue;
  const v = argv[++i];
  if (!v) { console.error('--drop richiede un preset o "Nome auto"'); process.exit(1); }
  drops.push(v.startsWith('preset_') ? { preset: v } : { carName: v });
}
const aiArg = getArg('ai');
let aiRange = null;
if (aiArg) {
  const m = String(aiArg).match(/^(\\d{1,3})[-–](\\d{1,3})$/);
  if (!m) { console.error('--ai richiede "min-max" (es. 94-99)'); process.exit(1); }
  aiRange = [Number(m[1]), Number(m[2])];
}

if (!drops.length && !aiRange && !has('serie') && !argv.includes('--rule')) { console.error('nessuna azione: usa --serie, --rule, --drop o --ai'); process.exit(1); }

// costruzione piano: regole a mano (--rule) oppure dalla convenzione (--serie)
const classes = loadClasses();
let plan = { rules: [] };
if (getArg('serie')) plan = planFromClass(classes, getArg('serie'), getArg('track'));
const autoBase = getArg('auto-base');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--rule') continue;
  const r = argv[++i];
  if (!r) { console.error('--rule richiede "auto=kg,%"'); process.exit(1); }
  const [car, spec = '0,0'] = r.split('=');
  const [kg = 0, pct = 0] = spec.split(',').map(Number);
  // "preset_gr86_mech_3=100,10" matcha sul preset meccanico; altrimenti sul nome auto
  const match = car.startsWith('preset_') ? { preset: car } : { carName: car };
  plan.rules.push({ match, ballastKg: kg, restrictorPct: pct });
}

const dry = has('dry') || !has('apply');
let fields = decodeMsg(buf);
let report = [], cleared = 0, unused = [], droppate = [];
if (plan.rules.length) {
  const res = balanceCells(buf, plan);
  fields = res.fields; report = res.report; cleared = res.cleared; unused = res.unused;
  console.log(`piano: ${plan.rules.map((r) => `${(r.match.preset ?? r.match.carName)} → ${r.ballastKg ?? 0}kg/${r.restrictorPct ?? 0}%`).join(' · ')}`);
  if (plan.trkMsg) console.log(`  traccia:${plan.trkMsg}`);
  for (const r of report) console.log(`  ${(r.changed ? '→' : '=').trim()}  ${String(r.car).padEnd(52)} ${r.kg}kg ${r.pct}%`);
  if (unused.length) console.log(`⚠ regole senza celle corrispondenti: ${unused.join(' · ')}`);
}
if (drops.length) {
  const d = dropCells(Buffer.from(encodeMsg(fields)), drops);
  if (!d.empty) { fields = d.fields; console.log(`drop: rimosse ${d.droppate.length} auto (+ ${d.droppate.length} piloti): ${d.droppate.join(' · ')}`); }
  else console.log('drop: nessuna cella corrispondente');
}
if (aiRange) {
  const a = setAiRange(Buffer.from(encodeMsg(fields)), aiRange[0], aiRange[1]);
  fields = a.fields;
  console.log(`intervallo AI → ${aiRange[0]}-${aiRange[1]}`);
}
if (dry) { console.log('DRY: niente scritto. Aggiungi --apply per scrivere.'); process.exit(0); }

if (gameRunning() && !has('force')) throw new Error('EVO è APERTO: chiudi il gioco prima di scrivere (o --force sapendolo).');
const backup = `${FILE}.bak-bal-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
copyFileSync(FILE, backup);
writeFileSync(`${FILE}.tmp`, encodeMsg(fields));
renameSync(`${FILE}.tmp`, FILE);
console.log(`scritto. Backup: ${backup}`);
}
