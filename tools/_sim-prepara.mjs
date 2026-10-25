// _sim-prepara.mjs (v2) — LA SIMULAZIONE DEL «PREPARA» SULLA COPIA VERGINE
// (26/10, richiesta Mauro: «simula un'installazione pulita e vediamo cosa non va»).
//
// Riproduce il ramo del gestore 'race' del server (src/webui.mjs, case 'race')
// su un SAVE SANDBOX: GameModes/GameModeType_RACE_WEEKEND.gamemodesave è un
// CAMPIONE REALE di Mauro e last_grid.customgrid la copia della griglia reale
// di un'altra serie — come sul PC vergine mentre EVO è aperto con la carriera.
// Nessuna scrittura fuori da data/test-installazione-pulita/sandbox.
process.env.ACE_GAME_SAVEDIR = 'data/test-installazione-pulita/sandbox';
process.env.EVO_DATA_DIR = 'data/test-installazione-pulita';

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));

const mod = (p) => import(pathToFileURL(join(ROOT, p)));
const { changeWeekendTrack, currentWeekendTrack, weekendCarCount } = await mod('tools/set-track.mjs');
const { currentRaceTime, setRaceTime } = await mod('tools/set-racetime.mjs');
const { rebuildGridApply } = await mod('src/grid-apply.mjs');
const { garageCurrent } = await mod('tools/set-driver-car.mjs');
const { currentWeatherPreset } = await mod('src/weather.mjs');

// la serie della carriera di test dell'app (Coppa 500, come negli screenshot PC2)
const nodeId = 'coppa_audi-r8-lms-gt4-evo';

console.log('=== 1) PISTA: currentWeekendTrack() sul campione reale ===');
const before = currentWeekendTrack();
console.log(`  letta: ${before ?? 'NULL'}`);

console.log('=== 2) PISTA: changeWeekendTrack («Prepara» vuole Imola) ===');
try {
  const r = changeWeekendTrack('Imola');
  console.log(`  esito: written=${r.written} · blocchi=${r.blocchi} · changed=${r.changed}`);
} catch (e) {
  console.log(`  ❌ ${String(e?.message ?? e).split('\n')[0]} (code: ${e?.code ?? '?'})`);
}
const after = currentWeekendTrack();
console.log(`  rilettura: ${after ?? 'NULL'} ${/imola/i.test(after ?? '') ? '✅ Imola scritta e riletta' : '❌ NON è Imola'}`);

console.log('=== 3) CONTATORI NATIVI: weekendCarCount() (3.7 / 3.10) ===');
const cc = weekendCarCount();
console.log(`  auto dichiarate=3.7: ${cc?.declared} · voci 3.10: ${cc?.cars} · pista: ${cc?.track ?? 'NULL'}`);

console.log('=== 4) GRIGLIA: rebuildGridApply nella sandbox (griglia di un\'altra serie sul disco) ===');
try {
  const out = rebuildGridApply({ ladder, nodeId, roundIndex: 0, dry: true });
  console.log(`  dry ${nodeId} → source ${out.source} · ${out.report.serie} · ${out.report.gridSize} celle`);
  const full = rebuildGridApply({ ladder, nodeId, roundIndex: 0, dry: false, force: true });
  console.log(`  FULL → scritta in sandbox (source ${full.source})`);
} catch (e) {
  console.log(`  ❌ ${String(e?.message ?? e).split('\n')[0]}`);
}

console.log('=== 5) ORA: currentRaceTime() e setRaceTime 11:00 scala 1 (come fa il server) ===');
const t = currentRaceTime();
console.log('  lette:', t ? `${t.hour}:${String(t.minute ?? 0).padStart(2, '0')} · ${t.scale}x` : 'NULL (il server mostrerebbe «apri il weekend in EVO»)');
try {
  const rt = setRaceTime({ hour: 11, scale: 1 });
  console.log('  scrittura:', JSON.stringify(rt));
} catch (e) {
  console.log(`  ❌ ${String(e?.message ?? e).split('\n')[0]}`);
}

console.log('=== 6) GARAGE (solo lettura: in sandbox non c\'è garage) ===');
try { console.log('  auto corrente:', garageCurrent()?.name ?? 'NULL'); }
catch (e) { console.log(`  errore atteso: ${String(e?.message ?? e).split('\n')[0]}`); }

console.log('=== 7) METEO (solo lettura: in sandbox non c\'è gamemode.lastgamemode) ===');
try { console.log('  preset corrente:', currentWeatherPreset()); }
catch (e) { console.log(`  errore atteso: ${String(e?.message ?? e).split('\n')[0]}`); }

console.log(`=== fine — file gamemodesave esiste ancora: ${existsSync('data/test-installazione-pulita/sandbox/GameModes/GameModeType_RACE_WEEKEND.gamemodesave')} ===`);
