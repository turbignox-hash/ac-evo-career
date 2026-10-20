// dump-block.mjs — dump di UN blocco del gamemodesave per ispezione.
// uso: node tools/dump-block.mjs <file> <percorso.tipo> [prof]
//   es: node tools/dump-block.mjs <gamemodesave> 3.11 3   → il primo pilota completo
import { readFileSync } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';
const file = process.argv[2];
const pathStr = process.argv[3] ?? '3';
const prof = Number(process.argv[4] ?? 3);
const path = pathStr.split('.').map(Number);

const looksStr = (b) => b.length > 2 && [...b.slice(0, 48)].every((c) => (c >= 32 && c < 127) || c === 9 || c === 10 || c === 13);
const hex = (b) => '<' + Buffer.from(b).toString('hex').slice(0, 24) + (b.length > 12 ? '…' : '') + '>';

const walk = (buf, nums, d, label = '') => {
  const fields = decodeMsg(buf);
  const touches = (f) => path[nums.length] === f.field;
  for (const f of fields) {
    const isTarget = touches(f);
    if (!isTarget && path[nums.length] !== undefined) continue;
    const p = (label ? label + '.' : '') + f.field;
    const v = f.varint != null ? BigInt(f.varint).toString()
      : f.wire === 2 ? (looksStr(f.bytes) ? `"${Buffer.from(f.bytes).toString('utf8')}"` : hex(f.bytes))
      : f.bytes ? `f32=${Buffer.from(f.bytes).readFloatLE(0)}` : '?';
    console.log(`${'  '.repeat(d)}${p} (w${f.wire}) = ${v}`);
    if (isTarget && f.wire === 2 && d < prof) walk(f.bytes, [...nums, f.field], d + 1, p);
  }
};
walk(readFileSync(file), [Number(path[0])], 0);
