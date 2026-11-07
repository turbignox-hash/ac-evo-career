// gara-carriera.mjs — LA CARRIERA DICHIARA LA GARA (7/11/2026).
//
// Perché serve: nelle gare in singolo di EVO il blocco STATIC scrive
// «TimeAttack» e la fase arriva vuota o generica («Session»). Ho misurato la
// regola che doveva supplire («sessione a giri e nessun timer»): non regge,
// perché il gioco dà un timer anche alla gara a 3 giri — sulla gara di
// Donington del 6/11 `sessionState.timeLeft` andava da 10:02 a 0 con
// `totalLap = 3`. Quindi `session.race` restava falso per tutta la gara (2
// campioni su 697) e con lui `inRace` del copilota: «Ultimo giro», «Bandiera a
// scacchi» e la cronaca mute proprio in gara.
//
// L'unica dichiarazione che non mente è quella di chi la gara l'ha preparata:
// la carriera. `state.pending` (scritto da `markPending` in race.mjs) porta la
// pista dell'appuntamento e i giri in palio. Se la sessione viva è su QUELLA
// pista con QUEI giri, è la gara preparata — non una prova (che è a tempo e ha
// `lapsTotal` a zero).
//
// Regola di casa: nessuna deduzione oltre il dichiarato. Se `pending` non c'è,
// o i giri non tornano, la funzione dice di no e resta la parola del gioco.

/** Confronto pista tollerante: minuscole, spazi e punteggiatura fuori, e la
 *  contenenza nei due versi («Donington Park» ↔ «Donington Park GP»). */
function stessaPista(a, b) {
  const n = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const x = n(a);
  const y = n(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * La sessione viva è la gara che la carriera ha preparato?
 * `sessione` = snapshot.session, `giocatore` = snapshot.player, `pending` =
 * state.pending. Vero solo con pista coerente e giri identici a quelli della
 * scheda (entrambi > 0): un timer che scorre non basta a dire «gara», un
 * `lapsTotal` a zero dice «prova o qualifica».
 */
export function garaDallaCarriera(sessione = null, giocatore = null, pending = null) {
  if (!pending) return false;
  const giri = Number(giocatore?.lapsTotal);
  const giriScheda = Number(pending.laps);
  if (!Number.isFinite(giri) || giri <= 0) return false;      // prova a tempo
  if (!Number.isFinite(giriScheda) || giriScheda <= 0) return false;
  if (giri !== giriScheda) return false;                       // un'altra distanza
  const pista = sessione?.track ?? null;
  if (!pista) return false;
  const nomi = [pending.trackId, ...(Array.isArray(pending.trackNames) ? pending.trackNames : [])].filter(Boolean);
  return nomi.some((x) => stessaPista(pista, x));
}

/**
 * Lo snapshot con la dichiarazione della carriera applicata. Non muta l'input
 * (il lettore riusa i suoi oggetti) e non tocca niente quando il gioco ha già
 * detto «gara»: in quel caso la sua parola basta.
 */
export function conGaraCarriera(snap, pending) {
  if (!snap?.session) return snap;
  if (snap.session.race === true) return snap;
  if (!garaDallaCarriera(snap.session, snap.player, pending)) return snap;
  return { ...snap, session: { ...snap.session, race: true } };
}
