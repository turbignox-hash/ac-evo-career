// _diff-gridtype.mjs — confronta gli snapshot del toggle GRID TYPE a livello
// di BYTE e di CAMPO protobuf: dove il gioco cambia un solo campo, lì vive
// l'enum AUTOMATIC/CUSTOM della griglia.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMsg } from './evo-grid.mjs';

const dir = 'data/samples/gridtype';
const files = readdirSync(dir).sort().map((f) => join(dir, f));
if (files.length < 2) { console.log('servono almeno 2 snapshot'); process.exit(1); }

const bufs = files.map((f) => ({ f, b: readFileSync(f) }));
console.log('--- byte-level diff ---');
for (let i = 1; i < bufs.length; i++) {
  const a = bufs[i - 1], b = bufs[i];
  const diffs = [];
  const n = Math.min(a.b.length, b.b.length);
  for (let k = 0; k < n; k++) if (a.b[k] !== b.b[k]) diffs.push(k);
  console.log(`${a.f} → ${b.f}: ${diffs.length} byte diversi ${diffs.length < 12 ? '=' + diffs.join(',') : ''}`);
}
// se le lunghezze differiscono, segnalalo
bufs.forEach(({ f, b }) => { console.log(`${f}: ${b.length} B`); });

// struttura: cammina i campi top-level e stampa field/value per ogni snapshot
const utf8 = (x) => Buffer.from(x).toString('utf8');
console.log('\n--- campi top-level per snapshot ---');
for (const { f, b } of bufs) {
  console.log('\n== ' + f + ' ==');
  try {
    for (const fld of decodeMsg(b)) {
      const v = fld.varint != null ? BigInt(fld.varint).toString()
        : fld.wire === 2 ? (fld.bytes.length > 17 ? `${fld.bytes.length}B <${Buffer.from(fld.bytes).slice(0, 24).toString('hex')}>` : `"${utf8(fld.bytes)}"`)
        : fld.bytes ? `f32=${Buffer.from(fld.bytes).readFloatLE(0)}` : '?';
      console.log(`  field ${fld.field} (w${fld.wire}) = ${v}`);
    }
  } catch (e) { console.log('  decode fallito: ' + e.message); }
}

// durante un TIPO basta trovare DUE punti: byte-diff che emoti un campo con un VALUE differente
function walk(buf, d = 2, path = '') {
  let fields;
  try { fields = decodeMsg(buf); } catch { return []; }
  const arr = [];
  for (const fld of fields) {
    const p = path ? `${path}.${fld.field}` : `${fld.field}`;
    if (fld.wire === 2 && d > 0 && !(fld.bytes.length > 2 && [...fld.bytes.slice(0, 20)].every((c) => c >= 32 && c < 127))) {
      arr.push(...walk(fld.bytes, d - 1, p));
    } else {
      arr.push({ path: p, wire: fld.wire, varint: fld.varint ?? null, f32: fld.bytes ? Buffer.from(fld.bytes).readFloatLE(0) : null });
    }
  }
  return arr;
}
console.log('\n--- differenza CAMPI (percorso completo) ---');
const A = walk(bufs[0].b), B = walk(bufs[Math.min(1, bufs.length - 1)].b);
const map = (l) => { const m = new Map(); for (const x of l) m.set(x.path, x); return m; };
const mapA = map(A), mapB = map(B);
for (const [path, v] of mapA) {
  const w = mapB.get(path);
  if (!w) { console.log(`solo in ${bufs[0].f}: ${path}`); continue; }
  if (v.varint !== w.varint || v.f32 !== w.f32) console.log(`DIVERGENZA ${path}: ${v.varint != null ? 'varint ' + v.varint + ' → ' + w.varint : 'f32 ' + v.f32 + ' → ' + w.f32}`);
}
for (const path of mapB.keys()) if (!mapA.has(path)) console.log(`solo in ${bufs[B.length - 1].f}: ${path}`);
if (A.length !== B.length) console.log(`(campi totali: ${A.length} vs ${B.length})`);
