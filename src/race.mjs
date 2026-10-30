// race.mjs — la scheda gara: cosa impostare nel gioco, con che difficolta', e il lancio.
//
// Assetto Corsa EVO non accetta argomenti da riga di comando e non legge un file di sessione
// scritto da fuori: la gara si prepara nella sua interfaccia. Quindi l'app fa le due cose che
// restano possibili e utili:
//   1. decide tutto (auto, pista, giri, ora, meteo, avversari, difficolta' AI) e te lo mostra
//      come lista da seguire: due click e sei in pista;
//   2. apre il gioco per te.
// Il resto, cioe' la lettura del risultato, e' automatico: lo fa il file nativo del gioco.

import { difficultyFor, entryFee, pushMessage, nodeById, playerStanding, isClosedNode, senzaVincoli, grigliaSimEstesa } from './state.mjs';
import { rebuildGridApply } from './grid-apply.mjs';
import { contractStatus, challengeFor, trackMastery, sponsorFor, ensureContract, refreshContractTexts } from './life.mjs';
import { raceCrowdFor } from './memories.mjs';
import { launchGame } from './paths.mjs';
import { carPaddockSpecsOf } from './paddock.mjs';
import { loadCatalog } from './catalog.mjs';
import { rivalsOutlook } from './rivals.mjs';
import { recordFlows } from './flows.mjs';
import { recordWarning } from './warnings.mjs';
import { tr, lang } from './lang.mjs';
import { carPoolOf } from './car-pool.mjs';
import { sameTrack } from './tracknames.mjs';
import { existsSync } from 'node:fs';
import { weekendCarCount, WEEKEND_FILE } from '../tools/set-track.mjs';

/* Nomi delle opzioni meteo come compaiono ESATTAMENTE nel menu di EVO
 * (sereno, nuvole sparse, nuvoloso, coperto, pioggia leggera, pioggia, pioggia intensa).
 * La chiave e' il codice del round nei temi della ladder (weatherNames lì tiene i
 * nomi inglesi interni; qui la traduzione ufficiale del menu di gioco). */
const EVO_WEATHER = {
  0: 'sereno',
  1: 'nuvole sparse',
  2: 'nuvoloso',
  3: 'pioggia leggera',
  4: 'pioggia',
  5: 'pioggia intensa',
};
// corrispettivi del menu Meteo in un'installazione EVO in inglese
const EVO_WEATHER_EN = {
  0: 'clear',
  1: 'scattered clouds',
  2: 'cloudy',
  3: 'light rain',
  4: 'rain',
  5: 'heavy rain',
};

/* Layout reali del menu di EVO, dal catalogo del server dedicato (events_race_weekend.json).
 * Regola: si corre sul layout GP quando esiste; dove manca si usa il piu' lungo della pista
 * (Oulton Park → International, Paul Ricard → Layout 1C-V2, Watkins Glen → GP Inner Loop).
 * ATTENZIONE: al Nürburgring il piu' lungo sarebbe la 24h (25 km!): il "GP" di EVO si chiama
 * "Gp Strecke" e va scelto quello. */
const TRACK_LAYOUTS = {
  'imola': 'GP',
  'monza': 'GP',
  'fuji speedway': 'GP',
  'suzuka': 'GP',
  'sebring international raceway': 'GP',
  'sebring': 'GP',
  'mount panorama': 'GP',
  'red bull ring': 'GP',
  'nürburgring gp': 'Gp Strecke',
  'nürburgring': 'Gp Strecke',
  'nurburgring': 'Gp Strecke',
  'circuit de spa francorchamps': 'GP',
  'spa': 'GP',
  'brands hatch': 'GP',
  'laguna seca': 'GP',
  'circuit of the americas': 'GP',
  'donington park': 'GP',
  'kyalami': 'GP',
  'paul ricard': 'Layout 1C-V2',
  'oulton park': 'International',
  'road atlanta': 'GP',
  'watkins glen international': 'GP',
  'watkins glen': 'GP',
};

/** Layout consigliato per una pista: prima la tabella esplicita, poi "GP" come default. */
function layoutFor(trackDisplay) {
  const key = String(trackDisplay ?? '').toLowerCase().trim();
  return TRACK_LAYOUTS[key] ?? (key ? 'GP' : null);
}

export function nextRound(ladder, state, node = null) {
  const n = node ?? nodeById(ladder, state.node);
  const roundIndex = Math.min(state.round, n.calendar.length - 1);
  return { node: n, roundIndex, round: n.calendar[roundIndex], totalRounds: n.calendar.length };
}

export function raceCard(ladder, state, { car = null, stintPlan = null } = {}) {
  const { node, roundIndex, round } = nextRound(ladder, state);
  const profile = { ...(ladder.profiles[node.profile] ?? {}) };
  // override manuali per questa serie (intervallo slider AI, orari, moltiplicatore tempo,
  // distanza gara in %). L'aggressività AI in EVO è ancora bloccata (grigia): solo consiglio.
  const ov = state.raceSettings?.[node.nodeId] ?? {};
  const distPct = [25, 50, 75, 100].includes(Number(ov.distPct)) ? Number(ov.distPct) : 100;
  const aTempo = Number(round.durationMin) > 0;
  const durationEff = aTempo ? Math.max(5, Math.round(Number(round.durationMin) * distPct / 100)) : null;
  const baseLaps = aTempo ? null : Math.max(1, Number(round.laps) || 8);
  const laps = aTempo ? null : Math.max(2, Math.round(baseLaps * distPct / 100));
  // i premi scalano con la distanza scelta (25% → un quarto del premio pieno)
  const prizeFactor = distPct / 100;
  // RONDE A TEMPO (1/11, le serie endurance): la distanza chiave è la DURATA in
  // minuti — niente giri inventati (prima la card diceva «piena: 8 giri» pur
  // dicendo «a TEMPO: 45 minuti» a tre righe di distanza). laps/baseLaps nascono
  // SOLO per le ronde a giri; durationMin (piena) e durationEff (al % scelto)
  // raccontano la ronda a tempo e il Prepara tutto usa durationEff per scrivere
  // la gara bit a bit (setWeekendTimed), come già fa coi giri.
  // DURATE AL % BASSA (richiesta Mauro 31/10): oltre alle ORE diverse per
  // sessione, anche le DURATE di prove/qualifiche/warm-up seguono la distanza
  // scelta in Regole del weekend (25% → sessione un quarto, min 5'); la Race
  // resta coi GIRI già scalati (o a TEMPO coi minuti scalati). Il Prepara
  // tutto le scrive nel gamemodesave (f2 dei blocchi, in secondi).
  const durEff = (m) => Math.max(5, Math.round((Number(m) || 0) * distPct / 100));
  const practiceMinEff = durEff(profile.practiceMin ?? 45);
  const qualifyMinEff = durEff(profile.qualifyMin ?? 30);
  const warmupMinEff = durEff(10);
  const nodeEff = { ...node, econ: { ...node.econ, prize: Math.max(1, Math.round((node.econ.prize ?? 0) * prizeFactor)) } };
  const sliderMinOv = Number.isFinite(Number(ov.sliderMin)) ? Number(ov.sliderMin) : null;
  const sliderMaxOv = Number.isFinite(Number(ov.sliderMax)) ? Number(ov.sliderMax) : null;
  // OROLOGIO per round (orario.mjs, scelta Mauro 21/10/2026): il round del calendario
  // può portare hour/timeScale propri (piani notte/crepuscolo/alba/tramontoalba/
  // variabile). Precedenza: round del calendario > override serie > profilo ladder.
  if (Number.isFinite(Number(round.timeScale))) profile.timeScale = Number(round.timeScale);
  if (Number.isFinite(Number(ov.timeScale))) profile.timeScale = Number(ov.timeScale);
  const practiceStartOv = Number.isFinite(Number(ov.practiceStart)) ? Number(ov.practiceStart) : null;
  const qualifyStartOv = Number.isFinite(Number(ov.qualifyStart)) ? Number(ov.qualifyStart) : null;
  const warmupStartOv = Number.isFinite(Number(ov.warmupStart)) ? Number(ov.warmupStart) : null;
  const raceStartOv = Number.isFinite(Number(ov.raceStart)) ? Number(ov.raceStart) : null;
  // TEMPERATURA ARIA (bottone GUI 30/10): l'override della serie arriva dalla
  // scheda Regole weekend (°C); senza, l'aria resta quella del round/gioco.
  const airTempOv = Number.isFinite(Number(ov.airTemp)) ? Number(ov.airTemp) : null;
  // ORE DISTINTE per sessione (richiesta Mauro 28/10): prove, qualifiche, warm-up
  // e gara portano ciascuna il proprio orologio (default: calcolo a ritroso dal
  // round, con il warm-up 15 min prima della gara). Con il moltiplicatore>1 il
  // gioco riscorre indietro; qui si scrivono le ore distinte nei blocchi del
  // gamemodesave (setRaceSessions), come dalla regola gara settings.
  const raceHour = raceStartOv ?? round.hour ?? null;
  const diff = difficultyFor(ladder, state, node, round.track);
  // in EVO la difficoltà AI si imposta come INTERVALLO min-max: banda STRETTA di un
  // punto (scelta Mauro 23/10: gap massimo 1% su tutte le serie, per avvicinare
  // anche gli ultimi); si sposta col centro, l'utente la regola coi cursori
  const recMin = Math.max(0, Math.min(100, Math.round(diff.slider)));
  const recMax = Math.max(0, Math.min(100, recMin + 1));
  const diffShown = {
    ...diff,
    rangeMin: sliderMinOv ?? recMin,
    rangeMax: sliderMaxOv ?? recMax,
    overridden: Number.isFinite(sliderMinOv) || Number.isFinite(sliderMaxOv),
  };
  const advice = carAdviceFor(node, (id) => ladder.contentNames?.cars?.[id] ?? id);
  // SERIE NUOVA, griglia da sbloccare (23/10 sera: Coppa Audi RS 3 col customgrid
  // ancora 5× F40 di ieri): la card dice SUBITO il rituale della prima griglia
  // della serie, invece di farlo scoprire a tasto "Apri EVO" o in pista mentre
  // in EVO si vede la griglia vecchia. Se la build a secco passa, qui non manca
  // niente (gridRitual resta null): il rituale serve SOLO quando nessun
  // template sul disco ha le auto della serie.
  let gridRitual = null;
  try { rebuildGridApply({ ladder, nodeId: node.nodeId, roundIndex, dry: true }); }
  catch (e) { if (e?.code === 'NO_TEMPLATE') gridRitual = e.message; }
  // PRIMA ACCENSIONE RISOLTA (26/10, richiesta Mauro): alla primissima volta
  // nel gioco l'amico deve aprire UNA volta il Race Weekend del round
  // (altrimenti il Prepara non trova il weekend di carriera) e di lì, col
  // selettore Grid Type che diventa giusto una volta per tutte. La card
  // mostra l'avviso SOLO finché il weekend non esiste: appena il round
  // carica (weekendSeen=true) l'avviso sparisce da solo, senza che nessuno
  // lo debba spuntare
  const weekendSeen = existsSync(WEEKEND_FILE);
  const carName = (id) => ladder.contentNames?.cars?.[id] ?? id;
  // VIGIA DEL PARCO AUTO (24/10, richiesta Mauro: «potrei prendere una F1 e la UI
  // non se ne accorgerebbe dandomi la vittoria»): la scheda PROPOSTE SOLO le auto
  // ammesse della serie — la classe in grid-classes.json con poolAuto (multiclasse)
  // se c'è, altrimenti le node.cars del ladder. Un'auto più potente presa comunque
  // nel gioco NON si nasconde: l'import la marchia senza punti e senza premio
  // (vedi car-pool.mjs) e qui la card la individua SUBITO, prima di partire.
  const parco = carPoolOf(ladder, node.nodeId);
  const parcoIDs = parco.ids.length ? parco.ids : node.cars;
  const idOf = (x) => (parcoIDs.includes(x) ? x
    : parcoIDs.find((id) => carName(id).toLowerCase().trim() === String(x ?? '').toLowerCase().trim()) ?? null);
  const sceltaParcheggiabile = car ? idOf(car) : null;
  const adviceCar = advice.pick && parcoIDs.includes(advice.pick) ? advice.pick : parcoIDs[0];
  const chosenCar = sceltaParcheggiabile ?? adviceCar;
  const fuoriParco = parco.ammesse.length && !!car && !sceltaParcheggiabile;
  const chosenCarName = carName(chosenCar);
  const trackName = (id) => ladder.contentNames?.tracks?.[id] ?? id;
  const trackDisp = trackName(round.track);
  const layout = layoutFor(trackDisp);
  // SERIE MULTICLASSE (26/10 notte, nota per l'amico): più di un modello di
  // auto avversarie = griglia mista = zavorre e penalità di classe. In EVO
  // arrivano al via SOLO col selettore Grid Type su CUSTOM (lezione Berline
  // Moderne: AUTOMATIC le dalla via). La scheda lo dice SEMPRE sulle serie
  // multiclasse: «una volta sola e poi non toccarlo più» — il Prepara
  // riscrive comunque la forma da solo a ogni gara (mono compresa), e se la
  // scrittura da fuori non passa, il toast rosso guida al gesto a mano.
  const multiclasse = node.cars.length > 1;
  // CONSIGLIO GRID TYPE, SOLO QUANDO SERVE (27/10, richiesta Mauro: prima lo vedevi
  // anche sulle monomarca e sembrava un coro sincerato). La riga in scheda:
  //   • multiclasse CON classe dichiarata (zavorre/penalità in grid-classes.json):
  //     il selettore EVO va su CUSTOM alla prima gara — poi l'app lo riscrive da sola;
  //   • gli altri casi (monomarce comprese): la riga SPARISCE, l'app imposta da sola.
  const grigliaRow = !multiclasse ? null
    : parco.classe != null
      ? [tr({ it: 'Tipo griglia (Grid Type)', en: 'Grid Type' }), tr({ it: 'CUSTOM — lo fissi alla prima gara di questa serie, poi l’app lo riscrive da sola a ogni Prepara.', en: 'CUSTOM — set it at the first race of this series, then the app rewrites it itself every “Get ready”.' })]
      : [tr({ it: 'Tipo griglia (Grid Type)', en: 'Grid Type' }), tr({ it: 'lascialo com’è — per questa serie non serve una posa speciale', en: 'leave it as is — this series needs no special setting' })];
  // PIANO ORARIO REALISTICO (31/10, richiesta Mauro: «diversifica in maniera più
  // reale»): il vecchio calcolo a ritroso col moltiplicatore comprimeva tutto
  // sulla stessa ora (15/15/15/16 — le sessioni erano vicine quanto i MINUTI
  // che le separavano dalla gara). Il piano nuovo dichiara le ore come un VERO
  // weekend di gara, sempre nello stesso giorno della ronda:
  //   prove libere −6h (mattina) · qualifiche −3h (fine mattina/pomeriggio) ·
  //   warm-up −1h (l'ultima cosa sul tracciato prima della gara) · gara all'ora
  // della ronda. La scala tempo NON entra più nei default: le ore sono
  // scritte per sessione nel gamemodesave (setRaceSessions), non ricalcolate a
  // ritroso. Con ronda di notte (hour bassa) il piano si avvicina verso il
  // minimo (0) senza girare il giorno: prova 0:00, qualifica, warm-up, gara.
  const backHour = (h) => raceHour != null ? Math.max(0, raceHour - h) : 12;
  const practiceStart = practiceStartOv ?? backHour(6);
  const qualifyStart = qualifyStartOv ?? backHour(3);
  const warmupStart = warmupStartOv ?? backHour(1);

  // REALE, non la stima del ladder (26/10 sera, la scheda dell'Alfa 75 diceva
  // «6 cars» mentre il gamemodesave contava 14): il contatore del ladder era
  // una stima nostra, il contatore NATIVO (weekendCarCount) è quello confermato
  // dal gioco (lezione 24/10 del crash 0xC0000005). Lo mostro solo quando il
  // gamemodesave è leggibile e la sua pista COINCIDE con la ronda: se il
  // weekend è ancora su un'altra serie o su una pista vecchia, la stima resta.
  // Niente file / niente corrispondenza → nessuna override, comportamento come
  // prima (PC vergine).
  const nato = (() => {
    try {
      const n = weekendCarCount();
      return n && n.cars > 0 && sameTrack(n.track, trackName(round.track)) ? n : null;
    } catch { return null; }
  })();
  const gridsReali = nato ? nato.cars : node.gridSize;
  // GRIGLIA TIPICA nella card (28/10, «la card vede il campo largo come la
  // classifica»): il massimo gridSize di griglia reale incassato in SERIE
  // (grigliaSimEstesa, la stessa cifra delle card serie e dell'agenda). Il
  // gamemodesave di QUESTA ronda può essere più piccolo: la riga quando
  // diverge avvisa, così in EVO non sembra che manchino avversari.
  const tipica = grigliaSimEstesa(ladder, state, node);
  const gridsTipica = Math.max(tipica?.gridSize ?? 0, node.gridSize);

  const base = {
    node,
    roundIndex,
    totalRounds: node.calendar.length,
    round,
    car: chosenCar,
    carName: chosenCarName,
    // il selettore (GUI e --car) mostra SOLO il parco ammesso: la multiclasse con
    // poolAuto in grid-classes.json, altrimenti le auto della serie del ladder
    carChoices: parcoIDs.map((id) => ({ id, display: carName(id) })),
    carPool: parco,
    // EXTRA PADDACK (26/10): curva di coppia e versus dell'auto del sedile,
    // dal catalogo scritto dall'app Paddock (letture pure, nessuna scrittura).
    paddockSpec: carPaddockSpecsOf(chosenCarName, process.env),
    opponentCars: node.cars.map(carName),
    trackId: round.track,
    trackName: trackName(round.track),
    weather: ladder.weatherNames[String(round.weather)] ?? `meteo ${round.weather}`,
    gridSize: gridsReali,
    opponents: gridsReali - 1,
    profile,
    difficulty: diffShown,
    difficultyBase: diff,
    timeMultiplier: profile.timeScale ?? 1,
    practiceStart,
    qualifyStart,
    warmupStart,
    practiceMinEff,
    qualifyMinEff,
    warmupMinEff,
    raceHour,
    airTemp: airTempOv,
    carAdvice: advice.list,
    settings: [
      [tr({ it: 'Modalità', en: 'Mode' }), tr({ it: 'Weekend di gara', en: 'Race weekend' })],
      // Grid Type: riga SOLO per le multiclasse (richiesta Mauro 27/10 — vedi su)
      ...(grigliaRow ? [grigliaRow] : []),
      [tr({ it: 'Pista', en: 'Track' }), tr({ it: `${trackDisp} — layout ${layout}`, en: `${trackDisp} — ${layout} layout` })],
      [tr({ it: 'Auto', en: 'Car' }), chosenCarName],
      [tr({ it: 'Avversari', en: 'Opponents' }), tr({ it: `${gridsReali - 1} auto · ${node.cars.length > 1 ? 'multiclasse: ' + node.cars.map(carName).join(', ') : carName(node.cars[0])}${gridsTipica > gridsReali ? ` — griglia tipica di serie: ${gridsTipica}` : ''}`, en: `${gridsReali - 1} cars · ${node.cars.length > 1 ? 'multiclass: ' + node.cars.map(carName).join(', ') : carName(node.cars[0])}${gridsTipica > gridsReali ? ` — series typical grid: ${gridsTipica}` : ''}` })],
      [tr({ it: 'Difficoltà AI', en: 'AI difficulty' }), tr({ it: `min ${diffShown.rangeMin}% · max ${diffShown.rangeMax}%`, en: `min ${diffShown.rangeMin}% · max ${diffShown.rangeMax}%` })],
      [tr({ it: 'Prove libere', en: 'Practice' }), card_sessionHint(practiceMinEff, round, profile, 'P', practiceStartOv, raceHour)],
      [tr({ it: 'Qualifiche', en: 'Qualifying' }), card_sessionHint(qualifyMinEff, round, profile, 'Q', qualifyStartOv, raceHour)],
      [tr({ it: 'Warm-up', en: 'Warm-up' }), card_sessionHint(warmupMinEff, round, profile, 'W', warmupStartOv, raceHour)],
      [tr({ it: 'Gara', en: 'Race' }), aTempo
        ? tr({ it: `a TEMPO: ${durationEff} minuti${distPct !== 100 ? ` (piena: ${round.durationMin}′)` : ''}`, en: `BY TIME: ${durationEff} minutes${distPct !== 100 ? ` (full: ${round.durationMin}′)` : ''}` })
        : tr({ it: `${laps} giri`, en: `${laps} laps` })],
      // PIANO STINT (DA-9, prima fetta): riga SOLO per le ronde a tempo e SOLO
      // se il piano ha tutti i dati veri (consumo/ritmo dal sedile, serbatoio
      // osservato). Le note arrivano già risolte nella lingua corrente.
      ...(aTempo && stintPlan?.ok
        ? [[tr({ it: 'Piano stint', en: 'Stint plan' }), stintPlan.notes.join(' · ')]]
        : []),
      [tr({ it: 'Moltiplicatore tempo', en: 'Time multiplier' }), tr({ it: `${profile.timeScale ?? 1}x`, en: `${profile.timeScale ?? 1}x` })],
      [tr({ it: 'Ora del giorno', en: 'Time of day' }), tr({ it: `${String(raceHour).padStart(2, '0')}:00${raceStartOv != null ? ' — orario di gara scelto a mano in Regole del weekend' : ''}`, en: `${String(raceHour).padStart(2, '0')}:00${raceStartOv != null ? ' — race time set by hand in Weekend rules' : ''}` })],
      [tr({ it: 'Meteo', en: 'Weather' }), card_weatherHint(round.weather)],
      [tr({ it: 'Partenza', en: 'Start' }), tr({ it: profile.start === 'rolling' ? 'lanciata' : 'da fermo (griglia)', en: profile.start === 'rolling' ? 'rolling' : 'standing (grid)' })],
      [tr({ it: 'Pit obbligatorio', en: 'Mandatory pit' }), tr({ it: profile.pitreq ? 'sì, almeno 1 sosta' : 'no', en: profile.pitreq ? 'yes, at least 1 stop' : 'no' })],
      [tr({ it: 'Danni', en: 'Damage' }), tr({ it: 'leggeri', en: 'light' })],
    ],
    warnings: buildWarnings(node, round, profile, diffShown, laps),
    gridRitual,
    weekendSeen,
    outlook: (() => {
      // report pre-gara: obiettivo pista (miglior giro personale su questo tracciato),
      // punti e posizione della stagione in corso, rivali già incontrati nella serie
      const prev = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season);
      const trackDisp = trackName(round.track);
      const lapTarget = state.stats?.bestLaps?.[trackDisp] ?? null;
      const o = rivalsOutlook(ladder, state, node.nodeId);
      const mastery = trackMastery(ladder, state, trackDisp);
      const standing = playerStanding(ladder, state, node);
      const contr = contractStatus(ladder, state);
      return {
        lapTarget,
        seasonPoints: prev.reduce((a, r) => a + (r.points ?? 0), 0),
        racesRun: prev.length,
        totalRounds: node.calendar.length,
        rivals: o.rivals.slice(0, 6),
        standingPosition: standing?.position ?? null,
        mastery: { level: mastery.level, name: mastery.name, races: mastery.races },
        crowd: raceCrowdFor(round.track),
        duel: (state.life?.duel && state.life.duel.season === state.season) ? { name: state.life.duel.name, gap: state.life.duel.gap } : null,
        contract: contr ? contr.rows.map((c) => ({ text: c.text, progress: c.progress, ok: c.ok, decided: c.decided })) : null,
        sponsor: sponsorFor(state) ? { name: sponsorFor(state).name, deadlineRound: sponsorFor(state).deadlineRound + 1, missionDone: !!sponsorFor(state).missionDone } : null,
      };
    })(),
    challenge: (() => {
      const c = challengeFor(ladder, state);
      return c ? { season: c.season, nodeId: c.nodeId, round: c.round, kind: c.kind, text: c.text, reward: c.reward, penalty: c.penalty, accepted: !!c.accepted, verdict: c.verdict } : null;
    })(),
  };
  if (fuoriParco) base.warnings.push(tr({
    it: `Auto fuori serie: «${chosenCarName}» non è nel parco ammesso (${parco.ammesse.slice(0, 5).join(', ')}) — in EVO scegli una di queste: un'auto fuori pool all'import vale 0 punti e 0 premio, comunque vada la gara.`,
    en: `Car flagged outside the series: «${chosenCarName}» is not in the allowed pool (${parco.ammesse.slice(0, 5).join(', ')}) — pick one of those in EVO: an outside-pool car scores 0 points and 0 prize at import, no matter how the race goes.`,
  }));
  return {
    ...base,
    distPct,
    baseLaps,
    laps,
    durationMin: aTempo ? Number(round.durationMin) : null,
    durationEff,
    prizeFull: node.econ.prize,
    prizeEff: nodeEff.econ.prize,
    // il flusso premi/rep della stagione usa il nodo col premio già scalato
    effectiveNode: nodeEff,
    // il piano per il copilota (prossima fetta: «Finestra box entro 2 giri»)
    stintPlan: aTempo ? stintPlan : null,
  };
}

/**
 * Consiglio auto per la serie: incrocia le auto ammesse con l'indice di prestazione
 * ufficiale del catalogo (cars.json del server dedicato). Più PI = auto più veloce.
 */
function carAdviceFor(node, carName) {
  let list = [];
  let pick = null;
  try {
    const catalog = loadCatalog(null);
    const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const byNorm = new Map(catalog.cars.map((c) => [norm(c.name), c]));
    const toksOf = (s) => [...String(s).toLowerCase().matchAll(/\d+|[a-z]{3,}/g)].map((m) => m[0]);
    const byTokens = new Map();
    for (const c of catalog.cars) byTokens.set(c.name, new Set(toksOf(c.name)));
    list = node.cars.map((id) => {
      const name = carName(id);
      let c = byNorm.get(norm(name));
      if (!c) {
        // fallback: il catalogo con più token in comune col nome richiesto (su nomi con spazi)
        const want = new Set(toksOf(name));
        let bestTok = null, bestScore = 0;
        for (const [cname, toks] of byTokens) {
          let score = 0;
          for (const t of want) if (toks.has(t)) score += 1;
          if (score > bestScore) { bestScore = score; bestTok = cname; }
        }
        if (bestTok && bestScore >= 2) c = catalog.cars.find((x) => x.name === bestTok);
      }
      return { id, display: name, pi: c?.pi ?? null, piLabel: c ? `PI ${c.pi.toFixed(1)}` : 'PI n/d' };
    }).sort((a, b) => (b.pi ?? -1) - (a.pi ?? -1));
    pick = list[0]?.id ?? null;
  } catch (e) {
    recordWarning('race.pi', 'stima PI delle rivali non disponibile (continuo senza): ' + (e?.message ?? ''));
  }
  return { list, pick };
}

function card_weatherHint(level) {
  // nome ESATTO dell'opzione nel menu Meteo di EVO (EVO_WEATHER in cima al file)
  const target = lang() === 'en' ? EVO_WEATHER_EN[Number(level)] ?? EVO_WEATHER[Number(level)] : EVO_WEATHER[Number(level)] ?? `meteo ${level}`;
  if (Number(level) >= 3) return tr({
    it: `${target} — gara TUTTA al bagnato: lascialo fisso per tutta la sessione (in EVO il meteo non evolve durante la gara)`,
    en: `${target} — the race is FULLY wet: keep it fixed for the whole session (in EVO weather does not evolve during the race)`,
  });
  return target;
}

/** Durata delle sessioni con ora d'inizio consigliata: piano orario REALISTICO
 *  (31/10) — le sessioni di un vero weekend non si accavallano sul mèro orario
 *  della gara: prove libere di mattina (gara −6h), qualifiche in prossimità del
 *  pomeriggio (−3h), warm-up un'ora prima (−1h). Con un orario scelto a mano
 *  (override) quello vince sul piano automatico. baseHour è l'ora di gara
 *  efficace (round > override raceStart, richiesta Mauro 28/10). */
function card_sessionHint(min, round, _profile, kind = 'P', overrideHour = null, baseHour = null) {
  const dur = `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const h = baseHour ?? round.hour ?? null;
  if (!h) return tr({ it: `${dur} in tempo reale`, en: `${dur} in real time` });
  let hh, mm, chosen = false;
  if (Number.isFinite(overrideHour)) {
    chosen = true;
    hh = String(((Math.round(overrideHour) % 24) + 24) % 24).padStart(2, '0');
    mm = '00';
  } else {
    // lo stesso piano di raceCard (stessi offset del gamemodesave): P −6h, Q −3h, W −1h
    const beforeMin = kind === 'Q' ? 180 : kind === 'W' ? 60 : 360;
    const start = Math.max(0, h - Math.round(beforeMin / 60)) * 60;
    hh = String(Math.floor(start / 60)).padStart(2, '0');
    mm = String(start % 60).padStart(2, '0');
  }
  return tr({
    it: `${dur} in tempo reale · alle ${hh}:${mm}${chosen ? " — come l'hai impostata tu" : ' (piano orario da vero weekend di gara)'}`,
    en: `${dur} real time · at ${hh}:${mm}${chosen ? " — as you set it" : ' (realistic race-weekend schedule)'}`,
  });
}

function buildWarnings(node, round, profile, diff, laps = null) {
  const out = [];
  if (profile.pitreq) out.push(tr({ it: 'La sosta obbligatoria non è imponibile via file: impostala tu nella schermata regole, altrimenti la gara resta valida ma senza pit.', en: 'The mandatory pit stop cannot be forced via file: set it yourself in the rules screen, otherwise the race stays valid but without a pit.' }));
  if (profile.start === 'rolling') out.push(tr({ it: "La partenza lanciata dipende dalla modalità scelta nel gioco: se non c'è, la griglia da fermo vale lo stesso.", en: 'The rolling start depends on the mode picked in the game: if it is missing, the standing grid works just the same.' }));
  if (diff.trim !== 0) out.push(tr({ it: `Difficoltà adattata di ${diff.trim > 0 ? '+' : ''}${diff.trim} rispetto al centro della serie ("difficulty" per i dettagli).`, en: `Difficulty adapted by ${diff.trim > 0 ? '+' : ''}${diff.trim} from the series center ("difficulty" for details).` }));
  if (isClosedNode(node)) out.push(tr({ it: 'Serie a parco chiuso: si corre solo per contratto ufficiale, niente affitto né acquisto del sedile — la vettura la mette a disposizione il team.', en: 'Closed-grid series: you can race only via an official contract, no rent or seat purchase — the team provides the car.' }));
  if (round.durationMin) out.push(tr({ it: `Ronda a tempo (${round.durationMin} minuti alla distanza piena): la durata della gara la scrive il Prepara tutto (in EVO controlla solo che la schermata gara dica quei minuti).`, en: `Timed round (${round.durationMin} minutes at full distance): the race duration is written by "Get ready" (in EVO just check the race screen shows those minutes).` }));
  if ((laps ?? round.laps) >= 15) out.push(tr({ it: 'Gara lunga: prepara gomme e benzina per la distanza, e valuta la sosta.', en: 'Long race: prepare tyres and fuel for the distance, and consider the pit stop.' }));
  return out;
}

/** Paga l'iscrizione della ronda corrente (una volta sola per ronda). */
export function chargeEntry(ladder, state, node) {
  // contratto di stagione garantito anche per la prima serie (createCareer non passa da enterNode)
  const contract = ensureContract(ladder, state, node);
  refreshContractTexts(ladder, state, node);
  if (contract) pushMessage(state, tr({ it: `Contratto ${node.display}: ${contract.clauses.map((c) => c.text).join('; ')}. Premio al rispetto: ${contract.payout} €`, en: `Contract ${node.display}: ${contract.clauses.map((c) => c.textEn ?? c.text).join('; ')}. Reward for compliance: ${contract.payout} €` }), 'info');
  // iscrizione canonica a prezzo pieno (24/10 notte) — ma il palinsesto
  // «senza vincoli» dei test rapidi (25/10) riporta l'iscrizione a zero:
  // i test non pagano, e cancellando data/senza-vincoli.json tutto torna.
  const fee = senzaVincoli() ? 0 : entryFee(node);
  const round = state.round;
  const already = (state.results[node.nodeId] ?? []).some((r) => r.season === state.season && r.round === round);
  if (already || fee === 0) return 0;
  const paidKey = `entry:${node.nodeId}:${state.season}:${round}`;
  state.paidEntries ??= {};
  if (state.paidEntries[paidKey]) return 0;
  if (state.money < fee) throw new Error(tr({ it: `Iscrizione non pagabile: servono ${fee}, hai ${state.money}.`, en: `Entry fee not payable: it needs ${fee}, you have ${state.money}.` }));
  state.money -= fee;
  state.paidEntries[paidKey] = true;
  recordFlows(state, [{ kind: 'entry', money: -fee, reason: `iscrizione ${node.display} R${round + 1}` }]);
  pushMessage(state, tr({ it: `Iscrizione ${node.display} round ${round + 1} (-${fee}).`, en: `Entry fee ${node.display} round ${round + 1} (-${fee}).` }), 'money');
  return fee;
}

/** Finestra dell'AVVIO AUTOMATICO (29/10, «appena esco da una gara, sul menu
 *  riparte la stessa gara»): l'app Cruscotto preme «Avvia sessione» da sola
 *  SOLO NEI 30 MINUTI che seguono «Prepara tutto» (comandoAuto in uiapp-pub
 *  legge lo stampio). Un pending dimenticato NON potrà mai riavviare una
 *  gara da solo: resta la card del pannello in gioco, che è il gesto a mano.
 *  Mezz'ora copre il caricamento del gioco e un avvio tranquillo; dopo, la
 *  ronda vive anche nel canale dell'auto (24 h) ma il VIA resta a mano. */
export const FINESTRA_AVVIA_MS = 30 * 60 * 1000;

export function markPending(_ladder, state, card) {
  state.pending = {
    node: card.node.nodeId,
    round: card.roundIndex,
    trackId: card.trackId,
    trackNames: [card.trackName, card.trackId],
    hour: card.round.hour,
    laps: card.laps ?? card.round.laps ?? null,
    car: card.car,
    gridSize: card.gridSize,
    startedAt: Date.now(),
    avviaFino: Date.now() + FINESTRA_AVVIA_MS,
  };
  return state.pending;
}

export async function launch(paths, { exeOnly = true } = {}) {
  return launchGame(paths, { exe: exeOnly });
}

export { difficultyFor, nodeById };

