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

/* Testi storicizzati nel save (note garage, proposte griglia…) sono stati
   generati in italiano quando la carriera era in IT: qui si sistemano SOLO in
   visualizzazione durante la lettura, i dati sul disco non si toccano mai.  */
window.legacyIt = (s) => {
  const t = String(s ?? '');
  if (window.LINGUA !== 'en') return t;
  return t
    .replace(/\bvinta in\b/g, 'won in')
    .replace(/\bvittoria con\b/g, 'win with')
    .replace(/\bsulla P(\d+)\b/g, 'over P$1')
    .replace(/\bcampo troppo debole per la tua mano\b/g, 'field too soft for your hand')
    .replace(/\bcampo in linea con la tua mano\b/g, 'field in line with your hand')
    .replace(/\bsotto la base su ([^:]+): penalità troppo larga, la alleggerisco\b/g, 'under the base at $1: penalty too large, easing it')
    .replace(/\bsulla base\b/g, 'from the base')
    .replace(/\b(dalla base) su\b/g, 'from the base at')
    .replace(/\(stagione (\d+|\?)\)/g, '(season $1)');
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
