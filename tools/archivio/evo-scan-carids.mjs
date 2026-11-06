// evo-scan-carids.mjs — trova gli id reali dei modelli auto nel pacchetto del
// gioco (content.kspkg). Scan a stream dei primi N GB cercando le segnature
// "car_\" o path di customization (quel che il file customgrid usa per f14):
// serve a smontare gli id DEDOTTI (tipo maserati) quando l'anteprima non istanzia.
//
// uso: node tools/evo-scan-carids.mjs "ks_maserati" [maxGB=2]
import { openSync, readSync, closeSync } from 'node:fs';

const [brand, maxGB] = [process.argv[2] ?? 'ks_maserati', Number(process.argv[3] ?? 2)];
const FILE = 'E:/SteamLibrary/steamapps/common/Assetto Corsa EVO/content.kspkg';
console.log('scan di', FILE, 'fino a', maxGB, 'GB, brand =', brand);

const CH = 64 * 1024 * 1024;
const fd = openSync(FILE, 'r');
const buf = Buffer.alloc(CH);
const found = new Map(); // id → contesto breve
const LIMIT = maxGB * 1024 * 1024 * 1024;
let pos = 0;
while (pos < LIMIT) {
  const n = readSync(fd, buf, 0, CH, pos);
  if (n <= 0) break;
  const s = buf.toString('latin1');
  for (let i = s.indexOf(brand); i !== -1; i = s.indexOf(brand, i + 1)) {
    const visibile = (t) => t.split('').map((ch) => (ch.charCodeAt(0) < 32 ? '·' : ch)).join('');
    const snip = visibile(s.slice(Math.max(0, i - 40), i + 120));
    const m = snip.match(/(ks_[a-z0-9_]+)/);
    if (m) found.set(m[1], snip.slice(0, 150));
  }
  pos += CH - 1000;
}
closeSync(fd);
if (!found.size) console.log('nessuna occorrenza di', brand, 'nello scansionato');
else for (const [id, ctx] of found) console.log(id, '\n   …', ctx, '\n');
