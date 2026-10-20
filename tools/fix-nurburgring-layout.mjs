// fix-nurburgring-layout.mjs — aggiorna i campi pista del weekend file per il
// Nürburgring GP con i valori che EVO SCRIVE DA SOLO nelle sessioni vere
// (Results 260929-*): nome "Nurburgring" (SENZA ü — gli asset/texture del gioco
// sono ASCII: col "ü" la texture "n%C3%BCrburgring_gp-gp.texture" non esiste →
// path vuoto → crash al load), tag "GP", layout "Gp Strecke Time Attack".
import { decodeMsg, encodeMsg } from './evo-grid.mjs';
import { readFileSync, writeFileSync, copyFileSync, renameSync } from 'node:fs';

const FILE = 'C:/Users/Mauro/Saved Games/ACE/GameModes/GameModeType_RACE_WEEKEND.gamemodesave';
const want = {
  name: 'Nurburgring',            // ASCII: è così che EVO stesso lo cita nei Results
  tag: 'GP',
  layout: 'Gp Strecke Time Attack',
};

const buf = readFileSync(FILE);
const fields = decodeMsg(buf);
const f3 = fields.filter((f) => f.field === 3 && f.wire === 2);
const str = (x) => (x?.bytes != null) ? Buffer.from(x.bytes).toString('utf8') : '';
let touched = 0;
const stops = [];
for (const f of f3) {
  const session = decodeMsg(f.bytes);
  const trk = session.find((s) => s.field === 5 && s.wire === 2);
  if (!trk) continue;
  const sub = decodeMsg(trk.bytes);
  for (const s of sub) {
    if (s?.bytes == null) continue;   // campi varint (p.e. f9 lunghezza): niente stringa
    const cur = str(s);
    if (s.field === 2 && want.name && cur !== want.name && /n[uü]rb/i.test(cur)) { stops.push(cur + '→' + want.name); s.bytes = Buffer.from(want.name, 'utf8'); touched++; }
    else if (s.field === 3 && want.tag && cur !== want.tag) { stops.push(cur + '→' + want.tag); s.bytes = Buffer.from(want.tag, 'utf8'); touched++; }
    else if (s.field === 6 && want.layout && cur !== want.layout) { stops.push(cur + '→' + want.layout); s.bytes = Buffer.from(want.layout, 'utf8'); touched++; }
  }
  trk.bytes = encodeMsg(sub);
  f.bytes = encodeMsg(session);
}
if (touched) {
  copyFileSync(FILE, FILE + '.bak-layoutfix-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16));
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, encodeMsg(fields));
  renameSync(tmp, FILE);
  console.log('scritto ✓ (campi toccati:', touched, '):', stops.join(' · '));
} else console.log('già a posto, niente da scrivere');
