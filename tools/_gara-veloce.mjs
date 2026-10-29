// _gara-veloce.mjs (1/11) — LA GARA PERSONALIZZATA AL VOLO («se ti dicessi
// \«preparami al volo una gara endurance da 5 giri», saresti in grado?\»).
//
// Un gesto prepara TUTTO ciondolo l'app può scrivere byte a byte nella gara
// personalizzata di EVO (INSTANT_RACE + customgrid), restando fuori dal
// weekend di carriera (lezione 23/10: GameModeType_RACE_WEEKEND NON si tocca
// per gare fuori dal ladder — è della ronda, e mescolare i due mondi ha già
// dato il crash 0xC0000005 da pista mancante):
//
//   node tools/_gara-veloce.mjs --giri 5               # endurance, 5 giri
//   node tools/_gara-veloce.mjs --tempo 30             # a tempo (30 min)
//     [--banda 88-93]        banda AI della gara (default 88–93, endurance)
//     [--auto ks_ferrari_296_gt3]  arma il sedile nel Cruscotto (vetrina custom)
//     [--griglia-pool id1,id2,...] riscrive la griglia col pool dato (builder,
//                            fallback sui backup .bak-* come l'event-prep)
//     [--dry] [--force]
//
// Resta ALL'UTENTE (l'app non clicca l'interfaccia di EVO):
//   1) apri EVO → Gara personalizzata: scegli pista/layout/auto;
//   2) nel menu griglia premi GENERA/APPLICA (le celle scritte qui si montano);
//   3) parti. Durata e banda nel menu sono quelle scritte qui.
// A EVO APERTO le scritture dell'istantanea passano solo con --force; senza,
// il comando rifiuta (lezione: il menu può riscrivere il file nel frattempo).

import { existsSync, readdirSync, copyFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

import { GAME_MODES_DIR } from './evo-grid.mjs';
import { timedRace, setInstantAi, currentInstantRace, INSTANT_FILE } from './set-instantrace.mjs';
import { loadState, saveState } from '../src/state.mjs';
import { loadLadder, SAVE_FILE } from '../src/webui-env.mjs';
import { buildGridMessage } from '../src/gridbuilder.mjs';

const argv = process.argv.slice(2);
const val = (nome) => { const i = argv.indexOf('--' + nome); return i >= 0 ? argv[i + 1] : null; };
const giri = val('giri') != null ? Number(val('giri')) : null;
const tempo = val('tempo') != null ? Number(val('tempo')) : null;
const dry = argv.includes('--dry');
const force = argv.includes('--force');
const auto = val('auto');
const poolArg = val('griglia-pool');
let bandaMin = 88, bandaMax = 93;                   // default: banda endurance degli eventi
const bandaArg = val('banda');
if (bandaArg != null) {
  const m = String(bandaArg).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) { console.error('banda: formato LO-HI (es. --banda 88-93)'); process.exit(2); }
  bandaMin = Number(m[1]); bandaMax = Number(m[2]);
}
if (giri == null && tempo == null) {
  console.log('ricetta mancante: usa --giri N o --tempo N (minuti). Es. una endurance da 5 giri:\n  node tools/_gara-veloce.mjs --giri 5 --banda 88-93');
  process.exit(2);
}
if (giri != null && tempo != null) { console.error('o a giri o a tempo, non entrambi'); process.exit(2); }
if (!existsSync(INSTANT_FILE)) {
  console.error(`INSTANT_RACE non esiste ancora (${INSTANT_FILE}): apri UNA volta una gara personalizzata in EVO, poi riprova.`);
  process.exit(1);
}

console.log(`== GARA AL VOLO: ${giri != null ? `${giri} giri` : `${tempo} min`} · banda AI ${bandaMin}–${bandaMax}${auto ? ` · sedile ${auto}` : ''}${poolArg ? ' · griglia dal pool' : ''}${dry ? ' · DRY-RUN' : ''} ==\n`);

// 1) DURATA/MODALITÀ della gara (blocco Race dell'INSTANT_RACE)
step('durata gara', () => {
  const r = timedRace({ laps: giri, minutes: tempo, dry, force });
  const descr = giri != null ? `${giri} giri` : `${dopoTempoDescr(r.durata)} a tempo`;
  if (r.written) return `${descr} scritti${r.backup ? ` (backup ${basename(r.backup)})` : ''}`;
  if (r.dry) return `dry: scriveresti ${descr}`;
  return r.nota ?? 'già a posto';
});

// 2) BANDA AI della gara (cursori che EVO mostra/applica al menu gara)
step('banda AI', () => {
  const cur = currentInstantRace();
  if (!dry && cur && cur.aiMin === bandaMin && cur.aiMax === bandaMax) return `già ${bandaMin}–${bandaMax} (niente da scrivere)`;
  const r = setInstantAi(bandaMin, bandaMax, { dry, force });
  if (r.written) return `${bandaMin}–${bandaMax} scritta (era ${cur && cur.aiMin != null ? `${cur.aiMin}–${cur.aiMax}` : '—'})${r.backup ? ` (backup ${basename(r.backup)})` : ''}`;
  if (r.dry) return `dry: scriveresti ${bandaMin}–${bandaMax}`;
  return r.nota ?? `già ${bandaMin}–${bandaMax}`;
});

// 3) SEDILE ARMATO (opzionale): l'auto che il Cruscotto comanda nel menu gara
if (auto != null) step('sedile (vetrina custom)', () => {
  const ladder = loadLadder();
  const nome = ladder?.contentNames?.cars?.[auto] ?? null;
  if (!nome) return `auto "${auto}" NON nel libro della ladder: sedile NON armato (controlla l'id nel catalogo)`;
  const state = loadState(SAVE_FILE);
  state.vetrinaCustom = { car: auto, startedAt: Date.now() };
  saveState(SAVE_FILE, state);
  return `armato: entro pochi secondi il Cruscotto imposta "${nome}" (a fine gara: vetrina-custom --off)`;
});

// 4) GRIGLIA dal POOL (opzionale): stessa rete dell'event-prep — template =
// customgrid corrente + i .bak-* più recenti, celle del pool, banda dei rivali
if (poolArg != null) step('griglia dal pool', () => {
  const pool = String(poolArg).split(',').map((c) => c.trim()).filter(Boolean);
  const GRID_FILE = join(GAME_MODES_DIR, 'last_grid.customgrid');
  if (!existsSync(GRID_FILE)) return 'manca last_grid.customgrid: genera una griglia qualsiasi in EVO una volta, poi ripremi';
  const evNode = {
    nodeId: 'gara-veloce', display: 'Gara al volo',
    gridSize: Math.max(2, pool.length + 1), cars: pool,
    calendar: [{ name: 'gara al volo' }],
  };
  const candidati = [GRID_FILE,
    ...readdirSync(dirname(GRID_FILE)).filter((f) => f.startsWith(`${basename(GRID_FILE)}.bak-`)).sort().reverse().map((f) => join(dirname(GRID_FILE), f))];
  let built = null, errore = null;
  for (const cand of candidati) {
    try { built = buildGridMessage({ ladder: { nodes: [evNode] }, nodeId: evNode.nodeId, roundIndex: 0, file: cand, aiBand: [bandaMin, bandaMax], noBalance: true }); break; }
    catch (e) { errore = e; }
  }
  if (!built) return `griglia NON riscritta: ${String(errore?.message ?? errore)}`;
  if (dry) return `dry: costruirei ${built.report.gridSize} celle dal pool (${pool.join(', ')})`;
  const backup = `${GRID_FILE}.bak-veloce-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(GRID_FILE, backup);
  writeFileSync(`${GRID_FILE}.tmp`, built.buffer);
  renameSync(`${GRID_FILE}.tmp`, GRID_FILE);
  return `riscritta: ${built.report.gridSize} celle · AI ${built.report.ai ?? `${bandaMin}-${bandaMax}`} (${pool.join(', ')})`;
});

// il verdetto finale: lo stato dell'istantanea come lo vedrà EVO al menu
const dopo = (() => { try { return currentInstantRace(); } catch { return null; } })();
if (dopo) console.log(`\nStato istantaneo: ${dopo.modeTxt === 'a tempo' ? `${Math.round((dopo.durata ?? 0) / 60)} min a tempo` : `${dopo.durata} giri`} · AI ${dopo.aiMin ?? '?'}–${dopo.aiMax ?? '?'}`);
if (dry) console.log('   (dry-run: nessun file toccato)');
console.log('\n>> RESTA A TE (l\'app non clicca l\'interfaccia di EVO):');
console.log('   1) apri EVO → Gara personalizzata: scegli PISTA, LAYOUT e AUTO');
console.log('   2) nel menu griglia premi APPLICA: le celle scritte qui si montano');
console.log('   3) parti. Durata e banda nel menu sono quelle scritte qui sopra.');

/* ---------- helper ---------- */
function step(nome, fn) {
  try { console.log(`  ✓ ${nome}: ${fn()}`); }
  catch (e) { console.log(`  ✗ ${nome}: ${String(e?.message ?? e)}`); }
}
function dopoTempoDescr(sec) { const m = Math.round((Number(sec) || 0) / 60); return `${Math.max(1, m)} min`; }
