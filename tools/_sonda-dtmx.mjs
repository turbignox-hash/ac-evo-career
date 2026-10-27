// sonda: stato reale dei template per dtm_legends (26/10 notte)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg } from './evo-grid.mjs';

const PROJ = join(dirname(fileURLToPath(import.meta.url)), '..');
const carIdOf = (b) => { for (const g of decodeMsg(b)) if (g.field === 3) return g.bytes.toString('utf8'); return null; };
const cellsOf = (buf) => { try { return decodeMsg(buf).filter((f) => f.field === 1).map((f) => f.bytes); } catch { return null; } };
const riepilogo = (nome, file) => {
  if (!existsSync(file)) { console.log(`${nome}: ASSENTE`); return; }
  let buf; try { buf = readFileSync(file); } catch (e) { console.log(`${nome}: illeggibile — ${e.message}`); return; }
  const cells = cellsOf(buf); if (!cells) { console.log(`${nome}: decode FALLITO`); return; }
  const byId = {};
  for (const b of cells) { const id = carIdOf(b) ?? '?'; byId[id] = (byId[id] ?? 0) + 1; }
  console.log(`${nome}: ${cells.length} celle → ${JSON.stringify(byId)}`);
};

riepilogo('fabbrica  ', join(PROJ, 'config', 'griglie-fabbrica', 'dtm_legends.customgrid'));
riepilogo('magazzino ', join(PROJ, 'data', 'grid-templates', 'dtm_legends.customgrid'));
riepilogo('last_grid ', 'C:/Users/Mauro/Saved Games/ACE/GameModes/last_grid.customgrid');

const classes = JSON.parse(readFileSync(join(PROJ, 'data', 'grid-classes.json'), 'utf8'));
const cls = classes.classi?.dtm_legends;
console.log('classe dtm_legends in grid-classes.json:', cls ? JSON.stringify({ poolAuto: cls.poolAuto ?? null, regole: (cls.regole ?? []).length }) : 'ASSENTE');

const ladder = JSON.parse(readFileSync(join(PROJ, 'config', 'career.evo.ladder.json'), 'utf8'));
const node = (ladder.nodes ?? []).find((n) => n.nodeId === 'dtm_legends');
console.log('ladder node:', node ? JSON.stringify({ cars: node.cars ?? null, gridSize: node.gridSize ?? null, display: node.display ?? null }) : 'ASSENTE');
