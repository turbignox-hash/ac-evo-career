// _prova-voce-server.mjs — collaudo del relatore server: una frase e via.
import { creaVoceCopilota } from '../src/voce-copilota.mjs';
const voce = creaVoceCopilota();
voce.parla('Prova voce maschile: la copilota è rientrata in pista. Primo, secondo, terzo.');
setTimeout(() => { voce.spegni(); process.exit(0); }, 15000);
