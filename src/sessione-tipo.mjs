// sessione-tipo.mjs — «È GARA?» in un posto solo (7/11/2026).
//
// La regola è nata il 6/11 dentro `shmem.mjs`: il blocco STATIC di EVO scrive
// «TimeAttack» anche nelle gare in singolo, la fase può arrivare vuota, e
// l'unica firma che il gioco offre è «sessione A GIRI e NESSUN timer».
//
// COSA HO MISURATO PRIMA DI TOCCARLA (7/11, sulle due registrazioni vere:
// la gara di Donington del 6/11 e il collaudo del 4/11): la regola del timer
// NON distingue, e non si può «aggiustare» allargandola. In gara il timer non è
// vuoto ma un conto alla rovescia vero (`sessionState.timeLeft` = 10:02 → 0, con
// `totalLap` = 3): EVO dà un timer anche alla gara a giri. Trattare `00:00` come
// «timer spento» avrebbe etichettato «gara» la coda delle prove a tempo (nel
// collaudo 42 campioni su 360), cioè proprio l'errore che questa regola serve a
// evitare. Quindi la regola resta quella stretta (timer vuoto) e la verità
// sulla sessione la dichiara la CARRIERA al server (pending + pista + giri):
// vedi `garaDallaCarriera` in `webui.mjs`.
//
// Una regola, tre consumatori: qui, `shmem.mjs` (che la riesporta) e
// `engineer.mjs`.

/** Il timer è «spento» solo quando il gioco non scrive niente: una stringa
 *  (`'9:54'`, `'0:04'`, `'00:00'`) vuol dire che il timer c'è. */
export function timerSpento(v) {
  return v == null || String(v).trim() === '';
}

/**
 * È una gara? Vero quando il gioco lo dichiara (`tipo === 'Race'`) oppure
 * quando la sessione è a giri e il timer non c'è.
 */
export function eGaraSessione({ tipo = null, giriTotali = null, tempoRimanente = null } = {}) {
  if (String(tipo ?? '') === 'Race') return true;
  const giri = Number(giriTotali);
  return Number.isFinite(giri) && giri > 0 && timerSpento(tempoRimanente);
}
