import { readFileSync } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';
const PATH = 'C:/Users/Mauro/Saved Games/ACE/GameModes/GameModeType_RACE_WEEKEND.gamemodesave';
const A = readFileSync('data/samples/weather-current.hex');
const B = readFileSync(PATH);
const da = decodeMsg(A), db = decodeMsg(B);

const hex = (b) => Buffer.from(b).toString('hex');
// hex-diff grezzo: trova TUTTE le finestre di byte diversi
if (A.length === B.length && Buffer.compare(A, B) !== 0) {
  console.log('--- byte diff (finestre) ---');
  let i = 0;
  while (i < A.length) {
    if (A[i] !== B[i]) {
      const start = i;
      while (i < A.length && A[i] !== B[i]) i++;
      console.log('  off ' + start + ' (0x' + start.toString(16) + '), len ' + (i - start) + ' : A=' + hex(A.subarray(start, i)) + '  B=' + hex(B.subarray(start, i)));
    } else i++;
  }
} else if (Buffer.compare(A, B) === 0) {
  console.log('FILE IDENTICI');
}
// decodifica dei blocchi 3: confronto raw bytes per campo-number
const dump = (d, tag) => {
  const out = {};
  d.filter((f) => f.field === 3).forEach((blk, bi) => {
    decodeMsg(blk.bytes).forEach((x) => {
      const key = bi + '.' + x.field + ':' + x.wire;
      (out[key] = out[key] ?? []).push(x.varint != null ? BigInt(x.varint).toString() : hex(x.bytes));
    });
  });
  console.log('--- ' + tag + ' ---');
  for (const k of Object.keys(out)) console.log(' ' + k + ' x' + out[k].length + '  [' + out[k].slice(0, 4).join(',') + (out[k].length > 4 ? ' ...' : '') + ']');
};
dump(da, 'pioggia');
dump(db, 'attuale');
