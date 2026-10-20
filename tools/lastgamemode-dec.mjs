import { readFileSync } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';
const b = readFileSync('data/samples/lastgamemode-1742.hex');
const d = decodeMsg(b);
console.log('top:', d.map((f) => f.field + ':' + f.wire + ':' + (f.varint != null ? f.varint : Buffer.from(f.bytes).length)).join('|'));
d.filter((f) => f.wire === 2).forEach((f, bi) => {
  console.log('--- sub-' + bi + ' (field ' + f.field + ') ---');
  try {
    decodeMsg(f.bytes).forEach((x) => {
      const v = x.wire === 2 ? 'hex ' + Buffer.from(x.bytes).toString('hex').slice(0, 100) : String(x.varint);
      console.log('  f' + x.field + ':' + x.wire + ' ' + v);
    });
  } catch (e) { console.log('  (non protobuf)', e.message); }
});
