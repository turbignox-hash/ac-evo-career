// tools/_rap-mp.mjs — UNA TANTUM (27/10): genera e stampa il rapporto di gara
// della MP vera del 16/04 (260416-2108_MP_Race.sessionresults.json) com'è
// scritta in Saved Games/ACE/Results. Niente dati fittizi: passa dalla stessa
// strada della GUI (resolvePaths + rapportoGara), con il pilota del save.
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { resolvePaths } from '../src/paths.mjs';
import { rapportoGara } from '../src/rapporto-gara.mjs';

// il pilota lo leggo direttamente dal save di carriera di default (loadState
// esige lo slot attivo d'ambiente: qui non lo voglio mimare)
const save = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'evo-career.save.json'), 'utf8'));
const paths = resolvePaths({});
const rip = rapportoGara(paths, '260416-2108_MP_Race.sessionresults.json', { driver: save.driver });
if (rip.error) { console.log('ERRORE:', rip.error); }
else { console.log('SALVATO IN:', rip.salvatoMd); console.log(''); console.log(rip.md); }
