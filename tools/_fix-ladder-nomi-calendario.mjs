// _fix-ladder-nomi-calendario.mjs — CORREZIONE (30/10).
// La passata di stile _ladder-entry-style.mjs ha riscritto SOLO il campo
// `track` dei calendari di livello 1, tenendo(i) il vecchio `name`: il risultato
// era «Imola - Round 1» su track=brands_hatch, «Monza - Round 2» su
// donington_park… nomi e piste SCOPPIATI. Qui i nomi si rigenerano dalla pista
// attuale: «Brands Hatch - Round 1», l'ultima «· Finale». I roundtrip restano
// byte-identici fuori dai nomi cambiati.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../config/career.evo.ladder.json', import.meta.url);
const raw = readFileSync(FILE, 'utf8');
const ladder = JSON.parse(raw);
const bell = (t) => ladder.contentNames?.tracks?.[t] ?? t;

let fix = 0, ok = 0;
for (const node of ladder.nodes) {
  if (node.level !== 1) continue;
  const cal = node.calendar ?? [];
  cal.forEach((r, i) => {
    const nuovo = `${bell(r.track)} - ${i === cal.length - 1 ? 'Finale' : `Round ${i + 1}`}`;
    if (r.name !== nuovo) { r.name = nuovo; fix++; }
    else ok++;
  });
}

const out = JSON.stringify(ladder, null, 2) + '\n';
writeFileSync(FILE, out);
console.log(`nomi riallineati: ${fix} · già giusti: ${ok}`);

const check = JSON.parse(readFileSync(FILE, 'utf8'));
for (const n of check.nodes.filter((x) => x.level === 1).slice(0, 4)) {
  console.log(`  ${n.nodeId}:`);
  (n.calendar ?? []).forEach((r, i) => console.log(`    ${i + 1}) ${r.name}  ←  ${r.track}`));
}
