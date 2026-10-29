// _gara-veloce.mjs (1/11) — LA GARA PERSONALIZZATA AL VOLO («se ti dicessi
// «preparami al volo una gara endurance da 5 giri», saresti in grado?»).
//
// Un gesto prepara TUTTO che l'app può scrivere byte a byte nella gara
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
// Il CRUSCOTTO oltre al CLI: src/webui.mjs chiama garaVeloce() con gli stessi
// argomenti (pannello «Gara al volo», via bridge le scritture passano a gioco
// aperto con force, come 'instantrace').
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

/** La ricetta completa della gara al volo. RAISE per input sani (400:
 * NO_RECIPE / NO_ENTRAMBI / BANDA-formato), 409 se l'INSTANT_RACE non esiste.
 * Ogni passo si cava da solo: esito '' = riuscito, errore catturato in esito. */
export function garaVeloce({ giri = null, tempo = null, aiMin = 88, aiMax = 93, auto = null, pool = null, dry = false, force = false } = {}) {
  aiMin = aiMin != null ? aiMin : 88;  // esplicito nel default anche da API con null
  aiMax = aiMax != null ? aiMax : 93;
  if (giri == null && tempo == null) {
    throw Object.assign(new Error('ricetta mancante: servono giri O minuti a tempo'), { code: 'NO_RECIPE' });
  }
  if (giri != null && tempo != null) {
    throw Object.assign(new Error('o a giri o a tempo, non entrambi'), { code: 'NO_ENTRAMBI' });
  }
  giri = giri != null ? Number(giri) : null;
  tempo = tempo != null ? Number(tempo) : null;
  if ((giri != null && (!Number.isFinite(giri) || giri <= 0)) || (tempo != null && (!Number.isFinite(tempo) || tempo <= 0))) {
    throw Object.assign(new Error('durata: intero > 0 richiesto'), { code: 'BAD_DURATA' });
  }
  aiMin = Math.round(Number(aiMin)); aiMax = Math.round(Number(aiMax));
  if (!Number.isFinite(aiMin) || !Number.isFinite(aiMax) || aiMin < 0 || aiMax < 0 || aiMin > 100 || aiMax > 100) {
    throw Object.assign(new Error('banda AI: due interi fra 0 e 100'), { code: 'BAD_BANDA' });
  }
  if (!existsSync(INSTANT_FILE)) {
    throw Object.assign(new Error(`INSTANT_RACE non esiste ancora (${INSTANT_FILE}): apri UNA volta una gara personalizzata in EVO, poi riprova.`), { code: 'NO_INSTANT' });
  }
  if (auto != null) auto = String(auto).trim();
  if (typeof pool === 'string') pool = pool.split(',').map((c) => c.trim()).filter(Boolean);

  const passi = [];
  const step = (nome, fn) => {
    try { passi.push({ nome, esito: fn(), ok: true }); }
    catch (e) { passi.push({ nome, esito: String(e?.message ?? e), ok: false }); }
  };

  const titolo = `GARA AL VOLO: ${giri != null ? `${giri} giri` : `${tempo} min`} · banda AI ${aiMin}–${aiMax}${auto ? ` · sedile ${auto}` : ''}${pool ? ' · griglia dal pool' : ''}${dry ? ' · DRY-RUN' : ''}`;

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
    if (!dry && cur && cur.aiMin === aiMin && cur.aiMax === aiMax) return `già ${aiMin}–${aiMax} (niente da scrivere)`;
    const r = setInstantAi(aiMin, aiMax, { dry, force });
    if (r.written) return `${aiMin}–${aiMax} scritta (era ${cur && cur.aiMin != null ? `${cur.aiMin}–${cur.aiMax}` : '—'})${r.backup ? ` (backup ${basename(r.backup)})` : ''}`;
    if (r.dry) return `dry: scriveresti ${aiMin}–${aiMax}`;
    return r.nota ?? `già ${aiMin}–${aiMax}`;
  });

  // 3) SEDILE ARMATO (opzionale): l'auto che il Cruscotto comanda nel menu gara
  if (auto) step('sedile (vetrina custom)', () => {
    const ladder = loadLadder();
    const nome = ladder?.contentNames?.cars?.[auto] ?? null;
    if (!nome) throw new Error(`auto "${auto}" NON nel libro della ladder: sedile NON armato (controlla l'id nel catalogo)`);
    const state = loadState(SAVE_FILE);
    state.vetrinaCustom = { car: auto, startedAt: Date.now() };
    saveState(SAVE_FILE, state);
    return `armato: entro pochi secondi il Cruscotto imposta "${nome}" (a fine gara: vetrina-custom --off)`;
  });

  // 4) GRIGLIA dal POOL (opzionale): stessa rete dell'event-prep — template =
  // customgrid corrente + i .bak-* più recenti, celle del pool, banda dei rivali
  if (pool?.length) step('griglia dal pool', () => {
    const GRID_FILE = join(GAME_MODES_DIR, 'last_grid.customgrid');
    if (!existsSync(GRID_FILE)) throw new Error('manca last_grid.customgrid: genera una griglia qualsiasi in EVO una volta, poi ripremi');
    const evNode = {
      nodeId: 'gara-veloce', display: 'Gara al volo',
      gridSize: Math.max(2, pool.length + 1), cars: pool,
      calendar: [{ name: 'gara al volo' }],
    };
    const candidati = [GRID_FILE,
      ...readdirSync(dirname(GRID_FILE)).filter((f) => f.startsWith(`${basename(GRID_FILE)}.bak-`)).sort().reverse().map((f) => join(dirname(GRID_FILE), f))];
    let built = null, errore = null;
    for (const cand of candidati) {
      try { built = buildGridMessage({ ladder: { nodes: [evNode] }, nodeId: evNode.nodeId, roundIndex: 0, file: cand, aiBand: [aiMin, aiMax], noBalance: true, celleNuove: true }); break; }
      catch (e) { errore = e; }
    }
    if (!built) throw new Error(`griglia NON riscritta: ${String(errore?.message ?? errore)}`);
    if (dry) return `dry: costruirei ${built.report.gridSize} celle dal pool (${pool.join(', ')})`;
    const backup = `${GRID_FILE}.bak-veloce-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
    copyFileSync(GRID_FILE, backup);
    writeFileSync(`${GRID_FILE}.tmp`, built.buffer);
    renameSync(`${GRID_FILE}.tmp`, GRID_FILE);
    return `riscritta: ${built.report.gridSize} celle${built.report.sintesi?.length ? ` · celle sintetizzate per le TUE mai in griglia: ${built.report.sintesi.join(', ')} — la prima APPLICA in gioco è la verifica` : ''} · AI ${built.report.ai ?? `${aiMin}-${aiMax}`} (${pool.join(', ')})`;
  });

  // il verdetto finale: lo stato dell'istantanea come lo vedrà EVO al menu
  let stato = null;
  try { stato = currentInstantRace(); } catch { stato = null; }

  return {
    titolo,
    passi,
    stato,
    dry,
    restaAte: [
      'apri EVO → Gara personalizzata: scegli PISTA, LAYOUT e AUTO',
      'nel menu griglia premi APPLICA: le celle scritte qui si montano',
      'parti. Durata e banda nel menu sono quelle scritte qui sopra.',
    ],
  };
}

function dopoTempoDescr(sec) { const m = Math.round((Number(sec) || 0) / 60); return `${Math.max(1, m)} min`; }

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (nome) => { const i = argv.indexOf('--' + nome); return i >= 0 ? argv[i + 1] : null; };
  let aiMin = 88, aiMax = 93;                    // default: banda endurance degli eventi
  const bandaArg = val('banda');
  if (bandaArg != null) {
    const m = String(bandaArg).match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) { console.error('banda: formato LO-HI (es. --banda 88-93)'); process.exit(2); }
    aiMin = Number(m[1]); aiMax = Number(m[2]);
  }
  const giri = val('giri') != null ? Number(val('giri')) : null;
  const tempo = val('tempo') != null ? Number(val('tempo')) : null;
  let out;
  try {
    out = garaVeloce({ giri, tempo, aiMin, aiMax, auto: val('auto'), pool: val('griglia-pool'), dry: argv.includes('--dry'), force: argv.includes('--force') });
  } catch (e) {
    console.error(String(e?.message ?? e)); process.exit(Number(e?.code) || /NO_RECIPE|NO_ENTRAMBI|BAD_DURATA|BAD_BANDA/.test(e?.code ?? '') ? 2 : 1);
  }
  console.log(`== ${out.titolo} ==\n`);
  for (const p of out.passi) console.log(`  ${p.ok ? '✓' : '✗'} ${p.nome}: ${p.esito}`);
  if (out.stato) console.log(`\nStato istantaneo: ${out.stato.modeTxt === 'a tempo' ? `${Math.round((out.stato.durata ?? 0) / 60)} min a tempo` : `${out.stato.durata} giri`} · AI ${out.stato.aiMin ?? '?'}–${out.stato.aiMax ?? '?'}`);
  if (out.dry) console.log('   (dry-run: nessun file toccato)');
  console.log('\n>> RESTA A TE (l\'app non clicca l\'interfaccia di EVO):');
  for (let i = 0; i < out.restaAte.length; i++) console.log(`   ${i + 1}) ${out.restaAte[i]}`);
}
