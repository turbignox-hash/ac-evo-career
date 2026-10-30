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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';

import { comandoAuto, confermaAck, azioniPulsanti, statoIstantanea, verdettoFascia, preparaFascia } from '../src/uiapp-pub.mjs';

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

test('ronda scaduta + evento PREPARATO (<24h): cede il campo all\'evento, con armatura', () => {
  // 30/10: la legge della finestra. «eventoPreparato» è il click su
  // «Prepara tutto e divertiti» dell'evento (event-prep in webui.mjs):
  // entro 24 h da Lì l'auto comando può uscire; voglio IL SI dato tanto lì.
  const state = mkState({ pending: { ...pendingRonda, startedAt: Date.now() - 25 * 3600 * 1000 }, eventoPreparato: Date.now() - 60_000 });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd?.tipo, 'evento');
  assert.equal(cmd?.nome, 'F40 Leggenda');
});

test('evento accettato MAI preparato: NIENTE auto montata a sorpresa (la F40 spuntata a fine gara)', () => {
  // 30/10, Mauro torna al menu dopo una gara e trova l'F40 del premio
  // dell'evento — accettato SETTE giorni prima, mai preparato: il canale
  // stallava da una settimana l'auto comando. Senza armatura: silentio.
  const state = mkState({ pending: null });
  const cmd = comandoAuto(mkLadder(), state);
  assert.equal(cmd, null, 'accettato senza preparare ≠ autorizzato');
});

test('evento preparato FIN dalla notte (>24h): la finestra è chiusa, di nuovo silenzio', () => {
  const state = mkState({ pending: null, eventoPreparato: Date.now() - 25 * 3600 * 1000 });
  assert.equal(comandoAuto(mkLadder(), state), null);
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
  // (evento preparato: senza armatura il caso scaduta ora glieto null
  //  — 30/10, la legge della finestra dell'evento — e qui il ramo dunque
  //  STRAORDINARIO dell'auto nota obsoleta, che fa tornare evento con SI dato)
  const scaduta = mkState({ pending: { car: 'auto_used_ignota', startedAt: Date.now() - 25 * 3600 * 1000 }, eventoPreparato: Date.now() - 60_000 });
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
  // FINESTRA ARMATA (29/10, «riparte la stessa gara: solo da Prepara e
  // Divertiti»): il preparato scrive avviaFino — senza, niente via auto.
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: t, avviaFino: Date.now() + 10 * 60_000 } });
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

test('pending SENZA finestra (nato prima dello stampio): MAI un auto-via', () => {
  const t3 = Date.now() - 180_000;                                   // distinto dagli altri
  confermaAck(`${t3}:r5_touring:coppa_rx7`);
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: t3 } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.notEqual(cmd?.tipo, 'avvia', 'senza avviaFino non preme mai «Avvia sessione» da solo');
  assert.equal(cmd, null, 'ronda viva senza finestra: il campo torna nullo, resta la card a mano');
});

test('finestra PASSATA (pending fresco ma 30 min fa): niente avvia', () => {
  const t4 = Date.now() - 40 * 60_000;                               // ancora «fresco» (<24h) ma fuori finestra
  confermaAck(`${t4}:r5_touring:coppa_rx7`);
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: t4, avviaFino: t4 + 60_000 } });
  const cmd = comandoAuto(mkLadder(), state);
  assert.notEqual(cmd?.tipo, 'avvia', 'finestra chiusa: niente «Avvia sessione» premuto da solo');
  assert.equal(cmd, null, 'finestra chiusa: il campo resta nullo, la card del pannello decide');
});

test('ronda scaduta NON produce avvia: il campo va all\'evento (mai auto-avvio con pending vecchio)', () => {
  const tooOld = Date.now() - 25 * 3600 * 1000;
  confermaAck(`${tooOld}:r5_touring:coppa_rx7`);
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: tooOld }, eventoPreparato: Date.now() - 60_000 });
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

// 30/10 sera («no c'è ancora la Ferrari»): la demo armata prima del «Prepara
// tutto» ripristinava la FERRARI a ogni fascia e, ackata, lasciava la ronda
// MUTA fino a scadenza. La regola del 28/10 («al Prepara nuovissimo torna la
// priorità della ronda») vale anche per la vetrina custom: conta l'ORDINE
// DI NASCITA, non la finestra.
test('vetrina custom armata MA ronda nata DOPO: la ronda comanda (il Prepara riprende la mano)', () => {
  const demoTs = Date.now() - 30_000;
  const pending = { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: Date.now() - 5_000 };
  const cmd = comandoAuto(mkLadderDemo(), mkState({ pending, vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: demoTs } }));
  assert.equal(cmd?.tipo, 'setcar', 'ronda più fresca: il ramo demo tace, esce il setcar della ronda');
  assert.equal(cmd?.nome, 'R5 Touring', 'e l\'auto è quella della ronda, non la 296 della demo');
});

test('vetrina custom scaduta (>1 giorno): le priorità storiche tornano (ronda fresca)', () => {
  const state = mkState({ pending: pendingRondaFresca(), vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: Date.now() - 25 * 3600 * 1000 } });
  const cmd = comandoAuto(mkLadderDemo(), state);
  assert.equal(cmd?.tipo, 'setcar', 'finestra chiusa: la ronda preparata comanda di nuovo');
  assert.equal(cmd?.nome, 'R5 Touring');
});

test('vetrina custom ACKata MA ronda nata DOPO: il setcar della ronda esce lo stesso (la Ferrari non torna)', () => {
  const demoTs = Date.now() - 30_000;
  const pending = { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: Date.now() - 5_000 };
  confermaAck(`demo:${demoTs}:ks_ferrari_296_gt3`);
  const cmd = comandoAuto(mkLadderDemo(), mkState({ pending, vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: demoTs } }));
  assert.equal(cmd?.tipo, 'setcar', 'l\'ack della demo non seppellisce una ronda nata DOPO (lezione 30/10: ronda muta 24h)');
  assert.equal(cmd?.nome, 'R5 Touring');
});

test('vetrina custom armata DOPO la ronda: la priorità resta alla DEMO (il gesto a mano vince)', () => {
  const pendingTs = Date.now() - 30_000;
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: pendingTs }, vetrinaCustom: { car: 'ks_ferrari_296_gt3', startedAt: Date.now() - 5_000 } });
  const cmd = comandoAuto(mkLadderDemo(), state);
  assert.equal(cmd?.tipo, 'evento', 'demo più fresca: comanda lei, tipo «evento» (solo SetCurrentCar)');
  assert.equal(cmd?.nome, 'Ferrari 296 GT3', 'e tocca alla 296, come il 28/10');
});

test('vetrina custom con auto NON nel libro: il campo passa alle priorità storiche (evento armato)', () => {
  const state = mkState({ vetrinaCustom: { car: 'auto_ignota_demo', startedAt: Date.now() }, eventoPreparato: Date.now() - 60_000 });
  const cmd = comandoAuto(mkLadderDemo(), state);
  // l'auto ignota non comanda niente (il tool rifiuta comunque armi del genere,
  // tools/vetrina-custom.mjs): il ramo demo cade sulle priorità storiche,
  // che con la finestra dell'evento APERTA portano l'evento (30/10)
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

// ------------------------------------------------------------------
// IL VERDETTO DI GIORNATA NELLE FASCE (29/10, «bottone verdetto sul
// cruscotto»): payload piatto per la card in gioco, cache sui file di
// oggi, mai un'eccezione per un file del Results illeggibile.
// ------------------------------------------------------------------
const DRV = { first: 'Mauro', last: 'Turbigno', name: 'Mauro Turbigno', nation: 'ITA' };
const fila = (cognome, pos, { me = false } = {}) => ({
  driver_id: { a: String(9000 + pos), b: String(10000 + pos) },
  is_current_driver: me,
  position: pos, driver_name: me ? 'Mauro' : 'Adrian', driver_surname: cognome,
  driver_nation: 'ITA', team: '', car_brand: 'Ferrari', car_name: 'F2004', car_number: pos,
  laps: 4, splits: ['00:30.000', '00:29.500'], best_lap: '01:30.000', total_time: '05:00.000',
  diff_first: '', diff_previous: '', num_pits: 0, penalties: [], high_penalty: '',
  ballast: 0, restrictor: 0, has_best_lap: true,
});
const scriviGara = (dir, nome) => writeFileSync(join(dir, 'Results', nome), JSON.stringify({
  season: 11, event: 'Prova', session: 'Race', track: 'Monza', layout: 'GP',
  weather_type: 'GameModeSelectionWeatherType_CLEAR', hour: 15, min: 20,
  drivers: [fila('Turbigno', 0, { me: true }), fila('Palmer', 1)],
}, null, 2));

// il prefisso dei nomi dei Results è aammgg: la STESSA regola del tool CLI
const oggiPrefisso = () => {
  const o = new Date(); const due = (n) => String(n).padStart(2, '0');
  return `${String(o.getFullYear()).slice(2)}${due(o.getMonth() + 1)}${due(o.getDate())}`;
};

test('verdettoFascia: senza driver (no carriera) esce null e non esplode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-fascia-'));
  mkdirSync(join(dir, 'Results'), { recursive: true });   // resolvePaths mappa solo <ACE_DATA>/Results
  const env = { ACE_DATA: dir };
  assert.equal(verdettoFascia({ driver: null }, env), null);
  assert.equal(verdettoFascia({}, env), null);
});

test('verdettoFascia: una gara di oggi esce come card piatta (gare/vittorie/righe)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-fascia-'));
  mkdirSync(join(dir, 'Results'), { recursive: true });   // il file va in <ACE_DATA>/Results
  scriviGara(dir, `${oggiPrefisso()}-1200_SP_Race.sessionresults.json`);
  const v = verdettoFascia({ driver: DRV }, { ACE_DATA: dir });
  assert.ok(v, 'con una gara di oggi la card esiste');
  assert.equal(v.gare, 1);
  assert.equal(v.vittorie, 1, 'la gara è una vittoria (pos 0)');
  assert.ok(Array.isArray(v.righe) && v.righe.length === 1, 'una riga per la card');
  assert.equal(v.righe[0].ora, '12:00', 'ora presa dopo il trattino del nome file');
  assert.match(v.righe[0].giro, /^01:30\.000$/, 'il giro esce così com è nel file');
  rmSync(dir, { recursive: true, force: true });
});

test('verdettoFascia: la CACHE gira dietro ai file — una gara nuova la fascia la conta al giro dopo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-fascia-'));
  mkdirSync(join(dir, 'Results'), { recursive: true });   // il file va in <ACE_DATA>/Results
  const env = { ACE_DATA: dir };
  scriviGara(dir, `${oggiPrefisso()}-1400_SP_Race.sessionresults.json`);
  const prima = verdettoFascia({ driver: DRV }, env);
  assert.equal(prima.gare, 1, 'stato iniziale: una gara');
  scriviGara(dir, `${oggiPrefisso()}-1830_SP_Race.sessionresults.json`);
  const dopo = verdettoFascia({ driver: DRV }, env);
  assert.equal(dopo.gare, 2, 'la nuova gara cambia la chiave: il successivo giro la pesca');
  // VALIDAZIONE della cache: due giri senza cambiamenti non ricalcolano (stessa chiave, stesso payload)
  const ancora = verdettoFascia({ driver: DRV }, env);
  assert.equal(ancora, dopo, 'stessa chiave = stesso payload (niente ricalcolo)');
  rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------------
// IL SEMAFORO CHE SA ANCHE «PREPARA E DIVERTITI» (29/10, «arricchisci il
// semaforo»): il campo `prepara` della fascia porta l'armata LA RONDA con
// la FINESTRA del via automatico (avviaFino) o la GARA AL VOLO; vecchi e
// vuoti parlano chiari. Una riga del tooltip, non un colore: la connessione
// resta una cosa sola.
// ------------------------------------------------------------------
test('preparaFascia: ronda armata esce con arming, finestra del via e scadenza', () => {
  const t = Date.now() - 120_000;
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: t, avviaFino: Date.now() + 10 * 60_000 } });
  const pr = preparaFascia(state);
  assert.ok(pr, 'con una ronda preparata il dato esiste');
  assert.equal(pr.tipo, 'ronda');
  assert.equal(pr.auto, 'r5_touring');
  assert.equal(pr.armataAlle, t, 'l\'arming è lo startedAt del preparato');
  assert.ok(pr.viaFino > Date.now(), 'la finestra del via è armata');
  assert.ok(pr.scadeIn > 0, 'la ronda è ancora valida (finestra 24h)');
});

test('preparaFascia: ronda SENZA finestra (nato prima dello stampio) esce con viaFino 0 — via solo a mano', () => {
  const state = mkState({ pending: { car: 'r5_touring', node: 'coppa_rx7', trackNames: ['cota', 'cota'], startedAt: Date.now() - 60_000 } });
  const pr = preparaFascia(state);
  assert.ok(pr, 'la ronda c\'è');
  assert.equal(pr.viaFino, 0, 'senza avviaFino il tooltip non promette un via automatico');
});

test('preparaFascia: gara al volo nella sua finestra esce come demo, mai con via automatico', () => {
  const state = mkState({ vetrinaCustom: { car: 'r5_touring', startedAt: Date.now() - 30_000 } });
  const pr = preparaFascia(state);
  assert.ok(pr, 'la demo c\'è');
  assert.equal(pr.tipo, 'gara al volo');
  assert.equal(pr.viaFino, 0, 'la demo non preme mai «Avvia sessione» da sola');
  assert.ok(pr.scadeIn > 0);
});

test('preparaFascia: pending SCADUTO e campi vuoti = null (mai espedienti)', () => {
  assert.equal(preparaFascia(mkState({ pending: { car: 'r5_touring', startedAt: Date.now() - 25 * 3600 * 1000 } })), null, 'oltre le 24h la ronda non si mostra più armata');
  assert.equal(preparaFascia(mkState({})), null, 'niente di niente: null, non un oggetto finto');
  assert.equal(preparaFascia(null), null, 'senza stato: null, la fascia continua');
});

test('verdettoFascia: fino al file illeggibile non ammazza la fascia (giornata vuota = null)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdetto-fascia-'));
  mkdirSync(join(dir, 'Results'), { recursive: true });   // il file va in <ACE_DATA>/Results
  writeFileSync(join(dir, 'Results', `${oggiPrefisso()}-0900_SP_Race.sessionresults.json`), 'questo non è json');
  const v = verdettoFascia({ driver: DRV }, { ACE_DATA: dir });
  assert.equal(v, null, 'file che non si legge: card assente, la fascia continua');
  rmSync(dir, { recursive: true, force: true });
});
