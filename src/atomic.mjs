// atomic.mjs — scrittura JSON atomica.
//
// La stessa tecnica di saveState (state.mjs): prima si scrive un file .tmp
// accanto al destinatario, poi lo si rinomina. Se il processo muore a metà,
// al massimo resta un .tmp orfano: il file vero è sempre o la versione vecchia
// o la nuova, MAI un JSON a metà. Da usare per ogni registro che non deve mai
// corrompersi (ledger anti-doppioni, archivio rivali, config, gazzetta…).

import { writeFileSync, renameSync } from 'node:fs';

export function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, file);
}
