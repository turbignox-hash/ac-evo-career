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

window.impostaLingua = (lingua) => {
  localStorage.setItem('evo-lingua', lingua);
  location.reload();
};
