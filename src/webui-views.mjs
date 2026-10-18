// webui-views.mjs — le VISTE del server (gli oggetti JSON che la GUI consuma),
// estratte dal monolite webui.mjs nello stesso giorno del fix telemetria RX-7.
// Sono gli stessi dati che la CLI stampa: questo file sa leggere lo stato e
// costruire le schede, NON conosce http, switch API o watcher (quelli stanno
// in webui.mjs). Fanno mestieri qui:
//   viewHeader  identità pilota + serie/sedile in testa (usato da QUASI ogni risposta)
//   viewStatus  cruscotto: economia, difficoltà, risultati stagione
//   seriesNodeView  la scheda di una serie (usata da Messaggi/offerte)
//   viewCalendar / viewStandings / viewMessages  pagine interne
//   viewCard    la scheda gara: checklist + telemetria verace ("Consigli dal BOX")
//   viewDifficulty  le bande slider per OGNI serie (88–93 default, Coppa GT86 99–100)
//   viewSetup   installazione, contenuto visto, slot carriera, verifica ladder
// Le costanti di sessione e i lettori (appEnv/context) arrivano da webui-env.mjs:
// qui NESSUN import da webui.mjs, così il server non chiude un cerchio.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  nodeById, disciplineName, tierOf, gateStatus,
  standingsFor, playerStanding, difficultyFor, savePath, sponsorTier,
} from './state.mjs';
import { agendaDay, dateLabel, scheduledDay, racesOnDay, prossimoGiornoConGara } from './agenda.mjs';
import { raceCard } from './race.mjs';
import { mailbox } from './mailbox.mjs';
import { memoryRoundHint } from './memories.mjs';
import { tyreClassOf } from './setup.mjs';
import { carImageOf } from './cars.mjs';
import { listMotecSessions, collectSessions, racePressureAdvice } from './motec.mjs';
import { resolvePaths, STEAM_APP_ID } from './paths.mjs';
import { scanContentCached, validateLadder } from './content.mjs';
import { appEnv, context, DATA_DIR, SLOT, CONFIG_FILE } from './webui-env.mjs';

const money = (n) => Number(n ?? 0).toLocaleString('it-IT');
const trackName = (ladder, id) => ladder.contentNames?.tracks?.[id] ?? id;
const carName = (ladder, id) => ladder.contentNames?.cars?.[id] ?? id;

// CONTEGGIO ALLA PROSSIMA GARA: guarda i giorni PROSSIMI (da oggi+1) e prendi
// la prima gara di campionato iscritto; se è già in ritardo la prende tra quelle
// appare oggi. Serve all'header per il badge che avvisa PRIMA che la gara
// diventi "in ritardo" (non dopo, come la mail del direttore di corsa).
function nextRaceCountdown(ladder, state){
  const today = agendaDay(state);
  for (let d = today; d <= today + 30; d++) {
    const mine = racesOnDay(ladder, state, d).filter((g) => g.stato === 'iscritto');
    if (!mine.length) continue;
    const g = mine[0];
    return { day: d, in: d - today, late: d === today && (g.late ?? false), node: g.node?.display ?? g.display ?? '', track: g.track ?? '', round: (g.index ?? g.roundIndex ?? 0) + 1, dateLabel: dateLabel(d) };
  }
  return null;
}
export function viewHeader(ladder, state) {
  const node = nodeById(ladder, state.node);
  const standing = playerStanding(ladder, state, node);
  const sponsor = sponsorTier(state);
  const H = state.heritage ?? { completed: [] };
  const activeMem = state.heritage?.active ?? null;
  return {
    driver: state.driver,
    nation: state.driver?.nation ?? null,
    money: state.money,
    moneyText: money(state.money),
    rep: state.rep,
    sponsor: sponsor ? sponsor.name : null,
    heritage: { completed: (H.completed ?? []).length, activeDone: !!activeMem?.done },
    node: { id: node.nodeId, display: node.display, discipline: disciplineName(ladder, node.discipline), level: node.level, tier: tierOf(ladder, node.level) },
    position: standing?.position ?? null,
    gridSize: node.gridSize,
    round: Math.min(state.round, node.calendar.length),
    rounds: node.calendar.length,
    season: state.season,
    day: agendaDay(state),
    todayLabel: dateLabel(agendaDay(state)),
    // CONTEGGIO ALLA PROSSIMA GARA DI CAMPIONATO sempre nell'header: la mail
    // "in ritardo" arriva solo quando è TARDI — il badge invece avvisa PRIMA
    nextRace: nextRaceCountdown(ladder, state),
    titles: state.titles ?? [],
    pending: state.pending ?? null,
    difficultyMode: state.difficulty?.mode ?? 'adaptive',
    offers: state.offers ?? [],
  };
}
function viewStatus(ladder, state) {
  const node = nodeById(ladder, state.node);
  const track = node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track;
  const diff = difficultyFor(ladder, state, node, track);
  const results = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).sort((a, b) => a.round - b.round);
  return {
    header: viewHeader(ladder, state),
    econ: { model: node.econ.model, entry: node.econ.entry, prize: node.econ.prize, champion: node.econ.champion ?? null, rent: node.econ.rent },
    difficulty: { slider: diff.slider, total: Math.round(diff.total), trim: diff.trim, base: Math.round(diff.base ?? 0), offClass: diff.offClass, offTrack: diff.offTrack, locked: diff.locked },
    results: results.map((r) => ({
      round: r.round + 1, track: trackName(ladder, r.track),
      dnf: r.dnf, position: r.position, points: r.points, prize: r.prize, fl: r.fl,
    })),
    messages: (state.messages ?? []).slice(-12).reverse(),
  };
}

function seriesNodeView(ladder, state, node) {
  const gate = gateStatus(ladder, state, node);
  const req = node.requires ? `${nodeById(ladder, node.requires.nodeId).display} top ${node.requires.top}` : null;
  const ps = ladder.pointsSystems?.[node.points] ?? null;
  const prof = ladder.profiles?.[node.profile] ?? null;
  return {
    id: node.nodeId, display: node.display, level: node.level,
    gridSize: node.gridSize, points: node.points, econ: node.econ,
    access: node.access, cars: node.cars.map((c) => carName(ladder, c)),
    carImages: node.cars.map((c) => { const name = carName(ladder, c); return { name, image: carImageOf(name) ?? carImageOf(c) ?? null }; }),
    calendar: node.calendar.map((r) => ({ name: r.name, track: trackName(ladder, r.track), laps: r.laps, hour: r.hour, weather: ladder.weatherNames?.[String(r.weather)] ?? null })),
    format: prof ? [
      `prove ${prof.practiceMin ?? 0} min`, `qualifiche ${prof.qualifyMin ?? 0} min`,
      prof.start === 'grid' ? 'partenza da fermo (griglia)' : 'partenza lanciata',
      prof.wx === 'dynamic' ? 'meteo dinamico' : 'meteo fisso',
      prof.pitreq ? 'pit-stop obbligatorio' : 'niente pit obbligatorio',
      prof.timeScale > 1 ? `tempo ×${prof.timeScale}` : 'tempo reale',
    ] : [],
    ai: node.ai ?? [],
    pointsInfo: ps ? { table: ps.table, fl: ps.flPoint ?? 0, pole: ps.polePoint ?? 0, note: ps.note ?? null } : null,
    current: node.nodeId === state.node,
    done: (state.bestFinish?.[node.nodeId] != null) || (state.championships?.[node.nodeId] != null),
    bestFinish: state.bestFinish?.[node.nodeId] ?? null,
    champSeasons: state.championships?.[node.nodeId] ?? [],
    repRequired: node.repRequired ?? 0, rep: state.rep ?? 0,
    open: gate.ok, reasons: gate.reasons ?? [], requires: req,
  };
}

function viewCalendar(ladder, state) {
  const node = nodeById(ladder, state.node);
  const played = new Set((state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).map((r) => r.round));
  return {
    node: node.display, season: state.season,
    rounds: node.calendar.map((round, i) => ({
      index: i, name: round.name, track: trackName(ladder, round.track),
      laps: round.laps, durationMin: round.durationMin ?? null, hour: round.hour, weather: ladder.weatherNames[String(round.weather)],
      played: played.has(i), current: i === state.round,
    })),
  };
}

function viewStandings(ladder, state) {
  const node = nodeById(ladder, state.node);
  const table = standingsFor(ladder, state, node);
  return {
    node: node.display, season: state.season,
    rows: table.map((row) => ({
      position: row.position, name: row.name, points: row.points, country: row.country,
      isPlayer: !!row.isPlayer, iconic: !!row.iconic, hot: !!row.hot,
    })),
  };
}

function viewMessages(ladder, state) {
  return {
    mailbox: mailbox(ladder, state),
    messages: (state.messages ?? []).slice(-20).reverse(),
    offers: (state.offers ?? []).map((o) => {
      // ogni offerta porta con se la scheda completa della serie: si apre dal Messaggi
      const detail = (() => { try { return seriesNodeView(ladder, state, nodeById(ladder, o.nodeId)); } catch { return null; } })();
      return { ...o, discipline: disciplineName(ladder, o.discipline), detail };
    }),
  };
}

function viewCard(ladder, state, car = null) {
  const card = raceCard(ladder, state, { car });
  // la data della gara sul calendario continuo: il giorno in cui la prossima ronda
  // della serie cade (o è già matura). Il cruscotto la mostra accanto a "R x di y".
  const schedDay = (() => { try { return scheduledDay(ladder, state, card.node); } catch { return null; } })();
  return {
    agendaDay: schedDay,
    agendaDayLabel: schedDay != null ? dateLabel(schedDay) : null,
    nodeDisplay: card.node.display,
    roundIndex: card.roundIndex,
    totalRounds: card.totalRounds,
    roundName: card.round.name,
    round: card.round,
    car: card.car,
    carName: card.carName,
    carChoices: card.carChoices,
    opponentCars: card.opponentCars,
    trackName: card.trackName,
    weather: card.weather,
    gridSize: card.gridSize,
    opponents: card.opponents,
    difficulty: {
      slider: card.difficulty.slider, total: Math.round(card.difficulty.total), trim: card.difficulty.trim,
      rangeMin: card.difficulty.rangeMin, rangeMax: card.difficulty.rangeMax, overridden: !!card.difficulty.overridden,
    },
    aggression: card.profile.aggr,
    aggressionLocked: true,
    timeMultiplier: card.timeMultiplier ?? 1,
    distPct: card.distPct ?? 100,
    baseLaps: card.baseLaps ?? null,
    laps: card.laps ?? null,
    prizeFull: card.prizeFull ?? null,
    prizeEff: card.prizeEff ?? null,
    practiceStart: card.practiceStart,
    qualifyStart: card.qualifyStart,
    settings: card.settings,
    warnings: card.warnings,
    carAdvice: card.carAdvice,
    outlook: card.outlook,
    challenge: card.challenge ?? null,
    pendingNudge: state.pendingNudge ?? null,
    // il "Suggerimento in attesa" del trim adattivo (pagina Difficoltà) proposto anche qui
    pendingProposal: state.difficulty?.pending ?? null,
    heritageActive: (() => {
      const mem = state.heritage?.active;
      if (!mem || mem.done) return null;
      const isRound = mem.nodeId === card.node.nodeId && (mem.rounds ?? []).includes(card.round?.track);
      if (!isRound) return null;
      return { title: mem.title, ancestor: mem.ancestor, relation: mem.relation, era: mem.era, objective: mem.objective?.text ?? '', done: mem.progress?.length ?? 0, total: (mem.tracksDisplay ?? mem.rounds ?? []).length, inherit: mem.inherit };
    })(),
    heritageHint: memoryRoundHint(ladder, state),
    entryFee: card.node.econ.entry,
    seasonDone: state.round >= card.node.calendar.length,
    tyre: null,
    boxRadio: null,
    ...(() => {
      // telemetria reale (pressioni gara + benzina) e "Consigli dal BOX": un solo
      // blocco perche' il radio dell'ingegnere usa gli stessi dati delle gomme
      const tyre = tyreClassOf(card.carName);
      if (!tyre) return {};
      let race = { ok: false };
      let fuel = null;
      let telemEmpty = false;
      let wrongTrack = false;
      let wrongTrackName = null;
      try {
        const p = resolvePaths(appEnv());
        const root = p.dataDirs?.[0] ? join(p.dataDirs[0], 'MoTec') : join(p.dataDirs?.[1] ?? '', 'MoTec');
        const resultsDir = p.resultsDirs?.[0] ?? join(root, '..', 'Results');
        let sessions = collectSessions(root, resultsDir, { car: card.carName, track: card.trackName, limit: 8 });
        // FALLBACK MAI PIU' SILENZIOSO: se il round ha una pista nota e non esiste
        // telemetria SU QUELLA pista, non prendiamo le sessioni recenti dell'auto —
        // subito dopo una gara sarebbero proprio la gara appena corsa (pista diversa):
        // pressioni e consumi cambiano da pista a pista e fuorviano. Il fallback
        // auto-only resta solo per i round senza pista nota (primissima partenza).
        if (!sessions.length && !card.trackName) sessions = collectSessions(root, resultsDir, { car: card.carName, limit: 8 });
        // EVO a volte scrive il file MoTeC SENZA i dati (solo intestazione: capita in
        // alcune sessioni, es. time attack, o chiudendo il gioco di colpo): lo segnaliamo
        // invece di lasciare il box muto sulla pressione
        if (sessions.length) {
          telemEmpty = false;
        } else if (card.trackName) {
          wrongTrack = true; // niente telemetria utilizzabile su QUESTA pista
          wrongTrackName = listMotecSessions(root, { car: card.carName })[0]?.track ?? null;
        } else {
          telemEmpty = listMotecSessions(root, { car: card.carName }).length > 0;
        }
        const raceLaps = card.round?.laps ?? card.baseLaps ?? 10;
        if (sessions.length) race = racePressureAdvice(sessions, { target: tyre.target, raceLaps });
        const fuels = sessions.map((s) => s.fuelPerLap).filter((v) => Number.isFinite(v) && v > 0 && v < 20);
        if (fuels.length) {
          const avg = fuels.reduce((a, b) => a + b, 0) / fuels.length;
          fuel = { perLap: Math.round(avg * 100) / 100, need: Math.ceil(avg * raceLaps + 1), laps: raceLaps };
        }
      } catch { /* senza telemetria si degrada al consiglio base */ }

      // la scheda radio dell'ingegnere, derivata dai dati della ronda
      const tips = [];
      const laps = card.round?.laps ?? null;
      const profile = card.profile ?? {};
      const pitKmh = profile.pitkmh ?? 60;
      if (profile.pitreq) {
        tips.push({ icon: '🔧', title: 'Pit-stop obbligatorio', text: laps
          ? `almeno 1 sosta: scendi tra il giro ${Math.max(2, Math.ceil(laps / 2) - 2)} e il giro ${Math.min(laps - 1, Math.ceil(laps / 2) + 2)} (finestra sicura) — limite box ${pitKmh} km/h, controlla la riga gomme`
          : `almeno 1 sosta — limite box ${pitKmh} km/h` });
      } else if (laps != null && laps >= 12) {
        tips.push({ icon: '⛽', title: 'Sosta consigliata', text: `gara di ${laps} giri senza pit obbligatorio: se la benzina non arriva${fuel ? ` (${fuel.need} L stimati)` : ''} o le gomme cedono dopo metà gara, la sosta a metà è quasi sempre vincente` });
      } else if (laps != null) {
        tips.push({ icon: '🚫', title: 'Niente sosta', text: `gara di ${laps} giri: benzina e gomme arrivano in fondo — il pit ti costa troppo tempo, evitalo a meno di danni` });
      }
      const wx = card.weather ?? '';
      const wet = /rain/i.test(wx);
      // pressione gomme ideale: il numero dell'ingegnere, con le correzioni di contesto
      if (race?.ok && race.raceStartPsi != null) {
        let psi = race.raceStartPsi;
        const notes = [];
        if (wet) { psi = Math.round((psi + 0.4) * 10) / 10; notes.push('+0.4 per il bagnato (la gomma lavora più fredda)'); }
        if (profile.pitreq && laps) { notes.push('dopo il pit: azzeri il bring-in, la gomma nuova riparte ~1 PSI sotto il target'); }
        if ((card.round?.hour ?? 12) >= 17) { notes.push('a sera la pista si raffredda: se dopo 5 giri sei sotto target, apri 0.2'); }
        tips.push({ icon: '🛞', title: `Pressione gomme ideale: ${psi} PSI`, text: `partenza da freddo per la gara di ${laps ?? '?'} giri (target a caldo ${tyre.target} PSI${notes.length ? ' · ' + notes.join(' · ') : ''})` });
      } else {
        // senza telemetria usabile: stima dalla classe gomme con la regola dei 4 PSI
        // (la gomma in stint sano sale di 3–5 PSI: parti ~4 sotto il target a caldo)
        const est = Math.round((tyre.target - 4 + (wet ? 0.4 : 0)) * 10) / 10;
        tips.push({ icon: '🛞', title: `Pressione gomme ideale: ~${est} PSI (stima)`, text: `nessun dato telemetrico ancora: regola dei 4 PSI — parti ~4 sotto il target (${tyre.target} a caldo${wet ? ' · +0.4 per il bagnato' : ''}) e correggi alla prossima uscita` });
      }
      if (telemEmpty) {
        tips.push({ icon: '📭', title: 'Telemetria di questa auto vuota', text: 'EVO non ha scritto i dati nel file MoTeC (capita in alcune sessioni, es. time attack, o chiudendo il gioco di colpo): rifai un paio di giri in prova e i consigli torneranno calcolati sui tuoi dati veri' });
      }
      if (wrongTrack) {
        tips.push({ icon: '📭', title: `Nessuna telemetria su ${card.trackName}`, text: wrongTrackName
          ? `l'ultima telemetria di questa auto è da ${wrongTrackName}: non la usiamo per questa gara perché pressioni e consumi cambiano da pista a pista — fai qualche giro in prova e i consigli torneranno calcolati sui tuoi dati veri`
          : 'non hai ancora girato su questa pista con questa auto: fai qualche giro in prova e i consigli torneranno calcolati sui tuoi dati veri' });
      }
      if (wet) {
        tips.push({ icon: '🌧️', title: 'Bagnato fisso', text: `gara TUTTA in pioggia (${wx.replace(/^.*_/, '')}): accelera dolce in trazione e anticipa la frenata di 10–15 m` });
      }
      if ((card.round?.hour ?? 12) >= 17) {
        tips.push({ icon: '🌆', title: 'Gara serale', text: `partenza alle ${String(card.round.hour).padStart(2, '0')}:00: la pista si raffredda col passare dei giri — la pressione scende, non strafare con la partenza` });
      }
      if (fuel?.need != null) {
        tips.push({ icon: '⛽', title: 'Benzina', text: `${fuel.need} litri per ${fuel.laps} giri (consumo medio ${fuel.perLap} L/giro dalla telemetria) + 1 di riserva` });
      }
      return { tyre: { classLabel: tyre.label, target: tyre.target, race, fuel }, boxRadio: { tips } };
    })(),
  };
}function viewDifficulty(ladder, state) {
  // range reale dello slider AI di Assetto Corsa EVO: 0..100% (corretto dal pilota in gioco).
  // La mappatura della scala interna resta nel ladder.
  const sliderRange = { min: 0, max: 100 };
  const rows = [];
  for (const node of ladder.nodes.sort((a, b) => a.level - b.level)) {
    const track = node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track;
    const d = difficultyFor(ladder, state, node, track);
    // intervallo EVO della serie: override manuale (state.raceSettings) oppure ±5 sul valore calcolato
    const ov = state.raceSettings?.[node.nodeId] ?? {};
    const oMin = Number.isFinite(Number(ov.sliderMin)) ? Number(ov.sliderMin) : null;
    const oMax = Number.isFinite(Number(ov.sliderMax)) ? Number(ov.sliderMax) : null;
    rows.push({
      id: node.nodeId, display: node.display, discipline: disciplineName(ladder, node.discipline),
      current: node.nodeId === state.node,
      base: Math.round(d.base ?? 0), trim: d.trim, offClass: d.offClass, offTrack: d.offTrack,
      total: Math.round(d.total), slider: d.slider, locked: !!d.locked,
      rangeMin: oMin ?? Math.max(0, d.slider - 5),
      rangeMax: oMax ?? Math.min(100, d.slider + 5),
      overridden: oMin != null || oMax != null,
    });
  }
  return {
    mode: state.difficulty?.mode ?? 'adaptive',
    internalRange: { min: 70, max: 120 },
    trimRange: { min: -20, max: 20 },
    sliderRange,
    rows,
    pending: state.difficulty?.pending ?? null,
    pendingDisplay: state.difficulty?.pending ? nodeById(ladder, state.difficulty.pending.nodeId).display : null,
  };
}

function viewSetup(ladder) {
  const { ladder: _l, paths } = context();
  // cache TTL 30s: scanContent cammina l'intera installazione EVO — /api/boot
  // veniva riscritto riga per riga ad ogni caricamento pagina (cache in content.mjs)
  const content = scanContentCached(paths);
  const issues = validateLadder(ladder, content);
  // gli slot carriera (1..3): quale esiste, chi lo usa, quello attivo di questa sessione
  const slots = [1, 2, 3].map((s) => {
    const file = join(DATA_DIR, savePath(s));
    let pilota = null, gare = 0;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      pilota = raw?.driver?.name ?? null;
      gare = Object.values(raw?.results ?? {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    } catch { /* slot vuoto o corrotto: non è un errore qui */ }
    return { slot: s, file: savePath(s), exists: existsSync(file), pilota, gare, active: s === SLOT };
  });
  return {
    dataDirs: paths.dataDirs,
    resultsDirs: paths.resultsDirs,
    logsDirs: paths.logsDirs,
    gameExe: paths.gameExe,
    slots,
    saved: existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {},
    content: { cars: content.cars.size, tracks: content.tracks.size },
    ladder: { nodes: ladder.nodes.length, disciplines: ladder.disciplines.length },
    issues: issues.map((i) => ({ node: i.node, kind: i.kind, id: i.id, display: i.display })),
    steamUrl: `steam://rungameid/${STEAM_APP_ID}`,
  };

}

export { viewStatus, seriesNodeView, viewCalendar, viewStandings, viewMessages, viewCard, viewDifficulty, viewSetup };
