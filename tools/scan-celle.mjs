// scan-celle.mjs — trovaclassi: dove stanno le celle di serie auto nel magazzino.
// uso: node tools/scan-celle.mjs ks_mercedes_190e_evo_ii ...
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const want = process.argv.slice(2);
const roots = [
  'config/griglie-fabbrica',
  'data/grid-templates',
  'data/griglie-grezz',
  'data/samples',
  'L:\\CarrieraEVO',
  'C:\\Users\\Mauro\\Saved Games\\ACE\\GameModes',
];
const hits = {};
const walk = (dir, depth) => {
  if (depth > 4) return;
  let list = []; try { list = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else if (/customgrid/i.test(e.name) || /\.grid$/i.test(e.name)) {
      try {
        const b = readFileSync(p);
        const found = want.filter((w) => b.indexOf(Buffer.from(w)) >= 0);
        if (found.length) hits[p] = found.map((w) => {
          const s = b.toString('binary');
          return `${w.replace('ks_', '')}×${s.split(w).length - 1}`;
        }).join(' ');
      } catch {}
    }
  }
};
for (const r of roots) walk(r, 0);
for (const [p, f] of Object.entries(hits).sort()) console.log(p, '->', f);
if (!Object.keys(hits).length) console.log('nessuna cella trovata');
