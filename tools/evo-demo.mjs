#!/usr/bin/env node
// evo-demo.mjs — costruisce un'installazione EVO finta (cartelle dati + log + Results)
// con esattamente il contenuto citato dalla scala carriera. Serve per provare tutto
// il ciclo senza avere il gioco: content --validate, new, next, race, import, season-end.
//
//   node tools/evo-demo.mjs
//   ACE_DATA=demo/ace node ac-evo-career.mjs content --validate

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const LADDER = join(PROJECT, 'config', 'career.evo.ladder.json');
const DEMO = join(PROJECT, 'demo', 'ace');

const ladder = JSON.parse((await import('node:fs')).readFileSync(LADDER, 'utf8'));

if (existsSync(join(PROJECT, 'demo'))) rmSync(join(PROJECT, 'demo'), { recursive: true, force: true });
mkdirSync(join(DEMO, 'Logs'), { recursive: true });
mkdirSync(join(DEMO, 'Results'), { recursive: true });

const cars = new Set();
const tracks = new Set();
for (const node of ladder.nodes) {
  (node.cars ?? []).forEach((c) => cars.add(c));
  (node.calendar ?? []).forEach((r) => tracks.add(r.track));
}

const lines = ['[demo] caricamento contenuto di prova'];
for (const t of [...tracks].sort()) lines.push(`Loading scene content\\tracks\\${t}\\${t}.scene`);
for (const c of [...cars].sort()) lines.push(`Loading car content\\cars\\${c}\\${c}.actor`);
lines.push('scene_actors collection doesn\'t contain track_limits_left splines');
writeFileSync(join(DEMO, 'Logs', 'log-260101-000000.txt'), lines.join('\n') + '\n', 'utf8');

// una season definition credibile, come quelle che scrive il gioco
const seedTrack = [...tracks][0];
const seedCar = [...cars][0];
writeFileSync(join(DEMO, 'last_season.seasondefinition.json'), JSON.stringify({
  season_type: 'SeasonDefinitionType_SinglePlayer',
  name: 'Demo',
  event_map: { '0': { name: 'Demo', session_map: { '0': { name: 'Race', scene: { track_content_data: { name: ladder.contentNames?.tracks?.[seedTrack] ?? seedTrack, folder_path: `content\\tracks\\${seedTrack}` } } } } } },
  entrylist: { cars: [{ car_final_states: [{ car_data: `content\\cars\\${seedCar}\\data\\CarData.car` }] }] },
}, null, 1) + '\n', 'utf8');

console.log(`Installazione demo creata in ${DEMO}`);
console.log(`  ${cars.size} auto, ${tracks.size} piste`);
console.log('\nProva:');
console.log(`  ACE_DATA="${join('demo', 'ace')}" node ac-evo-career.mjs content --validate`);
console.log(`  ACE_DATA="${join('demo', 'ace')}" node ac-evo-career.mjs new --name "Mauro Sgamer" --nation ITA`);
