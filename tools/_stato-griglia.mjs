// _stato-griglia.mjs — lettura immediata del disco di EVO (lab, MAURO 26/10):
// contatore nativo, forma del modo, celle della cartuccia.
import { weekendCarCount, weekendGridMode } from './set-track.mjs';
import { readCells } from '../tools/grid-balance.mjs';
import { readFileSync } from 'node:fs';
import { GRID_FILE } from '../src/grid-apply.mjs';

console.log('nativo:', JSON.stringify(weekendCarCount()));
console.log('modo:', JSON.stringify(weekendGridMode()));
try { console.log('cartuccia:', readCells(readFileSync(GRID_FILE)).cells.length, 'celle'); }
catch (e) { console.log('cartuccia: non leggibile —', e.message.slice(0, 80)); }
