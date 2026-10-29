// 2/11 — OTTAVA FILA: LA SCHEDA GARA. race.mjs (459 righe) era l'ultimo modulo
// grosso Sensa test unit: costruisce raceCard (tutto quello da impostare in EVO
// per correre) e chargeEntry (l'iscrizione). Doppio nido: ACE_GAME_SAVEDIR per
// i file di gioco (via _game-sandbox) e EVO_DATA_DIR per la carriera, entrambi
// in tmpdir — ma NIENTE che venga davvero avviato. Anche PADDOCK_JOURNAL_DIR
// reindirigto: la scheda chiede le specs Paddock e non deve guardare sul disco vero.
import './_game-sandbox.mjs';                       // PRIMA: file di gioco finti
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-racecard-'));
process.env.EVO_SENZA_VINCOLI = '0';                // i test descrivono il comportamento canonico: si paga
process.env.PADDOCK_JOURNAL_DIR = mkdtempSync(join(tmpdir(), 'evo-racecard-pd-')); // nido vuoto → specs null

const race = await import('../src/race.mjs');

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
  assert.ok(Number.isFinite(p.startedAt));
  // FINESTRA DELL'AVVIO (29/10, «riparte la stessa gara: solo da Prepara e
  // Divertiti»): il preparato arma la finestra — un'ora di via automatiz-
  // zabile che termina per tempo (30 min segnano la cremiera del via).
  assert.ok(Number.isFinite(p.avviaFino) && p.avviaFino > Date.now(), 'la finestra del via è armata dal preparato');
  assert.ok(p.avviaFino - p.startedAt <= 31 * 60 * 1000, 'la finestra è corta, non una giornata');
});

/* ------- i layout REALE di EVO: la tabella TRACK_LAYOUTS vince sul default ------- */

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
