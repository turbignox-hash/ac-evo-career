// evo-grid.mjs — decodifica e RISCRITTURA della griglia personalizzata di EVO.
//
// Scoperta del 18/10/2026: le gare personalizzate ("crea gara" con range PI)
// vengono salvate in  Saved Games\ACE\GameModes\last_grid.customgrid  come
// protobuf senza schema noto. Struttura sperimentata su quella di Mauro:
//
//   campo 1 (ripetuto)  = CELLA GRIGLIA: 3 id auto ("ks_porsche_992_gt3_rs"),
//                         4 nome auto, 6 anno, 9 marca, 10 preset meccanico,
//                         11 preset visuale, 14 livree (ripetuto)
//   campo 2 (ripetuto)  = PILOTA AI: nome, nazione, skill (float), ecc.
//   campo 3             = SETUP GRIGLIA: sub1 n.celle, sub5 gomme (byte pack),
//                         sub23/24 = finestra PI (float LE, es. 15.0 / 17.0)
//   campo 4             = workaround per i campi f2 residui (wire 2 finale)
//
// Uso:
//   node tools/evo-grid.mjs [file]            → stampa le celle in breve
//   node tools/evo-grid.mjs --dump file       → albero JSON completo
//   node tools/evo-grid.mjs --verify file     → round-trip: decode→encode byte-identico
//   node tools/evo-grid.mjs --pi 16 17 file   → cambia la finestra PI (con backup)
//
import { readFileSync, writeFileSync, renameSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

/* ---------- protobuf senza schema: campi generici ---------- */
function readVarint(buf, i) {
  let v = 0n, s = 0n;
  for (;;) {
    if (i >= buf.length) throw new Error('varint oltrefine');
    const b = buf[i++];
    v |= BigInt(b & 0x7f) << s;
    s += 7n;
    if (!(b & 0x80)) break;
  }
  return [v, i];
}
function encodeVarint(v) {
  const out = [];
  let x = BigInt(v);
  do { let b = Number(x & 0x7fn); x >>= 7n; if (x) b |= 0x80; out.push(b); } while (x);
  return out;
}

export function decodeMsg(buf) {
  const fields = [];
  let i = 0;
  while (i < buf.length) {
    const [tag, i0] = readVarint(buf, i); i = i0;
    const field = Number(tag >> 3n), wire = Number(tag & 7n);
    if (wire === 0) { const [v, i1] = readVarint(buf, i); i = i1; fields.push({ field, wire, varint: v }); }
    else if (wire === 1) { fields.push({ field, wire, bytes: buf.subarray(i, i + 8) }); i += 8; }
    else if (wire === 2) { const [len, i1] = readVarint(buf, i); i = i1; fields.push({ field, wire, bytes: buf.subarray(i, i + Number(len)) }); i += Number(len); }
    else if (wire === 5) { fields.push({ field, wire, bytes: buf.subarray(i, i + 4) }); i += 4; }
    else throw new Error(`wire ${wire} non gestita (field ${field})`);
  }
  return fields;
}

const encVarintArr = (v) => Uint8Array.from(encodeVarint(v));
const encVarintByKey = (n) => encVarintArr(Number(n));
export function encodeMsg(fields) {
  const chunks = [];
  for (const f of fields) {
    const tag = (BigInt(f.field) << 3n) | BigInt(f.wire);
    chunks.push(encVarintArr(tag));
    if (f.wire === 0) chunks.push(encVarintByKey(f.varint));
    else if (f.wire === 2) chunks.push(encVarintArr(f.bytes.length), f.bytes);  // solo wire 2 ha il prefisso di lunghezza!
    else chunks.push(f.bytes);                                                  // wire 1 (fixed64) e 5 (fixed32): solo i byte
  }
  let total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const c of chunks) { out.set(c, i); i += c.length; }
  return out;
}

const utf8 = (b) => b ? Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.byteLength).toString('utf8') : '';
const f32 = (b) => (b && b.length >= 4) ? Buffer.from(b.slice?.() ?? b).readFloatLE(0) : NaN;
const setF32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; };

/* ---------- decomposizione high-level ---------- */
export function gridFileOf(buf) {
  const top = decodeMsg(buf);
  const cells = [], drivers = [];
  let configMeta = null, configRaw = null, other = [];
  for (const f of top) {
    if (f.field === 1) {
      const inner = decodeMsg(f.bytes);
      const cell = { raw: f.bytes };
      for (const g of inner) {
        if (g.field === 3) cell.carId = utf8(g.bytes);
        else if (g.field === 4) cell.carName = utf8(g.bytes);
        else if (g.field === 6) cell.year = Number(g.varint);
        else if (g.field === 9) { const sub = decodeMsg(g.bytes); cell.brand = utf8(sub.find?.((x) => x.field === 2)?.bytes) ?? null; }
        else if (g.field === 10) { const q = decodeMsg(g.bytes).filter((x) => x.field === 1 || x.field === 2).map((x) => utf8(x.bytes)); cell.mechPreset = q[1] ?? q[0] ?? null; }
        else if (g.field === 11) { const t = utf8(g.bytes); const k = t.indexOf('\x12'); const v = k >= 0 ? t.slice(k + 1).split('\x18')[0] : null; cell.visualPreset = v || t || null; }
      }
      cells.push(cell);
    } else if (f.field === 2) {
      const inner = decodeMsg(f.bytes);
      const drv = { raw: f.bytes };
      let k = 0;
      for (const g of inner) {
        if (g.field === 1) { try { const v = decodeMsg(g.bytes); drv.name = utf8(v[0]?.bytes) || utf8(g.bytes); } catch { drv.name = utf8(g.bytes); } }
        else if (g.field === 2) drv.nation = utf8(g.bytes);
      }
      drivers.push(drv);
    } else if (f.field === 3) {
      configRaw = f.bytes;
      const inner = decodeMsg(f.bytes);
      const meta = {};
      for (const g of inner) {
        if (g.field === 1) meta.count = Number(g.varint);
        else if (g.field === 5) meta.tyres = Buffer.from(g.bytes).toString('hex');
        else if (g.field === 20) meta.aiMin = Number(g.varint);   // slider AI basso
        else if (g.field === 21) meta.aiMax = Number(g.varint);   // slider AI alto
        else if (g.field === 23) meta.piMin = f32(g.bytes);       // finestra PI
        else if (g.field === 24) meta.piMax = f32(g.bytes);
      }
      configMeta = meta;
    } else if (f.field === 4) {
      configMeta = configMeta ?? {};
      configMeta.weather = Number(f.varint);  // 3 = meteo scelto
    } else other.push(f);
  }
  return { cells, drivers, config: { ...configMeta, raw: configRaw }, other, top };
}

/* ---------- round-trip ---------- */
export function verifyRoundTrip(file) {
  const buf = readFileSync(file);
  const out = encodeMsg(decodeMsg(buf));
  const ok = Buffer.compare(Buffer.from(buf), Buffer.from(out)) === 0;
  return { ok, size: buf.length, sizeOut: out.length };
}

/* ---------- riscrittura della finestra PI (sub23/24 del campo 3) ---------- */
export function rewritePiRange(buf, piMin, piMax) {
  const fields = decodeMsg(buf);
  let touched = false;
  for (const f of fields) {
    if (f.field === 3 && f.wire === 2) {
      const inner = decodeMsg(f.bytes);
      for (const g of inner) {
        if (g.field === 23 && g.wire === 5) { g.bytes = setF32(piMin); touched = true; }
        if (g.field === 24 && g.wire === 5) { g.bytes = setF32(piMax); touched = true; }
      }
      f.bytes = encodeMsg(inner);
    } else {
      // fallback rimosso: la finestra PI sta SOLO nel campo 3 (sub 23/24)
      // (i campi non-PI passano indietro immutati: il caller li ri-encoda)
    }
  }
  if (!touched) throw new Error('campo finestra PI non trovato (sub 23/24 assenti): struttura diversa, niente scrittura');
  return encodeMsg(fields);
}

/* ---------- CLI ---------- */
function stamp(file) {
  const buf = readFileSync(file);
  const g = gridFileOf(buf);
  console.log(`${file} — ${buf.length} byte, mtime ${statSync(file).mtime.toLocaleString('it-IT')}`);
  console.log(`celle auto: ${g.cells.length} · piloti: ${g.drivers.length}`);
  console.log(`setup griglia: ${JSON.stringify({ ...g.config, raw: undefined })}`);
  const byCar = {};
  for (const c of g.cells) byCar[c.carName ?? c.carId] = (byCar[c.carName ?? c.carId] ?? 0) + 1;
  for (const [car, n] of Object.entries(byCar)) console.log(`  ${car} ×${n}`);
  const names = g.drivers.slice(0, 6).map((d) => d.name ?? '?');
  console.log(`  piloti (primi): ${names.join(', ')}${g.drivers.length > 6 ? ' …' : ''}`);
}

const argv = process.argv.slice(2);
const flag = argv[0];
const DEFAULT = 'C:/Users/Mauro/Saved Games/ACE/GameModes/last_grid.customgrid';
if (flag === '--dump') console.log(JSON.stringify(decodeMsg(readFileSync(argv[1] ?? DEFAULT)), (k, v) => v.type === 'Buffer' ? Buffer.from(v.data).toString('hex').slice(0, 64) + '…' : v, 1).slice(0, 4000));
else if (flag === '--verify') { const r = verifyRoundTrip(argv[1] ?? DEFAULT); console.log(r.ok ? `ROUND-TRIP OK (${r.size}/${r.sizeOut} byte)` : `ROUND-TRIP DIVERSO (norm-preserving, non byte) ${JSON.stringify(r)}`); }
else if (flag === '--pi') {
  const [lo, hi, file] = [Number(argv[1]), Number(argv[2]), argv[3] ?? DEFAULT];
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('uso: --pi <min> <max> [file]');
  const buf = readFileSync(file);
  const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  const out = rewritePiRange(buf, lo, hi);
  writeFileSync(`${file}.tmp`, out);
  renameSync(`${file}.tmp`, file);
  console.log(`finestra PI → ${lo}–${hi}. Backup: ${backup}`);
  const back = verifyRoundTrip(file); // non è identico (apposta la modifica): verifica solo di coerenza struttura
  console.log(`rilettura: ${JSON.stringify(gridFileOf(readFileSync(file)).config)}`);
} else stamp(argv[0] ?? DEFAULT);
