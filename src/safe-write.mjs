// safe-write.mjs — scritture di contorno che non devono sparire.
//
// Un catch vuoto evita che un errore fermi l'operazione principale, ma
// nasconde un dato che l'utente crede scritto (journal, backup, magazzino).
// writeOrWarn conserva il fallback scelto dal chiamante e lascia una voce in
// errors.jsonl: il flusso continua, il difetto però resta diagnosticabile.
//
// Non è per gli errori di scrittura che DEVONO fermare il chiamante
// (saveState, writeJsonAtomic): lì si rilancia, e infatti non lo usiamo.

import { recordWarning } from './warnings.mjs';

/**
 * Esegue `fn`; se lancia, registra `label` in errors.jsonl e restituisce
 * `fallback`. `fn` è sincrona: le scritture del progetto lo sono.
 * @template T
 * @param {string} label modulo breve ('journal.mirror', 'import.backup'...)
 * @param {() => T} fn
 * @param {T|null} [fallback]
 * @returns {T|null}
 */
export function writeOrWarn(label, fn, fallback = null) {
  try {
    return fn();
  } catch (e) {
    const msg = e?.code ? `${e.code}: ${e?.message ?? e}` : (e?.message ?? String(e));
    recordWarning(label, msg);
    return fallback;
  }
}
