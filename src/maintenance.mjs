// maintenance.mjs — la manutenzione della carriera: il dottore può SCANSIONARE
// da solo (a intervalli regolari e all'avvio del pannello), RIPARARE le anomalie
// che si correggono senza domande, e mettere a punto le "liste" che con il tempo
// si sporcano: bacheca, registro anti-doppioni dell'import, registro flussi.
//
// Le operazioni destructive (svuotare liste, riallineare flussi) partono SOLO
// con conferma esplicita del chiamante: qui sono solo implementate, chi le
// invoca deve chiedere conferma all'utente (webui: modale; CLI: flag espliciti).

import { saveState, pushMessage } from './state.mjs';
import { checkIntegrity, fixIntegrity } from './integrity.mjs';
import { invalidateFlowsCache, seedFlowsFrom, dedupFlows } from './flows.mjs';
import { SAVE_FILE, resetImportRegistry } from './import.mjs';
import { tr } from './lang.mjs';

const persistWith = (state, Persist) => (Persist ? Persist(state) : saveState(SAVE_FILE, state));

/** Scansione completa: la cache dei flussi viene SEMPRE svuotata prima (così il
 *  totale atteso è ricalcolato dal disco, non da valori memo stanchi). */
export function scanCareer(ladder, state) {
  invalidateFlowsCache();
  const issues = checkIntegrity(ladder, state);
  return { issues, at: new Date().toISOString() };
}

/** Auto-riparazione: scansiona e corregge SAFAMENTE ciò che si può correggere
 *  senza chiedere nulla (statistiche, cassa, rep — sempre verso la fonte di
 *  verità); un sintetico della correzione finisce in bacheca. */
export function autoRepair(ladder, state, { persist = null } = {}) {
  const { issues } = scanCareer(ladder, state);
  if (!issues.length) return { issues, fixed: [] };
  const out = fixIntegrity(ladder, state);
  if (out.fixed.length) {
    pushMessage(state, tr({
      it: `🛠 Auto-riparazione: corretti ${out.fixed.length} valori incoerenti (${out.fixed.slice(0, 6).join(', ')}${out.fixed.length > 6 ? '…' : ''}).`,
      en: `🛠 Auto-repair: fixed ${out.fixed.length} inconsistent values (${out.fixed.slice(0, 6).join(', ')}${out.fixed.length > 6 ? '…' : ''}).`,
    }), 'info');
    persistWith(state, persist);
  }
  return { issues, fixed: out.fixed };
}

/* ---------- pulizie (sempre con conferma del chiamante) ---------- */

/** SVUOTA la bacheca (anello di annunci): configura con il conteggio, poi
 *  ritorna quante voci ha cancellato. */
export function clearBacheca(state, { persist = null } = {}) {
  const removed = (state.messages ?? []).length;
  state.messages = [];
  pushMessage(state, tr({
    it: `🧹 Bacheca svuotata a mano: ${removed} annunci cancellati dall'utente (il simbolo della pulizia resta come traccia).`,
    en: `🧹 Board cleared by hand: ${removed} posts removed by the user (a cleaner notice is left as a trace).`,
  }), 'info');
  persistWith(state, persist);
  return { removed };
}

/** Riparte col registro anti-doppioni Vuoto: i file risultati già incassati
 *  precedentemente potrebbero essere rincassati SE li re-importi a mano —
 *  usare solo se il registro conta file sbagliati. Restituisce il conteggio. */
export function resetLedger() {
  resetImportRegistry();
  return { ok: true };
}

/** RICALCOLA il registro flussi dal salvataggio corrente: il file viene
 *  azzerato e creato UNA riga di seme per portare le attese a cassa/rep del
 *  salvataggio (utente correttamente in piedi). */
export function reseedFlows(state, { persist = null } = {}) {
  seedFlowsFrom(state);
  persistWith(state, persist);
  return { ok: true };
}

/** Elimina i doppioni ESATTI dal registro flussi (stesso istante, nodo,
 *  stagione, tipo, valori e motivo). Ritorna quante righe tolte. */
export function flowDedup() {
  return dedupFlows();
}
