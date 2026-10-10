#!/usr/bin/env node
// evo-fake-result.mjs — scrive un file di risultato come lo scriverebbe Assetto Corsa EVO,
// per provare "import" senza guidare.
//
//   node tools/evo-fake-result.mjs --dir "<...>/Results" --position 3 --cars 12 --track Imola [--fl] [--dnf]
//
// Il pilota della carriera viene letto da data/evo-career.save.json (o da --player "Nome Cognome").
// Gli avversari portano il contrassegno "•" come nel gioco, e le posizioni sono 0-based
// (0 = vincitore), esattamente come nel formato reale.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const SAVE = join(PROJECT, 'data', 'evo-career.save.json');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const wantPosition = Math.max(1, Number(arg('position', 1)));
const fieldSize = Math.max(2, Number(arg('cars', 12)));
const track = String(arg('track', 'Imola'));
const layout = String(arg('layout', 'GP Race'));
const session = String(arg('session', 'Race'));
const wantDnf = !!arg('dnf', false);
const wantFl = !!arg('fl', false);
const carName = String(arg('car', 'Ferrari 296 GT3'));
const dir = String(arg('dir', join(PROJECT, 'demo', 'ace', 'Results')));

let player = { first: 'Mauro', last: 'Sgamer', nation: 'ITA' };
if (existsSync(SAVE)) {
  const state = JSON.parse(readFileSync(SAVE, 'utf8'));
  player = { first: state.driver.first, last: state.driver.last, nation: state.driver.nation };
}
const custom = arg('player', null);
if (typeof custom === 'string') {
  const parts = custom.trim().split(/\s+/);
  player = { first: parts[0], last: parts.slice(1).join(' ') || parts[0], nation: 'ITA' };
}

const AI = [
  ['Adrian', 'Palmer', 'GBR'], ['Ryan', 'Coleman', 'USA'], ['Connor', 'Phillips', 'USA'],
  ['Lukas', 'Zimmermann', 'DEU'], ['Justin', 'Crawford', 'USA'], ['Anthony', 'Russell', 'USA'],
  ['Diego', 'Ramirez', 'MEX'], ['Scott', 'Patterson', 'USA'], ['Andrea', 'Rossi', 'ITA'],
  ['Henri', 'Dubois', 'FRA'], ['Brandon', 'Turner', 'USA'], ['Felix', 'Schumacher', 'DEU'],
  ['Andrew', 'Wallace', 'USA'], ['Niklas', 'Becker', 'DEU'], ['Lars', 'Nielsen', 'DNK'],
  ['Kenji', 'Tanabe', 'JPN'], ['Miguel', 'Arrieta', 'ESP'], ['Niels', 'Bakker', 'NLD'],
  ['Rafael', 'Nunes', 'BRA'], ['Piotr', 'Kowalski', 'POL'],
];

const fmt = (ms) => {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(3).padStart(6, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
};

const totalLaps = 12;
const baseLap = 100; // secondi

// griglia: gli avversari, poi il giocatore inserito alla posizione richiesta
const field = [];
const aiCount = fieldSize - 1;
for (let i = 0; i < aiCount; i++) {
  const [first, last, nation] = AI[i % AI.length];
  field.push({ name: `•${first}`, surname: last, nation, gap: 0.4 + i * 0.35 });
}
const insertAt = Math.min(wantPosition - 1, field.length);
field.splice(insertAt, 0, { name: player.first, surname: player.last, nation: player.nation, gap: 0.25 + insertAt * 0.3, isPlayer: true });

// chi sta davanti gira più forte; il giocatore che chiede il giro veloce lo ottiene
field.forEach((e, i) => {
  e.bestMs = (baseLap + e.gap) * 1000;
  e.laps = i < fieldSize / 2 ? totalLaps : totalLaps - 1;
});
const playerIndexBefore = field.findIndex((e) => e.isPlayer);
if (wantFl) field[playerIndexBefore].bestMs = (baseLap - 0.2) * 1000;

let fastestIndex = field.reduce((best, e, i) => (e.bestMs < field[best].bestMs ? i : best), 0);

// ritiro: il giocatore finisce in fondo, senza tempo totale
if (wantDnf) {
  const [me] = field.splice(field.findIndex((e) => e.isPlayer), 1);
  me.laps = 2;
  me.retired = true;
  field.push(me);
  fastestIndex = field.reduce((best, e, i) => (e.bestMs < field[best].bestMs ? i : best), 0);
}

const drivers = field.map((e, i) => ({
  driver_id: { a: String(5000000000000000000n + BigInt(i) * 12345n), b: String(15000000000000000000n + BigInt(i) * 777n) },
  is_current_driver: false, // il gioco in singolo spesso non lo marca: l'import lo riconosce dall'assenza del "•"
  position: i,
  driver_name: e.name,
  driver_surname: e.surname,
  driver_nation: e.nation,
  team: '',
  car_brand: 'Kunos',
  car_name: carName,
  car_number: i + 2,
  laps: e.laps,
  splits: [],
  best_lap: fmt(e.bestMs),
  total_time: e.retired ? '' : fmt(e.bestMs * e.laps),
  diff_first: i === 0 ? '' : fmt((e.bestMs - field[0].bestMs) * e.laps),
  diff_previous: i === 0 ? '' : fmt((e.bestMs - field[i - 1].bestMs) * e.laps),
  num_pits: 0,
  penalties: [],
  high_penalty: '',
  ballast: 0,
  restrictor: 0,
  has_best_lap: i === fastestIndex,
}));

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const outFile = join(dir, `${stamp}_SP_${session}.sessionresults.json`);
mkdirSync(dir, { recursive: true });
writeFileSync(outFile, JSON.stringify({
  season: 'Demo',
  event: 'Demo',
  session,
  track,
  layout,
  weather_type: 'GameModeSelectionWeatherType_CLEAR',
  hour: 14,
  min: 0,
  drivers,
}, null, 1) + '\n', 'utf8');

const me = drivers.find((d) => d.driver_name === player.first && d.driver_surname === player.last);
console.log(`Risultato finto scritto: ${outFile}`);
console.log(`  ${session} · ${track} · ${drivers.length} piloti · giocatore ${wantDnf ? 'ritirato (P' + drivers.length + ')' : 'P' + (me.position + 1)} · giro veloce: ${me.has_best_lap ? 'tuo' : drivers[fastestIndex].driver_name + ' ' + drivers[fastestIndex].driver_surname}`);
