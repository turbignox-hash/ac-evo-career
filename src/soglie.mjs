// soglie.mjs — i numeri che DUE parti del programma devono leggere uguali.
//
// 6/11 (audit): la regola del delta di un setup («ha guadagnato / ha perso /
// è rumore») viveva in tre posti con lo stesso numero scritto a mano:
// allievo.mjs (la memoria del meccanico), prova-setup.mjs (il giudizio A/B) e
// gui/js/viste-c.js (il chip colorato nel pannello). Finché i numeri restano
// uguali non succede niente; il giorno che si cambia una soglia in un posto
// solo, il pannello e il motore cominciano a raccontare due verità diverse —
// ed è il tipo di divergenza che non si nota finché non si perde una serata.
//
// Qui stanno le soglie CONDIVISE, una volta sola. Il browser non importa moduli
// del server (la GUI è caricata come <script> classici): la sua copia resta nel
// suo file, ma test/soglie-condivise.test.mjs confronta i due numeri e rompe la
// build se uno si muove senza l'altro.

/** Sotto questo delta (secondi) il giro è MIGLIORE: guadagno vero. */
export const DELTA_GUADAGNO_S = -0.05;

/** Sopra questo delta (secondi) il giro è PEGGIORE: perdita vera. In mezzo è
 *  rumore — la zona neutra che non fa cambiare idea al meccanico. */
export const DELTA_PERDITA_S = 0.15;
