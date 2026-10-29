// _celle-sessioni.mjs — i QUATTRO blocchi sessione del weekend: quanti slot-cella ha ciascuno?
import { decodeMsg } from './evo-grid.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.env.USERPROFILE, 'Saved Games', 'ACE', 'gamemodes');
const wk = decodeMsg(readFileSync(join(DIR, 'GameModeType_RACE_WEEKEND.gamemodesave')));
const blocchi = wk.filter((f) => f.field === 3 && f.wire === 2);
console.log('blocchi field 3 =', blocchi.length);
for (const b of blocchi) {
  const sub = decodeMsg(b.bytes);
  const nomi = sub.filter((x) => x.field === 1 && x.bytes).map((x) => '"' + x.bytes.toString('utf8').slice(0, 32) + '"');
  const celle = sub.filter((x) => x.field === 10 && x.wire === 2);
  const f7 = sub.find((x) => x.field === 7)?.varint;
  console.log(`  blocchi: nomi=${nomi.join(',') || '(nessun nome)'} · sub-10=${celle.length} · f7=${f7 ?? '—'}`);
  // pista? qualche campo bytes con 'Hockenheim'? il nome pista
  for (const x of sub) {
    if (x.bytes) {
      const t = x.bytes.toString('utf8');
      if (t.length > 3 && /^[\x20-\x7e]+$/.test(t) && !t.startsWith('preset_') && !t.startsWith('ks_') && nomi.every((n) => !t.includes(n))) {
        console.log('    altro testo @f' + x.field, '→', JSON.stringify(t.slice(0, 60)));
      }
    }
  }
}
