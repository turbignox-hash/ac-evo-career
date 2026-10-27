'use strict';
/* Infrastruttura lingua della GUI (22/10/2026).
   Regola "pigra" (vedi README): le viste si traducono al giro in cui le si
   tocca, una per una. Questo file rende possibile quelle traduzioni.

   Uso:
     tr({ it: 'Impostazioni', en: 'Settings' })
     tr({ it: `tra ${n} giorno`, en: `in ${n} day` })
   Se manca l'inglese resta il testo italiano: chiave della lingua attiva
   assente = testo italiano. La GUI non resta mai vuota.

   La scelta vive nel localStorage del browser: senza modifiche al server,
   senza nuovi campi nel save. Si cambia in Impostazioni e la pagina si
   ricarica da sola. */

window.LINGUA = localStorage.getItem('evo-lingua') || 'it';
document.documentElement.lang = window.LINGUA;

window.tr = (p) => (p && (p[window.LINGUA] ?? p.it)) ?? '';
/* locale dei numeri e delle date: garantito dalla stessa lingua dell'interfaccia */
window.LOCALE = window.LINGUA === 'en' ? 'en-US' : 'it-IT';

/* Ogni porta/finestra dell'app è un ORIGIN suo: il localStorage è separato e
   una finestra nuova (slot 3, seconda istanza) parte con 'it' di default
   anche quando il server é in inglese — 24/10: la copilota parlava italiano
   sull'interfaccia inglese. Se il browser NON ha mai scelto lui (niente
   'evo-lingua' nel localStorage), ADOTTA la lingua del server (evo.config);
   la leggiamo da /api/lang (GET, aggiunto al server lo stesso giorno).
   Il segno in sessionStorage impedisce ricariche all'infinito: adottare
   ricarica la pagina UNA volta sola per lingua. */
if (!localStorage.getItem('evo-lingua')) {
  const segno = 'evo-lingua-adoptata';
  fetch('/api/lang').then((r) => (r.ok ? r.json() : null)).then((j) => {
    const sk = j?.lang;
    if ((sk === 'it' || sk === 'en') && sk !== window.LINGUA && sessionStorage.getItem(segno) !== sk) {
      sessionStorage.setItem(segno, sk);
      location.reload();
    } else if (sk === window.LINGUA) {
      sessionStorage.setItem(segno, sk);
    }
  }).catch(() => {});
}

/* Testi storicizzati nel save (note garage, proposte griglia…) sono stati
   generati in italiano quando la carriera era in IT: qui si sistemano SOLO in
   visualizzazione durante la lettura, i dati sul disco non si toccano mai.  */
window.legacyIt = (s) => {
  const t = String(s ?? '');
  if (window.LINGUA !== 'en') return t;
  return t
    .replace(/\bvinta in\b/g, 'won in')
    /* chip live e stati di sessione (src/shmem.mjs scrive la parola italiana): */
    .replace(/\bsconosciuta\b/g, 'unknown')
    /* movimenti del garage nei flussi (src/garage.mjs, memo storici): */
    .replace(/\bvendita ([^()]+) \((\d+) km, valutata ([\d.,]+) €\)/g, 'sale $1 ($2 km, appraised $3 €)')
    .replace(/\bvittoria con\b/g, 'win with')
    .replace(/\bsulla P(\d+)\b/g, 'over P$1')
    .replace(/\bcampo troppo debole per la tua mano\b/g, 'field too soft for your hand')
    .replace(/\bcampo in linea con la tua mano\b/g, 'field in line with your hand')
    .replace(/\bsotto la base su ([^:]+): penalità troppo larga, la alleggerisco\b/g, 'under the base at $1: penalty too large, easing it')
    .replace(/\bsulla base\b/g, 'from the base')
    .replace(/\b(dalla base) su\b/g, 'from the base at')
    /* movimenti di cassa storici (finance/life/race scrivono in italiano):
       iscrizione, gara pulita, premio contratto e verdetto delle sfide. */
    .replace(/\biscrizione /g, 'entry fee ')
    .replace(/\bgara pulita /g, 'clean race ')
    .replace(/\bpremio contratto\b/g, 'contract bonus')
    .replace(/\bpremio \b/g, 'prize ')
    .replace(/\bsfida persa:/gi, 'Lost duel:')
    .replace(/\bsfida vinta:/gi, 'Won duel:')
    .replace(/\bchiudi davanti a /g, 'finish ahead of ')
    .replace(/\bchiudi la gara in zona punti senza toccare nulla \(nessun ritiro\)/g, 'finish the race in the points without touching anything (no retirements)')
    .replace(/\bchiudi almeno terzo\b/g, 'finish at least third')
    .replace(/\bchiudi almeno (\d+) gare sul podio\b/g, 'finish at least $1 races on the podium')
    .replace(/\bchiudi almeno (\d+) gare a punti\b/g, 'finish at least $1 races scoring points')
    .replace(/\btotalizza almeno (\d+) punti in stagione\b/g, 'score at least $1 championship points in the season')
    .replace(/\bvinci almeno (\d+) gare\b/g, 'win at least $1 races')
    .replace(/\bnessun ritiro nelle prime (\d+) gare\b/g, 'no retirements in the first $1 races')
    .replace(/\(stagione (\d+|\?)\)/g, '(season $1)')
    /* note di calibrazione generanti dalle gare (annotazione autoBase della griglia): */
    .replace(/\(dal campo ([^,)]+), gara (\d+)\)/g, '(from the field $1, race $2)')
    .replace(/\(base della calibrazione: ([^)]+)\)/g, '(calibration base: $1)')
    .replace(/\bcalibrazione (\d+)-?(\d+)? \? \(gara (\d+)\)/g, 'calibration $1-$2 (race $3)');
};

window.impostaLingua = (lingua) => {
  localStorage.setItem('evo-lingua', lingua);
  // UNA lingua per tutti: il server (vale anche per CLI) prende la stessa scelta.
  // Fuori dal browser che lo salva, nella sua configurazione: niente nel save.
  try {
    fetch('/api/lang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: lingua }),
    }).catch(() => {});
  } catch { /* niente server: resta la scelta locale */ }
  location.reload();
};
