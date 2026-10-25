// _gridtype-watch.mjs — fotografa il gamemodesave del weekend a ogni
// mtime-change mentre Mauro muove il toggle GRID TYPE nel menu di EVO
// (sessione di registro 26/10): poi si fa diff a campo per trovare
// il protobuf del gridType AUTOMATIC→CUSTOM, come weather-diff.mjs.
import { statSync, copyFileSync, mkdirSync } from 'node:fs';
import { GAME_MODES_DIR } from './evo-grid.mjs';
import { join } from 'node:path';

const SRC = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');
const OUT = 'data/samples/gridtype';
mkdirSync(OUT, { recursive: true });
let last = 0;
const stamp = () => {
  const t = new Date();
  const hms = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
  return hms + '-' + String(t.getMilliseconds()).padStart(3, '0');
};
setInterval(() => {
  try {
    const m = statSync(SRC).mtimeMs;
    if (m !== last) {
      const size = statSync(SRC).size;
      if (last === 0) { last = m; return; }        // il primo giro: solo calibrazione
      last = m;
      const tag = stamp();
      copyFileSync(SRC, join(OUT, 'gt-' + tag + '.hex'));
      console.log('[' + tag + '] snapshot (size ' + size + ')');
    }
  } catch {}
}, 200);
console.log('watcher gridtype attivo: fotografo ' + SRC);
