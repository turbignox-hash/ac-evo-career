// compare-setups.mjs — confronto VERI fra file .carsetup: pressioni, camber/toe,
// freni, diff, molle, ammortizzatori, aero. Richiesta Mauro 21/10: «vedere
// realmente cosa ha fatto (il meccanico)». I file sono argomenti da CLI o, per
// il testVELOCE, le 3 copie della Ferrari 296 GT3 a Imola (giorno 21-10).
// uso: node tools/compare-setups.mjs <file1> <file2> [...]
import { parseSetup } from '../src/carsetup.mjs';
import { readFileSync } from 'node:fs';

const DEFAULTS = [
  'C:/Users/Mauro/Saved Games/ACE/Car Setups/Ferrari 296 GT3/Imola/Test Ferrari GT3.carsetup',
  'C:/Users/Mauro/Saved Games/ACE/Car Setups/Ferrari 296 GT3/Imola/Test Ferrari GT3 — setup che piace (21-10, EVO-consigliato).carsetup',
  'C:/Users/Mauro/Saved Games/ACE/Car Setups/Ferrari 296 GT3/Imola/Optimed.carsetup',
];
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;
const r1 = (v) => (v == null ? '—' : String(Math.round(v * 1000) / 1000));

const loaded = files.map((f) => ({ name: f.split('/').pop(), s: parseSetup(readFileSync(f)) }));
const w = Math.max(...loaded.map((l) => Math.min(40, l.name.length)));
const row = (label, get, indent = '  ') => {
  console.log(label);
  for (const l of loaded) console.log(`${indent}${l.name.slice(0, w).padEnd(w)}  ${get(l.s)}`);
};

console.log('===== FRAMMENTO REALE dei save (.carsetup, decoder auto.mjs) =====');
row('【gomme: pressione PSI】', (s) => (s.tires ?? []).map((t) => r1(t.pressure)).join(' | '));
row('【gomme: camber°】', (s) => (s.tires ?? []).map((t) => r1(t.camber)).join(' | '));
row('【gomme: toe°】', (s) => (s.tires ?? []).map((t) => r1(t.toe)).join(' | '));
row('【freni: bias% / mult%】', (s) => s.brakes ? `${r1(s.brakes.bias)} / ${r1(s.brakes.mult)}` : '—');
row('【diff: tra / coast / pre】', (s) => s.diff ? `${r1(s.diff.traction)} / ${r1(s.diff.coast)} / ${r1(s.diff.preload)}` : (s.diff == null ? '—' : Object.keys(s.diff).join(',')));
row('【molle N/m (6)】', (s) => (s.springs ?? []).map((m) => r1(m.spring)).join(' | '));
row('【ammort. lB-u/fB-u/lR-u/fR-u (primo assale)】', (s) => (s.dampers ?? []).slice(0, 4).map((d) => `${r1(d.slowBump)}/${r1(d.fastBump)}|${r1(d.slowReb)}/${r1(d.fastReb)}`).join('  '));
if (loaded.some((l) => l.s.aero)) {
  row('【aero: pack / h-ant / h-post / ala-ant / ala-post】', (s) => s.aero ? `${JSON.stringify(s.aero.pack ?? [])} · h = ${r1(s.aero.heightF)} / ${r1(s.aero.heightR)} · ali = ${r1(s.aero.wingF)} / ${r1(s.aero.wingR)}` : '—');
}
if (loaded.some((l) => l.s.electronics)) {
  row('【elettronica】', (s) => s.electronics ? JSON.stringify(s.electronics).slice(0, 90) : '—');
}
if (loaded.some((l) => l.s.fuel != null)) {
  row('【benzina litri】', (s) => (s.fuel == null ? '—' : r1(s.fuel)));
}
// i DIFF fra il primo e l'ultimo file (base → ottimizzato)
const [a, ...rest] = [loaded[0], loaded[loaded.length - 1]];
console.log('===== CAMBIAMENTI davvero scritti (base → final) =====');
const diff = (label, path, mul = '') => {
  const va = path(a.s), vb = path(rest[0].s);
  if (JSON.stringify(va) === JSON.stringify(vb)) return;
  console.log(`  ${label}: ${JSON.stringify(va)} → ${JSON.stringify(vb)} ${mul}`.replace(/"/g, ''));
};
diff('pressioni', (s) => (s.tires ?? []).map((t) => t.pressure), 'PSI');
diff('camber', (s) => (s.tires ?? []).map((t) => t.camber), '°');
diff('toe', (s) => (s.tires ?? []).map((t) => t.toe), '°');
diff('freni', (s) => s.brakes, '%');
diff('diff', (s) => s.diff);
diff('molle', (s) => (s.springs ?? []).map((m) => m.spring));
diff('ammort. primo assale', (s) => (s.dampers ?? []).slice(0, 4));
diff('aero', (s) => s.aero);
diff('benzina', (s) => s.fuel);
console.log('  (il parser tocca SOLO i campi mappati: tutto il resto resta byte per byte)');
