import { readFileSync } from 'node:fs';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';
const path = 'C:/Users/Mauro/Saved Games/ACE/GameModes/gamemode.lastgamemode';
const buf = readFileSync(path);
const fields = decodeMsg(buf);
console.log('top fields prima:', fields.map((f) => f.field + ':' + f.wire).join('|'), 'size', buf.length);
const out = [];
for (const f of fields) {
  if (f.field === 3 && out.every((x) => x.field !== 2)) out.push({ field: 2, wire: 0, varint: 4n });
  out.push(f);
}
const enc = encodeMsg(out);
console.log('enc size:', enc.length, 'primi 12:', enc.subarray(0, 12).toString('hex'));
const back = decodeMsg(enc);
const p = back.find((f) => f.field === 2);
console.log('rilettura f2:', p ? Number(p.varint) : 'assente', '· campi:', back.map((f) => f.field + ':' + f.wire).join('|'));
console.log('subs f3 identici:', back.filter((f) => f.field === 3).map((f) => Buffer.from(f.bytes).length).join(',') === fields.filter((f) => f.field === 3).map((f) => Buffer.from(f.bytes).length).join(','));
