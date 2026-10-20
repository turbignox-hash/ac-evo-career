import { readFileSync } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';
const float = (b, o) => b.readFloatLE(o);
// decodifica payload f3: seq di campi wire 5 (float) dopo i len-delim vuoti
function floatsOf(bytes) {
  const out = {};
  let i = 0;
  const b = Buffer.from(bytes);
  while (i < b.length) {
    const tag = b[i++];
    const field = tag >> 3, wire = tag & 7;
    if (wire === 2) { const l = b[i++]; i += l; }
    else if (wire === 0) { while (b[i] & 128) i++; i++; }
    else if (wire === 5) { out['f' + field] = float(b, i); i += 4; }
    else break;
  }
  return out;
}
const r2 = (v) => v == null ? null : Math.round(v * 1000) / 1000;
const files = process.argv.slice(2);
for (const n of files) {
  const d = decodeMsg(readFileSync(n));
  console.log('=== ' + n + ' ===');
  console.log(' top: ' + d.map((f) => f.field + ':' + f.wire + ':' + (f.varint != null ? f.varint : Buffer.from(f.bytes).length)).join('|'));
  d.filter((f) => f.field === 3 && f.wire === 2).forEach((sub) => {
    const s = decodeMsg(sub.bytes);
    const idx = (s.find((x) => x.field === 1) ?? {}).varint;
    const f2 = (s.find((x) => x.field === 2) ?? {}).varint ?? '-';
    const f3 = s.find((x) => x.field === 3);
    const fl = f3 ? floatsOf(f3.bytes) : {};
    console.log('  sub idx=' + idx + ' f2=' + f2 + ' floats: ' + JSON.stringify(Object.fromEntries(Object.entries(fl).map(([k, v]) => [k, r2(v)]))));
  });
}
