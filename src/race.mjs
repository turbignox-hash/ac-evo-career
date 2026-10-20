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
import { contractStatus, challengeFor, trackMastery, sponsorFor, ensureContract } from './life.mjs';
import { raceCrowdFor } from './memories.mjs';
import { launchGame } from './paths.mjs';
import { loadCatalog } from './catalog.mjs';
import { rivalsOutlook } from './rivals.mjs';
import { recordFlows } from './flows.mjs';
import { recordWarning } from './warnings.mjs';

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
  const roundHour = Number.isFinite(Number(round.hour)) ? Number(round.hour) : null;
  if (Number.isFinite(Number(ov.timeScale))) profile.timeScale = Number(ov.timeScale);
  const practiceStartOv = Number.isFinite(Number(ov.practiceStart)) ? Number(ov.practiceStart) : null;
  const qualifyStartOv = Number.isFinite(Number(ov.qualifyStart)) ? Number(ov.qualifyStart) : null;
  const diff = difficultyFor(ladder, state, node, round.track);
  // in EVO la difficoltà AI si imposta come INTERVALLO min-max: il tool consiglia
  // una banda ±5 attorno al valore calcolato; l'utente può spostarla o restringerla
  const recMin = Math.max(0, Math.min(100, diff.slider - 5));
  const recMax = Math.max(0, Math.min(100, diff.slider + 5));
  const diffShown = {
    ...diff,
    rangeMin: sliderMinOv ?? recMin,
    rangeMax: sliderMaxOv ?? recMax,
    overridden: Number.isFinite(sliderMinOv) || Number.isFinite(sliderMaxOv),
  };
  const advice = carAdviceFor(node, (id) => ladder.contentNames?.cars?.[id] ?? id);
  const chosenCar = car ?? advice.pick ?? node.cars[0];
  const carName = (id) => ladder.contentNames?.cars?.[id] ?? id;
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
    carName: carName(chosenCar),
    carChoices: node.cars.map((id) => ({ id, display: carName(id) })),
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
      ['Modalità', 'Weekend di gara'],
      ['Pista', `${trackDisp} — layout ${layout}`],
      ['Auto', `${carName(chosenCar)}${node.cars.length > 1 ? ` (una delle auto della serie: ${node.cars.map(carName).join(', ')})` : ''}`],
      ['Avversari', `${node.gridSize - 1} auto`],
      ['Auto avversarie', node.cars.length > 1 ? `tutte della serie: ${node.cars.map(carName).join(', ')}` : `${carName(node.cars[0])} (serie monomarca)`],
      ['Difficoltà AI', `min ${diffShown.rangeMin}% · max ${diffShown.rangeMax}%${diffShown.overridden ? ' — scelto a mano' : ''}`],
      ['Aggressività AI', `${profile.aggr}% (in EVO è ancora bloccata: lasciala com'è)`],
      ['Prove libere', card_sessionHint(profile.practiceMin, round, profile, 'P', practiceStartOv)],
      ['Qualifiche', card_sessionHint(profile.qualifyMin, round, profile, 'Q', qualifyStartOv)],
      ['Gara', `${laps} giri${round.laps ? ' (tempo reale)' : ''}${distPct !== 100 ? ` — ${distPct}% della distanza piena (${baseLaps} giri)` : ''}`],
      ['Formato gara', round.durationMin
        ? `a TEMPO: ${distPct === 100 ? round.durationMin : Math.max(5, Math.round(round.durationMin * distPct / 100))} minuti (distanza piena ${round.durationMin}′) — in EVO scegli "Durata" invece dei giri`
        : `a GIRI: ${laps} giri${distPct !== 100 ? ` (${distPct}% di ${baseLaps})` : ''}`],
      ['Moltiplicatore tempo', `${profile.timeScale ?? 1}x${round.timeScale ? " — impostato dal piano orario del round" : " — lascialo a 1x: le raccomandazioni d'ora assumono il tempo reale"}`],
      ['Ora del giorno', `${String(round.hour).padStart(2, '0')}:00${round.timeScale && round.timeScale > 1 ? `, ${round.timeScale}x: la luce si muove durante la gara` : ' — il sole parte da qui e scende fino alla bandiera a scacchi (col moltiplicatore tempo accelera pure lui)'}`],
      ['Meteo', card_weatherHint(round.weather)],
      ['Partenza', profile.start === 'rolling' ? 'lanciata, se l\'opzione è disponibile' : 'da fermo (griglia)'],
      ['Pit obbligatorio', profile.pitreq ? 'sì, almeno 1 sosta' : 'no'],
      ['Danni', 'consigliato: leggeri (le serie storiche perdonano meno)'],
    ],
    warnings: buildWarnings(node, round, profile, diffShown, laps),
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
  const target = EVO_WEATHER[Number(level)] ?? `meteo ${level}`;
  if (Number(level) >= 3) return `${target} — gara TUTTA al bagnato: lascialo fisso per tutta la sessione (in EVO il meteo non evolve durante la gara)`;
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
  if (!h) return `${dur} in tempo reale`;
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
  const when = scale === 1 ? `alle ${hh}:${mm}` : `alle ${hh}:${mm} (tempo ${scale}x)`;
  return `${dur} in tempo reale · ${when}${chosen ? " — come l'hai impostata tu" : " per arrivare all'ora di gara"}`;
}

function buildWarnings(node, round, profile, diff, laps = null) {
  const out = [];
  if (profile.pitreq) out.push('La sosta obbligatoria non è imponibile via file: impostala tu nella schermata regole, altrimenti la gara resta valida ma senza pit.');
  if (profile.start === 'rolling') out.push('La partenza lanciata dipende dalla modalità scelta nel gioco: se non c\'è, la griglia da fermo vale lo stesso.');
  if (diff.trim !== 0) out.push(`Difficoltà adattata di ${diff.trim > 0 ? '+' : ''}${diff.trim} rispetto al centro della serie ("difficulty" per i dettagli).`);
  if (isClosedNode(node)) out.push('Serie a parco chiuso: si corre solo per contratto ufficiale, niente affitto né acquisto del sedile — la vettura la mette a disposizione il team.');
  if (round.durationMin) out.push(`Ronda a tempo (${round.durationMin} minuti alla distanza piena): in EVO imposta la DURATA della gara, non il numero di giri.`);
  if ((laps ?? round.laps) >= 15) out.push('Gara lunga: prepara gomme e benzina per la distanza, e valuta la sosta.');
  return out;
}

/** Paga l'iscrizione della ronda corrente (una volta sola per ronda). */
export function chargeEntry(ladder, state, node) {
  // contratto di stagione garantito anche per la prima serie (createCareer non passa da enterNode)
  const contract = ensureContract(ladder, state, node);
  if (contract) pushMessage(state, `Contratto ${node.display}: ${contract.clauses.map((c) => c.text).join('; ')}. Premio al rispetto: ${contract.payout} €`, 'info');
  const fee = entryFee(node);
  const round = state.round;
  const already = (state.results[node.nodeId] ?? []).some((r) => r.season === state.season && r.round === round);
  if (already || fee === 0) return 0;
  const paidKey = `entry:${node.nodeId}:${state.season}:${round}`;
  state.paidEntries ??= {};
  if (state.paidEntries[paidKey]) return 0;
  if (state.money < fee) throw new Error(`Iscrizione non pagabile: servono ${fee}, hai ${state.money}.`);
  state.money -= fee;
  state.paidEntries[paidKey] = true;
  recordFlows(state, [{ kind: 'entry', money: -fee, reason: `iscrizione ${node.display} R${round + 1}` }]);
  pushMessage(state, `Iscrizione ${node.display} round ${round + 1} (-${fee}).`, 'money');
  return fee;
}

export function markPending(ladder, state, card) {
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
