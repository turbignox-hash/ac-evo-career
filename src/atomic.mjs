// atomic.mjs — scrittura JSON atomica.
//
// La stessa tecnica di saveState (state.mjs): prima si scrive un file .tmp
// accanto al destinatario, poi lo si rinomina. Se il processo muore a metà,
// al massimo resta un .tmp orfano: il file vero è sempre o la versione vecchia
// o la nuova, MAI un JSON a metà. Da usare per ogni registro che non deve mai
// corrompersi (ledger anti-doppioni, archivio rivali, config, gazzetta…).

import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

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
    renameSync(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* il .tmp non c'è più: quel che conta è l'errore sotto */ }
    throw e;
  }
}
