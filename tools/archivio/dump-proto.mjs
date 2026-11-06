// dump-proto.mjs — dump strutturale del wire format protobuf di un .customgrid.
// Uso: node tools/dump-proto.mjs <file> [file2 …]
// Stampa per ogni campo: percorso (fN), wire type, lunghezza/varint.
// Solo lettura: non tocca i file, serve per confrontare griglie scritte dal
// tool contro griglie scritte dal gioco (crash 24/10, avvio sessione).
import { readFileSync } from 'node:fs';

function walk(buf, depth, path, out) {
  let i = 0;
  while (i < buf.length) {
    let tag = 0, shift = 0;
    const tStart = i;
    while (i < buf.length) { const b = buf[i++]; tag |= (b & 0x7f) << shift; shift += 7; if (!(b & 0x80)) break; }
    const fn = tag >>> 3, wt = tag & 7;
    if (wt === 0) {
      let v = 0, s = 0;
      while (i < buf.length) { const b = buf[i++]; v += (b & 0x7f) * 2 ** s; s += 7; if (!(b & 0x80)) break; }
      out.push({ p: path + 'f' + fn, wt, off: tStart, len: i - tStart, val: v });
    } else if (wt === 2) {
      let l = 0, s = 0;
      while (i < buf.length) { const b = buf[i++]; l += (b & 0x7f) * 2 ** s; s += 7; if (!(b & 0x80)) break; }
      const bytes = buf.subarray(i, i + l);
      i += l;
      out.push({ p: path + 'f' + fn, wt, off: tStart, len: i - tStart });
      if (depth < 3) walk(bytes, depth + 1, path + 'f' + fn + '.', out);
    } else if (wt === 5) {
      if (i + 4 > buf.length) { out.push({ p: path + 'TRUNC', off: tStart }); return; }
      out.push({ p: path + 'f' + fn, wt, off: tStart, len: 5, val: buf.readFloatLE(i) });
      i += 4;
    } else if (wt === 1) {
      if (i + 8 > buf.length) { out.push({ p: path + 'TRUNC', off: tStart }); return; }
      out.push({ p: path + 'f' + fn, wt, off: tStart, len: 9, fixed64: buf.readBigUInt64LE(i).toString(16) });
      i += 8;
    } else {
      out.push({ p: path + 'ERR-wt' + wt, off: tStart });
      return;
    }
  }
}

for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f);
  const out = [];
  walk(buf, 0, '', out);
  console.log('===', f, `(${buf.length} byte)`);
  for (const o of out) console.log(`  ${o.p}  wt=${o.wt} off=${o.off} len=${o.len ?? '-'}` + (o.val !== undefined ? ` val=${o.val}` : '') + (o.fixed64 ? ' hex=' + o.fixed64 : ''));
  console.log('  troncato a', out.length, 'campi');
}
