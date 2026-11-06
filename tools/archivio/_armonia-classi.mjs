// _armonia-classi.mjs — ARMONIA 25/10: aggiunge a data/grid-classes.json una
// classe per OGNI serie multiclasse del ladder che non ce l'ha (poolAuto =
// auto del nodo, regole a vuoto: la calibrazione nasce dai risultati, non dal
// teorico — decisione Mauro 24/10). Non tocca le classi esistenti.
//   node tools/_armonia-classi.mjs            (aggiunge e stampa il quadro)
//   node tools/_armonia-classi.mjs --stampa   (solo il quadro)
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../data/grid-classes.json', import.meta.url);
const LADDER = new URL('../config/career.evo.ladder.json', import.meta.url);
const stampa = process.argv.includes('--stampa');

const j = JSON.parse(readFileSync(FILE, 'utf8'));
if (!j.classi) j.classi = j;
const ladder = JSON.parse(readFileSync(LADDER, 'utf8'));

let aggiunte = 0;
for (const n of ladder.nodes) {
  if (j.classi[n.nodeId]) continue;
  const pool = Array.isArray(n.cars) ? n.cars : [];
  if (pool.length < 2) continue;
  j.classi[n.nodeId] = {
    poolAuto: [...pool],
    regole: [],
    escludiAuto: [],
    perTraccia: {},
    nota: 'ARMONIA-25/10: classe multiclasse senza dati di calibrazione - parte a 0/0 (decisione Mauro 24/10) e impara dai risultati.',
  };
  aggiunte++;
}
if (!stampa) {
  writeFileSync(FILE, JSON.stringify(j, null, 2) + '\n');
  console.log('classi totali: ' + Object.keys(j.classi).length + ' - multiclasse aggiunte oggi: ' + aggiunte);
}
for (const n of ladder.nodes) {
  const pool = Array.isArray(n.cars) ? n.cars : [];
  const cls = j.classi[n.nodeId];
  if (pool.length > 1) console.log((cls ? '[ok] ' : '[!]  ') + n.display + ' [' + n.nodeId + '] - classe ' + (cls ? (cls.regole?.length ? 'con ' + cls.regole.length + ' regole' : '0/0') : 'MANCANTE') + ', pool: ' + pool.map(function (c) { return ladder.contentNames?.cars?.[c] ?? c; }).join(', '));
}
