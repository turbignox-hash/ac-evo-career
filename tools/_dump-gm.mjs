import { decodeMsg } from './evo-grid.mjs';
import fs from 'node:fs';
const file = process.argv[2] ?? 'C:/Users/Mauro/Saved Games/ACE/GameModes/GameModeType_RACE_WEEKEND.gamemodesave';
const buf = fs.readFileSync(file);
const blocks = decodeMsg(buf).filter(f => f.field === 3 && f.wire === 2);
console.log('sessioni:', blocks.length);
const shape = (b) => decodeMsg(b).map((g) => {
  if (g.wire === 2) return `f${g.field}:len${g.bytes.length}`;
  if (g.wire === 5) return `f${g.field}:f32(${(g.bytes && g.bytes.length >= 4) ? Buffer.from(g.bytes.slice()).readFloatLE(0) : '?'})`;
  return `f${g.field}:v(${g.varint})`;
});
for (const b of blocks) {
  const inner = decodeMsg(b.bytes);
  const nome = inner.filter(g => g.field === 1 && g.wire === 2).map(g => Buffer.from(g.bytes.slice()).toString('utf8')).join('|');
  console.log(`  blocco "${nome}":`);
  console.log('    ', shape(b.bytes).join(' '));
}
