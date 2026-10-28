// watch-grid.mjs — watchdog sul file customgrid di EVO: logga cada mtime/hash
// nel file data/grid-watch.log a ogni cambiamento, per il test dell'11/10.
// Uso: node tools/watch-grid.mjs [timeout-secondi]  (default: 1 ora)
import { watchFile, statSync, readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, '..', 'data', 'grid-watch.log');
const FILE = process.env.GRID_FILE ?? 'C:/Users/Mauro/Saved Games/ACE/GameModes/last_grid.customgrid';
const tsec = Number(process.argv[2] ?? 3600);
const _t0 = Date.now();

const snap = () => {
  try {
    const st = statSync(FILE);
    const buf = readBuf(FILE);
    const h = createHash('sha1').update(buf).digest('hex').slice(0, 10);
    return { mtime: st.mtimeMs, size: st.size, hash: h };
  } catch { return null; }
};
const readBuf = (f) => readFileSync(f);

let last = snap();
const line = (msg) => appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
line(`WATCH start: ${last ? JSON.stringify(last) : 'file assente'}`);
console.log(`watch su ${FILE}`);
console.log(`registro: ${LOG}`);
console.log(`durata: ${tsec}s (stop con Ctrl+C)`);
watchFile(FILE, { interval: 1000 }, () => {
  const cur = snap();
  if (!cur) { line('FILE SPARITO'); last = null; return; }
  if (!last || cur.mtime !== last.mtime || cur.size !== last.size || cur.hash !== last.hash) {
    line(`CAMBIATO: ${JSON.stringify(last)} → ${JSON.stringify(cur)}`);
    console.log('CAMBIATO:', last, '→', cur);
    last = cur;
  }
});
setTimeout(() => { line('WATCH stop (timeout)'); process.exit(0); }, tsec * 1000);
