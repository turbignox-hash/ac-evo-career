// grid-mix.mjs — la prima griglia MULTI-MARCA della carriera: sostituisce le
// auto nelle celle del customgrid (stessa finestra PI) ri-usando i campi del
// gioco stesso. Le livree che non abbiamo pescato restano coerenti perché
// puntano a file dell'auto NUOVA? NO: le rigeneriamo dall'auto sorgente.
//
// Strate gia: prendiamo una cella campione (la prima del file), ripuliamo le
// livree (campo 14 vuote) e impostiamo id/nome/marca/preset dell'auto target.
// I piloti restano i "Buffy Gridtest" (o chi sono) — non li tocca.
//
// uso: node tools/grid-mix.mjs --dry  (solo anteprima)
//      node tools/grid-mix.mjs        (scrive, con backup)
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = 'C:/Users/Mauro/Saved Games/ACE/GameModes/last_grid.customgrid';

// le 9 varianti nei intorni della finestra 15–17 (da cars.json del server dedicato)
// Днell    
const CATALOG = [
  { preset: 'preset_sp3_mech_1',      id: 'ks_ferrari_daytona_sp3',      name: 'Ferrari Daytona SP3',        brand: 'Ferrari',      year: 2022, variant: 'Standard' },
  { preset: 'preset_mcgt2_mech_1',    id: 'ks_maserati_gt2',             name: 'Maserati GT2',               brand: 'Maserati',     year: 2023, variant: 'GT2' },
  { preset: 'preset_amggt2_mech_1',   id: 'ks_mercedes_amg_gt2',         name: 'Mercedes-AMG GT2',           brand: 'Mercedes-AMG', year: 2023, variant: 'GT2' },
  { preset: 'preset_935_mech_1',      id: 'ks_porsche_935',              name: 'Porsche 935',                brand: 'Porsche',      year: 1981, variant: 'GT2' },
  { preset: 'preset_992c_mech_1',     id: 'ks_porsche_992_gt3_cup',      name: 'Porsche 911 GT3 Cup (992)',  brand: 'Porsche',      year: 2021, variant: 'ABS TC' },
  { preset: 'preset_992c_mech_2',     id: 'ks_porsche_992_gt3_cup',      name: 'Porsche 911 GT3 Cup (992)',  brand: 'Porsche',      year: 2021, variant: 'ABS' },
  { preset: 'preset_992c_mech_3',     id: 'ks_porsche_992_gt3_cup',      name: 'Porsche 911 GT3 Cup (992)',  brand: 'Porsche',      year: 2021, variant: 'No ABS No TC' },
  { preset: 'preset_gt3rs_mech_1',    id: 'ks_porsche_992_gt3_rs',       name: 'Porsche 911 GT3 RS (992)',   brand: 'Porsche',      year: 2021, variant: 'Clubsport' },
  { preset: 'preset_gt3rs_mech_2',    id: 'ks_porsche_992_gt3_rs',       name: 'Porsche 911 GT3 RS (992)',   brand: 'Porsche',      year: 2021, variant: 'Weissach' },
];

// piano griglia multi-marca per 15 celle: alternanza che fa bene agli occhi
//   1+2 GT3 Cup  3+4 935  5+6 AMG GT2  7+8 Maserati GT2  9+10 Daytona SP3
//  11+12+13 GT3 RS WS  14+15 GT3 Cup
const PLAN = [4,4,3,3,2,2,1,1,0,0,8,8,8,5,5];

/* ---------- protobuf micro-tools (firma condivisa con evo-grid) ---------- */
function readVarint(buf, i) {
  let v = 0n, s = 0n;
  for (;;) {
    if (i >= buf.length) throw new Error('varint oltrefine');
    const b = buf[i++]; v |= BigInt(b & 0x7f) << s; s += 7n;
    if (!(b & 0x80)) break;
  }
  return [v, i];
}
const encVarintArr = (v) => {
  const out = []; let x = BigInt(v);
  do { let b = Number(x & 0x7fn); x >>= 7n; if (x) b |= 0x80; out.push(b); } while (x);
  return Uint8Array.from(out);
};
function decodeMsg(buf) {
  const fields = []; let i = 0;
  while (i < buf.length) {
    const [tag, i0] = readVarint(buf, i); i = i0;
    const field = Number(tag >> 3n), wire = Number(tag & 7n);
    if (wire === 0) { const [v, i1] = readVarint(buf, i); i = i1; fields.push({ field, wire, varint: v }); }
    else if (wire === 1) { fields.push({ field, wire, bytes: buf.subarray(i, i + 8) }); i += 8; }
    else if (wire === 2) { const [len, i1] = readVarint(buf, i); i = i1; fields.push({ field, wire, bytes: buf.subarray(i, i + Number(len)) }); i += Number(len); }
    else if (wire === 5) { fields.push({ field, wire, bytes: buf.subarray(i, i + 4) }); i += 4; }
    else throw new Error('wire ' + wire);
  }
  return fields;
}
function encodeMsg(fields) {
  const chunks = [];
  for (const f of fields) {
    const tag = (BigInt(f.field) << 3n) | BigInt(f.wire);
    chunks.push(encVarintArr(tag));
    if (f.wire === 0) chunks.push(encVarintArr(f.varint));
    else if (f.wire === 2) chunks.push(encVarintArr(f.bytes.length), f.bytes);
    else chunks.push(f.bytes);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total); let i = 0;
  for (const c of chunks) { out.set(c, i); i += c.length; }
  return out;
}
const B = (s) => Buffer.from(String(s), 'utf8');

/* ---------- costruzione della cella target ---------- */
// Replica MINIMA della struttura cella that il gioco scrive (ispezionata dal
// file reale): 3 id · 4 nome · 6 anno · 9 marca · 10 preset mat.params… sopra
// senza levree: EVO le ri-genera con i default quando mancano.
function makeCell(car) {
  const f3 = { field: 3, wire: 2, bytes: B(car.id) };
  const f4 = { field: 4, wire: 2, bytes: B(car.name) };
  const f6 = { field: 6, wire: 0, varint: BigInt(car.year) };
  const brand = encodeMsg([{ field: 2, wire: 2, bytes: B(car.brand) }]);
  const f9 = { field: 9, wire: 2, bytes: brand };
  const mech = encodeMsg([
    { field: 1, wire: 2, bytes: B(car.preset) },
    { field: 2, wire: 2, bytes: B(car.name + ' Preset ' + car.variant) },
    { field: 3, wire: 0, varint: 1n },
    { field: 4, wire: 2, bytes: B(car.variant) },
  ]);
  const f10 = { field: 10, wire: 2, bytes: mech };
  // campo 11 (visual preset): il gioco lo accetta Assente — default in gioco
  return [f3, f4, f6, f9, f10].sort((a, b) => 0).map(x => x); // ordine = come scritto da EVO (non serve sort)
}

/* ---------- scrivere ---------- */
function main(previewOnly) {
  const buf = readFileSync(FILE);
  const fields = decodeMsg(buf);
  const cellCount = fields.filter((f) => f.field === 1).length;
  if (cellCount !== PLAN.length) throw new Error('il file ha ' + cellCount + ' celle, il piano ne ha ' + PLAN.length + ': aggiorna PLAN');
  let k = 0;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].field !== 1) continue;
    const car = CATALOG[PLAN[k]];
    fields[i].bytes = encodeMsg(makeCell(car));
    if (previewOnly) console.log((k + 1).toString().padStart(2), '→', car.name, '(' + car.variant + ')');
    k++;
  }
  if (previewOnly) return;
  copyFileSync(FILE, FILE + '.bak-mix');
  const out = encodeMsg(fields);
  writeFileSync(FILE + '.tmp', out);
  renameSync(FILE + '.tmp', FILE);
  console.log('griglia multi-marca scritta sul file. Piloti intatti. Backup: ' + FILE + '.bak-mix');
}

if (process.argv.includes('--dry')) main(true);
else main(false);
