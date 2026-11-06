// live-log-incrementale.mjs — legge il log del monitor SOLO per le righe nuove.
//
// (6/11, sessione «area debole».) Prima la rotta `live-riepilogo` faceva, a ogni
// scrittura del monitor: `readFileSync` dell'intero log + `parseLog` di tutte le
// righe + `riassumiMonitor` su tutto. Costa O(log): misurato 365 ms su 10 MB e
// 1.160 ms su 35 MB, sul thread del server che serve anche la GUI — e su una
// sessione lunghissima il vecchio riepilogo poteva perfino sfondare lo stack
// (`Math.max(...array)`).
//
// Qui lo stato è: byte già consumati, coda senza `\n` (una riga a metà
// scrittura), un accumulatore che tiene statistiche correnti. A ogni giro si
// leggono solo i byte aggiunti. Riletture complete restano solo per i casi veri:
// file troncato o ruotato (inode diverso).
//
// Tutto quello che riguarda «cosa significa una riga» sta in
// `live-monitor-riepilogo.mjs`: qui c'è solo il file system.

import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { creaAccumulatoreRiepiloghi, parseLog, riepiloghiDa } from './live-monitor-riepilogo.mjs';

/**
 * Lettore del log del monitor. `aggiorna()` risponde:
 *   { cambiato, assente?, errore?, mtime, size, righe, totale, sessioni, testo }
 * `sessioni`/`testo` arrivano da `riepiloghiDa` (ultime 5, l'ultima in fondo).
 */
export function lettoreLogLive(file, { ultime = 5 } = {}) {
  let acc = creaAccumulatoreRiepiloghi();
  let offset = 0;               // byte del file già consumati
  let resto = Buffer.alloc(0);  // coda dopo l'ultimo '\n': riga ancora in scrittura
  let firma = null;             // `ino|mtimeMs|size` dell'ultima lettura
  let righe = 0;                // righe JSON valide consumate finora
  let dati = riepiloghiDa([], { ultime });

  const azzera = () => {
    acc = creaAccumulatoreRiepiloghi();
    offset = 0;
    resto = Buffer.alloc(0);
    righe = 0;
  };
  const ricalcola = () => { dati = riepiloghiDa(acc.risultato(), { ultime }); };

  /** Legge il file da `da` a `a` (byte). Restituisce meno byte solo se il file
   *  si accorcia mentre lo leggiamo: il resto lo prende il giro dopo. */
  const leggi = (da, a) => {
    const n = a - da;
    if (n <= 0) return Buffer.alloc(0);
    const fd = openSync(file, 'r');
    try {
      const buf = Buffer.alloc(n);
      let letto = 0;
      while (letto < n) {
        const k = readSync(fd, buf, letto, n - letto, da + letto);
        if (!k) break;
        letto += k;
      }
      return letto === n ? buf : buf.subarray(0, letto);
    } finally {
      closeSync(fd);
    }
  };

  const aggiorna = () => {
    let st;
    try {
      st = statSync(file);
    } catch (e) {
      // il file è sparito (o non è leggibile): il riepilogo torna vuoto, e
      // questo È un cambiamento se prima c'erano sessioni
      const prima = dati.totale;
      azzera();
      firma = null;
      ricalcola();
      return {
        ...dati, cambiato: prima !== 0 || righe > 0,
        assente: e.code === 'ENOENT', errore: e.code === 'ENOENT' ? null : e.message,
        mtime: null, size: 0, righe,
      };
    }
    const k = `${st.ino}|${st.mtimeMs}|${st.size}`;
    if (k === firma) return { ...dati, cambiato: false, assente: false, errore: null, mtime: st.mtime, size: st.size, righe };
    // file troncato o sostituito (rotazione): si riparte da zero, non si legge
    // a metà del contenuto vecchio
    if (st.size < offset || (firma && String(st.ino) !== firma.split('|')[0])) azzera();
    firma = k;
    const pezzo = leggi(offset, st.size);
    offset = Math.min(st.size, offset + pezzo.length);
    const buf = resto.length ? Buffer.concat([resto, pezzo]) : pezzo;
    const taglio = buf.lastIndexOf(0x0a);
    if (taglio < 0) {
      // nessuna riga completa: si tiene tutto per il giro dopo (niente parse a metà)
      resto = Buffer.from(buf);
      return { ...dati, cambiato: false, assente: false, errore: null, mtime: st.mtime, size: st.size, righe };
    }
    // si decodifica SOLO fino all'ultimo '\n': un carattere UTF-8 spezzato a
    // metà non entra mai nel testo
    resto = Buffer.from(buf.subarray(taglio + 1));
    const nuove = parseLog(buf.subarray(0, taglio + 1).toString('utf8'));
    for (const l of nuove) acc.aggiungi(l);
    righe += nuove.length;
    ricalcola();
    return { ...dati, cambiato: true, assente: false, errore: null, mtime: st.mtime, size: st.size, righe };
  };

  return {
    aggiorna,
    stato: () => ({ offset, righe, resto: resto.length }),
  };
}
