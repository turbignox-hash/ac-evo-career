// _merge-r5.mjs — il magazzino della Coppa R5 Turbo era POVERO (11 celle uniche
// sul file di fabbrica) mentre il conteggio di carriera della serie chiede 12 o
// 14 vetture: il builder rifiuta a ragione e la griglia resta quella della serie
// precedente (lezione 24/10, Coppa 500 → Coppa R5). Nella raccolta c'erano però
// GIÀ 24 celle R5 byte-uniche sparse su 69 file (fabbrica, magazzini, grezze e
// i loro .bak-*): qua si fondono TUTTE nel template in config/griglie-fabbrica
// /coppa_r5-turbo.customgrid (con backup prima). Gli altri file non si toccano.
// Solo le celle ks_renault_5_gt_turbo, esclusivamente byte-uniche.
import { readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg, encodeMsg, gridFileOf } from './evo-grid.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = join(HERE, '..');
const ID = 'ks_renault_5_gt_turbo';
const BASE = join(PROJ, 'config', 'griglie-fabbrica', 'coppa_r5-turbo.customgrid');
const DIRS = [
  join(PROJ, 'config', 'griglie-fabbrica'),
  join(PROJ, 'data', 'grid-templates'),
  join(PROJ, 'data', 'slot-3', 'grid-templates'),
  join(PROJ, 'data', 'griglie-grezz'),
];
const carIdOf = (b) => { for (const g of decodeMsg(b)) if (g.field === 3) return g.bytes.toString('utf8'); return null; };

const uniche = new Map();   // hex → bytes raw della cella
for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.customgrid')) continue;
    let buf; try { buf = readFileSync(join(dir, f)); } catch { continue; }
    let cells; try { cells = gridFileOf(buf).cells; } catch { continue; }
    for (const c of cells) {
      if (c.carId !== ID) continue;
      const k = Buffer.from(c.raw).toString('hex');
      if (!uniche.has(k)) uniche.set(k, c.raw);
    }
  }
}
if (uniche.size < 14) {
  console.error(`ci sono solo ${uniche.size} celle R5 uniche (servono ≥14): niente merge`);
  process.exit(1);
}
const buf0 = readFileSync(BASE);
const fields0 = decodeMsg(buf0);
const tutto = [...uniche.values()];
const mergeTarget = tutto.length;
// il file di base resta l'ossatura (driver, config, meteo); si sostituiscono
// SOLO le entrate di campo 1 con tutte le celle uniche raccolte.
let cellsOut = 0;
const fields = [];
for (const f of fields0) {
  if (f.field !== 1) { fields.push(f); continue; }
  if (cellsOut < mergeTarget) fields.push({ field: 1, wire: 2, bytes: tutto[cellsOut++] });
}
while (cellsOut < mergeTarget) fields.push({ field: 1, wire: 2, bytes: tutto[cellsOut++] });   // coda se il base ne ha meno
const backup = `${BASE}.bak-merge-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
copyFileSync(BASE, backup);
writeFileSync(BASE, encodeMsg(fields));
// anche nel magazzino di progetto (stesso contenuto, come raccogli-griglie)
try { writeFileSync(join(PROJ, 'data', 'grid-templates', 'coppa_r5-turbo.customgrid'), encodeMsg(fields)); } catch {}
const g = gridFileOf(encodeMsg(fields));
console.log(`merge R5: ${cellsOut} celle uniche scritte · driver: ${g.drivers.length} · config count: ${g.config.count} (backup: ${backup})`);
