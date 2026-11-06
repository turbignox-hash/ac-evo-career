// fotografica il gamemodesave a ogni mtime-change, in data/samples/wx-<HHMMSS>.hex
import { statSync, copyFileSync, mkdirSync } from 'node:fs';
const SRC = 'C:/Users/Mauro/Saved Games/ACE/GameModes/GameModeType_RACE_WEEKEND.gamemodesave';
mkdirSync('data/samples', { recursive: true });
let last = 0;
setInterval(() => {
  try {
    const m = statSync(SRC).mtimeMs;
    if (m !== last) {
      last = m;
      const t = new Date();
      const tag = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
      copyFileSync(SRC, 'data/samples/wx-' + tag + '.hex');
      console.log('[' + tag + '] snapshot salvato (size ' + statSync(SRC).size + ')');
    }
  } catch {}
}, 250);
console.log('watcher attivo');
