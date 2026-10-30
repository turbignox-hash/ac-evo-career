// integrity.mjs — il revisore dei conti della carriera.
// Ricalcola dal basso ciò che dovrebbe esserci e lo confronta col salvataggio:
//  - statistiche (gare, vittorie, podi, giri veloci, pole) dalle gare registrate;
//  - cassa e reputazione dal REGISTRO FLUSSI (data/flows.jsonl): ogni premio,
//    sponsor, contratto, iscrizione e bonus è scritto lì con il suo motivo;
//  - annuncio in bacheca per gara.
// Se qualcosa non torna — per esempio una gara "fantasma" entrata per un doppio
// import — lo dice, e con un click sistemare è questione di un secondo.

import { SAVE_FILE } from './import.mjs';
import { saveState } from './state.mjs';
import { expectedTotals, seedFlowsFrom, invalidateFlowsCache } from './flows.mjs';

const lapMs = (t) => { const m = String(t ?? '').match(/^(\d+):(\d+)\.(\d+)$/); return m ? +m[1] * 60000 + +m[2] * 1000 + +m[3] : Infinity; };

const allRaces = (state) => Object.entries(state.results ?? {})
  .flatMap(([nodeId, list]) => (list ?? []).map((r) => ({ ...r, nodeId })))
  .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));

const msgText = (m) => String(m?.text ?? m?.body ?? '');

/** Cassa e reputazione attese, ricostruite dal registro flussi. */
function moneyRepFromFlows() {
  return expectedTotals();
}

/** Verifica d'integrità: lista di anomalie (vuota = tutto a posto). */
export function checkIntegrity(ladder, state) {
  const issues = [];
  const races = allRaces(state);
  if (!races.length) return issues;

  // statistiche: totali di carriera vs gare registrate
  const s = state.stats ?? {};
  const want = {
    races: races.length,
    wins: races.filter((r) => !r.dnf && r.position === 1).length,
    podiums: races.filter((r) => !r.dnf && r.position <= 3).length,
    fastestLaps: races.filter((r) => r.fl).length,
    poles: races.filter((r) => r.pole === true).length,
  };
  for (const [k, v] of Object.entries(want)) {
    if ((s[k] ?? 0) !== v) issues.push({ severity: 'high', text: `Statistiche "${k}": il salvataggio dice ${s[k] ?? 0}, dalle gare registrate risulta ${v}.` });
  }
  const laps = races.reduce((a, r) => a + (r.laps ?? 0), 0);
  if ((s.laps ?? 0) !== laps) issues.push({ severity: 'medium', text: `Giri percorsi: il salvataggio dice ${s.laps ?? 0}, dalle gare risulta ${laps}.` });

  // cassa e reputazione dal registro flussi
  const { money, rep } = moneyRepFromFlows(state);
  if (state.money !== money) issues.push({ severity: 'high', text: `Cassa: il salvataggio dice ${state.money}, dai flussi registrati risulta ${money} (diff ${state.money - money}).` });
  if (state.rep !== rep) issues.push({ severity: 'high', text: `Reputazione: il salvataggio dice ${state.rep}, dai flussi registrati risulta ${rep} (diff ${state.rep - rep}).` });

  // coerenza interna delle gare
  const board = state.messages ?? [];
  // la bacheca è un anello a 60 (pushMessage): un annuncio più vecchio del primo
  // messaggio ancora in bacheca è stato scritto e poi spinto fuori dal cap —
  // non è un annuncio mancante (regola degli annunci scappati, 23/10/2026).
  const oldestAt = board.length ? Math.min(...board.map((m) => new Date(m.at ?? 0).getTime())) : 0;
  for (const r of races) {
    const node = ladder.nodes.find((x) => x.nodeId === r.nodeId);
    const label = `${node?.display ?? r.nodeId} · ${node?.calendar?.[r.round]?.name ?? 'R' + (r.round + 1)}`;
    if (r.dnf && r.position === 1) issues.push({ severity: 'medium', text: `${label}: ritiro ma posizione 1 — dati contraddittori.` });
    // il giro malformato fa uscire Infinity da lapMs (30/10: la brancha era
    // morta, !Infinity è falso — testata in test/integrity.test.mjs)
    if (r.bestLap && !Number.isFinite(lapMs(r.bestLap))) issues.push({ severity: 'low', text: `${label}: miglior giro "${r.bestLap}" in formato strano.` });
    const roundName = node?.calendar?.[r.round]?.name ?? `Round ${r.round + 1}`;
    /* il calendario della ladder è l'attuale: per le stagioni passate la pista
       della stessa round può essere cambiata (calendari riscritti), quindi il
       nome da solo non basta — l'importer scrive gara e annuncio nello stesso
       istante (±2 s), e un annuncio contesto è una prova decisamente migliore. */
    const sameRace = (m) => {
      const t = msgText(m);
      if (t.includes(String(roundName)) && (r.dnf ? t.includes('ritiro') : t.includes('P' + r.position))) return true;
      /* annuncio scritto PRIMA della riscrittura delle penalità (24/10, flow
         _fix-penalita): la posizione in pista all'epoca era quella di ordine
         pista — qui nota come rawPos. Nel dubbio che un'annuncio "P1" c'e
         JUNK per una gara ora registrata come P6 con una penalità +5.0s,
         il match è valido lo stesso: è la STESSA gara, scritta con il punti
         di vista di allora, non un annuncio perso. */
      if (t.includes(String(roundName)) && !r.dnf && !r.dsq && r.penalty && Number.isFinite(r.rawPos) && t.includes('P' + r.rawPos)) return true;
      if (!r.at || !m.at) return false;
      const dms = Math.abs(new Date(m.at).getTime() - new Date(r.at).getTime());
      return dms <= 2000 && t.includes('premio');
    };
    const has = board.some((m) => sameRace(m));
    const raceT = new Date(r.at ?? 0).getTime();
    if (!has && Number.isFinite(raceT) && (!oldestAt || raceT >= oldestAt) && oldestAt > 0) issues.push({ severity: 'low', text: `Manca l'annuncio in bacheca per ${label}.` });
  }
  return issues;
}

/** Applica le correzioni che si possono fare senza chiedere nulla all'utente. */
export function fixIntegrity(ladder, state, { dryRun = false } = {}) {
  const issues = checkIntegrity(ladder, state);
  if (!issues.length) return { ok: true, fixed: [], issues };

  const races = allRaces(state);
  const fixed = [];
  const set = (k, v) => {
    if ((state.stats?.[k] ?? 0) !== v) { if (!dryRun) state.stats[k] = v; fixed.push(`stats.${k} = ${v}`); }
  };
  state.stats ??= {};
  set('races', races.length);
  set('wins', races.filter((r) => !r.dnf && r.position === 1).length);
  set('podiums', races.filter((r) => !r.dnf && r.position <= 3).length);
  set('fastestLaps', races.filter((r) => r.fl).length);
  set('poles', races.filter((r) => r.pole === true).length);
  set('laps', races.reduce((a, r) => a + (r.laps ?? 0), 0));

  // cassa/rep: riallineate al registro flussi (che viene ripartito dal valore corretto)
  const { money, rep } = moneyRepFromFlows(state);
  if (state.money !== money) { if (!dryRun) state.money = money; fixed.push(`money = ${money}`); }
  if (state.rep !== rep) { if (!dryRun) state.rep = rep; fixed.push(`rep = ${rep}`); }
  if (!dryRun && fixed.some((f) => f.startsWith('money') || f.startsWith('rep'))) {
    seedFlowsFrom(state);
  }
  if (!dryRun && fixed.length) {
    saveState(SAVE_FILE, state);
    invalidateFlowsCache();
  }
  return { ok: fixed.length > 0, fixed, issues };
}
