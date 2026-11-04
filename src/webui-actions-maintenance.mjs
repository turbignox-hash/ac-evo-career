// webui-actions-maintenance.mjs — la Manutenzione della webui (4/11, P1.5).
// Estratto da webui.mjs senza cambiare rotte, payload, status o tempi. Qui
// vivono la rotta `maintenance`, maintenanceTick e il suo ciclo periodico:
// un giro all'avvio del pannello e poi ogni 10 minuti.
import { existsSync, readFileSync } from 'node:fs';
import { scanCareer, autoRepair, clearBacheca, resetLedger, reseedFlows, flowDedup } from './maintenance.mjs';
import { ensureFlowsSeeded } from './flows.mjs';
import { CONFIG_FILE, SAVE_FILE, context, writeConfig, requireState, persist } from './webui-env.mjs';
import { recordWarning } from './warnings.mjs';
import { tr } from './lang.mjs';

export const MAINTENANCE_ACTIONS = new Set([
  'maintenance',
]);

// Auto-riparazione (23/10): ON di default (tutto il specchio del dottore, ma in
// gratuito). Si spegne da Impostazioni → Manutenzione. Letta A OGNI USO dal
// config: il toggle sopravvive al riavvio come il liveMode.
function autoRepairEnabled() {
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).autoRepair !== false; }
  catch { return true; }
}

let lastAutoRepairAt = 0;
/** Un giro del dottore: scansiona la carriera e ripara SaFAMENTE ciò che si
 *  può correggere senza domande. Chiamato all'avvio del pannello e poi ogni
 *  10 minuti — con cache delle scansioni: al massimo una al periodo. */
function maintenanceTick({ force = false } = {}) {
  if (!existsSync(SAVE_FILE)) return null;
  if (!autoRepairEnabled()) return null;
  // Processo di test/sandbox (var d'ambiente per i test): niente auto-riparazione
  // su file veri — il 23/10 il boot della webui di un test ha percorso
  // fixIntegrity sul salvataggio reale del PC leggendo totali immaginari.
  if (process.env.EVO_DATA_DIR || process.env.EVO_FLOWS_DIR) return null;
  if (!force && Date.now() - lastAutoRepairAt < 10 * 60 * 1000) return null;
  lastAutoRepairAt = Date.now();
  try {
    const { ladder } = context();
    const state = requireState();
    ensureFlowsSeeded(state);
    const { issues } = scanCareer(ladder, state);
    if (!issues.length) return { issues, fixed: [] };
    const out = autoRepair(ladder, state, { persist });
    if (out.fixed.length) recordWarning('maintenance.auto', 'auto-riparazione applicata', out.fixed.join(', '));
    return out;
  } catch (e) {
    recordWarning('maintenance.auto', 'auto-riparazione non riuscita', e?.message ?? null);
    return null;
  }
}

/** Accende il dottore periodico. Sta qui, accanto al tick che comanda, così
 *  l'estrazione porta con sé anche il ciclo di vita e webui.mjs non deve
 *  conoscere né la cadenza né la cache. */
export function startMaintenanceTicker() {
  // AUDIT FREEZE 23/10: lo scavo sincrono non sta più A IMPORT (prima eseguiva
  // ancora prima del listen: il primo click della GUI aspettava il dottore);
  // parte dopo 2.5s di server aperto, quando il cruscotto è già dipinto.
  setTimeout(() => maintenanceTick({ force: true }), 2500).unref();
  setInterval(() => maintenanceTick(), 10 * 60 * 1000);
}

export function maintenanceAction(action, { ladder, state, body, persist: persistState, sendJson, res }) {
  switch (action) {
    case 'maintenance': {
      // Il rione MANUTENZIONE (richiesta Mauro 23/10: "il tool si ripari da solo,
      // con scansioni manuali e opzioni per togliere le liste sporche"):
      //   scan          → scansione completa (cache flussi svuotata, valori veri dal disco)
      //   fix/auto      → scansione + riparazione di ciò che si corregge senza chiedere
      //   auto-toggle   → lei parte da sola all'avvio e ogni 10 minuti (writeConfig)
      // e le pulizie CON CONFERMA (body.confirm === true, la GUI apre la modale):
      //   clear-messages (svuota bacheca) · reset-ledger (registro anti-doppioni)
      //   reseed-flows (ricalcola flussi dal salvataggio) · dedup-flows (doppio esatti)
      const op = String(body.op ?? 'scan');
      if (['clear-messages', 'reset-ledger', 'reseed-flows', 'dedup-flows'].includes(op) && body.confirm !== true) {
        return sendJson(res, 409, { error: tr({ it: 'Operazione irreversibile: serve la conferma (confirm=true).', en: 'This action cannot be undone: pass confirm=true.' }), needConfirm: true });
      }
      if (op === 'scan') return sendJson(res, 200, scanCareer(ladder, state));
      if (op === 'fix') { const out = autoRepair(ladder, state, { persist: persistState }); return sendJson(res, 200, out); }
      if (op === 'tick') { const out = maintenanceTick({ force: true }); return sendJson(res, 200, out ?? { issues: [], fixed: [], skipped: true }); }
      if (op === 'auto-toggle') {
        const on = !!body.on;
        writeConfig({ autoRepair: on });
        if (on) lastAutoRepairAt = 0;
        return sendJson(res, 200, { ok: true, autoRepair: on });
      }
      if (op === 'auto-status') return sendJson(res, 200, { autoRepair: autoRepairEnabled() });
      if (op === 'clear-messages') return sendJson(res, 200, clearBacheca(state, { persist: persistState }));
      if (op === 'reset-ledger') return sendJson(res, 200, resetLedger());
      if (op === 'reseed-flows') { reseedFlows(state, { persist: persistState }); return sendJson(res, 200, { ok: true }); }
      if (op === 'dedup-flows') return sendJson(res, 200, flowDedup());
      return sendJson(res, 400, { error: tr({ it: 'Operazione di manutenzione non valida.', en: 'Invalid maintenance op.' }) });
    }
    default: return false;
  }
}
