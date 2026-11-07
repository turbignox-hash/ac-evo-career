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
import { garaDallaCarriera, conGaraCarriera } from '../src/gara-carriera.mjs';

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
