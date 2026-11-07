// test/gara-carriera.test.mjs — LA CARRIERA DICHIARA LA GARA (7/11/2026).
//
// Il difetto custodito: nelle gare in singolo di EVO il blocco STATIC scrive
// «TimeAttack», la fase è generica e il timer scorre ANCHE in gara (misurato
// sulla gara di Donington del 6/11: 10:02 → 0 con totalLap 3), quindi
// `session.race` restava falso e il copilota taceva in gara. L'unica
// dichiarazione affidabile è quella di chi la gara l'ha preparata: pista e
// giri della scheda. Qui si pesano i sì e soprattutto i NO (prove, altra
// pista, altra distanza): un falso «gara» accenderebbe finestra pit e ultimo
// giro in una prova libera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaDichiarazioneGara, garaDallaCarriera, conGaraCarriera, secondiTimer } from '../src/gara-carriera.mjs';
import { durateDaSessioni } from '../src/durate-save.mjs';

const pending = { trackId: 'donington', trackNames: ['Donington Park', 'donington'], laps: 3 };
const sessione = (track = 'Donington Park', race = false) => ({ type: 'TimeAttack', track, race });
const giocatore = (giri) => ({ lapsTotal: giri });

test('gara preparata: stessa pista e stessi giri → è la gara della carriera', () => {
  assert.equal(garaDallaCarriera(sessione(), giocatore(3), pending), true);
  assert.equal(garaDallaCarriera(sessione('donington Park GP'), giocatore(3), pending), true, 'contenenza tollerante');
});

test('prove e qualifiche non sono gara: lapsTotal a zero o distanza diversa', () => {
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), pending), false, 'prova a tempo: nessun giro in palio');
  assert.equal(garaDallaCarriera(sessione(), giocatore(5), pending), false, 'altra distanza');
  assert.equal(garaDallaCarriera(sessione('Suzuka'), giocatore(3), pending), false, 'altra pista');
  assert.equal(garaDallaCarriera(sessione(null), giocatore(3), pending), false, 'senza pista non si giudica');
  assert.equal(garaDallaCarriera(sessione(), { lapsTotal: null }, pending), false);
  // senza scheda preparata (nessuna carriera, evento custom) la carriera non parla
  assert.equal(garaDallaCarriera(sessione(), giocatore(3), null), false);
  assert.equal(garaDallaCarriera(sessione(), giocatore(3), { ...pending, laps: null }), false, 'gara a tempo: niente giri da confrontare');
});

// ─────────────────── RONDE A TEMPO (7/11): firma = i minuti ───────────────────
// Il gioco non scrive i giri in palio nelle gare a tempo, scrive il timer: a
// dichiarare la gara deve essere la DURATA, quella scritta dal Prepara tutto
// (`durationMin` del pending, già scalata dalla distanza scelta) contro la
// durata della sessione viva. `practiceMin`/`qualifyMin` viaggiano col pending
// perché senza quelle una prova lunga quanto la gara non si può scartare.
const aTempo = { trackId: 'donington', trackNames: ['Donington Park', 'donington'], laps: null, durationMin: 20, practiceMin: 45, qualifyMin: 30 };

const tempo = (sessione, giocatore, pending, durataLiveMin) =>
  garaDallaCarriera(sessione, giocatore, pending, { durataLiveMin });

const snapTempo = (timeLeftAll, giri = 0, track = 'Donington Park') => ({
  game: true, live: true,
  session: sessione(track),
  player: { lapsTotal: giri, timeLeftAll },
});

test('secondiTimer legge i timer del gioco, non li indovina', () => {
  assert.equal(secondiTimer('9:54'), 594);
  assert.equal(secondiTimer('00:00'), 0);
  assert.equal(secondiTimer('0:04'), 4);
  assert.equal(secondiTimer('1:02:30'), 3750);
  assert.equal(secondiTimer('45'), 45);
  for (const v of [null, undefined, '', '  ', 'abc', '1:x', '-1:00']) assert.equal(secondiTimer(v), null, `«${v}» non è un timer`);
});

test('gara a tempo: venti minuti in scheda e venti minuti al via → è la gara', () => {
  assert.equal(tempo(sessione(), giocatore(0), aTempo, 20), true);
  assert.equal(tempo(sessione(), giocatore(0), aTempo, 19.5), true, 'entro il 10% (il via può tardare una manciata di secondi)');
  assert.equal(tempo(sessione(), { lapsTotal: null }, aTempo, 20), true, 'giri non riportati');
});

test('gara a tempo: durata diversa, prova lunga uguale o giri in palio → no', () => {
  assert.equal(tempo(sessione(), giocatore(0), aTempo, 45), false, 'è la prova, non la gara');
  assert.equal(tempo(sessione(), giocatore(0), aTempo, 30), false, 'è la qualifica');
  assert.equal(tempo(sessione(), giocatore(0), aTempo, 12), false, 'altra durata');
  assert.equal(tempo(sessione(), giocatore(0), aTempo, null), false, 'senza durata viva non si giudica');
  assert.equal(tempo(sessione(), giocatore(3), aTempo, 20), false, 'una gara a tempo non ha giri in palio');
  assert.equal(tempo(sessione('Suzuka'), giocatore(0), aTempo, 20), false, 'altra pista');
  // ambiguità: se la prova dura gli stessi minuti della gara, non è dimostrabile
  assert.equal(tempo(sessione(), giocatore(0), { ...aTempo, practiceMin: 20 }, 20), false);
  assert.equal(tempo(sessione(), giocatore(0), { ...aTempo, qualifyMin: 21 }, 20), false);
  // una ronda a giri non passa mai per la strada dei minuti
  assert.equal(tempo(sessione(), giocatore(3), { ...pending, durationMin: 20 }, 3), true, 'vince la regola dei giri');
  assert.equal(garaDallaCarriera(sessione(), giocatore(3), { ...pending, laps: 3, durationMin: 20 }), true, 'giri, senza sapere la durata');
});

test('la memoria della durata: prove lunghe, poi la gara a tempo più corta', () => {
  const d = creaDichiarazioneGara();
  const passi = [];
  // prova da 45 minuti: scende ... fino a 0:00 (fine sessione, come la 6/11)
  for (const t of ['45:00', '44:58', '30:00', '1:00', '0:00', '0:00']) passi.push(d.valuta(snapTempo(t), aTempo).gara);
  // gamma tra le sessioni: due letture vuote di fila
  passi.push(d.valuta(snapTempo(''), aTempo).gara, d.valuta(snapTempo(''), aTempo).gara);
  // la gara a tempo parte: 20:00 → è la gara della carriera
  passi.push(d.valuta(snapTempo('20:00'), aTempo).gara);
  assert.deepEqual(passi, [false, false, false, false, false, false, false, false, true]);
  // e il timer che scende non la fa cadere
  assert.equal(d.valuta(snapTempo('19:58'), aTempo).gara, true);
  assert.equal(d.valuta(snapTempo('0:00'), aTempo).gara, true, 'sul traguardo resta gara: la bandiera a scacchi si annuncia lì');
});

test('la memoria non si lascia ingannare: altra pista, e la prova non diventa gara', () => {
  const d = creaDichiarazioneGara();
  assert.equal(d.valuta(snapTempo('45:00'), { ...aTempo, trackId: 'suzuka', trackNames: ['Suzuka'] }).gara, false, 'prova su un\'altra pista');
  // stessa memoria, sessione della pista giusta che dura 45: prova, non gara
  assert.equal(d.valuta(snapTempo('45:00'), aTempo).gara, false);
  // sessione nuova più corta senza un confine visto (timer che scende da 45 a
  // 10): la memoria resta 45 e la dichiarazione tace — il lato sicuro
  assert.equal(d.valuta(snapTempo('10:00'), aTempo).gara, false, 'la prova abbandonata presto non si confonde con la gara');
  // cambio pista: la memoria riparte
  assert.equal(d.valuta(snapTempo('20:00', 0, 'Suzuka'), aTempo).gara, false);
  assert.equal(d.valuta(snapTempo('20:00'), aTempo).gara, true);
});

test('la dichiarazione marca lo snapshot, non lo muta, e non tocca la rotta a giri', () => {
  const d = creaDichiarazioneGara();
  const snap = snapTempo('20:00');
  const esito = d.valuta(snap, aTempo);
  assert.equal(esito.gara, true);
  assert.equal(esito.snap.session.race, true);
  assert.equal(snap.session.race, false, 'il lettore riusa i suoi oggetti');
  assert.notEqual(esito.snap.session, snap.session);
  // nessun pending: la carriera non parla (null, non «non è gara»)
  const senza = creaDichiarazioneGara().valuta(snapTempo('20:00'), null);
  assert.equal(senza.gara, null);
  assert.equal(senza.snap.session.race, false, 'senza carriera niente marcatura');
});

// ────────── LA DURATA LA DICE IL GAMEMODESAVE (7/11, richiesta Mauro) ──────────
// Il numero che il gioco esegue è quello del file, non quello della scheda:
// misurato il 7/11, la scheda diceva prove 45′ e qualifica 30′ mentre il save
// diceva 900 s (15′) e 600 s (10′). Quindi i minuti attesi vengono dal save e
// la scheda resta la riserva.
const saveTempo = (garaSec, provaSec = 900, qualificaSec = 600) => ({
  letto: true, file: 'finto', aTempo: true, garaSec, garaGiri: null, provaSec, qualificaSec, warmupSec: 600,
});

test('durateDaSessioni: le durate si leggono per nome, la gara per blocco', () => {
  const ses = [
    { nome: 'Practice', aTempo: true, durataSec: 900, giri: 900 },
    { nome: 'Qualifying', aTempo: true, durataSec: 600, giri: 600 },
    { nome: 'Warmup', aTempo: true, durataSec: 600, giri: 600 },
    { nome: 'Race', aTempo: true, durataSec: 1200, giri: 1200 },
  ];
  assert.deepEqual(durateDaSessioni(ses), {
    aTempo: true, garaSec: 1200, garaGiri: null, provaSec: 900, qualificaSec: 600, warmupSec: 600,
  });
  // gara a giri: garaSec null, i giri nel loro campo
  const giri = durateDaSessioni([{ nome: 'Practice', aTempo: true, durataSec: 900 }, { nome: 'Race', aTempo: false, giri: 5 }]);
  assert.equal(giri.aTempo, false);
  assert.equal(giri.garaSec, null);
  assert.equal(giri.garaGiri, 5);
  assert.equal(giri.qualificaSec, null, 'qualifica assente: nessun numero inventato');
  assert.deepEqual(durateDaSessioni([]), { aTempo: null, garaSec: null, garaGiri: null, provaSec: null, qualificaSec: null, warmupSec: null });
});

test('gara a tempo: i minuti del save valgono anche se la scheda dice altro', () => {
  const save = saveTempo(1200);   // 20 minuti nel file
  // scheda a 20 → gara
  assert.equal(tempo(sessione(), giocatore(0), aTempo, 20), true);
  // scheda a 25 ma il file dice 20: valgono ENTRAMBE le firme, perché entrambe
  // sono «la gara» — la scheda può essere più fresca del file (ronda appena
  // preparata) e il file più fresco della scheda (Prepara tutto dopo il pending)
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), { ...aTempo, durationMin: 25 }, { durataLiveMin: 20, save }), true, 'i 20 del file');
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), { ...aTempo, durationMin: 25 }, { durataLiveMin: 25, save }), true, 'i 25 della scheda');
  // una durata che non è né quella della scheda né quella del file resta fuori
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), { ...aTempo, durationMin: 25 }, { durataLiveMin: 60, save }), false);
  // save illeggibile: torna la scheda da sola
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), aTempo, { durataLiveMin: 20, save: { letto: false } }), true);
});

test('gara a tempo: le prove del save contano come ambiguità, non solo quelle della scheda', () => {
  // la scheda dice prove 45′, ma nel file la prova dura 20 minuti come la gara
  const save = saveTempo(1200, 1200, 600);
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), aTempo, { durataLiveMin: 20, save }), false);
  // qualifica da 20 minuti: stessa ambiguità
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), aTempo, { durataLiveMin: 20, save: saveTempo(1200, 900, 1200) }), false);
  // se il file dice che la gara è a GIRI e la scheda dice a TEMPO, i due tipi
  // litigano: vince la scheda (è la ronda in corso) e la sua firma a tempo vale
  const saveGiri = { letto: true, aTempo: false, garaSec: null, garaGiri: 5, provaSec: 900, qualificaSec: 600 };
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), aTempo, { durataLiveMin: 20, save: saveGiri }), true);
  // ma i giri in palio non si inventano: una ronda a giri con giriTotal 0 è una prova
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), pending, { save: saveGiri }), false);
});

test('gara a giri: contano i giri della scheda E quelli del save', () => {
  const save = { letto: true, aTempo: false, garaSec: null, garaGiri: 5, provaSec: 900, qualificaSec: 600 };
  assert.equal(garaDallaCarriera(sessione(), giocatore(3), pending, { save }), true, 'i 3 giri della scheda');
  assert.equal(garaDallaCarriera(sessione(), giocatore(5), pending, { save }), true, 'i 5 giri che il file fa girare');
  assert.equal(garaDallaCarriera(sessione(), giocatore(4), pending, { save }), false);
  assert.equal(garaDallaCarriera(sessione(), giocatore(0), pending, { save }), false, 'prova: nessun giro in palio');
});

test('il tracker usa il lettore delle durate e non tocca il conto alla rovescia', () => {
  let letture = 0;
  const d = creaDichiarazioneGara({ durate: () => { letture += 1; return saveTempo(1200); } });
  const esito = d.valuta(snapTempo('20:00'), aTempo);
  assert.equal(esito.gara, true);
  assert.equal(letture, 1, 'una lettura per tick (dentro c\\u2019è la cache per mtime)');
  assert.equal(esito.snap.session.race, true);
});

test('conGaraCarriera marca lo snapshot senza toccare l’input', () => {
  const snap = { game: true, live: true, session: sessione(), player: giocatore(3) };
  const marcato = conGaraCarriera(snap, pending);
  assert.equal(marcato.session.race, true);
  assert.equal(snap.session.race, false, 'il lettore riusa i suoi oggetti: nessuna mutazione');
  assert.notEqual(marcato.session, snap.session);
  // quando il gioco lo dice già, non si riscrive nulla
  const gia = { game: true, session: sessione('Donington Park', true), player: giocatore(3) };
  assert.equal(conGaraCarriera(gia, pending), gia);
  // fuori dalla gara preparata lo snapshot resta com'è
  const prova = { game: true, session: sessione(), player: giocatore(0) };
  assert.equal(conGaraCarriera(prova, pending), prova);
});
