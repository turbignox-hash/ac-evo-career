// setup-explode.mjs — smonta un file .carsetup di Assetto Corsa EVO
// (protobuf della stessa famiglia dei customgrid: stesso decodeMsg) e stampa
// la struttura ricorsiva: campo, wire, valore (float/uint/string/bytes hex).
// Solo diagnostica: non scrive niente.
//
// Uso: node tools/setup-explode.mjs "<percorso .carsetup>" [--corti]
import { readFileSync } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';

const file = process.argv[2];
if (!file) { console.error('uso: node tools/setup-explode.mjs <file.carsetup>'); process.exit(1); }
const CORTI = process.argv.includes('--corti');

const f32 = (b) => { try { return Buffer.from(b).readFloatLE(0); } catch { return null; } };
const hex = (b) => Buffer.from(b).toString('hex');

function dump(bytes, depth, path) {
  let fields;
  try { fields = decodeMsg(Buffer.from(bytes)); }
  catch { console.log('  '.repeat(depth) + `${path} = RAW(${bytes.length}) ${hex(bytes).slice(0, 60)}…`); return; }
  if (!Array.isArray(fields) || !fields.length) {
    console.log('  '.repeat(depth) + `${path} = ${hex(bytes).slice(0, 80)}`);
    return;
  }
  for (const f of fields) {
    const p = `${path}.${f.field}`;
    if (f.wire === 0) console.log('  '.repeat(depth) + `${p} varint = ${f.value}`);
    else if (f.wire === 1) console.log('  '.repeat(depth) + `${p} f64 = ${f32 ?? ''}`);
    else if (f.wire === 5) console.log('  '.repeat(depth) + `${p} f32 = ${f32(f.bytes)}`);
    else if (f.wire === 2) {
      const b = Buffer.from(f.bytes);
      const len = b.length;
      // un packed float? proviamo
      let preview;
      if (len % 4 === 0 && len >= 8) preview = `len=${len} first-f32=[${Array.from({length: Math.min(4, len/4)}, (_,i)=>b.readFloatLE(i*4).toFixed(3))}]`;
      else preview = `len=${len}`;
      console.log('  '.repeat(depth) + `${p} bytes ${preview}`);
      if (!CORTI || depth < 3) {
        if (f.bytes.length > 12 || depth < 4) {
          try { dump(f.bytes, depth + 1, p); }
          catch (e) { console.log('  '.repeat(depth + 1) + `(non nesting: ${e.message})`); }
        }
      }
    }
    else console.log('  '.repeat(depth) + `${p} wire=${f.wire} ?`);
  }
}

const buf = readFileSync(file);
console.log(`file: ${file} (${buf.length} byte)`);
dump(buf, 0, 'root');
