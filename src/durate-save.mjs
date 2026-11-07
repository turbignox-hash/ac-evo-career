// durate-save.mjs — LA DURATA DELLA SESSIONE LA DICE IL FILE DEL GIOCO (7/11/2026).
//
// Perché serve: la dichiarazione della gara a tempo confrontava la durata del
// round portata dal `pending` della carriera con il conto alla rovescia della
// sessione viva. Ma il numero che il gioco esegue NON è quello della scheda: è
// quello scritto nel `GameModeType_RACE_WEEKEND.gamemodesave` dal «Prepara
// tutto» (f2 = secondi con f3=1, giri con f3=2 — vedi weekend-laps.mjs). Misurato
// il 7/11 sul save di Donington: la scheda diceva prove 45′ e qualifica 30′,
// il file dice 900 s (15′) e 600 s (10′). Se si confronta con la scheda si
// confronta con un numero che il gioco non vede.
//
// Quindi i numeri ATTESI vengono dal save (la fonte del gioco), e la scheda
// della carriera resta la riserva per quando il save non è leggibile (gioco non
// installato, file assente, EVO che lo riscrive a metà lettura). Il conto alla
// rovescia resta l'unico segnale VIVO: dice in quale sessione sei, non quanto
// dovrebbe durare — per questo resta anche lui, ma come identità, non come
// durata di riferimento.
//
// Lettura pura e con cache: `weekendLaps` decodifica il protobuf, e il file
// cambia poche volte per weekend. La chiave è mtime+size, quindi una riscrittura
// del Prepara tutto si vede subito.

import { statSync } from 'node:fs';
import { raceBlockIndex, weekendLaps, WEEKEND_SAVE } from './weekend-laps.mjs';

/** Le sessioni del save (già decodificate) → i numeri che servono alla gara.
 *  Pura e testabile: `ses` è l'uscita di `weekendLaps()`, non un file. */
export function durateDaSessioni(ses = []) {
  const trova = (re) => (Array.isArray(ses) ? ses.find((s) => re.test(String(s?.nome ?? ''))) : null) ?? null;
  const gara = (Array.isArray(ses) ? ses[raceBlockIndex(ses)] : null) ?? null;
  const sec = (s) => (s?.aTempo ? Number(s.durataSec) || null : null);
  return {
    aTempo: gara ? gara.aTempo === true : null,
    garaSec: sec(gara),
    garaGiri: gara && gara.aTempo === false ? Number(gara.giri) || null : null,
    provaSec: sec(trova(/pract|prov|pratic/i)),
    qualificaSec: sec(trova(/qualif/i)),
    warmupSec: sec(trova(/warm/i)),
  };
}

let CACHE = { chiave: null, valore: null };

/** Le durate scritte nel gamemodesave, lette dal file vero. Mai un'eccezione:
 *  `{ letto:false, motivo }` quando non si può leggere, così il chiamante sa
 *  che deve tornare alla scheda della carriera. */
export function durateDalSave({ file = WEEKEND_SAVE } = {}) {
  try {
    const st = statSync(file);
    const chiave = `${file}|${st.mtimeMs}|${st.size}`;
    if (CACHE.chiave === chiave) return CACHE.valore;
    const valore = { letto: true, file, ...durateDaSessioni(weekendLaps(file)) };
    CACHE = { chiave, valore };
    return valore;
  } catch (e) {
    return { letto: false, file, motivo: e?.code ?? e?.message ?? 'gamemodesave non leggibile' };
  }
}

/** Solo per i test: svuota la cache. */
export function _svuotaCacheDurate() {
  CACHE = { chiave: null, valore: null };
}
