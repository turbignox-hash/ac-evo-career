// track-change-monitor.mjs — spia sul cambio pista a gioco APERTO.
// Ogni secondo stampa i file toccati di recente in Saved Games/ACE (mtime),
// lo stato live (pista/layout/sessione) e - se i file chiave cambiano - il loro
// hash. Scopo: capire DOVE EVO scrive la pista del weekend quando la cambi dal menu.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'C:/Users/Mauro/Saved Games/ACE';
const seen = new Map();
const scan = (dir, rel = '') => {
  let items = []; try { items = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    if (it.isDirectory()) { if (!['Replay', 'MoTec', 'Results', 'Logs'].includes(it.name)) scan(join(dir, it.name), rel + it.name + '/'); continue; }
    const p = join(dir, it.name);
    let st; try { st = statSync(p); } catch { continue; }
    const key = rel + it.name;
    const sig = `${Math.round(st.mtimeMs / 1000)}|${st.size}`;
    const prev = seen.get(key);
    if (prev !== sig) {
      const now = prev ? 'CAMBIATO ' : 'visto    ';
      seen.set(key, sig);
      if (prev || Math.abs(Date.now() - st.mtimeMs) < 120000) console.log(`${now}${new Date(st.mtimeMs).toISOString().slice(11,19)}  ${key}  (${st.size}B)`);
    }
  }
};
console.log('--- monitor partito: tocca la pista nel menu quando vuoi ---');
setInterval(() => scan(root), 1000);
