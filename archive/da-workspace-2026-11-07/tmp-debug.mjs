import { resolvePaths } from './src/paths.mjs';
import { collectSessions } from './src/motec.mjs';

const p = resolvePaths();
const root = p.dataDirs[0] + '\\MoTec';
const resultsDir = p.resultsDirs[0];
console.log('root =', JSON.stringify(root));
console.log('resultsDir =', JSON.stringify(resultsDir));

const s = collectSessions(root, resultsDir, { car: 'Honda S2000 AP1', limit: 8 });
console.log('s2000 sessions:', s.length);
for (const x of s.slice(0, 5)) {
  console.log(' ', x.track, '|', x.kindLabel, '| valid:', x.validLaps,
    '| coldLF:', x.coldPressures && x.coldPressures.LF,
    '| hotLF:', x.hotPressures && x.hotPressures.LF,
    '| fuel/lap:', x.fuelPerLap, '| dur:', x.durationSec);
}
const s2 = collectSessions(root, resultsDir, { car: 'Honda S2000 AP1', track: 'Nürburgring GP', limit: 8 });
console.log('s2000 con filtro pista:', s2.length);
