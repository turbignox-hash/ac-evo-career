// debug-logsplit.mjs — confronta i log di gioco di ieri (telemetria OK) e oggi (vuota)
import { readFileSync } from 'node:fs';

const logIeri = 'C:/Users/Mauro/Saved Games/ACE/Logs/log-260928-200600.txt';
const logOggi = 'C:/Users/Mauro/Saved Games/ACE/Logs/log-260929-194642.txt';

const patterns = [
  'Split completed for car',
  'On Split start',
  'Zone Exit',
  'crossed the line',
  'Lap finished',
  'lap_end',
  'Finished lap',
  'Lap Invalid',
  'Lap valid',
  'invalid lap',
  'off track',
  'reset to track',
];

const counts = (file) => {
  const txt = readFileSync(file, 'latin1');
  const out = {};
  for (const p of patterns) out[p] = txt.split(p).length - 1;
  return out;
};

const a = counts(logIeri);
const b = counts(logOggi);
console.log('pattern'.padEnd(28), 'ieri', 'oggi');
for (const p of patterns) console.log(p.padEnd(28), String(a[p]).padStart(5), String(b[p]).padStart(5));
