// race.mjs — la scheda gara: cosa impostare nel gioco, con che difficolta', e il lancio.
//
// Assetto Corsa EVO non accetta argomenti da riga di comando e non legge un file di sessione
// scritto da fuori: la gara si prepara nella sua interfaccia. Quindi l'app fa le due cose che
// restano possibili e utili:
//   1. decide tutto (auto, pista, giri, ora, meteo, avversari, difficolta' AI) e te lo mostra
//      come lista da seguire: due click e sei in pista;
//   2. apre il gioco per te.
// Il resto, cioe' la lettura del risultato, e' automatico: lo fa il file nativo del gioco.

import { difficultyFor, entryFee, pushMessage, nodeById, playerStanding, isClosedNode } from './state.mjs';
import { rebuildGridApply } from './grid-apply.mjs';
import { contractStatus, challengeFor, trackMastery, sponsorFor, ensureContract, refreshContractTexts } from './life.mjs';
import { raceCrowdFor } from './memories.mjs';
import { launchGame } from './paths.mjs';
import { loadCatalog } from './catalog.mjs';
import { rivalsOutlook } from './rivals.mjs';
import { recordFlows } from './flows.mjs';
import { recordWarning } from './warnings.mjs';
import { tr, lang } from './lang.mjs';
import { carPoolOf } from './car-pool.mjs';

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

export function raceCard(ladder, state, { car = null } = {}) {
  const { node, roundIndex, round } = nextRound(ladder, state);
  const profile = { ...(ladder.profiles[node.profile] ?? {}) };
  // override manuali per questa serie (intervallo slider AI, orari, moltiplicatore tempo,
  // distanza gara in %). L'aggressività AI in EVO è ancora bloccata (grigia): solo consiglio.
  const ov = state.raceSettings?.[node.nodeId] ?? {};
  const distPct = [25, 50, 75, 100].includes(Number(ov.distPct)) ? Number(ov.distPct) : 100;
  const baseLaps = Math.max(1, Number(round.laps) || 8);
  const laps = Math.max(2, Math.round(baseLaps * distPct / 100));
  // i premi scalano con la distanza scelta (25% → un quarto del premio pieno)
  const prizeFactor = distPct / 100;
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
  // ora d'inizio effettiva delle sessioni: override manuale, altrimenti il calcolo a ritroso
  const scale = Math.max(1, profile.timeScale ?? 1);
  const backFrom = (minsBefore) => round.hour != null
    ? Math.floor((((round.hour * 60 - scale * minsBefore) % 1440) + 1440) % 1440 / 60)
    : 12;
  const practiceStart = practiceStartOv ?? backFrom(profile.practiceMin + 5 + profile.qualifyMin + 15);
  const qualifyStart = qualifyStartOv ?? backFrom(profile.qualifyMin + 15);

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
    opponentCars: node.cars.map(carName),
    trackId: round.track,
    trackName: trackName(round.track),
    weather: ladder.weatherNames[String(round.weather)] ?? `meteo ${round.weather}`,
    gridSize: node.gridSize,
    opponents: node.gridSize - 1,
    profile,
    difficulty: diffShown,
    difficultyBase: diff,
    timeMultiplier: profile.timeScale ?? 1,
    practiceStart,
    qualifyStart,
    carAdvice: advice.list,
    settings: [
      [tr({ it: 'Modalità', en: 'Mode' }), tr({ it: 'Weekend di gara', en: 'Race weekend' })],
      [tr({ it: 'Pista', en: 'Track' }), tr({ it: `${trackDisp} — layout ${layout}`, en: `${trackDisp} — layout ${layout}` })],
      [tr({ it: 'Auto', en: 'Car' }), tr({ it: `${chosenCarName}${node.cars.length > 1 ? ` (un'auto ammessa della serie: ${parco.ammesse.slice(0, 6).join(', ')})` : ` (serie monomarca: ${chosenCarName})`}`, en: `${chosenCarName}${node.cars.length > 1 ? ` (one of the series' pool cars: ${parco.ammesse.slice(0, 6).join(', ')})` : ` (one-make series: ${chosenCarName})`}` })],
      [tr({ it: 'Avversari', en: 'Opponents' }), tr({ it: `${node.gridSize - 1} auto`, en: `${node.gridSize - 1} cars` })],
      [tr({ it: 'Auto avversarie', en: 'Opponent cars' }), tr({ it: node.cars.length > 1 ? `tutte della serie: ${node.cars.map(carName).join(', ')}` : `${carName(node.cars[0])} (serie monomarca)`, en: node.cars.length > 1 ? `all from the series: ${node.cars.map(carName).join(', ')}` : `${carName(node.cars[0])} (one-make series)` })],
      [tr({ it: 'Difficoltà AI', en: 'AI difficulty' }), tr({ it: `min ${diffShown.rangeMin}% · max ${diffShown.rangeMax}%${diffShown.overridden ? ' — scelto a mano' : ''}`, en: `min ${diffShown.rangeMin}% · max ${diffShown.rangeMax}%${diffShown.overridden ? ' — set by hand' : ''}` })],
      [tr({ it: 'Aggressività AI', en: 'AI aggression' }), tr({ it: `${profile.aggr}% (in EVO è ancora bloccata: lasciala com'è)`, en: `${profile.aggr}% (still locked in EVO: leave it as is)` })],
      [tr({ it: 'Prove libere', en: 'Practice' }), card_sessionHint(profile.practiceMin, round, profile, 'P', practiceStartOv)],
      [tr({ it: 'Qualifiche', en: 'Qualifying' }), card_sessionHint(profile.qualifyMin, round, profile, 'Q', qualifyStartOv)],
      [tr({ it: 'Gara', en: 'Race' }), tr({ it: `${laps} giri${round.laps ? ' (tempo reale)' : ''}${distPct !== 100 ? ` — ${distPct}% della distanza piena (${baseLaps} giri)` : ''}`, en: `${laps} laps${round.laps ? ' (real time)' : ''}${distPct !== 100 ? ` — ${distPct}% of the full distance (${baseLaps} laps)` : ''}` })],
      [tr({ it: 'Formato gara', en: 'Race format' }), round.durationMin
        ? tr({ it: `a TEMPO: ${distPct === 100 ? round.durationMin : Math.max(5, Math.round(round.durationMin * distPct / 100))} minuti (distanza piena ${round.durationMin}′) — in EVO scegli "Durata" invece dei giri`, en: `BY TIME: ${distPct === 100 ? round.durationMin : Math.max(5, Math.round(round.durationMin * distPct / 100))} minutes (full distance ${round.durationMin}′) — in EVO pick "Duration" instead of laps` })
        : tr({ it: `a GIRI: ${laps} giri${distPct !== 100 ? ` (${distPct}% di ${baseLaps})` : ''}`, en: `BY LAPS: ${laps} laps${distPct !== 100 ? ` (${distPct}% of ${baseLaps})` : ''}` })],
      [tr({ it: 'Moltiplicatore tempo', en: 'Time multiplier' }), tr({ it: `${profile.timeScale ?? 1}x${round.timeScale ? " — impostato dal piano orario del round" : " — lascialo a 1x: le raccomandazioni d'ora assumono il tempo reale"}`, en: `${profile.timeScale ?? 1}x${round.timeScale ? " — set by the round's time plan" : " — keep it at 1x: the time recommendations assume real time"}` })],
      [tr({ it: 'Ora del giorno', en: 'Time of day' }), tr({ it: `${String(round.hour).padStart(2, '0')}:00${round.timeScale && round.timeScale > 1 ? `, ${round.timeScale}x: la luce si muove durante la gara` : ' — il sole parte da qui e scende fino alla bandiera a scacchi (col moltiplicatore tempo accelera pure lui)'}`, en: `${String(round.hour).padStart(2, '0')}:00${round.timeScale && round.timeScale > 1 ? `, ${round.timeScale}x: light moves during the race` : ' — the sun starts here and sinks to the checkered flag (it speeds up with the time multiplier too)'}` })],
      [tr({ it: 'Meteo', en: 'Weather' }), card_weatherHint(round.weather)],
      [tr({ it: 'Partenza', en: 'Start' }), tr({ it: profile.start === 'rolling' ? 'lanciata, se l\'opzione è disponibile' : 'da fermo (griglia)', en: profile.start === 'rolling' ? 'rolling, if the option is available' : 'standing (grid)' })],
      [tr({ it: 'Pit obbligatorio', en: 'Mandatory pit' }), tr({ it: profile.pitreq ? 'sì, almeno 1 sosta' : 'no', en: profile.pitreq ? 'yes, at least 1 stop' : 'no' })],
      [tr({ it: 'Danni', en: 'Damage' }), tr({ it: 'consigliato: leggeri (le serie storiche perdonano meno)', en: 'recommended: light (history series forgive less)' })],
    ],
    warnings: buildWarnings(node, round, profile, diffShown, laps),
    gridRitual,
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
    prizeFull: node.econ.prize,
    prizeEff: nodeEff.econ.prize,
    // il flusso premi/rep della stagione usa il nodo col premio già scalato
    effectiveNode: nodeEff,
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

/** Durata delle sessioni con ora d'inizio consigliata: nel gioco le ore scorrono in tempo reale
 *  (o più in fretta col moltiplicatore), quindi la sessione va posizionata a ritroso rispetto
 *  all'ora di gara per trovarci all'orario. La stima include pause brevi fra le sessioni.
 *  Con un orario scelto a mano (override) quello vince sul calcolo automatico. */
function card_sessionHint(min, round, profile, kind = 'P', overrideHour = null) {
  const scale = Math.max(1, profile.timeScale ?? 1);
  const dur = `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const h = round.hour ?? null;
  if (!h) return tr({ it: `${dur} in tempo reale`, en: `${dur} in real time` });
  let hh, mm, chosen = false;
  if (Number.isFinite(overrideHour)) {
    chosen = true;
    hh = String(((Math.round(overrideHour) % 24) + 24) % 24).padStart(2, '0');
    mm = '00';
  } else {
    // minuti reali che separano l'inizio sessione dalla partenza della gara
    const realBefore = kind === 'Q'
      ? profile.qualifyMin + 15
      : profile.practiceMin + 5 + profile.qualifyMin + 15;
    const start = Math.round(((h * 60 - scale * realBefore) % 1440 + 1440) % 1440);
    hh = String(Math.floor(start / 60)).padStart(2, '0');
    mm = String(start % 60).padStart(2, '0');
  }
  const when = scale === 1
    ? tr({ it: `alle ${hh}:${mm}`, en: `at ${hh}:${mm}` })
    : tr({ it: `alle ${hh}:${mm} (tempo ${scale}x)`, en: `at ${hh}:${mm} (time ${scale}x)` });
  return tr({
    it: `${dur} in tempo reale · ${when}${chosen ? " — come l'hai impostata tu" : " per arrivare all'ora di gara"}`,
    en: `${dur} real time · ${when}${chosen ? " — as you set it" : " so you reach the race hour"}`,
  });
}

function buildWarnings(node, round, profile, diff, laps = null) {
  const out = [];
  if (profile.pitreq) out.push(tr({ it: 'La sosta obbligatoria non è imponibile via file: impostala tu nella schermata regole, altrimenti la gara resta valida ma senza pit.', en: 'The mandatory pit stop cannot be forced via file: set it yourself in the rules screen, otherwise the race stays valid but without a pit.' }));
  if (profile.start === 'rolling') out.push(tr({ it: "La partenza lanciata dipende dalla modalità scelta nel gioco: se non c'è, la griglia da fermo vale lo stesso.", en: 'The rolling start depends on the mode picked in the game: if it is missing, the standing grid works just the same.' }));
  if (diff.trim !== 0) out.push(tr({ it: `Difficoltà adattata di ${diff.trim > 0 ? '+' : ''}${diff.trim} rispetto al centro della serie ("difficulty" per i dettagli).`, en: `Difficulty adapted by ${diff.trim > 0 ? '+' : ''}${diff.trim} from the series center ("difficulty" for details).` }));
  if (isClosedNode(node)) out.push(tr({ it: 'Serie a parco chiuso: si corre solo per contratto ufficiale, niente affitto né acquisto del sedile — la vettura la mette a disposizione il team.', en: 'Closed-grid series: you can race only via an official contract, no rent or seat purchase — the team provides the car.' }));
  if (round.durationMin) out.push(tr({ it: `Ronda a tempo (${round.durationMin} minuti alla distanza piena): in EVO imposta la DURATA della gara, non il numero di giri.`, en: `Timed round (${round.durationMin} minutes at full distance): in EVO set the race DURATION, not the number of laps.` }));
  if ((laps ?? round.laps) >= 15) out.push(tr({ it: 'Gara lunga: prepara gomme e benzina per la distanza, e valuta la sosta.', en: 'Long race: prepare tyres and fuel for the distance, and consider the pit stop.' }));
  return out;
}

/** Paga l'iscrizione della ronda corrente (una volta sola per ronda). */
export function chargeEntry(ladder, state, node) {
  // contratto di stagione garantito anche per la prima serie (createCareer non passa da enterNode)
  const contract = ensureContract(ladder, state, node);
  refreshContractTexts(ladder, state, node);
  if (contract) pushMessage(state, tr({ it: `Contratto ${node.display}: ${contract.clauses.map((c) => c.text).join('; ')}. Premio al rispetto: ${contract.payout} €`, en: `Contract ${node.display}: ${contract.clauses.map((c) => c.textEn ?? c.text).join('; ')}. Reward for compliance: ${contract.payout} €` }), 'info');
  // iscrizione tornata canonica (24/10 notte, Mauro: «reintroduci i soldi e la
  // reputazione per i campionati») — la modalità «senza vincoli» apre solo
  // quello che decide gateStatus (piazzamenti), niente più iscrizioni gratis
  const fee = entryFee(node);
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

export function markPending(_ladder, state, card) {
  state.pending = {
    node: card.node.nodeId,
    round: card.roundIndex,
    trackId: card.trackId,
    trackNames: [card.trackName, card.trackId],
    hour: card.round.hour,
    laps: card.laps ?? card.round.laps,
    car: card.car,
    gridSize: card.gridSize,
    startedAt: Date.now(),
  };
  return state.pending;
}

export async function launch(paths, { exeOnly = true } = {}) {
  return launchGame(paths, { exe: exeOnly });
}

export { difficultyFor, nodeById };

