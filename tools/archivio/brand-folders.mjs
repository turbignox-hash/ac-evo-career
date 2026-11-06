import { readFileSync } from 'node:fs';
const s = readFileSync('data/customgrid-snapshots/regola-buffy-confermata.customgrid', 'latin1');
// i path nel binary duro appaiono come content\cars\...customization\ks_porsche\colours\...
// con backslash singoli: split e filtriamo i segmenti che seguono 'customization'
const parts = s.split('\\');
const out = [];
for (let i = 0; i < parts.length - 1; i++) {
  if (parts[i] === 'customization') out.push(parts[i + 1]);
}
console.log([...new Set(out.filter((p) => p.startsWith('ks_')))].join('\n'));
