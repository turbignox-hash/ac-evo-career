// fotografica gamemode.lastgamemode a ogni mtime-change, in data/samples/lgm-<HHMMSS>.hex
import { statSync, copyFileSync } from 'node:fs';
const SRC = 'C:/Users/Mauro/Saved Games/ACE/GameModes/gamemode.lastgamemode';
let last = 0;
setInterval(() => {
  try {
    const m = statSync(SRC).mtimeMs;
    if (m !== last) {
      last = m;
      const t = new Date();
      const tag = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
      copyFileSync(SRC, 'data/samples/lgm-' + tag + '.hex');
      console.log('[' + tag + '] lgm snapshot (size ' + statSync(SRC).size + ')');
    }
  } catch {}
}, 200);
console.log('lgm watcher attivo');
