// build-car-specs.mjs — costruisce data/car-specs.json leggendo i ui_car.json di
// Assetto Corsa 1 installato (stessa filosofia del vecchio progetto: potenza, coppia,
// peso, trazione, cambio, anno, paese e le CURVE motore per il grafico).
//
// Uso (una volta, e poi ogni volta che installi nuove auto DLC in AC1):
//   node tools/build-car-specs.mjs                        → cerca AC1 nelle librerie Steam
//   node tools/build-car-specs.mjs "G:\SteamLibrary\steamapps\common\assettocorsa"
//
// Il risultato è un semplice JSON: { <norm>: { name, brand, power(hp), torque(Nm),
// weight(kg), topspeed, acceleration, pwratio, drive, gearbox, year, country,
// powerCurve:[[rpm,hp]...], torqueCurve:[[rpm,Nm]...] } }, chiave = nome normalizzato.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = process.argv[2];
const CANDIDATES = arg ? [arg] : [
  'G:/SteamLibrary/steamapps/common/assettocorsa',
  'E:/SteamLibrary/steamapps/common/assettocorsa',
  'D:/SteamLibrary/steamapps/common/assettocorsa',
  'C:/Program Files (x86)/Steam/steamapps/common/assettocorsa',
];
const root = CANDIDATES.find((p) => existsSync(join(p, 'content', 'cars')));
if (!root) { console.error('AC1 non trovato: passa la cartella come argomento.'); process.exit(1); }

const carsDir = join(root, 'content', 'cars');
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]/g, '');

/** Sanitizza i JSON di Kunos: accapo reali dentro le stringhe, commenti, virgole finali,
 * BOM. Stessa logica di readDirtyJson in catalog.mjs. */
function readDirtyJson(file) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return null; }
  try { return JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { /* si va di sanifica */ }
  try {
    let text = raw.replace(/^\uFEFF/, '');
    let out = '';
    let inStr = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (!inStr) {
        if (ch === '"') inStr = true;
        out += ch;
        continue;
      }
      if (ch === '\\') { out += ch + (text[i + 1] ?? ''); i++; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      const code = ch.charCodeAt(0);
      if (code === 13) continue;
      if (code === 10) { out += '\\n'; continue; }
      if (code === 9) { out += ' '; continue; }
      if (code < 32) { out += ' '; continue; }
      out += ch;
    }
    text = out
      .replace(/\\/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"\\])\/\/[^\n\r]*/g, '$1')
      .replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(text);
  } catch { return null; }
}
const num = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const m = String(v).match(/([\d.,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const curve = (arr) => !Array.isArray(arr) ? null
  : arr.map((p) => [num(Array.isArray(p) ? p[0] : p), num(Array.isArray(p) ? p[1] : p)])
       .filter((p) => p[0] != null && p[1] != null);

/** Tag di trazione/cambio dal json (vecchio formato o tags). */
function driveOf(ui) {
  const tags = Array.isArray(ui.tags) ? ui.tags.map((t) => String(t).toLowerCase()) : [];
  const all = (JSON.stringify(ui.specs ?? {}) + ' ' + tags.join(' ')).toLowerCase();
  if (/\bawd|4wd|all.?wheel|4x4\b/.test(all)) return 'integrale';
  if (/\brwd|rear.?wheel\b/.test(all)) return 'posteriore';
  if (/\bfwd|front.?wheel\b/.test(all)) return 'anteriore';
  return null;
}
function gearboxOf(ui) {
  const tags = Array.isArray(ui.tags) ? ui.tags.map((t) => String(t).toLowerCase()) : [];
  const all = tags.join(' ');
  if (/sequential|paddle|h-pattern|manual|auto|dual.?clutch|dct/.test(all)) {
    if (/sequential/.test(all)) return 'sequenziale';
    if (/paddle/.test(all)) return 'cambio sul volante';
    if (/dual.?clutch|dct/.test(all)) return 'doppia frizione';
    if (/auto/.test(all)) return 'automatico';
    return 'manuale';
  }
  return null;
}
function yearOf(ui) {
  // AC1 non scrive l'anno: si prova dai tag, altrimenti nulla (i nomi EVO lo hanno già)
  const tags = Array.isArray(ui.tags) ? ui.tags.map((t) => String(t)) : [];
  const hit = tags.join(' ').match(/\b(19|20)\d{2}\b/);
  return hit ? Number(hit[0]) : null;
}
function countryOf(ui) {
  const tags = Array.isArray(ui.tags) ? ui.tags.map((t) => String(t).toLowerCase()) : [];
  const map = { italy: 'Italia', germany: 'Germania', france: 'Francia', japan: 'Giappone', uk: 'Regno Unito', 'great britain': 'Regno Unito', britain: 'Regno Unito', usa: 'Stati Uniti', 'united states': 'Stati Uniti', america: 'Stati Uniti', australia: 'Australia', spain: 'Spagna', netherlands: 'Paesi Bassi', sweden: 'Svezia' };
  for (const t of tags) if (map[t]) return map[t];
  return null;
}

const out = {};
let count = 0;
for (const id of readdirSync(carsDir)) {
  const file = join(carsDir, id, 'ui', 'ui_car.json');
  if (!existsSync(file)) continue;
  let ui = readDirtyJson(file);
  if (!ui || typeof ui !== 'object') continue;
  const s = ui.specs ?? {};
  const name = String(ui.name ?? id).trim();
  const entry = {
    id,
    name,
    brand: String(ui.brand ?? '').trim() || null,
    country: countryOf(ui),
    year: yearOf(ui),
    drive: driveOf(ui),
    gearbox: gearboxOf(ui),
    power: num(s.bhp) ?? null,
    torque: num(s.torque) ?? null,
    weight: num(s.weight) ?? null,
    topspeed: s.topspeed != null ? String(s.topspeed) : null,
    acceleration: s.acceleration != null ? String(s.acceleration) : null,
    pwratio: s.pwratio != null ? String(s.pwratio) : null,
    powerCurve: curve(ui.powerCurve),
    torqueCurve: curve(ui.torqueCurve),
    class: String(ui.class ?? '').trim() || null,
  };
  // power dal pwratio se manca (peso/rapporto peso-potenza)
  if (!entry.power && entry.weight && entry.pwratio) {
    const r = num(entry.pwratio);
    if (r > 0) entry.power = Math.round(entry.weight / r);
  }
  // picco dalla curva come ultimo resort
  if (!entry.power && entry.powerCurve?.length) entry.power = Math.max(...entry.powerCurve.map((p) => p[1]));
  if (!entry.torque && entry.torqueCurve?.length) entry.torque = Math.max(...entry.torqueCurve.map((p) => p[1]));
  const key = norm(name).replace(/(19|20)\d{2}$/, '');
  if (key && !out[key]) { out[key] = entry; count++; }
}

const dest = new URL('../data/car-specs.json', import.meta.url);
writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(`Scritte ${count} schede auto da AC1 (${root}) → ${dest.pathname.replace(/^\/([A-Za-z]:)/, '$1')}`);
