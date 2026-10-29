import { creaVoceCopilota } from '../src/voce-copilota.mjs';
const v = creaVoceCopilota();
v.parla('Prova del trasporto del Pitwall: uno, due, tre, la copilota rientra in pista.');
await new Promise(r => setTimeout(r, 20000));
v.spegni();
console.log('TRASPORTO: frase inviata e finestra scaduta');
