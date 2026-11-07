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
 *  contenenza nei due versi («Donington Park» ↔ «Donington Park GP»).
 *  Esportata perché la verifica guidata (`tools/verifica-gara-tempo.mjs`)
 *  sceglie le sessioni da guardare con la STESSA tolleranza della regola. */
export function stessaPista(a, b) {
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
 * state.pending, `opts.save` = le durate lette dal gamemodesave
 * (`durateDalSave`), `opts.durataLiveMin` = durata della sessione viva misurata
 * dal conto alla rovescia.
 *
 * DUE MODI, uno per tipo di ronda, deciso dalla scheda (7/11):
 *   • ronda A GIRI  → i giri in palio uguali a quelli della scheda O a quelli
 *     scritti nel save per la gara;
 *   • ronda A TEMPO → la durata viva uguale a quella della gara secondo la
 *     scheda O secondo il save, e DIVERSA dalle durate di prove/qualifiche di
 *     entrambe le fonti: se la prova dura quanto la gara, la sessione non si
 *     può distinguere e non si dichiara niente (un falso «gara» accenderebbe
 *     finestra pit e ultimo giro in prova).
 * Perché due fonti (7/11, richiesta Mauro): il numero che il gioco esegue è
 * quello del `gamemodesave`, non quello della scheda — misurato il 7/11, la
 * scheda diceva prove 45′ e qualifica 30′ mentre il file dice 15′ e 10′. Il
 * save vince quando c'è, la scheda resta la riserva per quando il save non si
 * legge. In tutti i casi serve la stessa pista, e il conto alla rovescia resta
 * il segnale che dice in QUALE sessione sei (la durata non identifica nessuno).
 */
export function garaDallaCarriera(sessione = null, giocatore = null, pending = null, { durataLiveMin = null, save = null } = {}) {
  if (!pending) return false;
  const pista = sessione?.track ?? null;
  if (!pista) return false;
  const nomi = [pending.trackId, ...(Array.isArray(pending.trackNames) ? pending.trackNames : [])].filter(Boolean);
  if (!nomi.some((x) => stessaPista(pista, x))) return false;

  const s = save?.letto ? save : null;
  const giri = Number(giocatore?.lapsTotal);
  const giriScheda = Number(pending.laps);
  const aGiri = Number.isFinite(giriScheda) && giriScheda > 0;
  if (aGiri) {
    // a giri: la firma sono i giri in palio; vale quella della scheda e quella
    // del save (se il save dice che la gara è a giri), perché il gioco esegue
    // il file
    const attesi = [giriScheda, s && s.aTempo === false ? Number(s.garaGiri) : null]
      .filter((n) => Number.isFinite(n) && n > 0);
    return Number.isFinite(giri) && giri > 0 && attesi.includes(giri);
  }

  // ronda A TEMPO: la durata è la firma. La sessione non deve avere giri in
  // palio (una gara a tempo non ne ha).
  const durataViva = Number(durataLiveMin);
  if (!Number.isFinite(durataViva) || durataViva <= 0) return false;
  if (Number.isFinite(giri) && giri > 0) return false;
  const vicino = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.1);
  const minuti = (sec) => (Number.isFinite(Number(sec)) && Number(sec) > 0 ? Number(sec) / 60 : null);
  const attesi = [Number(pending.durationMin), s && s.aTempo === true ? minuti(s.garaSec) : null]
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!attesi.some((d) => vicino(durataViva, d))) return false;
  const altre = [pending.practiceMin, pending.qualifyMin, s ? minuti(s.provaSec) : null, s ? minuti(s.qualificaSec) : null]
    .filter((n) => Number.isFinite(Number(n)) && Number(n) > 0)
    .map(Number);
  return !altre.some((d) => vicino(durataViva, d));
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
export function creaDichiarazioneGara({ durate = null } = {}) {
  // `durate` è il lettore del gamemodesave (7/11): i minuti che il gioco ESEGUE
  // vengono da lì, non dal conto alla rovescia. Iniettato per non legare questo
  // modulo al disco (e per poterlo provare senza il gioco installato).
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
      const save = typeof durate === 'function' ? durate() : null;
      const gara = garaDallaCarriera(s, snap?.player, pending, { durataLiveMin: maxSec > 0 ? maxSec / 60 : null, save });
      if (gara !== true || !s || s.race === true) return { snap, gara };
      return { snap: { ...snap, session: { ...s, race: true } }, gara };
    },
  };
}
