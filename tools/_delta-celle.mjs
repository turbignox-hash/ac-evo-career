// tools/_delta-celle.mjs — one-off (Mauro 24/10): preset/anno distinti delle celle
// Delta. Senza argomento legge la fabbrica; con un percorso legge quel file
// (es. la griglia grezza multiclasse: la Delta prototipo potrebbe starci dentro).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gridFileOf } from './evo-grid.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const f = process.argv[2]
  ?? join(HERE, '..', 'config', 'griglie-fabbrica', 'coppa_lancia-delta-hf-integrale-evo-ii.customgrid');
if (!existsSync(f)) { console.log('file mancante: ' + f); process.exit(0); }
const g = gridFileOf(readFileSync(f));
const celle = g.cells.filter((c) => /delta/i.test(String(c.carId ?? '')));
console.log(`${f.split(/[\\/]/).pop()} → ${celle.length} celle Delta (su ${g.cells.length})`);
const comp = new Map();
for (const c of celle) {
  const k = `${c.visualPreset ?? '?'} · mech=${c.mechPreset ?? '?'} · anno=${c.year ?? '?'}`;
  comp.set(k, (comp.get(k) ?? 0) + 1);
}
for (const [k, n] of comp) console.log(`${n}× ${k}`);
