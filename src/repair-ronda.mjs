// repair-ronda.mjs — LA REGOLA DEL MEDICO (riabilita-ronda): le stesse regole
// di `applyRaceResult` in una funzione PURA, così il tool e i test leggono la
// STESSA verga e nessuna copia diverge.
// 5/11 sera: la ladder chiamava «Mini JCS 1990» l'auto che EVO scrive nei
// risultati «Mini John Cooper S»: il vigia (car-pool) marcò tre rondi della
// Coppa come auto fuori parco e l'import le registrò MA valendo zero. Se oggi
// il parco ammette l'auto della entry, il sigillo non regge e la ronda torna
// a valere coi punti, il premio e la reputazione di OG stool.
import { nodeById, prizeFor, isIconicRound, repGain } from './state.mjs';
import { pointsFor } from './world.mjs';

/**
 * ricalcolaEntry(ladder, state, nodeId, entry) → { node, nodeEff, points, prize, rep, iconic } | null
 * Identica a applyRaceResult: distPct (raceSettings) scala il premio dell'econ
 * del nodo; la ronda iconica porta +25% rep e il premio iconico dove previsto;
 * una gara DNF vale rep 1 e premio 0. Mai throw: senza nodo nel ladder la
 * riabilitazione non tocca l'entry (null).
 */
export function ricalcolaEntry(ladder, state, nodeId, entry) {
  const node = nodeById(ladder, nodeId);
  if (!node) return null;
  const distPct = [25, 50, 75, 100].includes(Number(state.raceSettings?.[nodeId]?.distPct)) ? Number(state.raceSettings[nodeId].distPct) : 100;
  const nodeEff = { ...node, econ: { ...node.econ, prize: Math.max(1, Math.round((node.econ.prize ?? 0) * distPct / 100)) } };
  const trackAmmo = entry.track ?? node.calendar?.[entry.round]?.track ?? null;
  const iconic = isIconicRound(nodeEff, trackAmmo);
  const points = pointsFor(ladder, nodeEff, entry.position, entry.dnf);
  const prize = entry.dnf ? 0 : prizeFor(nodeEff, entry.position, entry.gridSize, { iconicRound: iconic });
  const rep = entry.dnf ? 1 : Math.round(repGain(nodeEff, entry.position, entry.gridSize) * (iconic ? 1.25 : 1));
  return { node, nodeEff, points, prize, rep, iconic };
}

/**
 * riabilitabile(ladder, carPoolOfFn, carInPoolFn, nodeId, entry) → { parco } | null
 * Il motivo governa: la riabilitazione esiste SOLO se il sigillo del vigia
 * non sta più in piedi OGGI (l'auto della entry è nel parco correntd). Mai un
 * numero a mano: se il parco resta fuori, la ronda si resta.
 */
export function riabilitabile(ladder, nodeId, entry, { carPoolOf, carInPool }) {
  if (!entry?.autoFuori) return null;
  const parco = carPoolOf(ladder, nodeId);
  if (!parco.ammesse.length) return null;
  if (!carInPool(entry.car, parco.ammesse)) return null;
  return { parco };
}
