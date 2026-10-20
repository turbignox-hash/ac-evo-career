// decode-gamemode.mjs — ispezione del GameModeType_RACE_WEEKEND.gamemodesave:
// struttura protobuf (stesso schema wire del customgrid) per trovare il CAMPO
// che porta la pista del weekend — prelude al cambio pista a gioco aperto.
import { readFileSync } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';
const utf8 = (b) => Buffer.from(b).toString('utf8');

const file = process.argv[2] ?? 'C:/Users/Mauro/Saved Games/ACE/GameModes/GameModeType_RACE_WEEKEND.gamemodesave';
const depth = Number(process.argv[3] ?? 2);

const walk = (buf, d, path = '') => {
  let fields;
  try { fields = decodeMsg(buf); } catch { return; }
  for (const f of fields) {
    const p = path ? `${path}.${f.field}` : `${f.field}`;
    const v = f.varint != null ? BigInt(f.varint).toString()
      : f.wire === 2 ? (looksStr(f.bytes) ? `"${utf8(f.bytes)}"` : `${f.bytes.length<=8?`<${Buffer.from(f.bytes).toString("hex")}>`:`<${f.bytes.length}B>`}`)
      : f.bytes ? `f32=${Buffer.from(f.bytes).readFloatLE(0)}` : '?';
    console.log(`${'  '.repeat(Math.max(0, depth - d))}${p} (w${f.wire}) = ${v}`);
    if (f.wire === 2 && d > 0 && !(f.bytes.length && looksStr(f.bytes))) walk(f.bytes, d - 1, p);
  }
};
const looksStr = (b) => b.length > 2 && [...b.slice(0, 40)].every((c) => (c >= 32 && c < 127) || c === 10 || c === 13);
walk(readFileSync(file), depth);
