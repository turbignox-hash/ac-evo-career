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
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { comandoAuto, confermaAck, azioniPulsanti, statoIstantanea } from '../src/uiapp-pub.mjs';

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

// ------------------------------------------------------------------
// VETRINA CUSTOM (28/10 sera, «deve farlo in automatico come paddock»):
// una gara personalizzata preparata col tool ha la PRIORITÀ per la SUA
// finestra: comanda l'AUTO della demo (tipo «evento»: solo SetCurrentCar,
// niente sequenza del weekend) e dopo l'ack TACE (la ronda pendente
// riprimerebbe la SUA auto a ogni fascia: ping-pong col garage).
// ------------------------------------------------------------------
const mkLadderDemo = () => ({
  nodes: [],
  contentNames: { cars: { r5_touring: 'R5 Touring', ks_ferrari_296_gt3: 'Ferrari 296 GT3' } },
});
const pendingRondaFresca = () => ({ ...pendingRonda, startedAt: Date.now() - 60_000 });

test('vetrina custom armata fresca: comanda l\'AUTO DELLA DEMO, sopra ronda e evento', () => {
  const state = mkState({ pending: pendingRondaFresca(), vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: Date.now() - 10_000 } });
  const cmd = comandoAuto(mkLadderDemo(), state);
  assert.equal(cmd?.tipo, 'evento', 'la demo esce tipo «evento»: SOLO SetCurrentCar, il weekend non si tocca');
  assert.equal(cmd?.nome, 'Ferrari 296 GT3', 'comanda la 296, non l\'R5 della ronda né l\'F40 dell\'evento');
});

test('vetrina custom ACKata: silenzio per tutta la finestra (niente ronda che riprinia l\'R5)', () => {
  const demoTs = Date.now() - 30_000;
  const state = mkState({ pending: pendingRondaFresca(), vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: demoTs } });
  confermaAck(`demo:${demoTs}:ks_ferrari_296_gt3`);
  const cmd = comandoAuto(mkLadderDemo(), state);
  assert.equal(cmd, null, 'ackato: la finestra demo intero tace, la ronda non rientra nel ping-pong');
});

test('vetrina custom scaduta (>1 giorno): le priorità storiche tornano (ronda fresca)', () => {
  const state = mkState({ pending: pendingRondaFresca(), vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: Date.now() - 25 * 3600 * 1000 } });
  const cmd = comandoAuto(mkLadderDemo(), state);
  assert.equal(cmd?.tipo, 'setcar', 'finestra chiusa: la ronda preparata comanda di nuovo');
  assert.equal(cmd?.nome, 'R5 Touring');
});

test('vetrina custom con auto NON nel libro: il campo passa alle priorità storiche (evento)', () => {
  const state = mkState({ vetrinaCustom: { car: 'auto_ignota_demo', startedAt: Date.now() } });
  const cmd = comandoAuto(mkLadderDemo(), state);
  // l'auto ignota non comanda niente (il tool rifiuta comunque armi del genere,
  // tools/vetrina-custom.mjs): il ramo demo cade sulle priorità storiche
  assert.equal(cmd?.tipo, 'evento', 'auto ignota: il ramo demo non comanda, le storie riprendono il campo');
});

// ------------------------------------------------------------------
// I BOTTONI «Prepara e divertiti» IN GIOCO (3/11, «implementalo sul
// cruscotto per i bottoni prepara e divertiti di entrambi, anche eventi
// speciali»): azioniPulsanti spedisce al pannello I DATI dei due gesti
// con gli STESSI id di comandoAuto (così un ack del bottone sincronizza
// anche il canale automatico), e i bottoni RESTANO a premere anche DOPO
// l'ack: sono il RIFUGIO dell'amico quando la presa automatica non parte.
// ------------------------------------------------------------------
const pendingMonza = { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['Monza'], startedAt: Date.now() - 60_000 };

test('azioni: ronda fresca espone il bottone CON la pista del libro (Monza → GP Race), evento pure', () => {
  const az = azioniPulsanti(mkLadder(), mkState({ pending: pendingMonza }));
  assert.equal(az.ronda?.tipo, 'setcar', 'bottone ronda: sequenza COMPLETA di Paddock, tipo setcar');
  assert.equal(az.ronda?.nome, 'R5 Touring');
  assert.equal(az.ronda?.pista, 'Monza', 'la pista arriva dal libro TRACK_INFO, non resta null');
  assert.equal(az.ronda?.layout, 'GP Race');
  assert.ok(az.ronda?.id, 'id presente: ack di bottone e canale automatico puntano allo stesso imprint');
  assert.equal(az.evento?.nome, 'F40 Leggenda', 'ENTRAMBI i bottoni escono insieme: ronda e evento non si contendono nulla da qui');
});

test('azioni: gli id dei bottoni coincidono con gli id dei comandi automatici (ack unico)', () => {
  const state = mkState({ pending: pendingMonza });
  const az = azioniPulsanti(mkLadder(), state);
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd?.id, az.ronda?.id, "stesso imprint: l'ack del bottone tace anche il canale automatico");
});

test('azioni: evento NON accettato = niente bottone evento (serve il SI a maestro)', () => {
  const invito = { ...EVENTO, acceptedAt: null };
  const az = azioniPulsanti(mkLadder(), mkState({ events: { active: invito, history: [], showCase: [], lastRoundChecked: null } }));
  assert.equal(az.evento, undefined);
});

test('azioni: ronda con auto IGNOTA nel libro rimane FUORI (comando non replicabile)', () => {
  const az = azioniPulsanti(mkLadder(), mkState({ pending: { car: 'auto_used_ignota', startedAt: Date.now() - 60_000 } }));
  assert.equal(az.ronda, undefined, 'senza nome auto nota il bottone uscirebbe sbagliato: non esce, il canale automatico pure lo salta');
});

test('azioni: bottone ronda NON muore con il pending ackato (è il RIFUGIO del canale automatico)', () => {
  const state = mkState({ pending: pendingMonza });
  confermaAck(`${pendingMonza.startedAt}:r5_touring:coppa_rx7`);
  const az = azioniPulsanti(mkLadder(), state);
  assert.equal(az.ronda?.nome, 'R5 Touring', 'ackato: il canale automatico tace, MA il bottone resta premibile');
});

test('azioni: la finestra demo (gara al volo) esce come terzo bottone e NASCONDE quello evento', () => {
  const demoTs = Date.now() - 30_000;
  const az = azioniPulsanti(mkLadderDemo(), mkState({ vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: demoTs } }));
  assert.equal(az.demo?.tipo, 'evento', "la gara al volo comanda SOLO auto, stessa azione dell'evento");
  assert.equal(az.demo?.nome, 'Ferrari 296 GT3');
  assert.equal(az.demo?.id, `demo:${demoTs}:ks_ferrari_296_gt3`, 'id demo = id del canale automatico (stesso ack)');
  assert.equal(az.evento, undefined, "con la finestra demo viva un secondo bottone evento prenderebbe l'auto");
});

test('azioni: finestra demo scaduta → il bottone demo scompare e quello evento torna', () => {
  const az = azioniPulsanti(mkLadderDemo(), mkState({ vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: Date.now() - 25 * 3600 * 1000 } }));
  assert.equal(az.demo, undefined);
  assert.equal(az.evento?.nome, 'F40 Leggenda');
});

// ------------------------------------------------------------------
// I FATTI NELLE CARD (4/11): la card porta anche scadenza della finestra,
// e per l'evento pista/giri/ora/banda dalla scheda; per la gara al volo
// lo stato REALE dell'istantanea (letto con currentInstantRace: sola
// lettura, mai un'eccezione che ammazza la fascia).
// ------------------------------------------------------------------
test('azioni: la card dell evento porta pista/giri/ora/banda della scheda', () => {
  const az = azioniPulsanti(mkLadder(), mkState({}));
  assert.equal(az.evento?.giri, 10, 'giri = laps dell evento');
  assert.equal(az.evento?.ora, 17, 'ora = hour dell evento');
  assert.equal(az.evento?.banda, '88–93', 'banda AI fissa degli eventi');
  assert.equal(typeof az.evento?.pista, 'string', 'pista = trackName della scheda');
  assert.ok(az.evento?.pista);
});

test('azioni: la card della ronda porta la finestra rimasta (~24h per un pending da un minuto)', () => {
  const az = azioniPulsanti(mkLadder(), mkState({ pending: pendingMonza }));
  assert.ok(Number(az.ronda?.scadeIn) > 23 * 3600 * 1000, 'finestra di freschezza: ms rimasti');
});

test('azioni: la card della gara al volo porta la finestra e lo stato DELL ISTANTANEA reale', () => {
  const az = azioniPulsanti(mkLadderDemo(), mkState({ vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: Date.now() - 30_000 } }));
  assert.ok(Number(az.demo?.scadeIn) > 23 * 3600 * 1000, 'finestra demo: ms rimasti');
  const i = az.demo?.istantanea;
  if (i == null) return; // PC senza alcuna gara custom aperta: il campo resta null e la card non esplode
  assert.ok(i.durata && (i.durata.giri != null || i.durata.min != null), 'durata dell istantanea: giri o minuti');
  if (i.banda != null) assert.match(i.banda, /^\d+–\d+$/, 'banda AI in forma LO–HI');
});

test('statoIstantanea: file assente = null, mai un eccezione (la fascia sopravvive)', () => {
  assert.equal(statoIstantanea(join(tmpdir(), 'istantanea-che-non-esiste', 'GameModeType_INSTANT_RACE.gamemodesave')), null);
});
