// _griglia-audit.mjs — sonda temporanea: cosa c'è davvero nelle griglie del gioco
import { decodeMsg } from './evo-grid.mjs';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.env.ACE_GAMEMODES ?? join(process.env.USERPROFILE, 'Saved Games', 'ACE', 'gamemodes');
const fino = (f) => statSync(join(DIR, f)).mtime.getTime();
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.customgrid') || f.includes('bak-'))
  .map((f) => ({ f, m: fino(f) }))
  .sort((a, b) => b.m - a.m);

const scan = (buf, depth = 0, fieldPath = '') => {
  let out = [];
  for (const g of decodeMsg(buf)) {
    if (g.bytes) {
      const t = g.bytes.toString('utf8');
      if (t.length > 4 && t.length < 200 && !t.includes(' ') && (t.startsWith('ks_') || t.startsWith('preset_'))) {
        out.push({ fieldPath: fieldPath + '.' + g.field, v: t });
      }
      try {
        const sub = decodeMsg(g.bytes);
        if (sub.length && depth < 6) out = out.concat(scan(g.bytes, depth + 1, fieldPath + '.' + g.field));
      } catch { /* non un sub-msg */ }
    }
  }
  return out;
};

for (const { f, m } of files.slice(0, 10)) {
  const buf = readFileSync(join(DIR, f));
  const hits = scan(buf);
  const ids = hits.filter((h) => h.v.startsWith('ks_') && !h.v.startsWith('preset_')).map((h) => h.v);
  const presets = hits.filter((h) => h.v.startsWith('preset_')).map((h) => h.v);
  console.log('---', f, new Date(m).toISOString().slice(0, 16), buf.length + 'B', ids.length + ' carid unici:', ids.slice(0, 4).join(','));
  if (presets.length) console.log('    presets:', [...new Set(presets)].slice(0, 3).join(' | '));
}
if (!files.length) console.log('(nessun file customgrid/bak- in', DIR + ')');
