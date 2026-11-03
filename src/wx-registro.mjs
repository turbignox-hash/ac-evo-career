// wx-registro.mjs — IL DIARIO DELLE SCRITTURE AUTOMATICHE DEL BOLLETTINO.
//
// Il bollettino (wx-auto.mjs) sistema il cielo da solo: al cambio ronda
// scrive le Prove, a fine di ogni sessione del weekend la successiva. Ma
// chi lo ha visto? Prima la scrittura si raccontava un tasto alla volta
// nella lista messaggi del server (watcher.push) e poi spariva: sul disco
// non restava traccia per la GUI. Ora ogni scrittura RIUSCITA aggiunge UNA
// voce su data/wx-auto.jsonl:
//   { at, via, sessione, preset, label, from, file }
//   • at:       ISO — QUANDO (ora del PC, non del gioco);
//   • via:      'cambio-ronda' | 'fine-sessione' — PERCHÉ la scrittura;
//   • sessione: la sessione che RICEVE il preset ('Practice', 'Qualifying'…);
//   • preset:   il numero scritto; label: il suo nome nel catalogo meteo;
//   • from:     il preset che c'era prima (dopo il catch di setWeatherPreset);
//   • file:     il file Risultati che ha innescato la scrittura (fine-sessione).
//
// Sullo STESSO file (3/11, richiesta Mauro: «per capire cosa il bollettino non
// scrive») anche le scritture SCARTATE dal cancello della pista (trackMatches):
//   { at, via, esito: 'scarto', motivo: 'pista', sessione, pista, attese,
//     preset, label, verso, file }
//   • esito:    'scarto' — la riga NON è una scrittura, e la GUI la segna così;
//   • pista:    la pista letta dal file Risultati (quella del gioco);
//   • attese:   i nomi di pista che la card si aspetta per la ronda;
//   • preset/label/verso: che cosa SAREBBE stato scritto, e a quale sessione;
//   • file:     il Risultati scartato (o null quando l'innesco è la ronda).
// Così «il bollettino non ha scritto» non è più un silenzio: resta il perché.
// La GUI lo legge via API 'wx-log' (pannello «Regole di questo weekend ·
// meteo» nella scheda): le ultime voci dal più recente.
// EVO_DATA_DIR: solo per i test (il registro di test non tocca quello vero).
// Corazzato come warnings.mjs: se qualcosa va storto, la voce si perde e
// basta — il registro non deve MAI rompere il bollettino.

import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.EVO_DATA_DIR
  ? join(process.env.EVO_DATA_DIR, 'wx-auto.jsonl')
  : join(HERE, '..', 'data', 'wx-auto.jsonl');

const MAX = 300;  // righe tenute su disco: cronache del bollettino, non contabilità
let count = (() => {
  try { return readFileSync(FILE, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; }
})();

/** Una riga sul diario, qualunque sia il tipo di voce. Silenzioso per
 *  costruzione: un registro mancato non è un danno al bollettino. */
function scrivi(voce) {
  try {
    count += 1;
    mkdirSync(dirname(FILE), { recursive: true });
    appendFileSync(FILE, JSON.stringify(voce) + '\n', 'utf8');
    if (count > MAX) {                                   // taglio: le più vecchie vanno, restano ~fino a metà
      const restano = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).slice(-Math.floor(MAX / 2));
      writeFileSync(FILE, restano.join('\n') + '\n', 'utf8');
      count = restano.length;
    }
  } catch { /* careersi in silenzio: il registro è di servizio */ }
}

/** Una scrittura riuscita → una riga. voce: la forma documentata in cima. */
export function registra(voce) {
  scrivi(voce);
}

/** Una scrittura SCARTATA dal cancello della pista (trackMatches): il bollettino
 *  tace, ma il PERCHÉ resta sul diario — la pista del file e quelle attese,
 *  che cosa si sarebbe scritto e a quale sessione. */
export function registraScarto({ via, motivo = 'pista', sessione = null, pista = null, attese = [], preset = null, label = null, verso = null, file = null } = {}) {
  scrivi({
    at: new Date().toISOString(), via,
    esito: 'scarto', motivo,
    sessione, pista, attese,
    preset, label, verso, file,
  });
}

/** Le ultime N voci, dal più recente. { voci, total } — il totale è quello
 *  attualmente sul FILE: dopo un taglio si restringe, è vita normale. */
export function leggi({ n = 15 } = {}) {
  const voci = [];
  try {
    for (const riga of readFileSync(FILE, 'utf8').split('\n')) {
      if (!riga) continue;
      try { const q = JSON.parse(riga); if (q && typeof q === 'object') voci.push(q); } catch { /* riga rotta: si passa */ }
    }
  } catch { return { voci: [], total: 0 }; }
  return { total: voci.length, voci: voci.slice(-n).reverse() };
}
