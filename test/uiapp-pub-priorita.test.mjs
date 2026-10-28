// test/uiapp-pub-priorita.test.mjs — la PRIORITÀ ronda/evento e la SCADENZA
// del pending (28/10, «la Ferrari rientra» + lezione 27/10 19:30).
//
// Il patto: mentre una ronda preparata è VIVA (pending fresco, non ancora
// confermato) il comando dell'evento speciale NON esce dal publisher — chi
// sta per correre la ronda non trova l'auto dell'evento impostata a sorpresa
// nel menu (la Ferrari al posto dell'R5). Ma il pending non è immortale
// (lezione 27/10 19:30): se passa un giorno, il campo torna all'evento
// attivo e accettato; senza evento, la ronda preparata resta comunque
// il comando (un circolo mai silente per posta da resultados periduti).
import test from 'node:test';
import assert from 'node:assert/strict';

import { comandoAuto, confermaAck } from '../src/uiapp-pub.mjs';

// fixture in stile events-card.test.mjs: un'auto nota nel libro lader e
// un evento attivo e accettato (premio un'auto diversa da quella della ronda).
const EVENTO = {
  id: 'ev_test', kind: 'special-race', tier: 'finale',
  createdAt: new Date().toISOString(), season: 5, afterRound: 0,
  theme: { id: 'legend_finale', name: 'Il Gran Finale dei Campioni' },
  trackId: 'cota', trackDisplay: 'cota', weather: 0, laps: 10, hour: 17, timeScale: 1,
  guests: ['Hans Stuck'],
  prize: { carId: 'lamborghini_countach_lp5000_qv', carName: 'F40 Leggenda', money: 21000, rep: 15, duplicateCash: false },
  deadlineRounds: 99,
  acceptedAt: new Date().toISOString(),
};
const mkState = (extra = {}) => ({
  node: 'coppa_rx7',
  results: {},
  events: { active: EVENTO, history: [], showCase: [], lastRoundChecked: null },
  ...extra,
});
const mkLadder = () => ({ nodes: [], contentNames: { cars: { r5_touring: 'R5 Touring' } } });
const pendingRonda = { car: 'r5_touring', trackNames: ['cota', 'cota'], startedAt: 0 };

test('ronda preparata fresca: il comando è l\'auto DELLA ROUND, mai l\'evento', () => {
  const state = mkState({ pending: { ...pendingRonda, startedAt: Date.now() - 60_000 } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd?.tipo, 'setcar');
  assert.equal(cmd?.nome, 'R5 Touring');
});

test('ronda scaduta (>1 giorno): cede il campo all\'evento attivo e accettato', () => {
  const state = mkState({ pending: { ...pendingRonda, startedAt: Date.now() - 25 * 3600 * 1000 } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd?.tipo, 'evento');
  assert.equal(cmd?.nome, 'F40 Leggenda');
});

test('ronda scaduta SENZA evento attivo: la ronda resta il comando (no silenzio)', () => {
  const state = mkState({ pending: { ...pendingRonda, startedAt: Date.now() - 25 * 3600 * 1000 }, events: { active: null, history: [], showCase: [], lastRoundChecked: null } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd?.tipo, 'setcar');
  assert.equal(cmd?.nome, 'R5 Touring');
});

test('evento attivo ma NON accettato: niente comando evento (serve il SI a maestro)', () => {
  const invito = { ...EVENTO, acceptedAt: null };
  const state = mkState({ events: { active: invito, history: [], showCase: [], lastRoundChecked: null } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd, null);
});

test('pending con auto NON nota nel ladder: scade in 1 giorno come gli altri', () => {
  const scaduta = mkState({ pending: { car: 'auto_used_ignota', startedAt: Date.now() - 25 * 3600 * 1000 } });
  const cmdScaduta = comandoAuto(mkLadder(), scaduta);
  assert.equal(cmdScaduta?.tipo, 'evento', 'l\'evento torna senza pending-non-preciso');
  const fresca = mkState({ pending: { car: 'auto_used_ignota', startedAt: Date.now() - 60_000 } });
  const cmdFresca = comandoAuto(mkLadder(), fresca);
  assert.equal(cmdFresca, null, 'fresca con auto ignota: il ramo evento resta soppresso');
});

// ------------------------------------------------------------------
// LANCIO AUTOMATICO (28/10 sera): setcar confermato → comando 'avvia';
// avvia già confermata → silenzio. L'EVENTO non riceve mai un avvia.
// Ogni test usa un startedAt DISTINTO: gli id del pending portano
// startedAt e i due file dovrebbero non disturbarsi a vicenda.
// ------------------------------------------------------------------
test('setcar confermato con ronda viva: esce il comando tipo avvia (stesso pending)', () => {
  const t = Date.now() - 120_000;                                   // fresco, distinto
  confermaAck(`${t}:r5_touring:coppa_rx7`);                          // l'app ha impostato la R5
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: t } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd?.tipo, 'avvia', 'dopo l\'ack della setcar tocca all\'avvia');
  assert.equal(cmd?.id, `${t}:r5_touring:coppa_rx7:avvia`, 'id stabile legato al pending');
  assert.equal(cmd?.nome, 'R5 Touring');
});

test('avvia già confermata: silenzio, niente riparto', () => {
  const t2 = Date.now() - 240_000;
  const idP = `${t2}:r5_touring:coppa_rx7`;
  confermaAck(idP);
  confermaAck(`${idP}:avvia`);
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: t2 } });
  const cmd = comandoAuto(mkLadder(), state);
  // la ronda è viva e confermata, l'avvia pure: niente comando (e niente evento)
  assert.equal(cmd, null);
});

test('ronda scaduta NON produce avvia: il campo va all\'evento (mai auto-avvio con pending vecchio)', () => {
  const tooOld = Date.now() - 25 * 3600 * 1000;
  confermaAck(`${tooOld}:r5_touring:coppa_rx7`);
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: tooOld } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd?.tipo, 'evento', 'scaduto: la priorità resta all\'evento, non all\'avvia');
});
