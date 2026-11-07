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

/** Secondi da un timer del gioco: `'9:54'` → 594, `'1:02:30'` → 3750,
 *  `'00:00'` → 0, `'45'` → 45. Non leggibile → null (non si indovina). */
export function secondiTimer(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const pezzi = s.split(':').map((x) => Number(x));
  if (!pezzi.length || pezzi.some((x) => !Number.isFinite(x) || x < 0)) return null;
  return pezzi.reduce((acc, x) => acc * 60 + x, 0);
}

/**
 * La sessione viva è la gara che la carriera ha preparato?
 * `sessione` = snapshot.session, `giocatore` = snapshot.player, `pending` =
 * state.pending.
 *
 * DUE MODI, uno per tipo di ronda (7/11, richiesta Mauro di coprire anche le
 * gare a tempo):
 *   • ronda A GIRI  → i giri in palio identici a quelli della scheda;
 *   • ronda A TEMPO → la durata della sessione viva uguale a quella scritta
 *     dalla carriera (`durationMin` del pending, già scalata dalla distanza
 *     scelta), e DIVERSO dalle durate note di prove/qualifiche: se la prova dura
 *     quanto la gara, la sessione non si può distinguere e non si dichiara
 *     niente (un falso «gara» accenderebbe finestra pit e ultimo giro in prova).
 * In tutti e due i casi serve la stessa pista.
 */
export function garaDallaCarriera(sessione = null, giocatore = null, pending = null, { durataLiveMin = null } = {}) {
  if (!pending) return false;
  const pista = sessione?.track ?? null;
  if (!pista) return false;
  const nomi = [pending.trackId, ...(Array.isArray(pending.trackNames) ? pending.trackNames : [])].filter(Boolean);
  if (!nomi.some((x) => stessaPista(pista, x))) return false;

  const giri = Number(giocatore?.lapsTotal);
  const giriScheda = Number(pending.laps);
  const aGiri = Number.isFinite(giriScheda) && giriScheda > 0;
  if (aGiri) return Number.isFinite(giri) && giri === giriScheda;

  // ronda A TEMPO: la durata è la firma. La sessione non deve avere giri in
  // palio (una gara a tempo non ne ha) e la durata deve combaciare.
  const durataScheda = Number(pending.durationMin);
  const durataViva = Number(durataLiveMin);
  if (!Number.isFinite(durataScheda) || durataScheda <= 0) return false;
  if (!Number.isFinite(durataViva) || durataViva <= 0) return false;
  if (Number.isFinite(giri) && giri > 0) return false;
  const tolleranza = Math.max(1, durataScheda * 0.1);        // 1 minuto o il 10%
  const vicino = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.1);
  if (Math.abs(durataViva - durataScheda) > tolleranza) return false;
  // ambiguità: se la prova (o la qualifica) dura gli stessi minuti, non è
  // dimostrabile che questa sia la gara
  for (const altra of [pending.practiceMin, pending.qualifyMin]) {
    const d = Number(altra);
    if (Number.isFinite(d) && d > 0 && vicino(durataViva, d)) return false;
  }
  return true;
}

/**
 * Lo snapshot con la dichiarazione della carriera applicata. Non muta l'input
 * (il lettore riusa i suoi oggetti) e non tocca niente quando il gioco ha già
 * detto «gara»: in quel caso la sua parola basta.
 */
export function conGaraCarriera(snap, pending, opts = {}) {
  if (!snap?.session) return snap;
  if (snap.session.race === true) return snap;
  if (!garaDallaCarriera(snap.session, snap.player, pending, opts)) return snap;
  return { ...snap, session: { ...snap.session, race: true } };
}

/**
 * LA DICHIARAZIONE CON MEMORIA (7/11): per le gare a tempo serve la DURATA
 * della sessione viva, ma lo snapshot porta solo il tempo che RIMANE. Il
 * massimo del conto alla rovescia visto in questa sessione è la sua durata
 * (il timer scende e basta).
 *
 * Attenzione a due cose vere di EVO, misurate il 6/11: la stessa `sessionId`
 * resta per prove, qualifica e gara («0:0:0» per tutto il weekend) e il timer
 * può saltare a `null` nei passaggi di stato (nella registrazione 2 letture di
 * fila vuote a ogni cambio sessione, nessuna durante la guida). Quindi la
 * sessione NON si riconosce dall'id ma da tre segni, tutti «il timer riparte»:
 *   • il timer RISALE di oltre 30 s (dentro una sessione scende e basta);
 *   • il timer tocca 0:00 e poi riparte (fine sessione);
 *   • due letture vuote di fila (cambio di stato: fine sessione).
 * Senza questo, la durata delle prove resterebbe appiccicata alla gara e la
 * gara a tempo non verrebbe mai dichiarata.
 *
 * `valuta(snap, pending)` → `{ snap, gara }`: `gara` è true/false/null (null =
 * nessuna ronda preparata, la carriera non sa) e `snap` è lo snapshot marcato
 * (`session.race = true`) quando la carriera dichiara la gara.
 */
export function creaDichiarazioneGara() {
  let pista = null;
  let prec = null;       // ultimo timer letto, in secondi
  let maxSec = 0;        // massimo della sessione in corso = la sua durata
  let spenta = true;     // nessuna sessione in corso: la prossima lettura apre
  let vuote = 0;         // letture vuote di fila (2 = cambio di stato)
  return {
    valuta(snap, pending) {
      // nessuna ronda preparata: la carriera non dichiara niente e la parola
      // resta ai campi di EVO (null ≠ false: non è un «non è gara»)
      if (!pending) return { snap, gara: null };
      const s = snap?.session ?? null;
      const ora = s?.track ?? null;
      if (ora !== pista) { pista = ora; prec = null; maxSec = 0; spenta = true; vuote = 0; }
      const sec = secondiTimer(snap?.player?.timeLeftAll);
      if (sec == null) {
        if (++vuote >= 2) spenta = true;
      } else {
        vuote = 0;
        if (sec > 0) {
          // sessione nuova: confine visto, timer risalito, o primo timer mai
          if (spenta || maxSec === 0 || (prec != null && sec > prec + 30)) maxSec = sec;
          else if (sec > maxSec) maxSec = sec;
          spenta = false;
        } else {
          // 0:00 = sessione FINITA, non una durata zero: `maxSec` resta la sua
          // durata, altrimenti la dichiarazione cadrebbe proprio sul traguardo
          spenta = true;
        }
        prec = sec;
      }
      const gara = garaDallaCarriera(s, snap?.player, pending, { durataLiveMin: maxSec > 0 ? maxSec / 60 : null });
      if (gara !== true || !s || s.race === true) return { snap, gara };
      return { snap: { ...snap, session: { ...s, race: true } }, gara };
    },
  };
}
