// tools/riabilita-ronda.mjs — il medico delle rondi azzerate dal vigia.
//
// 5/11 sera: la ladder chiamava «Mini JCS 1990» l'auto che EVO scrive nei
// risultati «Mini John Cooper S» → tre rondi della Coppa registrati Ma valendo
// ZERO (0 punti, 0 premio, 0 reputazione). La riparazione non cambia i conti
// a mano: ribalta il motivo. Se OGGI il parco ammesso (car-pool) ammette
// l'auto della entry, il sigillo del vigia non regge e la ronda torna a
// valere come la scriverebbe `applyRaceResult` oggi:
//   • points = pointsFor (world.mjs)  • prize = prizeFor  • rep = repGain (×1.25 iconiche)
//   • cassa e rep += i DELTA non pagati, con i flussi a voce «riabilitazione»
//   • gara pulita 10% del premio (stessa regola, se no penalty)
//   • statistiche di merito: giri, vittorie, podi, giri veloci, bestLaps con
//     la stessa chiave canonica, bestFinish della scalata
//   • missione sponsor «podio entro il round N» pagata UNA volta se una ronda
//     riabilitata rientra nella finestra; la quota a gara NON si tocca (era
//     già stata pagata al primo import).
// Convenzioni: dry run di default; backup del save prima di scrivere; il
// server della webui (8642) deve essere SPEGNITO quando si scrive (tiene il
// save in memoria e vincerebbe le sue ricritture).
// Uso:  node tools/riabilita-ronda.mjs            (prova a secco, solo il piano)
//       node tools/riabilita-ronda.mjs --esegui   (scrive, col backup prima)
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadState, saveState, savePath, activeSlot, slotDataDir, chiaveBestLaps, pushMessage,
} from '../../src/state.mjs';
import { ricalcolaEntry, riabilitabile } from '../../src/repair-ronda.mjs';
import { carPoolOf, carInPool } from '../../src/car-pool.mjs';
import { recordFlows } from '../../src/flows.mjs';

const argv = process.argv.slice(2);
const ESEGUI = argv.includes('--esegui');
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(RADICE);   // i percorsi relativi della casa (config/, data/)

const slot = activeSlot();
const dataDir = process.env.EVO_DATA_DIR ?? join(RADICE, 'data');   // stessa regola di cli.mjs
const file = join(dataDir, savePath(slot));
const state = loadState(file);

let ladder = null;
for (const cand of [
  join(slotDataDir(), 'career.evo.ladder.json'),
  join(RADICE, 'config', 'career.evo.ladder.json'),
]) {
  try { ladder = JSON.parse(readFileSync(cand, 'utf8')); console.log('ladder:', cand); break; } catch { /* si passa avanti */ }
}
if (!ladder) { console.error('✧ ladder non trovato (slot né progetto)'); process.exit(1); }

const bashi = join(slotDataDir(), 'backups');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const piano = [];
for (const [nodeId, righe] of Object.entries(state.results ?? {})) {
  for (const entry of righe ?? []) {
    if (!entry?.autoFuori) continue;
    const mot = riabilitabile(ladder, nodeId, entry, { carPoolOf, carInPool });
    if (!mot) continue;
    const calc = ricalcolaEntry(ladder, state, nodeId, entry);
    if (!calc) { console.log(`skippata ${nodeId}: nodo assente nel ladder`); continue; }
    piano.push({ nodeId, entry, calc });
  }
}

console.log(`\n== PIANO ==  ${piano.length} ronde da riabilitare (dal motivo, non dai numeri)`);
for (const p of piano) {
  const e = p.entry;
  console.log(`  ${p.calc.node.display} R${(e.round ?? 0) + 1}: P${e.position} «${e.car}» — punti ${e.points}→${p.calc.points}, premio ${e.prize}→${p.calc.prize} €, rep ${e.rep}→${p.calc.rep}${p.calc.iconic ? ' (iconica)' : ''}`);
}
if (!piano.length) { console.log('\nniente da fare: nessuna ronda riabilitabile. Lanciala con «--esegui» quando il piano non è vuoto.'); process.exit(0); }
if (!ESEGUI) { console.log('\nPROVA: non ho scritto niente. Rilancia con --esegui per applicare (col backup prima).'); process.exit(0); }

// il server della webui tiene il save in memoria: écritto qui mentre
// girare farebbe riscrivere alla GUI il file vecchio. Si chiede server fermo.
try {
  const risposta = await fetch('http://127.0.0.1:8642/api/status', { signal: AbortSignal.timeout(1500) });
  if (risposta.ok) { console.error('✧ il server della webui (8642) è ACCESO: riavvia e chiudi, poi rilancia. Fermo'); process.exit(1); }
} catch { /* spento: si va */ }

mkdirSync(bashi, { recursive: true });
const backup = join(bashi, `evo-career.save.bak-${stamp()}.json`);
copyFileSync(file, backup);
console.log('backup:', backup);

// ---- IL PIANO IN ATTO: entry, flussi, cassa, rep con SOLO i delta non pagati ----
let totaleCassa = 0, totaleRep = 0;
for (const p of piano) {
  const e = p.entry, calc = p.calc;
  const dCassa = calc.prize - e.prize;
  const dRep = calc.rep - e.rep;
  e.points = calc.points; e.prize = calc.prize; e.rep = calc.rep;
  e.autoFuori = null;
  if (dCassa !== 0) { totaleCassa += dCassa; recordFlows(state, [{ kind: 'prize', money: dCassa, reason: `${calc.node.display} R${(e.round ?? 0) + 1} — riabilitazione vigia` }]); }
  if (dRep !== 0) { totaleRep += dRep; recordFlows(state, [{ kind: 'rep', rep: dRep, reason: `${calc.node.display} R${(e.round ?? 0) + 1} — riabilitazione vigia` }]); }
  if (!e.dnf && !e.penalty && calc.prize > 0) {
    const pulita = Math.round(calc.prize * 0.1);
    if (pulita > 0) { totaleCassa += pulita; recordFlows(state, [{ kind: 'bonus', money: pulita, reason: `gara pulita ${calc.node.display} R${(e.round ?? 0) + 1} — riabilitazione vigia` }]); }
  }
  pushMessage(state, `🩺 Riabilitata ${calc.node.display} R${(e.round ?? 0) + 1}: il vigia aveva sospeso la ronda per un NOME AUTO sbagliato nell'elenco delle ammesse («${e.car ?? '?'}»), non per un'auto sbagliata in pista. Ora vale come le altre.`);
}

// statistiche di carriera: le stesse aggiunte che applyRaceResult fa alla PRIMA
// intestazione (тическиеtheid).
let winDelta = 0, podiDelta = 0, lapsDelta = 0, flDelta = 0;
let missioneBonus = 0;
const sponsor = state.sponsor ?? null;
state.stats ??= {};
for (const p of piano) {
  const e = p.entry, calc = p.calc;
  if (e.dnf) continue;
  lapsDelta += Number(e.laps ?? 0) || 0;
  if (e.position === 1) winDelta += 1;
  if (e.position <= 3) podiDelta += 1;
  if (e.fl && !e.penalty) flDelta += 1;
  try {
    const trackAmmo = e.track ?? calc.node.calendar?.[e.round]?.track ?? null;
    if (trackAmmo && e.bestLap) {
      const seme = ladder.contentNames?.tracks?.[trackAmmo] ?? trackAmmo;
      const chiave = chiaveBestLaps(state.stats.bestLaps ?? {}, seme, Object.values(ladder.contentNames?.tracks ?? {}));
      state.stats.bestLaps ??= {};
      const rec = state.stats.bestLaps[chiave];
      if (!rec || String(e.bestLap) < String(rec.time ?? '')) {
        state.stats.bestLaps[chiave] = { time: e.bestLap, car: e.car ?? null, season: e.season ?? state.season, round: e.round ?? 0, node: p.nodeId, at: e.at ?? new Date().toISOString() };
        pushMessage(state, `Nuovo miglior giro personale a ${chiave}: ${e.bestLap} (${e.car ?? 'auto n/d'}).`);
      }
    }
  } catch { /* il record personale non deve fermare la riabilitazione */ }
  if (sponsor && !sponsor.missionDone && e.position <= 3 && (e.round ?? 0) <= (sponsor.deadlineRound ?? 0)) {
    missioneBonus = sponsor.bonus ?? 0;
    sponsor.missionDone = true;
    if (missioneBonus > 0) { totaleCassa += missioneBonus; recordFlows(state, [{ kind: 'bonus', money: missioneBonus, reason: `${sponsor.name} — missione podio entro il round ${(sponsor.deadlineRound ?? 0) + 1} (podio riabilitato)` }]); }
    pushMessage(state, `Missione sponsor centrata: podio entro il round ${(sponsor.deadlineRound ?? 0) + 1} (+${missioneBonus} da ${sponsor.name}).`);
    break;
  }
}

state.stats.laps ??= 0; state.stats.laps += lapsDelta;
state.stats.wins ??= 0; state.stats.wins += winDelta;
state.stats.podiums ??= 0; state.stats.podiums += podiDelta;
state.stats.fastestLaps ??= 0; state.stats.fastestLaps += flDelta;
const bestFinish = state.bestFinish ??= {};
for (const p of piano) {
  const e = p.entry;
  if (e.dnf) continue;
  bestFinish[p.nodeId] = bestFinish[p.nodeId] == null ? e.position : Math.min(bestFinish[p.nodeId], e.position);
}
state.money ??= 0; state.money += totaleCassa;
state.rep = (state.rep ?? 0) + totaleRep;
saveState(file, state);
console.log(`\nOK: cassa +${totaleCassa} €, rep +${totaleRep}, vittorie +${winDelta}, podi +${podiDelta}, giri +${lapsDelta}, giri veloci +${flDelta}, missione: ${missioneBonus > 0 ? '+' + missioneBonus + ' €' : 'nessuna'}`);
console.log('save scritto:', file);
