// _decode-full.mjs — parsa il gamemodesave campo per campo, CON offset di
// ogni tag, e stampa struttura annidata (per capire il campo del gridType).
import { readFileSync, } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';

const file = process.argv[2] ?? 'data/samples/gridtype/gt-190933-476.hex';

function _walk(buf, path = '') {
  let fields;
  try { fields = decodeMsg(buf); } catch { return; }
  let off = 0;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const p = path ? path + '.' + f.field : String(f.field);
    if (f.wire === 2 && f.bytes.length > 2 && !(f.bytes.every((c) => c >= 32 && c < 127))) {
      console.log(`${p} (w2, len ${f.bytes.length})  @tag ~byte ${off}, ${f.bytes.length}B <${Buffer.from(f.bytes.slice(0, 16)).toString('hex')}>`);
      _walk(f.bytes, p);
    } else if (f.varint != null) {
      console.log(`${p} (w0) = ${f.varint}  @tag byte ${off}`);
    } else {
      const s = f.bytes?.length ? Buffer.from(f.bytes).toString('utf8') : '';
      console.log(`${p} (w2) = "${s}"  @tag byte ${off}`);
    }
    // ricalcolo off: ogni field occupa tag (1-2) + payload. decodeMsg non
    // torna offset, quindi ricomputo hand-made sotto.
    off += 1;
  }
}

// decodeMsg non espone offset: riparto con un parser manuale minimale
function parseRaw(buf, path = '', depth = 0) {
  let k = 0;
  while (k < buf.length) {
    const tagStart = k;
    const tag = buf[k++];
    let fld = (tag >> 3), wire = (tag & 7);
    if ((tag & 0x0f) === 0x0f && k < buf.length) { // tag su 2 byte (raro qui)
      fld = ((tag >> 3) | ((buf[k] & 3) << 4)); wire = (buf[k] >> 2) & 7; k++;
    }
    let val = null, off = null;
    if (wire === 2) { let L = 0, sh = 0; while (true) { const x = buf[k++]; L |= (x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7; } off = k; val = buf.slice(k, k + L); k += L; }
    else if (wire === 0) { let v = 0n, sh = 0n; while (true) { const x = buf[k++]; v |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; } off = k; val = Number(v); }
    else { console.log(`${path} (w${wire}) @tag ${tagStart} — wire non gestita, stop`); return; }
    const p = path ? path + '.' + fld : String(fld);
    if (wire === 2 && val.length > 2 && !(val.every((c) => c >= 32 && c < 127))) {
      console.log(`${p} (w2 len ${val.length}, @data byte ${off})  <${Buffer.from(val.slice(0, 12)).toString('hex')}>`);
      if (depth < 4) parseRaw(val, p, depth + 1);
    } else if (wire === 2) {
      console.log(`${p} (w2) = "${Buffer.from(val).toString('utf8')}"  @data byte ${off}`);
    } else {
      console.log(`${p} (w0) = ${val}  @data byte ${off}`);
    }
  }
}

const b = readFileSync(file);
console.log('== struttura completa (parser manuale, offset assoluti del FILE) ==');
parseRaw(b);
