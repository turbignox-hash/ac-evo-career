// 2/11 — OTTAVA FILA: LA SCHEDA GARA. race.mjs (459 righe) era l'ultimo modulo
// grosso Sensa test unit: costruisce raceCard (tutto quello da impostare in EVO
// per correre) e chargeEntry (l'iscrizione). Doppio nido: ACE_GAME_SAVEDIR per
// i file di gioco (via _game-sandbox) e EVO_DATA_DIR per la carriera, entrambi
// in tmpdir — ma NIENTE che venga davvero avviato.
import { GAME_SANDBOX } from './_game-sandbox.mjs'; // PRIMA: file di gioco finti
import { appCacheClear } from '../src/app-carriera.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-racecard-'));
process.env.EVO_SENZA_VINCOLI = '0';                // i test descrivono il comportamento canonico: si paga

const race = await import('../src/race.mjs');
import { encodeMsg } from '../src/evo-grid.mjs';                 // le celle del customgrid finto
import { GRID_FILE } from '../src/grid-apply.mjs';                 // lo STESSO file che la vigia guarda

/* ---- fixture: stessa scala di life.test.mjs (gridFor vuole 30 piloti attivi) ---- */
const mkWorld = () => ({
  drivers: Array.from({ length: 30 }, (_, i) => ({
    id: `d${i + 1}`, name: `Rivale ${i + 1}`, first: 'Rivale', last: `${i + 1}`,
    country: 'IT', archetype: 'pro', iconic: false, age: 25, hot: false,
    skill: 90 - i, active: true,
  })),
});
const mk = (over = {}) => {
  const ladder = {
    disciplines: [],
    nodes: [{
      nodeId: 'coppa', display: 'Coppa Città', discipline: 'd', level: 1,
      calendar: [
        { track: 'track_monza', hour: 15, weather: 0, laps: 8 },
        { track: 'track_imola', hour: 16, weather: 4, laps: 6 },
        { track: 'track_monza', hour: 14, weather: 2, laps: 8 },
        { track: 'track_notte', hour: 2, weather: 0, laps: 10 },
      ],
      ai: [80, 84], gridSize: 10, points: 'fake',
      econ: { entry: 500, rent: 0, prize: 5000 },
      cars: ['car_a'], profile: 'pro',
      ...over.node,
    }],
    weatherNames: { '0': 'sereno', '1': 'nuvole sparse', '2': 'nuvoloso', '3': 'pioggia leggera', '4': 'pioggia', '5': 'pioggia intensa' },
    pointsSystems: { fake: { flPoint: 8, polePoint: 2, flTopN: 10 } },
    contentNames: { tracks: { track_monza: 'Monza', track_imola: 'Imola', track_notte: 'Notte' }, cars: { car_a: 'Azzurra GT' } },
    profiles: { pro: { practiceMin: 40, qualifyMin: 20, timeScale: 1, start: 'standing', pitreq: false } },
    ...over.ladder,
  };  const state = {
    node: 'coppa', season: 1, round: 0, money: 5000, rep: 0, world: mkWorld(), driver: { name: 'Mauro Turbigno', nation: 'IT' },
    results: { coppa: [] }, titles: [], seasons: [{ season: 1 }],
    difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
    stats: { bestLaps: {} }, agenda: { day: 1 }, messages: [],
  };
  Object.assign(ladder.nodes[0], over.nodeExtra ?? {});
  Object.assign(state, over.state ?? {});
  return { ladder, state };
};
const nodeOf = (l) => l.nodes[0];
const texto = (t) => typeof t === 'string' ? t : (t?.it || t?.en || '');

/* ------------------------------------------------------------------ */

// IL TASTO «ISCRIVITI E DIVERTITI» COL MIRROR (3/11): raceCard è quello che
// la GUI e il Prepara consumano — col NUOVO formato mirror journal (senza app
// di gioco: nessun journal esterno) la ronda «next» del calendario nostro
// scritto accanto al save DEVE guidare la card: pista, layout, giri, ore e
// meteo della ronda seminato, non solo la ladder grezza.
test('raceCard col MIRROR: la ronda «next» del calendario nostro guida la scheda', () => {
  const { ladder, state } = mk({
    node: {
      calendar: [
        { track: 'monza', hour: 15, weather: 0, laps: 8 },
        { track: 'imola', hour: 16, weather: 4, laps: 6 },
      ],
    },
    ladder: { contentNames: { tracks: { monza: 'Monza', imola: 'Imola' }, cars: { car_a: 'Azzurra GT' } } },
  });
  // IL MIRROR del journal (2/11): la STESSA forma che src/journal.mjs scrive
  // accanto al save a ogni saveState (done/next/todo; il weather a PAROLE).
  // ATTENZIONE: il mirror è CONDIVISO coi test dopo (stesso EVO_DATA_DIR del
  // processo) — rmSync in finally, sennò la ronda «next» finta guida ANCHE
  // «la scheda della ronda 0» (lezione del primo run del 3/11: 4 ≠ 8 giri).
  const mirrorFile = join(process.env.EVO_DATA_DIR, 'evo-calendar.json');
  appCacheClear();
  try {
    writeFileSync(mirrorFile, JSON.stringify({
      mirror: true, series: 'Coppa Città', season: 1, car: 'car a',
      summary: { done: 1, total: 2 },
      rounds: [
        { n: 1, track: 'Monza', layout: null, laps: 8, time: '15:00', weather: 'Sereno', state: 'done' },
        { n: 2, track: 'Imola', layout: 'GP', laps: 4, time: '17:30', weather: 'Pioggia', state: 'next' },
      ],
    }));
    const c = race.raceCard(ladder, state);
    // la ronda attiva è la 2ª (Imola): IL CALENDARIO SEMINATO LA DICE, non state.round
    assert.equal(c.roundIndex, 1);
    assert.equal(c.trackName, 'Imola');
    assert.equal(c.round.__calendario, true, 'la ronda porta il sigillo del calendario seminato');
    // i DETTAGLI del seminato valgono: layout, giri, ore e meteo nella scala LADDER
    assert.equal(c.round.layout, 'GP');
    assert.equal(c.round.laps, 4);
    assert.equal(c.round.hour, 17);
    assert.equal(c.round.weather, 4);            // «Pioggia» → ladder 4 (half rain)
    assert.equal(c.laps, 4,                      'giri dell\'override alla card');
    // la riga «Pista» della scheda porta IL LAYOUT SEMINATO, non solo GP default.
    // 3/11 (rinforzo dell'inchiesta): prima era `if (rigaPista) assert…` — se la
    // riga SPARIVA il test restava verde e la scheda perdeva la pista in silenzio.
    // Adesso la riga è OBBLIGATORIA (una e una sola) e il valore è fissato INTERO:
    // pista seminata + layout, non un pezzo qualsiasi che contenga «layout GP».
    const righePista = c.settings.filter((r) => typeof r[0] === 'string' && (r[0].includes('Pista') || r[0].includes('Track')));
    assert.equal(righePista.length, 1, `una sola riga Pista nella scheda: ${JSON.stringify(c.settings.map((r) => [texto(r[0]), texto(r[1])]))}`);
    assert.equal(texto(righePista[0][1]), 'Imola — layout GP',
      'la riga Pista è la pista SEMINATA (Imola) col suo layout, non la Monza della ladder');
  } finally {
    rmSync(mirrorFile, { force: true });            // niente mirror fuoriuscito per gli altri test
  }
});

test('raceCard: la scheda della ronda 0 — pista tradotta, auto, giri e griglia', () => {
  const { ladder, state } = mk();
  const c = race.raceCard(ladder, state);
  assert.equal(c.node.nodeId, 'coppa');
  assert.equal(c.roundIndex, 0);
  assert.equal(c.trackName, 'Monza');
  assert.equal(c.car, 'car_a');
  assert.equal(c.carName, 'Azzurra GT');
  assert.equal(c.laps, 8);
  assert.equal(c.opponents, c.gridSize - 1);       // griglia reale − io
  assert.equal(c.distPct, 100);                    // default distanza piena
  assert.equal(c.prizeEff, 5000);                  // premio pieno al 100%
});

test('raceCard multiclasse: la riga Grid Type compare CON classe; sulle mono NON compare', () => {
  const names = { track_monza: 'Monza' };
  const mk2 = mk({ node: { cars: ['car_a', 'car_b'] }, ladder: { contentNames: { tracks: names, cars: { car_a: 'Azzurra GT', car_b: 'Verde RS' } } } });
  const c = race.raceCard(mk2.ladder, mk2.state);
  assert.ok(c.settings.some((s) => /tipo griglia|grid type/i.test(texto(s[0]))));
  // monomarca: la riga SPARISCE (richiesta Mauro 27/10 — niente coro sincerato)
  const mono = race.raceCard(mk().ladder, mk().state);
  assert.ok(!mono.settings.some((s) => /tipo griglia|grid type/i.test(texto(s[0]))));
});

test('raceCard con DISTANZA 25%: giri, durate sessioni e premio scalano, il minimo gira', () => {
  const { ladder, state } = mk({ state: { raceSettings: { coppa: { distPct: 25 } } } });
  const c = race.raceCard(ladder, state);
  assert.equal(c.laps, 2);                          // 8 × 25% = 2, MAI sotto 2
  assert.equal(c.prizeFull, 5000);
  assert.equal(c.prizeEff, 1250);                   // un quarto del premio
  assert.equal(c.qualifyMinEff, 5);                 // 20 × 25% → min 5'
  assert.equal(c.practiceMinEff, 10);               // 40 × 25% = 10
  assert.equal(c.warmupMinEff, 5);                  // min 5'
  assert.equal(c.effectiveNode.econ.prize, 1250);   // il flusso premi usa il nodo scalato
});

test('raceCard RONDA A TEMPO (1/11, serie endurance): niente giri inventati, la durata esposta e scalata', () => {
  const calTempo = { calendar: [
    { track: 'track_monza', hour: 15, weather: 0, durationMin: 40 },
    { track: 'track_imola', hour: 16, weather: 4, durationMin: 30 },
  ] };
  const { ladder, state } = mk({ node: calTempo });
  const c = race.raceCard(ladder, state);
  assert.equal(c.durationMin, 40);            // la piena della ronda
  assert.equal(c.durationEff, 40);            // al 100% coincide
  assert.equal(c.laps, null);                 // PRIMA fabbricava 8 giri fatti
  assert.equal(c.baseLaps, null);             // adesso onesta: a tempo non si contano giri
  // al 25% la durata scala come le durate delle sessioni: 40′ → 10′ (min 5)
  const { ladder: l2, state: s2 } = mk({ node: calTempo, state: { raceSettings: { coppa: { distPct: 25 } } } });
  const c2 = race.raceCard(l2, s2);
  assert.equal(c2.durationEff, 10);
  assert.equal(c2.durationMin, 40);
  // la riga «Gara» della scheda dice «a TEMPO», mai «giri»
  const gara = c.settings.find(([k]) => /gara|race/i.test(texto(k)));
  assert.ok(gara, 'riga Gara presente');
  assert.ok(/a TEMPO|BY TIME/i.test(texto(gara[1])), `vale: ${texto(gara[1])}`);
  assert.ok(!/giri|laps/i.test(texto(gara[1])), 'niente giri sulla ronda a tempo');
});

test('raceCard: piano ORARIO realistico — P −6h, Q −3h, W −1h dalla gara, senza girare il giorno', () => {
  // ronda ore 15: P 09, Q 12, W 14, gara 15
  const { ladder, state } = mk();
  const c = race.raceCard(ladder, state);
  assert.equal(c.raceHour, 15);
  assert.equal(c.practiceStart, 9);
  assert.equal(c.qualifyStart, 12);
  assert.equal(c.warmupStart, 14);
  // ronda di NOTTE alle 2: il max(0,…) blocca senza girare il giorno
  const { ladder: l2, state: s2 } = mk({ state: { round: 3 } });
  const c2 = race.raceCard(l2, s2);
  assert.equal(c2.raceHour, 2);
  assert.equal(c2.practiceStart, 0);
  assert.equal(c2.qualifyStart, 0);
  // override MANUALE: raceStart vince sul round
  const { ladder: l3, state: s3 } = mk({ state: { raceSettings: { coppa: { raceStart: 20 } } } });
  const c3 = race.raceCard(l3, s3);
  assert.equal(c3.raceHour, 20);
  assert.equal(c3.warmupStart, 19);
});

test('raceCard: difficoltà in banda STRETTA (max − min = 1) e override dei cursori', () => {
  const { ladder, state } = mk();
  const c = race.raceCard(ladder, state);
  assert.equal(c.difficulty.rangeMax - c.difficulty.rangeMin, 1);
  assert.ok(c.difficulty.rangeMin >= 0 && c.difficulty.rangeMax <= 100);
  // override manuale: spostano la banda
  const { ladder: l2, state: s2 } = mk({ state: { raceSettings: { coppa: { sliderMin: 62, sliderMax: 63 } } } });
  const c2 = race.raceCard(l2, s2);
  assert.equal(c2.difficulty.rangeMin, 62);
  assert.equal(c2.difficulty.rangeMax, 63);
  assert.equal(c2.difficulty.overridden, true);
});

test('raceCard: auto FUORI parco — la card lo ridà PRIMA che parta', () => {
  const { ladder, state } = mk({ state: { raceSettings: { coppa: {} } } });
  // asceso manuale: il pilota ha scelto un'auto che non è nel nodo
  state.pendingManualCar = false;
  const c = race.raceCard(ladder, state, { car: 'car_fantasma' });
  assert.ok(c.warnings.some((w) => /fuori serie|outside the series/i.test(texto(w))), c.warnings.map(texto).join(' | '));
  // auto ammessa: NESSUN avviso di parco
  const c2 = race.raceCard(ladder, state, { car: 'car_a' });
  assert.ok(!c2.warnings.some((w) => /fuori serie|outside the series/i.test(texto(w))));
});

test('raceCard: riga Difficoltà AI con TRIM attivo — testo fissato (3/11, richiesta Mauro)', () => {
  // La legge del 1/11 (TRIM VIVO): la riga porta il trim attivo ACCANTO alla
  // banda — così stampa CTRL-C dal CLI e copia-testo della GUI segnano la
  // banda VIVA, non solo l'intervallo. Da 3/11 il testo EXACT si fissa:
  // trim +2sposta ANCHE la banda (24–25 → 28–29) e il suffisso va col segno.
  // DAL POMERIGGIO del 3/11 anche il trim NEGATIVO (richiesta Mauro: «anche al
  // trim negativo (es. −2: «trim −2» col segno) e alla banda che scende»):
  // il segno PLUS solo col positivo — il meno lo porta il numero (race.mjs:
  // `${trim > 0 ? '+' : ''}${trim}`), la banda SCINDE dello stesso passo,
  // e il clamp in fondo alla scala non la fa uscire dal 0.
  const { ladder, state } = mk();
  state.difficulty.trim.coppa = 2;
  const c = race.raceCard(ladder, state);
  const riga = c.settings.find(([k]) => /difficoltà ai|ai difficulty/i.test(texto(k)));
  assert.ok(riga, 'riga Difficoltà AI presente');
  // riga[1] è GIÀ il testo risolto (tr() torna la stringa della lingua viva):
  // il gemello EN si costruisce con la STESSA formula (race.mjs, riga «TRIM VIVO»).  assert.equal(texto(riga[1]), 'min 28% · max 29% (trim +2)');
  assert.equal(c.difficulty.trim, 2);
  // senza trim: NESSUN suffisso — la banda resta nuda «min X% · max Y%»
  const { ladder: l2, state: s2 } = mk();
  const c2 = race.raceCard(l2, s2);
  const riga2 = c2.settings.find(([k]) => /difficoltà ai|ai difficulty/i.test(texto(k)));
  assert.ok(riga2, 'riga Difficoltà AI (senza trim) presente');
  assert.equal(texto(riga2[1]), 'min 24% · max 25%');
  assert.equal(c2.difficulty.trim, 0);
  // TRIM NEGATIVO (richiesta Mauro, pomeriggio 3/11): −2 abbatte la banda
  // (24–25 → 20–21, simmetrico al +2 attorno al centro) e il suffisso porta
  // il SEgno — ma niente più: il meno lo scrive il numero (atteso '(trim -2)',
  // NON '(trim −2)' né '(trim +−2)').
  const { ladder: l3, state: s3 } = mk();
  s3.difficulty.trim.coppa = -2;
  const c3 = race.raceCard(l3, s3);
  const riga3 = c3.settings.find(([k]) => /difficoltà ai|ai difficulty/i.test(texto(k)));
  assert.ok(riga3, 'riga Difficoltà AI (trim −2) presente');
  assert.equal(texto(riga3[1]), 'min 20% · max 21% (trim -2)');
  assert.equal(c3.difficulty.trim, -2);
  assert.ok(c3.difficulty.rangeMin < c2.difficulty.rangeMin && c3.difficulty.rangeMax < c2.difficulty.rangeMax,
    'la banda DEVE scendere col trim negativo (24–25 → 20–21)');
  // il passo è lo stesso del positivo: ±1 trim = ±2 punti di slider
  const { ladder: l4, state: s4 } = mk();
  s4.difficulty.trim.coppa = -1;
  const c4 = race.raceCard(l4, s4);
  assert.equal(texto(c4.settings.find(([k]) => /difficoltà ai|ai difficulty/i.test(texto(k)))[1]), 'min 22% · max 23% (trim -1)');
  // clamp in fondo alla scala: un trim da −99 non spinge la banda sotto 0
  const { ladder: l5, state: s5 } = mk();
  s5.difficulty.trim.coppa = -99;
  const c5 = race.raceCard(l5, s5);
  assert.ok(c5.difficulty.rangeMin >= 0 && c5.difficulty.rangeMax >= 0, 'la banda con trim estremo NON scende sotto lo 0');
  assert.equal(c5.difficulty.rangeMax - c5.difficulty.rangeMin, 1, 'la banda resta STRETTA di 1 punto anche al clamp');
});

test('raceCard: outlook con obiettivo pista, stagione e contratto; Meteo con nome preset', () => {
  const { ladder, state } = mk();
  state.stats.bestLaps.Monza = '01:42.5';
  state.results.coppa.push({ season: 1, round: 0, position: 1, points: 25, dnf: false });
  // round 1 avanza: la rondadiventa Imola con weather 4 (pioggia leggera)
  const c1 = race.raceCard(ladder, state);
  assert.equal(c1.outlook.lapTarget, '01:42.5');    // obiettivo sulla pista RONDA 0
  assert.equal(c1.outlook.seasonPoints, 25);
  assert.equal(c1.outlook.racesRun, 1);
  // il meteo della ronda correntesie il nome della ladder, NON un indice
  const ladder2 = mk().ladder;
  ladder2.weatherNames = { '0': 'Clear', '4': 'Light rain' };
  const c2 = race.raceCard(ladder2, mk().state);
  assert.equal(c2.weather, 'Clear');
});

test('chargeEntry: paga UNA VOLTA per ronda, memorizza la ricevuta, e soldi corti => throw', () => {
  const { ladder, state } = mk();
  const fee1 = race.chargeEntry(ladder, state, nodeOf(ladder));
  assert.equal(fee1, 500);                           // alla prima ronda SI PIAGA
  assert.equal(state.money, 4500);
  assert.equal(race.chargeEntry(ladder, state, nodeOf(ladder)), 0, 'seconda volta: ZERO (ricevuta)');
  assert.equal(state.money, 4500);                   // nessun secondo pagamento
  assert.equal(Object.keys(state.paidEntries ?? {}).length, 1);
  // ronda nuova: si ripaga (le ronde 2 e 3 semo a pago pieno)
  state.round = 1;
  assert.equal(race.chargeEntry(ladder, state, nodeOf(ladder)), 500);
  assert.equal(state.money, 4000);
  assert.equal(race.chargeEntry(ladder, state, nodeOf(ladder)), 0);
  // soldi CORTI: errore CHE nomina il prezzo e il saldo
  const { ladder: l3, state: s3 } = mk();
  s3.money = 100;
  assert.throws(() => race.chargeEntry(l3, s3, nodeOf(l3)), (e) => {
    const msg = typeof e?.message === 'string' ? e.message : texto(e?.message);
    return /iscrizione/i.test(msg) && /500/.test(msg) && /100/.test(msg);
  });
  assert.equal(s3.money, 100);                       // niente addebito parziale
});

test('markPending: la ronda corrente della scheda va in state.pending per il flusso di gara', () => {
  const { ladder, state } = mk();
  const c = race.raceCard(ladder, state);
  const p = race.markPending(ladder, state, c);
  assert.equal(p.node, 'coppa');
  assert.equal(p.round, 0);
  assert.equal(p.trackId, 'track_monza');
  assert.deepEqual(p.trackNames, ['Monza', 'track_monza']);
  assert.equal(p.car, 'car_a');
  assert.equal(p.laps, 8);
  // IL WEEKEND DA APPLICARE AL VOLO (4/11): non basta l'auto — il Cruscotto
  // riceve anche griglia, avversari, Single Make, banda AI e ore di sessione.
  assert.equal(p.weekend.singleMake, true, 'una sola auto in serie = griglia monomarca');
  assert.equal(p.weekend.laps, 8);
  assert.deepEqual(p.weekend.gridCars, ['car_a']);
  assert.equal(p.weekend.opponents, c.opponents);
  assert.equal(p.weekend.aiMin, c.difficulty.rangeMin);
  assert.equal(p.weekend.aiMax, c.difficulty.rangeMax);
  assert.equal(p.weekend.sessions.Practice.hour, 9);
  assert.equal(p.weekend.sessions.Qualifying.hour, 12);
  assert.equal(p.weekend.sessions.Warmup.hour, 14);
  assert.equal(p.weekend.sessions.Race.hour, 15);
  assert.ok(Number.isFinite(p.startedAt));
  // FINESTRA DELL'AVVIO (29/10, «riparte la stessa gara: solo da Prepara e
  // Divertiti»): il preparato arma la finestra — un'ora di via automatiz-
  // zabile che termina per tempo (30 min segnano la cremiera del via).
  assert.ok(Number.isFinite(p.avviaFino) && p.avviaFino > Date.now(), 'la finestra del via è armata dal preparato');
  assert.ok(p.avviaFino - p.startedAt <= 31 * 60 * 1000, 'la finestra è corta, non una giornata');
});

/* ------- i layout REALE di EVO: la tabella TRACK_LAYOUTS vince sul default ------- */

/* --------- BOLLETTINO DEL WEEKEND (3/11, richiesta Mauro) ----------- */

/* Il piano NON chiede scelte: è deterministico dal meteo della ronda.
 * gara a livello r ⇒ prove min(r−2, 2) · qualifiche/warm-up r−1 · gara r.
 * clamp: mai sotto 0. r=4 è l'esempio letterale di Mauro: proves nuvoloso,
 * qualifiche pioggia leggera, gara pioggia. */
test('weatherPlanFor: ronda bagnata (4) = l\'esempio di Mauro alla lettera; clamp su sereno', () => {
  const round = { weather: 4 };
  const p = race.weatherPlanFor(round);
  assert.equal(p.length, 4);
  assert.deepEqual(p.map((s) => s.session), ['Practice', 'Qualifying', 'Warmup', 'Race']);
  assert.deepEqual(p.map((s) => s.weather), [2, 3, 3, 4]);
  assert.deepEqual(p.map((s) => s.label), ['nuvoloso', 'pioggia leggera', 'pioggia leggera', 'pioggia']);
  // ronda serena: tutto sereno (clamp: niente -2)
  assert.deepEqual(race.weatherPlanFor({ weather: 0 }).map((s) => s.weather), [0, 0, 0, 0]);
  // ronda pioggia intensa: prove restano da correre (tetto nuvoloso), poi scala
  const p5 = race.weatherPlanFor({ weather: 5 });
  assert.deepEqual(p5.map((s) => s.weather), [2, 4, 4, 5]);
  // round senza meteo: non esplode, il testo resta sereno
  assert.deepEqual(race.weatherPlanFor({}).map((s) => s.weather), [0, 0, 0, 0]);
});

test('raceCard porta il piano (weatherPlan + weatherRitual) e le ore di ogni sessione', () => {
  const { ladder, state } = mk();   // ronda 0: weather 0, hour 15
  const c = race.raceCard(ladder, state);
  assert.ok(Array.isArray(c.weatherPlan) && c.weatherPlan.length === 4);
  assert.equal(c.weatherPlan[3].weather, 0);               // ronda serena → gara serena
  assert.equal(c.weatherPlan[0].session, 'Practice');
  assert.equal(c.weatherPlan[0].hour, c.practiceStart);    // il piano mostra anche l'ora
  assert.equal(c.weatherPlan[3].hour, c.raceHour);
  assert.ok(typeof c.weatherRitual === 'string' && c.weatherRitual.length > 10);
});

test('layout reali: Paul Ricard "Layout 1C-V2", Oulton "International", default "GP"', () => {
  const cellFor = (trackId, disp) => {
    const { ladder, state } = mk();
    ladder.nodes[0].calendar[0] = { track: trackId, hour: 12, weather: 0, laps: 8 };
    ladder.contentNames.tracks[trackId] = disp;
    const c = race.raceCard(ladder, state);
    return texto(c.settings.find((s) => texto(s[0]).toLowerCase().includes('pista'))[1]);
  };
  assert.ok(cellFor('track_pr', 'Paul Ricard').includes('Layout 1C-V2'));
  assert.ok(cellFor('track_op', 'Oulton Park').includes('International'));
  // piste con tabella vuota: il default è GP (la pista del ladder standard del test)
  assert.ok(cellFor('track_monza', 'Monza').includes('GP'));
});

/* ------- VIGIA DEL CAMBIO DI CAMPIONATO (3/11, la prova del 2/11 incastonata
 * come test: la card dice PRIMA del bottone se la griglia sul disco è di un'altra
 * serie — non più scoperta solo premendo «Prepa tutto») ------- */
const driverBlocco = () => {
  const f = Buffer.alloc(4); f.writeFloatLE(0.55, 0);
  return encodeMsg([{ field: 4, wire: 5, bytes: f }]);
};
// stessa convenzione dei test del builder (f3 = id auto, f4 = nome, f2 = pilota,
// f3 esterno = conteggio): un customgrid minimo che readCells sapesse leggere
const customgridDiAuto = (auto) => encodeMsg([
  ...auto.map(([id, nome]) => ({ field: 1, wire: 2, bytes: encodeMsg([
    { field: 3, wire: 2, bytes: Buffer.from(id, 'utf8') },
    { field: 4, wire: 2, bytes: Buffer.from(nome, 'utf8') },
  ]) })),
  { field: 2, wire: 2, bytes: driverBlocco() },
  { field: 2, wire: 2, bytes: driverBlocco() },
  { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(auto.length) }]) },
]);

test('vigia cambio campionato: la card nomina le auto estranee PRIMA del bottone', () => {
  const { ladder, state } = mk();
  writeFileSync(GRID_FILE, customgridDiAuto([['ks_f40_lm', 'Ferrari F40 LM']]));
  const c = race.raceCard(ladder, state);
  assert.ok(typeof c.gridAltraSerie === 'string' && c.gridAltraSerie.includes("griglia sul disco contiene auto di un'altra serie"), `banner atteso, suele: «${c.gridAltraSerie}»`);
  assert.ok(c.gridAltraSerie.includes('Ferrari F40 LM'), 'la nota nomina la stirpe sul disco');
  assert.ok(c.gridAltraSerie.includes('riscrive dal template'), 'dice cosa fa il Prepa tutto, non solo che non va');
});

test('vigia cambio campionato: basta UNA auto estranea in una griglia mista', () => {
  const { ladder, state } = mk();
  writeFileSync(GRID_FILE, customgridDiAuto([['car_a', 'Azzurra GT'], ['ks_f40_lm', 'Ferrari F40 LM']]));
  const c = race.raceCard(ladder, state);
  assert.ok(typeof c.gridAltraSerie === 'string', 'la griglia mista deve accendere la vigia');
  assert.ok(c.gridAltraSerie.includes('Ferrari F40 LM'), 'la nota nomina la sola auto estranea');
});

test('vigia silente: griglia già della serie o file assente', () => {
  const { ladder, state } = mk();
  // parco combaciante: la 4-di-serie già in piedi → nessun banner
  writeFileSync(GRID_FILE, customgridDiAuto([['car_a', 'Azzurra GT'], ['car_a', 'Azzurra GT'], ['car_a', 'Azzurra GT'], ['car_a', 'Azzurra GT']]));
  assert.equal(race.raceCard(ladder, state).gridAltraSerie, null);
  // file assente: muta (sempre sotto try/catch)
  rmSync(GRID_FILE);
  assert.equal(race.raceCard(ladder, state).gridAltraSerie, null);
});

test('raceCard: il nativo 3.10 sono avversari — declared + 1, non cars - 1', () => {
  const file = join(GAME_SANDBOX, 'GameModes', 'GameModeType_RACE_WEEKEND.gamemodesave');
  const sessione = encodeMsg([
    { field: 5, wire: 2, bytes: encodeMsg([{ field: 2, wire: 2, bytes: Buffer.from('Monza') }]) },
    { field: 7, wire: 0, varint: BigInt(12) },
    ...Array.from({ length: 12 }, () => ({ field: 10, wire: 2, bytes: Buffer.from('car_a') })),
  ]);
  writeFileSync(file, encodeMsg([{ field: 3, wire: 2, bytes: sessione }]));
  try {
    const { ladder, state } = mk();
    const c = race.raceCard(ladder, state);
    assert.equal(c.gridSource, 'gamemodesave');
    assert.equal(c.opponents, 12, '12 avversari dichiarati = 12, non 11');
    assert.equal(c.gridSize, 13, '12 avversari + il giocatore');
  } finally {
    rmSync(file, { force: true });
  }
});

// DUE GESTI (4/11): «Prepara tutto» prepara e basta — il via lo premi tu in
// EVO; «Prepara tutto e avvia» arma anche l'auto-avvio dell'app Cruscotto
// (avviaFino, finestra di 30 minuti). La differenza vive TUTTA in markPending:
// con autoAvvio:false la finestra resta a 0 e l'app non preme mai il via.
test('markPending: il via automatico si arma solo col «Prepara tutto e avvia»', () => {
  const { ladder, state } = mk();
  const c = race.raceCard(ladder, state);
  const armato = race.markPending(ladder, state, c);
  assert.ok(armato.avviaFino > Date.now(), 'default: finestra di 30 minuti armata (Prepara tutto e avvia)');
  const solo = race.markPending(ladder, state, c, { autoAvvio: false });
  assert.equal(solo.avviaFino, 0, 'Prepara tutto: nessun auto-avvio, il via resta a mano');
});
