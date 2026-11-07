// atomic.mjs — scrittura JSON atomica.
//
// La stessa tecnica di saveState (state.mjs): prima si scrive un file .tmp
// accanto al destinatario, poi lo si rinomina. Se il processo muore a metà,
// al massimo resta un .tmp orfano: il file vero è sempre o la versione vecchia
// o la nuova, MAI un JSON a metà. Da usare per ogni registro che non deve mai
// corrompersi (ledger anti-doppioni, archivio rivali, config, gazzetta…).

import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

const pausa = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* senza Atomics si va senza pausa */ } };

/**
 * RENAME CON PAZIENZA (7/11). Su Windows il file destinatario può essere
 * tenuto aperto per un istante da UN ALTRO processo — la Pitwall che si salva
 * addosso, il gioco che rilegge la fascia, l'antivirus che scansiona — e il
 * rename cade con EPERM/EBUSY/EACCES pur essendo il gesto legittimo: pochi ms
 * dopo riesce. Prima si rinunciava al primo colpo, e il passo «roster al
 * gioco» della gara al volo è morto con «EPERM: operation not permitted,
 * rename ...save.json.tmp -> ...save.json» a server acceso. Si riprova (20 ×
 * 25 ms = mezzo secondo) e poi si risale con l'errore vero: un file davvero
 * bloccato deve ancora fallire, non girare a vuoto.
 */
export function rinnominaConPazienza(tmp, file, { tentativi = 20, pausaMs = 25 } = {}) {
  let ultimo;
  for (let i = 0; i < tentativi; i++) {
    try { renameSync(tmp, file); return true; }
    catch (e) {
      ultimo = e;
      const code = e?.code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') break;
      if (i < tentativi - 1) pausa(pausaMs);
    }
  }
  throw ultimo;
}

/** `pretty` (3/11): le fasce dell'app in gioco si scrivono ogni 2,5 s (500 ms
 *  per il canale in gioco) e il gioco le rilegge a ogni slot — lì il JSON resta
 *  COMPATTO com'era (`{ pretty: false }`), così la scrittura atomica non
 *  raddoppia il file che il gioco scarica dal disco. I registri che si leggono
 *  a occhio (ledger, archivio, config) continuano belli indentati.
 *  Se il rename non riesce (su Windows il gioco può tenere il file aperto
 *  nell'istante dello scatto), il .tmp non resta orfano: si toglie e l'errore
 *  risale, così il chiamante decide (il tick riprova allo slot dopo). */
export function writeJsonAtomic(file, data, { pretty = true } = {}) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8');
  try {
    rinnominaConPazienza(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* il .tmp non c'è più: quel che conta è l'errore sotto */ }
    throw e;
  }
}
