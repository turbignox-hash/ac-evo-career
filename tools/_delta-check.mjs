// tools/_delta-check.mjs — one-off (Mauro 24/10): quali versioni della Lancia
// Delta sono già state fotografate nei tre archivi? Si autolibera.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gridFileOf } from './evo-grid.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const dirs = [['fabbrica', join(ROOT, 'config', 'griglie-fabbrica')], ['magazzino', join(ROOT, 'data', 'grid-templates')], ['grezze', join(ROOT, 'data', 'griglie-grezz')]];
const viste = new Map(); // carId → { nome, dove:Set }
for (const [et, d] of dirs) {
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith('.customgrid') && !x.includes('.bak'))) {
    try {
      const g = gridFileOf(readFileSync(join(d, f)));
      for (const c of g.cells) {
        const s = `${c.carId ?? ''} ${c.carName ?? ''}`;
        if (/delta/i.test(s)) {
          if (!viste.has(c.carId)) viste.set(c.carId, { nome: c.carName ?? c.carId, dove: new Set() });
          viste.get(c.carId).dove.add(et);
        }
      }
    } catch { }
  }
}
if (!viste.size) console.log('nessuna cella Delta trovata negli archivi');
for (const [id, v] of viste) console.log(`✅ ${v.nome} [${id}] → ${[...v.dove].join(', ')}`);
