// _merge-dtm.mjs — il template di fabbrica di dtm_legends era RIDOTTO alle
// sole celle E30 mentre il ladder chiede E30 + Mercedes 190E Evo II + Alfa 75:
// il «Prepara tutto» del 26/10 loggava le auto mancanti (data/match-auto.log)
// e la griglia riuscita restava un E30 solo. Le celle mancanti ESISTEVANO:
//   • MERCEDES nei .bak-apply/-griglia/-bal di Saved Games GameModes
//   • ALFA 75 nel backup del progetto del 25/10 su L: (data-progetto/
//     grid-templates/dtm_legends + coppa_alfa-romeo-75-turbo-evo):
//     perse nell'installazione pulita di Mauro, ripescate qui.
// Stesso schema di _merge-r5.mjs: l'ossatura (driver, config, meteo) del file
// base resta; si APPENDONO in coda SOLO le celle byte-uniche NON già nel base
// (idempotente: si può rilanciare senza duplicare). Torna quante ne appende.
import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg, encodeMsg, gridFileOf } from './evo-grid.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = join(HERE, '..');
const IDS = ['ks_mercedes_190e_evo_ii', 'ks_alfa_romeo_75_turbo_evo'];
const LBU = 'L:\\CarrieraEVO\\evo-pitwall-backup-25-10-2026';
const BASE = join(PROJ, 'config', 'griglie-fabbrica', 'dtm_legends.customgrid');
const DIRS = [
  join(PROJ, 'config', 'griglie-fabbrica'),
  join(PROJ, 'data', 'grid-templates'),
  join(PROJ, 'data', 'slot-3', 'grid-templates'),
  join(PROJ, 'data', 'griglie-grezz'),
  'C:\\Users\\Mauro\\Saved Games\\ACE\\GameModes',
  join(LBU, 'Saved-Games-ACE', 'GameModes'),
  join(LBU, 'data-progetto', 'grid-templates'),
  join(LBU, 'data-progetto', 'griglie-grezz'),
];

const _carIdOf = (b) => { for (const g of decodeMsg(b)) if (g.field === 3) return g.bytes.toString('utf8'); return null; };

// celle byte-uniche delle auto cercate, sparse su ogni fonte (dedup per hex)
const viste = new Map();   // hex → bytes raw della cella
const fonti = new Set();
for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.customgrid')) continue;
    let cells; try { cells = gridFileOf(readFileSync(join(dir, f))).cells; } catch { continue; }
    for (const c of cells) {
      if (!IDS.includes(c.carId)) continue;
      const k = Buffer.from(c.raw).toString('hex');
      viste.set(k, c.raw);
      fonti.add(f);
    }
  }
}

// il file base resta l'ossatura (driver, config, meteo): il suo quadro celle
// NON si tocca, le nuove si APPENDONO in coda (rimbalzo senza duplicati).
const fields0 = decodeMsg(readFileSync(BASE));
const perBase = new Set(gridFileOf(readFileSync(BASE)).cells.map((c) => Buffer.from(c.raw).toString('hex')));
const nuove = [...viste.entries()].filter(([k]) => !perBase.has(k)).map(([, raw]) => raw);
for (const c of gridFileOf(readFileSync(BASE)).cells) {
  const k = Buffer.from(c.raw).toString('hex');
  if (IDS.includes(c.carId)) viste.set(k, c.raw);   // conta anche i base già buoni
}
console.log(`celle ${IDS.join('+')}: viste=${viste.size} da fonti=${fonti.size} · già nel base=${perBase.size ? perBase.size : 0} · da appendere=${nuove.length} (${perBase.size} uniche nel base prima)`);

if (nuove.length) {
  const fields = [...fields0, ...nuove.map((raw) => ({ field: 1, wire: 2, bytes: raw }))];
  const backup = `${BASE}.bak-merge-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  copyFileSync(BASE, backup);
  writeFileSync(BASE, encodeMsg(fields));
  try { writeFileSync(join(PROJ, 'data', 'grid-templates', 'dtm_legends.customgrid'), encodeMsg(fields)); } catch {}
  const g = gridFileOf(encodeMsg(fields));
  const unici = new Set(g.cells.map((c) => Buffer.from(c.raw).toString('hex')));
  console.log(`merge dtm: +${nuove.length} celle · pool adesso ${g.cells.length} celle (${unici.size} byte-uniche) · driver: ${g.drivers.length} · config count: ${g.config.count} (backup: ${backup})`);
} else {
  const g = gridFileOf(readFileSync(BASE));
  const unici = new Set(g.cells.map((c) => Buffer.from(c.raw).toString('hex')));
  console.log(`niente da appendere · pool già ${g.cells.length} celle (${unici.size} byte-uniche)`);
}
