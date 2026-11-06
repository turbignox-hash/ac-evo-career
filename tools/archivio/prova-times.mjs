// prova-times.mjs — lettura della sessione prova: best lap, ballast/penalità, giri.
// uso: node tools/prova-times.mjs [percorso|prefisso file results]   (default: ultima Practice)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RESULTS_DIR = 'C:/Users/Mauro/Saved Games/ACE/Results';
const arg = process.argv[2];

let file = arg;
if (!file || !file.includes('/')) {
  const pref = arg ?? '';
  const files = readdirSync(RESULTS_DIR).filter((f) => f.includes('Practice') && f.endsWith('.json') && f.startsWith(pref)).sort();
  file = join(RESULTS_DIR, files.at(-1) ?? '');
}
const j = JSON.parse(readFileSync(file, 'utf8'));
console.log('file:', file.split('/').pop(), '| track:', j.track, '| layout:', j.layout, '| weather:', j.weather_type, '| hour:', j.hour);

const ms = (s) => { if (!s) return null; const m = s.match(/(\d+):(\d+)[.](\d+)/); return m ? +m[1] * 60000 + +m[2] * 1000 + +m[3] : null; };
const fmt = (v) => v == null ? '—' : `${Math.floor(v / 60000)}:${String(Math.floor((v % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor(v % 1000)).padStart(3, '0')}`;

const rows = (j.drivers ?? []).map((d) => ({
  name: d.player_name ?? d.name ?? '?',
  car: d.car_name ?? ((d.car_brand ?? '') + ' '),
  bal: d.ballast ?? null,
  res: (d.restrictor ?? 0) * 100,
  best: ms(d.best_lap),
  laps: d.total_laps ?? d.laps ?? '?',
})).sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));

const bests = rows.filter((r) => r.best != null);
const ref = bests[0]?.best ?? null;
for (const r of rows) {
  const gap = r.best != null && ref != null ? ((r.best - ref) / 1000).toFixed(2) + 's' : '—';
  console.log(fmt(r.best).padStart(10), ('+' + gap.replace('+', '')).padStart(8), r.car.padEnd(34), `bal:${String(r.bal ?? '—').padStart(3)}`, `res:${r.res}%`, `giri:${r.laps}`, r.name);
}
