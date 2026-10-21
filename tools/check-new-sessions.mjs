import { readdirSync } from 'node:fs';
import { analyzeLd, sessionMetaOf } from '../src/motec.mjs';

const dir = 'C:/Users/Mauro/Saved Games/ACE/MoTec/Ferrari 296 GT3/ImolaGP';
const names = readdirSync(dir).filter((f) => f.endsWith('.ld') && f.includes('2026'));
console.log('FILE .ld di oggi:', names.length);
for (const n of names) {
  const meta = sessionMetaOf(n);
  const a = analyzeLd(dir + '/' + n);
  if (!a) { console.log('=== ' + n + ' -> non leggibile'); continue; }
  console.log('=== ' + n.slice(25, 62));
  console.log('  start:', meta.startAt ? meta.startAt.toLocaleString('it-IT') : '?', '· dur:', a.durationSec + 's · giri validi:', a.validLaps, '· best:', a.bestLapSec + 's · aria', a.airTemp, '· asfalto', a.roadTemp);
  console.log('  freddo (min nelle prime battute):', JSON.stringify(a.coldPressures));
  console.log('  bumpstop:', JSON.stringify(a.bump));
  console.log('  camberProxy:', JSON.stringify(a.camberProxy));
  const laps = a.laps.filter((l) => l.durationSec > 15 || a.laps.length < 9);
  for (const l of laps) {
    const p = l.pressures ?? {}, t = l.tair ?? {}, b = l.brakes ?? {};
    console.log('   giro', String(l.lap).padStart(2), (l.durationSec + 's').padStart(8),
      'fuel', l.fuelUsed,
      '· pres:', [p.LF, p.RF, p.LR, p.RR].map((v) => v == null ? '?' : v.toFixed(1)).join('/'),
      '· tair:', [t.LF, t.RF, t.LR, t.RR].map(v => v == null ? '?' : Math.round(v)).join('/'),
      '· freni:', [b.LF, b.RF, b.LR, b.RR].map(v => v == null ? '?' : Math.round(v)).join('/'));
  }
}
