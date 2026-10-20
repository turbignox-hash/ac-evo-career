// Verifica della timeline patchata: riepilogo dei float meteo di ogni sub
import { readFileSync } from 'node:fs';
import { decodeMsg } from './evo-grid.mjs';
const b = readFileSync('C:/Users/Mauro/Saved Games/ACE/GameModes/gamemode.lastgamemode');
const d = decodeMsg(b);
function floatsOf(bytes) {
  const out = {}; let i = 0; const b = Buffer.from(bytes);
  while (i < b.length) {
    const tag = b[i++]; const field = tag >> 3, wire = tag & 7;
    if (wire === 2) { const l = b[i++]; i += l; }
    else if (wire === 0) { while (b[i] & 128) i++; i++; }
    else if (wire === 5) { out['f' + field] = b.readFloatLE(i); i += 4; }
    else break;
  }
  return out;
}
const r = (v) => Math.round(v * 1000) / 1000;
d.filter((f) => f.field === 3 && f.wire === 2).forEach((sub) => {
  const s = decodeMsg(sub.bytes);
  const idx = (s.find((x) => x.field === 1) ?? {}).varint ?? 0;
  const sel = (s.find((x) => x.field === 2) ?? {}).varint === 1 ? ' [SELEZ]' : '';
  const w = s.find((x) => x.field === 3);
  const fl = w ? floatsOf(w.bytes) : {};
  console.log('sub ' + idx + sel + '  rain=' + (fl.f8 != null ? r(fl.f8) : '-') + ' cloud=' + (fl.f11 != null ? r(fl.f11) : '-') + ' fog=' + (fl.f12 != null ? r(fl.f12) : '-') + ' temp=' + (fl.f4 != null ? r(fl.f4) : '-'));
});
