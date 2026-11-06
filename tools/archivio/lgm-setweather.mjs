// Patch in-place della timeline meteo in gamemode.lastgamemode.
// Floats wire-5: sovrascrittura a stessa lunghezza -> struttura protobuf invariata.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const SRC = 'C:/Users/Mauro/Saved Games/ACE/GameModes/gamemode.lastgamemode';
const [, , ARG_RAIN, ARG_CLOUD, ARG_FOG] = process.argv;
const RAIN = ARG_RAIN != null ? Number(ARG_RAIN) : 1.0;   // 0..1 precipitazioni
const CLOUD = ARG_CLOUD != null ? Number(ARG_CLOUD) : 0.5; // 0..1 copertura
const FOG = ARG_FOG != null ? Number(ARG_FOG) : 0.2;       // 0..1 nebbia

function parse(buf, start, end, out) {
  let i = start;
  while (i < end) {
    const tagOff = i; const tag = buf[i++];
    const field = tag >> 3, wire = tag & 7;
    let valOff = i, _len = 0;
    if (wire === 0) { while (buf[i] & 128) i++; i++; _len = 1; }
    else if (wire === 1) { i += 8; _len = 8; }
    else if (wire === 5) { i += 4; _len = 4; }
    else if (wire === 2) { let l = 0, s = 0; while (true) { const x = buf[i]; l |= (x & 127) << s; s += 7; i++; if (!(x & 128)) break; } valOff = i; _len = l; i += l; }
    else break;
    out.push({ field, wire, tagOff, valOff, end: i, start: valOff });
  }
  return out;
}
const buf = readFileSync(SRC);
copyFileSync(SRC, 'data/samples/lgm-backup-preB.hex');
copyFileSync(SRC, SRC + '.bak-weather-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
const top = []; parse(buf, 0, buf.length, top);
let patched = 0;
for (const subField of top.filter((f) => f.field === 3 && f.wire === 2)) {
  const subs = []; parse(buf, subField.valOff, subField.end, subs);
  const w = subs.find((x) => x.field === 3 && x.wire === 2); // payload meteo
  if (!w) continue;
  const fs = []; parse(buf, w.start, w.end, fs);
  const set = { 8: RAIN, 11: CLOUD, 12: FOG };
  for (const f of fs) {
    if (set[f.field] !== undefined && f.wire === 5) {
      buf.writeFloatLE(set[f.field], f.valOff);
      patched++;
    }
  }
}
if (!patched) { console.log('NESSUN campo meteo trovato: non patcho.'); process.exit(1); }
writeFileSync(SRC, buf);
console.log('patch ok: ' + patched + ' float scritti (pioggia=' + RAIN + ' copertura=' + CLOUD + ' nebbia=' + FOG + ')');
console.log('backup: data/samples/lgm-backup-preB.hex + .bak-weather-* accanto al file');
