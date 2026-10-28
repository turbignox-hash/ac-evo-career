// _toggle-watch.mjs — fotografa OGNI file che cambia in ACE mentre Mauro
// muove il toggle Grid Type (26/10: il gamemodesave scritto a freddo NON
// viene adottato dal menu, quindi la bandierina vive ALTROVE).
// Copie su data/samples/gridtype2/<tag>__<percorso-appiattito>.
import { statSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_SAVEDIR } from './evo-grid.mjs';

const EXCLUDED = new Set(['Replay', 'MoTec', 'Logs', 'Results']);
const OUT = 'data/samples/gridtype2';
mkdirSync(OUT, { recursive: true });

function walk(dir, out = []) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name.startsWith('bak-') || e.name.includes('.bak-')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!EXCLUDED.has(e.name)) walk(p, out); }
    else out.push(p);
  }
  return out;
}

const known = new Map();
const stamp = () => {
  const t = new Date();
  return [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join('') + '-' + String(t.getMilliseconds()).padStart(3, '0');
};
const _first = true;
setInterval(() => {
  for (const p of walk(GAME_SAVEDIR)) {
    let st;
    try { st = statSync(p); } catch { known.delete(p); continue; }
    const sig = st.mtimeMs + ':' + st.size;
    if (!known.has(p)) { known.set(p, sig); continue; }   // baseline (prime 2 passeggiate)
    if (known.get(p) !== sig) {
      known.set(p, sig);
      const rel = p.slice(GAME_SAVEDIR.length).replace(/^[\\/]/, '').replace(/[\\/]/g, '__');
      const tag = stamp();
      try { copyFileSync(p, join(OUT, tag + '__' + rel)); console.log('[' + tag + '] ' + rel + ' (' + st.size + 'B)'); }
      catch {}
    }
  }
}, 250);
console.log('toggle-watch completo attivo su ' + GAME_SAVEDIR);
