// _weekend-celle.mjs — dove vivono le CELLE (auto/opponenti) nei gamemodesave e nel customgrid
import { decodeMsg } from './evo-grid.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.env.USERPROFILE, 'Saved Games', 'ACE', 'gamemodes');
const scan = (buf, depth = 0, path = '', out = []) => {
  let sub = [];
  try { sub = decodeMsg(buf); } catch { return out; }
  for (const g of sub) {
    const here = `${depth ? path : ''}${depth ? '.' : ''}${g.field}`;
    if (g.bytes) {
      const t = g.bytes.toString('utf8');
      if (t.startsWith('ks_') || t.startsWith('preset_')) {
        out.push({ path: here, fmt: g.wire, len: g.bytes.length });
      }
      out = scan(g.bytes, depth + 1, here, out);
    }
  }
  return out;
};

for (const f of ['last_grid.customgrid', 'GameModeType_RACE_WEEKEND.gamemodesave']) {
  const buf = readFileSync(join(DIR, f));
  const hits = scan(buf);
  const cont = {};
  for (const h of hits) {
    const k = h.path.replace(/\.\d+$/, '.N');
    cont[k] = cont[k] || { n: 0, valori: new Set() };
    cont[k].n++;
  }
  console.log('===', f, buf.length + 'B');
  for (const [k, v] of Object.entries(cont).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log('   path', k, '→', v.n, 'occorrenze');
  }
  // il PATH PIÙ profonde è quasi sicuro la cella: stampa i nomi auto per path distinti, ordini by profondità
  const perPath = {};
  for (const h of hits) (perPath[h.path] = perPath[h.path] || []).push(h);
  const keys = Object.keys(perPath).sort((a, b) => b.split('.').length - a.split('.').length);
  for (const k of keys.slice(0, 5)) {
    console.log('   esempio path', k, '→ n =', perPath[k].length, '· lunghezze byte:', perPath[k].map((h) => h.len).join(','));
  }
}
