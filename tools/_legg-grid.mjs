import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(0, 'utf8'));
const fmt = (c) => `${c.name} (preset ${c.preset ?? '-'}, kg ${c.kg}, pct ${c.pct})`;
console.log(JSON.stringify({
  exists: j.exists, drivers: j.drivers, classe: j.classe, perTraccia: j.perTraccia,
  aiMin: j.aiMin, aiMax: j.aiMax, matched: j.matched,
  celle: (j.cells ?? []).map(fmt),
}, null, 1));
