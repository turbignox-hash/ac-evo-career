// tracknames.mjs — UNA SOLA implementazione del matching fra nomi di pista.
//
// Storia (per non rifare l'errore): "normTrack" in motec.mjs, "normTrk" in
// tracks.mjs e "strip/trackMatches" in results.mjs erano tre copie gemelle
// scritte in momenti diversi. Sono già divergero DUE VOLTE:
//   1. gli accenti: "Nürburgring" → "nrburgring" rompeva il match col catalogo;
//   2. i suffissi di layout: "Imola" vs "ImolaGP" vs "Nürburgring Gp Strecke".
// Da qui in poi qualsiasi modifica al matching si fa SOLO qui, così le piste
// combaciano allo stesso modo in telemetria, risultati, quaderno prove e libro.
//
// Regola: trascrivi gli accenti (NFD + via i segni diacritici) PRIMA di spazzare
// via i non-alfanumerici, poi confronta per uguaglianza O prefisso (il gioco e le
// cartelle MoTeC aggiungono spesso il layout: "Fuji Speedway" vs "Fuji Speedway GP").

/** "Nürburgring GP" → "nurburgringgp": accenti trascritti, punteggiatura e spazi via. */
export function normTrack(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Due nomi di pista denotano lo stesso tracciato? Uguaglianza o prefisso (in entrambe le direzioni). */
export function sameTrack(a, b) {
  const x = normTrack(a), y = normTrack(b);
  if (!x || !y) return true; // lato sconosciuto: non si può dire che NON combaci
  return x.startsWith(y) || y.startsWith(x);
}

/* --- auto ---------------------------------------------------------------- */
/* Ste stesso problema delle piste, lato auto: il nome nella ladder ("Mazda RX-7 FD")
 * e la cartella MoTeC che EVO scrive ("Mazda RX-7 FD Spirit R") NON sono uguaglianza
 * esatta — il gioco aggiunge la versione/allestimento. Stessa regola delle piste:
 * uguaglianza O prefisso, in entrambe le direzioni. */

/** Come sameTrack ma per i nomi di AUTO (stesso normalize: accenti + solo alfanumerici). */
export function normCar(s) { return normTrack(s); }

/** Due nomi di auto denotano la stessa macchina? Uguaglianza o prefisso (in entrambe le direzioni). */
export function sameCar(a, b) { return sameTrack(a, b); }

/** Come sameTrack, ma contro una LISTA di nomi attesi (id ladder, display, nomi cartella...). */
export function matchesAnyTrack(actual, expectedNames) {
  const a = normTrack(actual);
  if (!a) return false;
  return (expectedNames ?? []).filter(Boolean).some((name) => {
    const e = normTrack(name);
    return !!e && (a === e || a.startsWith(e) || e.startsWith(a));
  });
}

/** Il nome della lista che combacia col nome vero del gioco (per mostrarlo in GUI).
 *  Se più nomi combaciano vince il PIÙ SPECIFICO ("Nürburgring GP" prima dell'id corto
 *  "nurburgring"): la lista mescola id ladder e nomi di display per lo stesso tracciato. */
export function matchTrackName(actual, expectedNames) {
  const a = normTrack(actual);
  if (!a) return null;
  let best = null, bestLen = -1;
  for (const name of (expectedNames ?? []).filter(Boolean)) {
    const e = normTrack(name);
    if (e && (a === e || a.startsWith(e) || e.startsWith(a)) && e.length > bestLen) {
      best = name;
      bestLen = e.length;
    }
  }
  return best;
}
