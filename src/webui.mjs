// webui.mjs — l'interfaccia grafica della carriera: un piccolo server locale
// (nessuna dipendenza) che serve gui/index.html e parla con lo stesso motore della CLI.
//
//   node src/webui.mjs [--port 8642] [--open]
//
// Il browser si apre su http://127.0.0.1:<porta> — tutto resta sul tuo PC.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, extname, basename, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths, isGameRunning, STEAM_APP_ID, GAME_EXE } from './paths.mjs';
import { scanContent, validateLadder } from './content.mjs';
import {
  createCareer, loadState, saveState, nodeById, disciplineName, tierOf, gateStatus,
  standingsFor, playerStanding, difficultyFor, seasonEnd,
  acceptOffer, pushMessage, sponsorTier, enterNode, renameDriver, careerStats,
  savePath, activeSlot,
} from './state.mjs';
import { paddock, ourToSkill, OUR_MIN, OUR_MAX } from './world.mjs';
import { loadCatalog, resultDetail } from './catalog.mjs';
import { liveReader, fmtMs } from './shmem.mjs';
import { raceCard, markPending, chargeEntry, launch } from './race.mjs';
import {
  listResultFiles, readSessionResult, isRaceSession, describeResult, findPlayerDriver, classify,
} from './results.mjs';
import { rivalsOverview, rivalDetail } from './rivals.mjs';
import { runImport, alreadyImportedHash, importedFiles, importLog, resetImportRegistry } from './import.mjs';
import { checkIntegrity, fixIntegrity } from './integrity.mjs';
import { maybeSpawnEvent, acceptEvent, declineEvent, finishEvent, eventCard, eventsOverview, expireEvents, ensureEvents } from './events.mjs';
import { seasonReview, reviewableSeasons, exportReview } from './review.mjs';
import { contractStatus, sponsorOffers, acceptSponsor, declineSponsor, challengeFor, acceptChallenge, sigilDefs, careerPlanner, ensureLife, sponsorFor, ensureContract, checkSigils } from './life.mjs';
import { newsFeed } from './gazzetta.mjs';
import { recordTestDay, testDayLog, calibrationSummary } from './testday.mjs';
import { recordWarning, readWarnings } from './warnings.mjs';
import { fourPsi, setupBoard, setSetupNote, tyreClassOf, telemetryLapsFor, TYRE_CLASSES } from './setup.mjs';
import { listMotecSessions, analyzeLd, presetOf, collectSessions, pressureAdvice, racePressureAdvice, logPressureAdvice, readPressureLog, kindIt, telemDiagnostics } from './motec.mjs';
import { trackBook, nextTrackOf } from './tracks.mjs';
import { carsBook, carImageOf } from './cars.mjs';
import { garageOverview, catalogPicker, addCar, removeCar, setNote, importShowcase, sellCar } from './garage.mjs';
import { ensureFlowsSeeded, recentFlows, resetFlows } from './flows.mjs';
import { mailbox } from './mailbox.mjs';
import {
  agendaDay, gareDelGiorno, prossimoGiornoConGara, avanzaGiorno, elencoCompleto,
  racesOnDay, calendarStrip, dateLabel, MAX_SCELTE_PER_GIORNO, CADENZA_GIORNI,
  choicesForDay, canChoose, recordChoice, impegni, shiftSeat,
  scheduledDay, nextUnplayedRound, hasSeat,
} from './agenda.mjs';
import { heritageOverview, claimMemory, memoryRoundHint } from './memories.mjs';
import { resetNews } from './gazzetta.mjs';
import { midSeasonPulse } from './world.mjs';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT = dirname(HERE);
const LADDER_FILE = join(PROJECT, 'career.evo.ladder.json');
const DATA_DIR = join(PROJECT, 'data');
// SLOT di carriera (1..3): lo slot si cambia SOLO riavviando il server con ACE_SLOT=n
// (così watcher e import non mischiano due carriere nella stessa sessione).
const SLOT = activeSlot();
const SAVE_FILE = join(DATA_DIR, savePath(SLOT));
const CONFIG_FILE = join(DATA_DIR, 'evo.config.json');
const GUI_DIR = join(PROJECT, 'gui');
const BACKUP_DIR = join(DATA_DIR, 'backups');

/* ------------------------------------------------------------------ */
/* infrastruttura comune alla CLI                                      */
/* ------------------------------------------------------------------ */

function loadLadder() { return JSON.parse(readFileSync(LADDER_FILE, 'utf8')); }

function appEnv() {
  const env = { ...process.env };
  if (existsSync(CONFIG_FILE)) {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    if (cfg.dataDir) env.ACE_DATA = cfg.dataDir;
    if (cfg.gameExe) env.ACE_ROOT = dirname(cfg.gameExe);
  }
  return env;
}

/** Elenco dei backup unificati in data/backups/ (dal più recente). */
function listBackups(limit = 8) {
  try {
    return readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('evo-career.save.bak-') && f.endsWith('.json'))
      .sort().reverse().slice(0, limit)
      .map((f) => {
        let size = 0;
        try { size = statSync(join(BACKUP_DIR, f)).size; } catch {}
        const m = f.match(/^evo-career\.save\.bak-(.+)\.(auto\.)?json$/);
        return { name: f, size, auto: !!m?.[2], at: (m?.[1] ?? f).replace(/T/, ' ').slice(0, 16) + (m?.[2] ? ' (auto)' : '') };
      });
  } catch { return []; }
}

/**
 * Salute del sistema: lettore live (versioni di gioco/sm, esito PowerShell,
 * ricicli, stderr) + telemetria (ultimo .ld scritto da EVO e se ha dati).
 * Se il gioco aggiorna i layout delle shared memory, è qui che lo si vede.
 */
function systemHealth(paths) {
  const rd = liveReader();
  rd.start(); // idempotente: garantisce che il lettore sia vivo anche al primo accesso
  const h = rd.health();
  // ultimo file .ld tra le cartelle MoTeC note (Saved Games\ACE, Documents\ACE)
  let lastLd = null;
  const dirsState = [];
  for (const dir of paths.dataDirs ?? []) {
    const root = join(dir, 'MoTec');
    let cars = [];
    try { cars = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { dirsState.push({ root, exists: false }); continue; }
    dirsState.push({ root, exists: true, cars: cars.length });
    for (const car of cars) {
      // i .ld sono annidati per pista: MoTec\<auto>\<pista>\<file>.ld
      let trackDirs = [];
      try { trackDirs = readdirSync(join(root, car), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
      for (const track of trackDirs) {
        try {
          const files = readdirSync(join(root, car, track)).filter((f) => f.endsWith('.ld'))
            .map((f) => { const st = statSync(join(root, car, track, f)); return { car, track, f, path: join(root, car, track, f), mtime: st.mtimeMs, size: st.size }; });
          const best = files.sort((a, b) => b.mtime - a.mtime)[0];
          if (best && (!lastLd || best.mtime > lastLd.mtime)) lastLd = best;
        } catch { /* pista senza .ld: pazienza */ }
      }
    }
  }
  let lastLdInfo = null;
  if (lastLd) {
    // validità dall'header: come in motec.mjs, tabella canali + canali con dati
    let valid = false, channels = 0, withData = 0;
    try {
      const fd = openSync(lastLd.path, 'r');
      const head = Buffer.alloc(Math.min(lastLd.size, 65536));
      readSync(fd, head, 0, head.length, 0);
      closeSync(fd);
      const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
      const t0 = dv.getUint32(8, true);
      const t1 = Math.min(dv.getUint32(12, true), head.length);
      if (t1 > t0 && (t1 - t0) % 124 === 0) {
        const n = Math.min(Math.floor((t1 - t0) / 124), 500);
        for (let k = 0; k < n; k++) { channels++; if (dv.getUint32(t0 + k * 124 + 12, true) > 0) withData++; }
      }
      valid = withData > 0;
    } catch { valid = false; }
    lastLdInfo = { car: lastLd.car, track: lastLd.track, file: lastLd.f, size: lastLd.size, mtimeMs: lastLd.mtime, when: new Date(lastLd.mtime).toLocaleString('it-IT'), valid, channels, withData };
  }
  return {
    ...h,
    telem: {
      lastLd: lastLdInfo,
      dirsChecked: (paths.dataDirs ?? []).map((d) => join(d, 'MoTec')),
      dirsState,
    },
  };
}

function context() {
  const ladder = loadLadder();
  const paths = resolvePaths(appEnv());
  return { ladder, paths };
}

function writeConfig(patch) {
  mkdirSync(DATA_DIR, { recursive: true });
  const current = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
  const next = { ...current, ...patch };
  writeJsonAtomic(CONFIG_FILE, next); // atomico: da qui dipendono i percorsi di gioco e dati
  return next;
}

const requireState = () => loadState(SAVE_FILE);
const persist = (state) => saveState(SAVE_FILE, state);

const money = (n) => Number(n ?? 0).toLocaleString('it-IT');
const signed = (n) => (Number(n) > 0 ? `+${n}` : `${n}`);

/* ------------------------------------------------------------------ */
/* viste (le stesse cose che stampa la CLI, ma come oggetti)           */
/* ------------------------------------------------------------------ */

const trackName = (ladder, id) => ladder.contentNames?.tracks?.[id] ?? id;
const carName = (ladder, id) => ladder.contentNames?.cars?.[id] ?? id;

function viewHeader(ladder, state) {
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

function viewSeries(ladder, state) {
  const out = [];
  for (const disc of ladder.disciplines) {
    const nodes = ladder.nodes.filter((n) => n.discipline === disc.id).sort((a, b) => a.level - b.level);
    if (!nodes.length) continue;
    out.push({
      id: disc.id,
      name: disc.name,
      description: disc.description,
      nodes: nodes.map((node) => seriesNodeView(ladder, state, node)),
    });
  }
  return { disciplines: out };
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

function viewPaddock(ladder, state, all = false) {
  const node = nodeById(ladder, state.node);
  const rows = paddock(state.world, ladder, node, state.season);
  return {
    node: node.display,
    total: state.world.drivers.length,
    active: state.world.drivers.filter((d) => d.active).length,
    rows: (all ? rows : rows.slice(0, 16)).map((r) => ({
      name: r.name, country: r.country, age: r.age, archetype: r.archetypeName,
      band: Math.round(r.bandValue), slider: r.evoSlider, iconic: !!r.iconic, hot: !!r.hot,
    })),
    archetypes: Object.values(ladder.archetypes).map((a) => a.name),
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
  return {
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
  const content = scanContent(paths);
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

/* ------------------------------------------------------------------ */
/* import: UNA sola logica per GUI, CLI e watcher (src/import.mjs)     */
/* ------------------------------------------------------------------ */

function doImport(ladder, paths, state, { manual = null, allowAny = false, force = false, since = null } = {}) {
  const out = runImport(ladder, paths, state, { manual, allowAny, force, since, persist });
  return { ...out, header: viewHeader(ladder, state) };
}

/* ------------------------------------------------------------------ */
/* server                                                              */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

async function api(context0, req, res, action, body) {
  const { ladder, paths } = context0;
  const hasCareer = () => existsSync(SAVE_FILE);
  const state = hasCareer() ? requireState() : null;    const needsCareer = ['agenda-detail', 'championships', 'world-ranking', 'status', 'series', 'calendar', 'standings', 'paddock', 'messages', 'card', 'difficulty', 'enter', 'accept', 'import', 'race', 'season-end', 'rename', 'difficulty-action', 'stats', 'rivals', 'rival-detail', 'integrity', 'integrity-fix', 'season-review', 'life', 'gazzetta', 'planner', 'challenge-accept', 'sponsor-accept', 'sponsor-decline', 'review-export', 'flows', 'testday', 'garage', 'events', 'event-accept', 'event-decline', 'event-finish', 'event-abandon', 'my-garage', 'garage-add', 'garage-remove', 'garage-note', 'garage-sell', 'difficulty-nudge', 'nudge-dismiss', 'heritage', 'heritage-claim', 'race-settings', 'import-inspect', 'tracks', 'backup'];
  if (needsCareer.includes(action) && !state) {
    return sendJson(res, 400, { error: 'Non c\'è ancora una carriera: creane una dalla schermata iniziale.' });
  }
  if (state) {
    ensureFlowsSeeded(state); // carriere nate prima del registro flussi
    // difficoltà AI diretta per OGNI serie: 88–93% di default, la Coppa GT86 resta
    // l'unica a 99–100 (scelta di Mauro). Chi ha già un valore lo mantiene; le serie
    // senza impostazione lo ricevono. I valori restano modificabili col pannello
    // regole e coi tasti ±1 del cruscotto (difficulty-nudge).
    const RS = (state.raceSettings ??= {});
    for (const n of (ladder.nodes ?? [])) {
      const cur = RS[n.nodeId];
      if (!cur) RS[n.nodeId] = { sliderMin: 88, sliderMax: 93 };
      else {
        if (cur.sliderMin == null) cur.sliderMin = 88;
        if (cur.sliderMax == null) cur.sliderMax = 93;
      }
    }
  }

  switch (action) {
    case 'boot': {
      return sendJson(res, 200, {
        hasCareer: hasCareer(),
        header: state ? viewHeader(ladder, state) : null,
        setup: viewSetup(ladder),
        gameRunning: await isGameRunning(),
        // badge urgente sul menu Messaggi: email priorità alta della posta del pilota
        mailUrgent: state ? mailbox(ladder, state).mails.filter((m) => m.priorita === 'urgente').length : 0,
      });
    }
    case 'agenda-sign-preview': {
      // ANTICIPO CONFLITTI alla firma: come cadrebbe il calendario della nuova serie
      // e le collisioni con le serie già iscritte (prima di spendere soldi/reputazione)
      const id = String(body.nodeId ?? '');
      const node = ladder.nodes.find((n) => n.nodeId === id);
      if (!node) return sendJson(res, 404, { error: 'Serie sconosciuta.' });
      const today = agendaDay(state);
      // simula il sedile di oggi: ronda k → giorno anchor + k·7
      const fakeState = { ...state, seats: { ...state.seats, [id]: { day: today, season: state.season } } };
      const future = [];
      for (let i = 0; i < node.calendar.length; i++) {
        const day = Math.max(1, today + i * CADENZA_GIORNI);
        const collide = [];
        for (const otherId of Object.keys(state.seats ?? {})) {
          const on = nodeById(ladder, otherId);
          const sd = scheduledDay(ladder, fakeState, on);
          // collisione se la stessa settimana (±1 giorno di flessibilità)
          if (sd != null && Math.abs(sd - day) <= 1) {
            const r = nextUnplayedRound(ladder, state, on);
            collide.push({
              nodeId: otherId, display: on.display, day: sd,
              dateLabel: dateLabel(sd), roundIndex: r?.index ?? null, track: r?.track ?? null,
            });
          }
        }
        const names = ladder.contentNames?.tracks ?? {};
        const round = node.calendar[i];
        future.push({
          index: i, day, dateLabel: dateLabel(day),
          name: round.name ?? `Round ${i + 1}`,
          track: names[round.track] ?? round.track,
          laps: round.laps, hour: round.hour,
          conflicts: collide,
        });
      }
      const conflittiTotali = future.filter((f) => f.conflicts.length).length;
      return sendJson(res, 200, {
        nodeId: id, display: node.display, level: node.level ?? 0,
        calendarLen: node.calendar.length,
        cadenza: CADENZA_GIORNI,
        bollette: node.econ ?? null,
        startLabel: dateLabel(today),
        future, conflictsTotal: conflittiTotali,
      });
    }
    case 'status': return sendJson(res, 200, viewStatus(ladder, state));
    case 'catalog': return sendJson(res, 200, loadCatalog(paths, process.env, { driver: state?.driver ?? null }));
    case 'result-detail': return sendJson(res, 200, resultDetail(paths, String(body.file ?? '')) ?? { error: 'File non trovato.' });
    case 'watcher':
      return sendJson(res, 200, { active: true, armed: watcher.armed, racedEnd: watcher.racedEnd, lastMsg: watcher.lastMsg, events: watcher.events, seq: watcher.importSeq ?? 0 });
    case 'live': {
      const r = liveReader();
      r.start();
      const snap = r.snapshot();
      // verifica della configurazione: confronta la sessione live con la scheda gara attesa
      let check = null;
      if (snap.game && state) {
        try {
          const card = raceCard(ladder, state, { car: typeof body.car === 'string' ? body.car : null });
          const live = snap.session;
          const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
          const has = (hay, needle) => !!hay && !!needle && (norm(hay).includes(norm(needle)) || norm(needle).includes(norm(hay)));
          // al menu (nessuna sessione caricata) niente verifica: solo stato
          if (!live.track) {
            return sendJson(res, 200, { ...snap, check: null, waiting: true });
          }
          // attese costruite dai dati veri della scheda
          const pistaSetting = card.settings.find(([k]) => norm(k).startsWith('pista'))?.[1] ?? '';
          const layoutMatch = String(pistaSetting).match(/layout\s+([A-Za-z0-9' ]+)/i);
          const expectedLayout = layoutMatch ? layoutMatch[1].trim() : null;
          const expectedTrack = card.trackName ?? null;
          const choices = (card.carChoices ?? []).map((c) => c.display);
          const liveCar = snap.player?.car ?? null;
          const carOk = !!liveCar && choices.some((ch) => {
            const a = norm(ch), b = norm(liveCar);
            return b.includes(a) || a.includes(b);
          });
          const rows = [
            { key: 'pista', expected: expectedTrack, live: live.track, ok: has(live.track, expectedTrack) },
            { key: 'layout', expected: expectedLayout, live: live.layout, ok: has(live.layout, expectedLayout) },
            { key: 'sessione', expected: 'Gara', live: live.type, ok: live.type === 'Race' },
            { key: 'auto', expected: choices.join(', ') || null, live: liveCar, ok: carOk },
          ];
          const allOk = rows.every((r) => r.ok);
          check = { rows, ready: allOk };
        } catch (e) {
          recordWarning('webui.livecheck', 'verifica live non riuscita (rispondo senza check): ' + (e?.message ?? ''));
        }
      }
      return sendJson(res, 200, { ...snap, check });
    }
    case 'stats': return sendJson(res, 200, careerStats(ladder, state));
    case 'rivals': return sendJson(res, 200, rivalsOverview(ladder, state, { q: typeof body.q === 'string' ? body.q : null }));
    case 'imports': return sendJson(res, 200, { ledger: importedFiles().slice(0, 30), log: importLog(20) });
    case 'rival-detail': return sendJson(res, 200, rivalDetail(String(body.key ?? '')) ?? { error: 'Rivale non trovato.' });
    case 'world-ranking': {
      // classifica MONDIALE per prestige: tutti i piloti del mondo ordinati per
      // skill innata (i più forti sono i "F1"), con la tua posizione in elenco
      const world = state.world;
      const rows = (world?.drivers ?? [])
        .filter((d) => d.active !== false)
        .map((d) => ({
          key: d.id ?? `${d.first}-${d.last}`, name: `${d.first} ${d.last}`, country: d.country,
          skill: Number(d.skill) || 0, age: d.age, archetype: d.archetype,
          form: d.hot ? 'in forma' : d.retired ? 'in declino' : '',
        }))
        .sort((a, b) => b.skill - a.skill);
      // skill DEL GIOCATORE dinamica: base dalla serie corrente, ma cresce coi
      // RISULTATI reali (vittorie e podi spingono sopra la banda della serie):
      // P1 in una serie bassa può valere più di un P8 in una alta.
      const cur = nodeById(ladder, state.node);
      const [hi, lo] = cur.ai ?? [80, 70];
      const base = ((Number(hi) || 80) + (Number(lo) || 70)) / 2;
      const mineAll = Object.values(state.results ?? {}).flat().filter((r) => r.season === state.season);
      const races = mineAll.length || 1;
      const avgShare = mineAll.reduce((acc, r) => acc + (r.dnf ? 0 : 1 - ((Number(r.position) || 10) / (Number(r.gridSize) || 12))), 0) / races;
      const bonuses = mineAll.filter((r) => !r.dnf && r.position === 1).length * 3 + mineAll.filter((r) => !r.dnf && r.position <= 3).length * 1.2;
      const mySkill = ourToSkill(Math.max(OUR_MIN, Math.min(OUR_MAX, base + (avgShare - 0.5) * 12 + bonuses)));
      const me = { key: 'player', name: state.driver.name, country: state.driver.nation, skill: mySkill, age: null, archetype: 'TU', form: '' };
      const all = [...rows, me].sort((a, b) => b.skill - a.skill);
      const myPos = all.findIndex((r) => r.key === 'player') + 1;
      const top = all.slice(0, 40);
      // la tua riga è SEMPRE nell'elenco anche se il posto è oltre il 40°:
      // comparirà in fondo marcata "tu", per vedere il tuo blocco
      if (myPos > top.length) {
        const idx = all.findIndex((r) => r.key === 'player');
        top.push(all[idx]);
      }
      return sendJson(res, 200, {
        total: all.length,
        myPosition: myPos,
        me,
        rows: top.map((r) => ({
          position: all.indexOf(r) + 1, name: r.name, country: r.country, skill: Math.round(r.skill * 100),
          age: r.age, archetype: r.archetype, isPlayer: r.key === 'player', form: r.form,
        })),
      });
    }
    case 'championships': {
      // una sezione per ogni campionato ISCRITTO: calendario della stagione in
      // corso + classifica reale (solo rondé trascorse) + i tuoi risultati
      const out = [];
      for (const nodeId of Object.keys(state.seats ?? {})) {
        let node;
        try { node = nodeById(ladder, nodeId); } catch { continue; }
        const results = (state.results?.[nodeId] ?? []).filter((r) => Number(r.season) === state.season);
        const names = ladder.contentNames?.tracks ?? {};
        let table = null;
        try {
          table = standingsFor(ladder, state, node, state.season).map((r) => ({
            position: r.position, name: r.name, points: r.points, isPlayer: !!r.isPlayer,
          }));
        } catch { table = null; }
        out.push({
          nodeId, display: node.display, level: node.level ?? 0,
          discipline: disciplineName(ladder, node.discipline),
          season: state.season,
          seatDay: state.seats[nodeId].day ?? null,
          calendar: node.calendar.map((round, i) => ({
            index: i,
            name: round.name ?? `Round ${i + 1}`,
            track: names[round.track] ?? round.track,
            laps: round.laps,
            hour: round.hour,
            played: results.some((r) => r.round === i),
          })),
          mine: results.map((r) => ({
            round: r.round, position: r.dnf ? 'DNF' : r.position, points: r.points,
            track: names[node.calendar[r.round]?.track] ?? node.calendar[r.round]?.track, fl: !!r.fl,
          })),
          standings: table,
          isCurrent: nodeId === state.node,
        });
      }
      return sendJson(res, 200, { championships: out });
    }
    case 'agenda-detail': {
      // scheda completa della gara cliccata in Agenda: serie, auto, calendario,
      // classifica in corso (se la stagione è iniziata), gate e meteo
      const id = String(body.nodeId ?? '');
      const day = Number.isFinite(Number(body.day)) ? Number(body.day) : agendaDay(state);
      const g = racesOnDay(ladder, state, day).find((x) => x.node.nodeId === id);
      if (!g) return sendJson(res, 404, { error: 'Nessuna gara di questa serie nel giorno richiesto.' });
      const node = g.node;
      const carNames = (ids) => (ids ?? []).map((c) => ladder.contentNames?.cars?.[c] ?? c);
      const results = (state.results?.[node.nodeId] ?? []).filter((r) => Number(r.season) === Number(g.season));
      const started = results.length > 0;
      let standings = null;
      if (started) {
        try {
          standings = standingsFor(ladder, state, node, g.season).slice(0, 10).map((r) => ({
            position: r.position, name: r.name, points: r.points, isPlayer: !!r.isPlayer,
          }));
        } catch { standings = null; }
      }
      // il mio risultato in questa stagione (se c'è)
      const mieGare = results.map((r) => ({ round: r.round, position: r.dnf ? 'DNF' : r.position, points: r.points, track: ladder.contentNames?.tracks?.[node.calendar[r.round]?.track] ?? node.calendar[r.round]?.track, fl: !!r.fl }));
      // gate: cosa manca per firmare (solo se non iscritto)
      const gate = state.seats?.[node.nodeId] ? { ok: true, reasons: [] } : gateStatus(ladder, state, node);
      return sendJson(res, 200, {
        nodeId: node.nodeId,
        display: node.display,
        discipline: disciplineName(ladder, node.discipline),
        level: node.level ?? 0,
        stato: g.stato,
        fattibile: g.fattibile,
        gateReasons: gate.reasons ?? [],
        isCurrent: !!g.isCurrent,
        roundIndex: g.index,
        roundName: g.name,
        track: g.track,
        trackId: g.trackId,
        laps: g.laps,
        hour: g.hour,
        weather: g.weather ?? null,
        scheduledDay: g.scheduledDay,
        dateLabel: dateLabel(g.scheduledDay),
        season: g.season,
        gridSize: node.gridSize ?? null,
        prize: node.econ?.prize ?? null,
        entryFee: node.econ?.rent ?? node.econ?.buy ?? 0,
        repRequired: node.repRequired ?? 0,
        cars: carNames(node.cars),
        calendar: node.calendar.map((round, i) => ({
          index: i,
          name: round.name ?? `Round ${i + 1}`,
          track: ladder.contentNames?.tracks?.[round.track] ?? round.track,
          laps: round.laps,
          hour: round.hour,
          played: results.some((r) => r.round === i),
          current: i === g.index,
        })),
        // "started" per le serie NON iscritte va derivato dal ROUND del ciclo:
        // i rivali hanno già corso le rondé prima dell'indice del giorno. I risultati
        // del giocatore non esistono (non è iscritto) e non possono decidere questo.
        started: hasSeat(state, node.nodeId) ? started : g.index > 0,
        standings,
        // entri a stagione avviata? La R1 (o le rondé prima della corrente) sono
        // già scappate: se firmi ora quei punti valgono 0. Meglio le fasi R1.
        joinLate: hasSeat(state, node.nodeId) ? false : g.index > 0,
        joinNote: hasSeat(state, node.nodeId)
          ? (started ? `La tua stagione è in corso: hai ${results.length} gare all'attivo.` : null)
          : g.index > 0
            ? `La stagione è già partita: ${g.index} rond${g.index === 1 ? 'e' : 'i'} scappate. Se firmi ora entri da questo round e quelle rondé valgono 0 punti per te. Meglio un campionato ALLA PARTENZA: guarda le fasi R1.`
            : 'R1: e questo campionato parte alla pari il giorno scelto — puoi firmare e correre la prima gara insieme a tutti.',
        mine: mieGare,
      });
    }
    case 'integrity': return sendJson(res, 200, { issues: checkIntegrity(ladder, state), seasons: reviewableSeasons(state) });
    case 'integrity-fix': {
      const out = fixIntegrity(ladder, state);
      return sendJson(res, 200, { ...out, header: viewHeader(ladder, state) });
    }
    case 'season-review': {
      const seasons = reviewableSeasons(state);
      const wanted = Number.isFinite(Number(body.season)) && Number(body.season) > 0 ? Number(body.season) : seasons[0] ?? state.season;
      if (!seasons.includes(wanted)) return sendJson(res, 400, { error: `Nessuna gara registrata per la stagione ${wanted}.` });
      return sendJson(res, 200, seasonReview(ladder, state, { season: wanted }));
    }
    case 'backup': {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const target = join(BACKUP_DIR, `evo-career.save.bak-${stamp}.json`);
        copyFileSync(SAVE_FILE, target);
        const backups = listBackups(8);
        return sendJson(res, 200, { ok: true, created: target, backups });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'events':
      return sendJson(res, 200, eventsOverview(ladder, state));
    case 'my-garage': {
      // il garage personale: importa le auto vinte dagli eventi e arricchisce col catalogo
      try {
        const out = garageOverview(ladder, state, { paths });
        if (out.justImported.length) {
          for (const name of out.justImported) pushMessage(state, `🏆 ${name} entra nel garage (vinta in un evento speciale).`, 'title');
          persist(state);
        }
        return sendJson(res, 200, out);
      }
      catch (e) { recordWarning('webui.garage', 'vista garage non riuscita: ' + (e?.message ?? '')); return sendJson(res, 200, { cars: [], total: 0, won: 0, bought: 0, totalWins: 0, justImported: [] }); }
    }
    case 'garage-catalog': return sendJson(res, 200, { cars: catalogPicker(ladder, { paths }) });
    case 'garage-add': {
      try {
        const out = addCar(state, { carId: body.carId, carName: body.carName, how: body.how === 'won' ? 'won' : 'bought', note: body.note ?? null });
        if (!out.reused) pushMessage(state, out.car.how === 'won' ? `🏆 ${out.car.carName} entra nel garage (vinta).` : `${out.car.carName} entra nel garage (comprata).`, 'money');
        persist(state);
        return sendJson(res, 200, { ok: true, reused: out.reused, garage: garageOverview(ladder, state, { paths }) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-remove': {
      try {
        const n = removeCar(state, String(body.carId ?? ''));
        if (n) persist(state);
        return sendJson(res, 200, { ok: n > 0, garage: garageOverview(ladder, state, { paths }) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-note': {
      try {
        setNote(state, String(body.carId ?? ''), body.note != null ? String(body.note) : null);
        persist(state);
        return sendJson(res, 200, { ok: true, garage: garageOverview(ladder, state, { paths }) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-sell': {
      try {
        const out = sellCar(ladder, state, String(body.carId ?? ''));
        persist(state);
        return sendJson(res, 200, { ok: true, sold: out, garage: garageOverview(ladder, state, { paths }), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'difficulty-nudge': {
      // trim manuale dal cruscotto: ±1 sulla banda della serie corrente (88–93 → 89–94).
      // Vale per la serie, quindi per qualsiasi auto di quella serie: la scheda si aggiorna.
      try {
        const node = nodeById(ladder, state.node);
        const RS = (state.raceSettings ??= {});
        const card0 = raceCard(ladder, state, {});
        const S = (RS[node.nodeId] ??= {});
        S.sliderMin ??= card0.difficulty.rangeMin;
        S.sliderMax ??= card0.difficulty.rangeMax;
        const delta = Math.max(-5, Math.min(5, Math.round(Number(body.delta) || 0)));
        S.sliderMin = Math.max(0, Math.min(100, S.sliderMin + delta));
        S.sliderMax = Math.max(S.sliderMin, Math.min(100, S.sliderMax + delta));
        // il suggerimento in sospeso (se c'è) è stato gestito: si chiude
        delete state.pendingNudge;
        persist(state);
        return sendJson(res, 200, { ok: true, card: viewCard(ladder, state, typeof body.car === 'string' ? body.car : null) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'nudge-dismiss': {
      // il pilota scarta il suggerimento: si chiude senza toccare la difficoltà
      try {
        delete state.pendingNudge;
        persist(state);
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-accept': {
      try { acceptEvent(ladder, state, String(body.eventId ?? '')); persist(state); return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-decline': {
      try { declineEvent(ladder, state, String(body.eventId ?? '')); persist(state); return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-finish': {
      try {
        const out = finishEvent(ladder, state, { position: Number(body.position), bestLapSec: body.bestLapSec != null ? Number(body.bestLapSec) : null });
        persist(state);
        return sendJson(res, 200, { ok: true, result: out, events: eventsOverview(ladder, state), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-abandon': {
      // ripensamento: l'invito accettato torna libero (senza penali)
      try {
        const ev = ensureEvents(state);
        if (ev.active && ev.active.acceptedAt) { delete ev.active.acceptedAt; persist(state); }
        return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'warnings':
      return sendJson(res, 200, readWarnings());
    case 'system-health':
      return sendJson(res, 200, systemHealth(paths));
    case 'agenda': {
      // calendario CONTINUO stile Zero to Apex: vista giornata + strip calendario + griglia filtri
      const day = agendaDay(state);
      const viewDay = Number.isFinite(Number(body.day)) && Number(body.day) >= 1 ? Math.floor(Number(body.day)) : day;
      const filter = typeof body.filter === 'string' ? body.filter : 'tutte';    // tutte|fattibili|iscritte|bloccate
      const disc = typeof body.discipline === 'string' ? body.discipline : null; // id disciplina o null
      const today = gareDelGiorno(ladder, state);
      const griglia = racesOnDay(ladder, state, viewDay).filter((g) => {
        if (filter === 'fattibili') return g.fattibile;
        if (filter === 'iscritte') return g.stato === 'iscritto';
        if (filter === 'bloccate') return !g.fattibile;
        return true;
      }).filter((g) => !disc || g.node.discipline === disc);
      return sendJson(res, 200, {
        day,
        viewDay,
        todayLabel: dateLabel(day),
        viewLabel: dateLabel(viewDay),
        nextRaceDay: prossimoGiornoConGara(ladder, state),
        maxScelte: MAX_SCELTE_PER_GIORNO,
        scelteOggi: choicesForDay(state, day),
        impegni: impegni(ladder, state),
        disciplines: ladder.disciplines.map((d) => ({ id: d.id, name: d.name })),
        strips: calendarStrip(ladder, state, { from: day - 3 < 1 ? 1 : day - 3, days: 21 }),
        gare: griglia.map((g) => ({
          nodeId: g.node.nodeId, display: g.node.display, level: g.node.level ?? 0,
          discipline: g.node.discipline, roundIndex: g.index, totalRounds: g.node.calendar.length,
          season: g.season, name: g.name, track: g.track, laps: g.laps, hour: g.hour,
          weather: g.weather ?? null, scheduledDay: g.scheduledDay,
          onSchedule: !!g.onSchedule, late: !!g.late, stato: g.stato,
          fattibile: g.fattibile, gateReasons: g.gateReasons ?? [], isCurrent: !!g.isCurrent,
          prize: g.node.econ?.prize ?? null, gridSize: g.node.gridSize ?? null,
          carName: (ladder.contentNames?.cars?.[g.node.cars?.[0]] ?? g.node.cars?.[0] ?? null),
        })),
      });
    }
    case 'agenda-advance': {
      const before = agendaDay(state);
      const to = Number.isFinite(Number(body.to)) ? Number(body.to) : null;
      const after = avanzaGiorno(state, to);
      persist(state);
      return sendJson(res, 200, { before, after });
    }
    case 'agenda-skip-to-next': {
      const target = prossimoGiornoConGara(ladder, state);
      if (target == null) return sendJson(res, 200, { error: 'Nessuna gara futura nei campionati iscritti.' });
      const after = avanzaGiorno(state, target);
      persist(state);
      return sendJson(res, 200, { after });
    }
    case 'agenda-shift': {
      // risolve un conflitto spostando la serie: il suo sedile slitta di +1 cadenza
      // (tutte le sue prossime ronde si spostano con lui), con nota nel diario
      const id = String(body.nodeId ?? '');
      const inf = impegni(ladder, state);
      const m = inf.lista.find((x) => x.nodeId === id);
      if (!m) return sendJson(res, 400, { error: 'Non hai un impegno con questa serie.' });
      const now = shiftSeat(state, id, CADENZA_GIORNI);
      pushMessage(state, `${m.display} spostata in avanti: prossima gara ${dateLabel(now)} (conflitto di calendario risolto).`, 'info');
      persist(state);
      return sendJson(res, 200, { ok: true, nodeId: id, nextDay: now });
    }
    case 'agenda-choose': {
      // sceglie la gara di OGGI: solo gare fattibili, e al massimo 3 per giornata
      // (come le 2-3 scelte quotidiane di Zero to Apex). Riscgliere la stessa serie è ok.
      const id = String(body.nodeId ?? '');
      const day0 = agendaDay(state);
      const griglia = racesOnDay(ladder, state, day0);
      const g = griglia.find((x) => x.node.nodeId === id);
      if (!g) return sendJson(res, 400, { error: 'Questa serie non ha gare in programma oggi.' });
      if (!g.fattibile) return sendJson(res, 403, { error: `Serie bloccata: ${g.gateReasons.join('; ')}` });
      const already = state.node === id;
      if (!already && !canChoose(state, day0, id)) {
        return sendJson(res, 409, { error: `Hai già scelto ${MAX_SCELTE_PER_GIORNO} gare per oggi: ne resta una sola da disputare (salta il tempo per cambiare giornata).` });
      }
      if (state.node !== id) {
        state.node = id;
        state.round = g.index;
        // sedile nuovo o rinnovato: la cadenza della serie parte da oggi
        state.seats ??= {};
        if (!state.seats[id]) {
          const results = state.results?.[id] ?? [];
          let last = 0;
          for (const r of results) if (Number(r.season) > last) last = Number(r.season);
          const seatSeason = (last && results.filter((r) => Number(r.season) === last).length < g.node.calendar.length) ? last : state.season;
          state.seats[id] = { day: day0, season: seatSeason };
          pushMessage(state, `Iscritto a ${g.node.display}: le sue gare partono sulla griglia del calendario da oggi.`, 'info');
        }
        pushMessage(state, `Scelta la gara del giorno: ${g.node.display} R${g.index + 1} (${g.track}).`, 'info');
      }
      recordChoice(state, day0, id);
      persist(state);
      return sendJson(res, 200, { ok: true, nodeId: id, roundIndex: g.index, choices: choicesForDay(state, day0).length });
    }
    case 'series': return sendJson(res, 200, viewSeries(ladder, state));
    case 'calendar': return sendJson(res, 200, viewCalendar(ladder, state));
    case 'standings': return sendJson(res, 200, viewStandings(ladder, state));
    case 'paddock': return sendJson(res, 200, viewPaddock(ladder, state, !!body.all));
    case 'messages': return sendJson(res, 200, viewMessages(ladder, state));
    case 'card': {
      const card = viewCard(ladder, state, typeof body.car === 'string' ? body.car : null);
      // arricchisci la card col libro delle piste: record di sessione sulla stessa auto + scheda
      try {
        if (card.outlook) {
          const book = trackBook(ladder, paths, state, { testdayFile: join(DATA_DIR, 'testdays.json') });
          const row = book.rows.find((r) => r.track === card.trackName || r.id === card.round?.track);
          // miniatura dell'auto selezionata per la prossima gara
          card.carImage = carImageOf(card.carName) ?? carImageOf(card.car) ?? null;
          if (row) {
            card.outlook.trackRec = row.session ?? null;
            // pulisce il doppio marchio nei dati storici ("Abarth Abarth 695 Biposto")
            if (card.outlook.lapTarget?.car) {
              const p = String(card.outlook.lapTarget.car).trim().split(/\s+/);
              if (p.length >= 2 && p[0].toLowerCase() === p[1].toLowerCase()) card.outlook.lapTarget.car = p.slice(1).join(' ');
            }
            if (row.info) card.outlook.trackInfo = { nick: row.info.nick, country: row.info.country, lengthKm: row.info.lengthKm, corners: row.info.corners, opened: row.info.opened, history: row.info.history, fullName: row.info.fullName, outline: row.info.outline ?? null, map: row.info.map ?? null };
          }
        }
      } catch { /* il libro delle piste non deve mai rompere la card */ }
      return sendJson(res, 200, card);
    }
    case 'race-settings': {
      // override manuali per la ronda corrente: intervallo slider AI (min-max, come in EVO),
      // orari delle sessioni e moltiplicatore tempo. L'aggressività AI in EVO è bloccata.
      const node = nodeById(ladder, state.node);
      const o = (state.raceSettings ??= {});
      if (body.clear) { delete o[node.nodeId]; persist(state); return sendJson(res, 200, viewCard(ladder, state, typeof body.car === 'string' ? body.car : null)); }
      o[node.nodeId] ??= {};
      const S = o[node.nodeId];
      const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null; };
      if (body.sliderMin != null) S.sliderMin = num(body.sliderMin, 0, 100);
      if (body.sliderMax != null) S.sliderMax = num(body.sliderMax, 0, 100);
      if (S.sliderMin != null && S.sliderMax != null && S.sliderMin > S.sliderMax) { const t = S.sliderMin; S.sliderMin = S.sliderMax; S.sliderMax = t; }
      if (body.practiceStart != null) S.practiceStart = num(body.practiceStart, 0, 23);
      if (body.qualifyStart != null) S.qualifyStart = num(body.qualifyStart, 0, 23);
      if (body.timeScale != null) S.timeScale = Math.max(1, Math.min(60, Number(body.timeScale) || 1));
      if (body.distPct != null) S.distPct = [25, 50, 75, 100].includes(Number(body.distPct)) ? Number(body.distPct) : null;
      // gli override restano legati alla serie finché non premi "Torna ai consigli":
      // così le fasce impostate dalla pagina Difficoltà per le altre serie non si perdono
      persist(state);
      return sendJson(res, 200, viewCard(ladder, state, typeof body.car === 'string' ? body.car : null));
    }
    case 'difficulty': return sendJson(res, 200, viewDifficulty(ladder, state));
    case 'setup': return sendJson(res, 200, viewSetup(ladder));
    case 'telem-diagnostics': {
      const { paths: pNow } = context();
      // come negli altri punti del file: prima Saved Games\ACE, poi Documents\ACE
      const root = pNow.dataDirs?.[0] ? join(pNow.dataDirs[0], 'MoTec') : join(pNow.dataDirs?.[1] ?? '', 'MoTec');
      return sendJson(res, 200, { root, cars: telemDiagnostics(root) });
    }
    case 'new-career': {
      if (!body.name || !String(body.name).trim()) return sendJson(res, 400, { error: 'Serve il nome del pilota.' });
      if (hasCareer() && !body.force) return sendJson(res, 400, { error: 'Esiste già una carriera. Attiva "ricomincia da zero" per sovrascriverla.' });
      const st = createCareer(ladder, {
        name: String(body.name).trim(),
        nation: String(body.nation ?? 'ITA').toUpperCase(),
        discipline: body.discipline ? String(body.discipline) : null,
      });
      resetImportRegistry(); // ledger e log appartenevano alla carriera precedente
      resetFlows();          // i flussi appartenevano alla carriera precedente
      resetNews();           // la gazzetta riparte pulita
      persist(st);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, st) });
    }
    case 'rename': {
      const before = state.driver.name;
      renameDriver(state, { name: String(body.name ?? '').trim() || null });
      pushMessage(state, `Nome pilota aggiornato: ${before} -> ${state.driver.name}.`, 'info');
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'enter': {
      const target = nodeById(ladder, String(body.nodeId ?? ''));
      enterNode(ladder, state, target, { buy: !!body.buy, force: !!body.force });
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'accept': {
      const target = acceptOffer(ladder, state, Number(body.index));
      persist(state);
      return sendJson(res, 200, { ok: true, signed: target.display, header: viewHeader(ladder, state) });
    }
    case 'race': {
      const node = nodeById(ladder, state.node);
      if (state.round >= node.calendar.length) return sendJson(res, 400, { error: 'Stagione completata: chiudi l\'anno dalla schermata Carriera.' });
      const card = raceCard(ladder, state, { car: typeof body.car === 'string' ? body.car : null });
      const running = await isGameRunning();
      state.pendingSettings = { ...(state.raceSettings?.[node.nodeId] ?? {}) };
      const fee = chargeEntry(ladder, state, node);
      markPending(ladder, state, card);
      persist(state);
      let launched = null;
      if (!body.noLaunch) {
        try {
          const r = await launch(paths, { force: !!body.forceLaunch });
          launched = r;
        } catch (e) {
          launched = { error: e.message };
        }
      }
      return sendJson(res, 200, { ok: true, fee, gameRunning: running, launched, card: viewCard(ladder, state, typeof body.car === 'string' ? body.car : null), header: viewHeader(ladder, state) });
    }
    case 'import': {
      try {
        const out = doImport(ladder, paths, state, {
          manual: body.position ? { position: body.position, gridSize: body.cars, dnf: !!body.dnf, fl: !!body.fl, laps: body.laps, bestLap: body.bestLap } : null,
          allowAny: !!body.allowAny, force: !!body.force,
        });
        // dopo una gara importata può nascere un invito speciale (e gli inviti
        // non accettati entro il termine scadono)
        let spawn = null;
        try { expireEvents(ladder, state); spawn = maybeSpawnEvent(ladder, state); } catch (e) { recordWarning('events.spawn', 'generazione invito fallita', e?.message ?? null); }
        if (spawn) persist(state);
        return sendJson(res, 200, { ...out, eventSpawned: spawn ? { id: spawn.id, theme: spawn.theme.name, track: spawn.trackDisplay } : null });
      } catch (e) {
        if (e.code) return sendJson(res, 409, { error: e.message, code: e.code, detail: e.detail });
        throw e;
      }
    }
    case 'import-inspect': {
      const files = listResultFiles(paths).slice(0, 8).map((f) => {
        try {
          const r = readSessionResult(f.file);
          const { driver, how } = findPlayerDriver(r, state.driver);
          const info = driver ? classify(r, { driver }) : null;
          return {
            name: f.name, mtime: f.mtime, session: r.session, track: r.track,
            drivers: (r.drivers ?? []).length, isRace: isRaceSession(r),
            me: driver ? { how, position: info.position, dnf: info.dnf, car: info.car } : null,
            already: alreadyImportedHash(f.file),
          };
        } catch { return { name: f.name, mtime: f.mtime, session: '?', track: '?', drivers: 0, isRace: false }; }
      });
      return sendJson(res, 200, { files });
    }
    case 'difficulty-action': {
      const d = state.difficulty;
      if (body.op === 'mode') {
        if (!['adaptive', 'fixed', 'custom'].includes(body.mode)) return sendJson(res, 400, { error: 'Modalità non valida.' });
        d.mode = body.mode;
        d.base ??= {}; d.trim ??= {};
        if (body.mode === 'fixed') {
          const value = Number(body.value ?? 95);
          if (!Number.isFinite(value) || value < 70 || value > 120) return sendJson(res, 400, { error: 'Il valore vuole un numero fra 70 e 120.' });
          for (const nd of ladder.nodes) d.base[nd.nodeId] = value;
          d.trim = {};
        }
        if (body.mode === 'adaptive') { d.base = {}; d.pending = null; }
        pushMessage(state, `Difficoltà AI impostata su "${body.mode}"${body.value ? ` (valore ${body.value})` : ''}.`, 'info');
      } else if (body.op === 'lock' || body.op === 'unlock') {
        nodeById(ladder, String(body.nodeId));
        const list = new Set(d.locked);
        if (body.op === 'lock') list.add(String(body.nodeId)); else list.delete(String(body.nodeId));
        d.locked = [...list];
      } else if (body.op === 'range') {
        // intervallo slider EVO di una serie (min-max, come nel gioco); vuoto = torna al consiglio
        const node = nodeById(ladder, String(body.nodeId ?? state.node));
        if (body.clear) {
          if (state.raceSettings?.[node.nodeId]) { delete state.raceSettings[node.nodeId].sliderMin; delete state.raceSettings[node.nodeId].sliderMax; }
        } else {
          const num = (v) => Math.max(0, Math.min(100, Math.round(Number(v))));
          let lo = num(body.min ?? 0), hi = num(body.max ?? 0);
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) return sendJson(res, 400, { error: 'Min e max vogliono numeri fra 0 e 100.' });
          if (lo > hi) { const t = lo; lo = hi; hi = t; }
          ((state.raceSettings ??= {})[node.nodeId] ??= {}).sliderMin = lo;
          state.raceSettings[node.nodeId].sliderMax = hi;
        }
        pushMessage(state, `Difficoltà EVO di ${node.display} impostata a ${body.clear ? 'consiglio automatico' : (state.raceSettings[node.nodeId]?.sliderMin ?? '?') + '–' + (state.raceSettings[node.nodeId]?.sliderMax ?? '?') + '%'}.`, 'info');
      } else if (body.op === 'trim') {
        const val = Math.max(-20, Math.min(20, Math.round(Number(body.value ?? 0))));
        if (!Number.isFinite(val)) return sendJson(res, 400, { error: 'Il trim vuole un numero fra -20 e +20.' });
        const targets = body.nodeId === 'all'
          ? ladder.nodes.map((n) => n.nodeId)
          : [nodeById(ladder, String(body.nodeId ?? state.node)).nodeId];
        d.trim ??= {};
        // la banda EVO della serie segue il trim: 1 punto di trim = 5 punti slider
        // (come il consiglio automatico centro±5). Così cruscotto e pagina difficoltà
        // mostrano SEMPRE la stessa banda anche quando il trim cambia.
        for (const t of targets) {
          const before = d.trim[t] ?? 0;
          d.trim[t] = val;
          const RS = (state.raceSettings ??= {});
          const S = (RS[t] ??= {});
          const shift = (val - before) * 5;
          S.sliderMin = Math.max(0, Math.min(100, (S.sliderMin ?? Math.round((state.raceSettings[t]?.sliderMin ?? 88))) + shift));
          S.sliderMax = Math.max(S.sliderMin, Math.min(100, (S.sliderMax ?? Math.round((state.raceSettings[t]?.sliderMax ?? 93))) + shift));
        }
        d.pending = null;
        pushMessage(state, `Difficoltà regolata a mano: trim ${val >= 0 ? '+' : ''}${val} su ${body.nodeId === 'all' ? 'tutte le serie' : nodeById(ladder, String(body.nodeId ?? state.node)).display}.`, 'info');
      } else if (body.op === 'accept' || body.op === 'reject') {
        const p = d.pending;
        if (!p) return sendJson(res, 400, { error: 'Nessun suggerimento in attesa.' });
        if (body.op === 'accept') {
          const before = d.trim[p.nodeId] ?? 0;
          d.trim[p.nodeId] = p.to;
          // il suggerimento accettato sposta anche la banda EVO della serie (+1 trim = +5 slider)
          const shift = (p.to - before) * 5;
          if (shift) {
            const RS = (state.raceSettings ??= {});
            const S = (RS[p.nodeId] ??= {});
            S.sliderMin = Math.max(0, Math.min(100, (S.sliderMin ?? 88) + shift));
            S.sliderMax = Math.max(S.sliderMin, Math.min(100, (S.sliderMax ?? 93) + shift));
          }
          pushMessage(state, `Difficoltà di ${nodeById(ladder, p.nodeId).display} portata a trim ${p.to >= 0 ? '+' : ''}${p.to} (${p.reason}): banda EVO ora ${state.raceSettings[p.nodeId]?.sliderMin ?? '?'}–${state.raceSettings[p.nodeId]?.sliderMax ?? '?'}%.`, 'info');
        }
        d.pending = null;
      } else {
        return sendJson(res, 400, { error: 'Operazione di difficoltà non valida.' });
      }
      persist(state);
      return sendJson(res, 200, { ok: true, view: viewDifficulty(ladder, state) });
    }
    case 'life': {
      const node = nodeById(ladder, state.node);
      const L = ensureLife(state);
      // backfill per carriere in corso: contratto e sigilli esistono da prima di questa stagione
      const backfill = ensureContract(ladder, state, node);
      const newSigils = checkSigils(ladder, state);
      if (backfill || newSigils.length) persist(state);
      const pulse = midSeasonPulse(state.world, ladder, node, state.season, Math.min(state.round, node.calendar.length - 1));
      const contr = contractStatus(ladder, state);
      return sendJson(res, 200, {
        contract: contr ? { display: contr.contract.display, season: contr.contract.season, payout: contr.contract.payout, rows: contr.rows, metrics: contr.metrics } : null,
        sponsor: sponsorOffers(ladder, state),
        sponsorActive: sponsorFor(state),
        challenge: (() => { const c = challengeFor(ladder, state); return c ?? null; })(),
        sigils: (L.sigils ?? []).map((s) => ({ ...(sigilDefs(ladder).find((d) => d.id === s.id) ?? {}), ...s })),
        sigilDefs: sigilDefs(ladder),
        challengeStats: L.challengeStats,
        duel: (L.duel && L.duel.season === state.season) ? L.duel : null,
        pulse,
        round: state.round,
      });
    }
    case 'heritage':
      return sendJson(res, 200, heritageOverview(ladder, state));
    case 'heritage-claim': {
      try {
        const out = claimMemory(ladder, state);
        // il relic: l'auto dell'antenato entra nel garage con la sua nota di famiglia
        try {
          const H = state.heritage ?? {};
          const done = (H.completed ?? [])[((H.completed ?? []).length) - 1];
          if (done?.carId) {
            addCar(state, { carId: done.carId, carName: done.carName ?? done.carId, how: 'won', note: `relic di famiglia — ${done.title} (${done.era})` });
            pushMessage(state, `📜 Il relic di famiglia entra nel garage: ${done.carName ?? done.carId}.`, 'title');
          }
        } catch { /* il relic non deve bloccare l'incasso */ }
        persist(state);
        return sendJson(res, 200, { ok: true, ...out, garage: garageOverview(ladder, state, { paths }), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'gazzetta': return sendJson(res, 200, { items: newsFeed(30) });
    case 'garage': {
      // aiuto-meccanico: target pressioni classe, regola 4 PSI, note per auto+pista
      try {
        if (body.action === 'psi') return sendJson(res, 200, fourPsi({ cold: body.cold, hot: body.hot, target: body.target }));
        if (body.action === 'sessions') {
          // storico telemetrie per auto (e pista se nota): tipo sessione, giri, benzina,
          // pressioni vere e assetto in pratica — la materia prima del suggeritore
          // (senza auto esplicita si usa l'auto più recente con telemetria, non la prima della lista)
          const board = setupBoard(ladder, state);
          const carName = body.car ?? null;
          const trackKey = body.track ?? board.track ?? undefined;
          const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
          const resultsDir = paths.resultsDirs?.[0] ?? join(root, '..', 'Results');
          let sessions = collectSessions(root, resultsDir, { car: carName, track: trackKey, limit: body.limit ?? 10 });
          if (!sessions.length && trackKey) sessions = collectSessions(root, resultsDir, { car: carName, limit: body.limit ?? 10 });
          if (!sessions.length && !carName) sessions = collectSessions(root, resultsDir, { limit: body.limit ?? 10 });
          // senza auto richiesta si usa solo l'auto più recente: mai consigli da telemetrie miste
          if (!carName && sessions.length > 1) sessions = sessions.filter((s) => s.car === sessions[0].car);
          const usedCar = sessions[0]?.car ?? carName;
          const tyre = usedCar ? tyreClassOf(usedCar) : null;
          const advice = pressureAdvice(sessions, { target: body.target ?? tyre?.target });
          // consiglio specifico GARA: usa i giri della ronda corrente (o 10 di default)
          // e privilegia uscite lunghe; le qualifiche da sole sottraggono ~0.2 PSI
          const nodeNow = nodeById(ladder, state.node);
          const raceLaps = nodeNow?.calendar?.[Math.min(state.round ?? 0, (nodeNow?.calendar?.length ?? 1) - 1)]?.laps ?? 10;
          const raceAdvice = racePressureAdvice(sessions, { target: body.target ?? tyre?.target, raceLaps });
          // registro il consiglio (una sola volta per base dati: se la telemetria non è cambiata, non duplico)
          if (advice.ok && advice.suggestedStartPsi != null && sessions[0]) {
            const lastLog = readPressureLog(1)[0];
            const sig = (advice.basis?.when ?? '') + '|' + advice.suggestedStartPsi;
            if (!lastLog || ((lastLog.basisWhen ?? '') + '|' + lastLog.suggestedStartPsi) !== sig) {
              try {
                logPressureAdvice({
                  car: usedCar, track: sessions[0].track ?? trackKey ?? null,
                  suggestedStartPsi: advice.suggestedStartPsi, range: advice.range, target: advice.target,
                  basisKind: advice.basis?.kind ?? null, basisKindLabel: advice.basis?.kindLabel ?? null, basisWhen: advice.basis?.when ?? null,
                });
              } catch { /* il log non deve bloccare la risposta */ }
            }
          }
          return sendJson(res, 200, {
            ok: true, car: usedCar ?? null, track: trackKey ?? null,
            // trasparenza su DOVE è stata girata la telemetria usata per il consiglio:
            // se pista del round e pista della telemetria divergono, la GUI lo dice
            trackDisplay: board.trackDisplay ?? null, basisTrack: sessions[0]?.track ?? null,
            target: tyre ? tyre.target : (body.target ?? null), classLabel: tyre?.label ?? null,
            telemetryLaps: telemetryLapsFor(usedCar ?? carName ?? ''),
            sessions: sessions.map((s) => ({
              when: s.whenLocal, kindLabel: s.kindLabel, weather: s.weather, preset: s.preset,
              validLaps: s.validLaps, durationSec: s.durationSec, bestLapSec: s.bestLapSec, fuelPerLap: s.fuelPerLap,
              cold: s.coldPressures, hot: s.hotPressures, sus: s.sus, bump: s.bump, camberProxy: s.camberProxy,
              airTemp: s.airTemp, roadTemp: s.roadTemp, laps: s.laps,
            })),
            advice,
            raceAdvice,
            raceLaps,
          });
        }
        if (body.action === 'motec') {
          // ultima sessione MoTeC per l'auto corrente (+ pista se indicata): benzina e pressioni vere
          const board = setupBoard(ladder, state);
          const carName = body.car ?? (board.rows[0]?.carName ?? null);
          const sessions = listMotecSessions(paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec'), { car: carName, track: body.track ?? board.trackDisplay ?? undefined });
          const alt = sessions.length ? null : listMotecSessions(join(paths.dataDirs?.[0] ?? '', 'MoTec'), { car: carName });
          const pick = (sessions.length ? sessions : alt)?.[0] ?? null;
          if (!pick) return sendJson(res, 200, { ok: true, found: false, hint: 'Nessuna telemetria MoTeC per questa auto: fai una sessione e EVO la salverà in Saved Games\\ACE\\MoTec.' });
          const a = analyzeLd(pick.file);
          if (!a) return sendJson(res, 200, { ok: true, found: false, hint: 'File MoTeC non leggibile: ' + pick.name });
          const tyre = tyreClassOf(carName);
          const advice = (tyre && a.lastPressures) ? fourPsi({ cold: a.coldPressures?.LF ?? a.coldPressures?.RR, hot: a.lastPressures.LF ?? a.lastPressures.RR, target: tyre.target }) : null;
          return sendJson(res, 200, {
            ok: true, found: true,
            session: { file: pick.name, car: pick.car, track: pick.track, preset: presetOf(pick.name), durationSec: a.durationSec, validLaps: a.validLaps, airTemp: a.airTemp, roadTemp: a.roadTemp, sus: a.sus, bump: a.bump, camberProxy: a.camberProxy },
            fuelPerLap: a.fuelPerLap,
            coldPressures: a.coldPressures, hotPressures: a.lastPressures,
            laps: a.laps.map((l) => ({ lap: l.lap, durationSec: l.durationSec, fuelUsed: l.fuelUsed, pressures: l.pressures, tair: l.tair, surf: l.surf })),
            advice,
            target: tyre ? tyre.target : null,
          });
        }
        if (body.action === 'note') {
          const saved = setSetupNote(body.car, body.track ?? setupBoard(ladder, state).track, body.text);
          return sendJson(res, 200, { ok: true, note: saved, board: setupBoard(ladder, state) });
        }
        return sendJson(res, 200, setupBoard(ladder, state));
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }
    case 'testday': {
      // giornate di prove: rapporti che NON toccano la carriera + quaderno di calibrazione
      try {
        if (body.action === 'import-file') {
          const out = recordTestDay(ladder, paths, state, { importFile: body.file, trackNames: body.trackNames, allowAny: !!body.allowAny, rangeMin: body.rangeMin, rangeMax: body.rangeMax, note: body.note });
          return sendJson(res, 200, { ok: true, entry: out.entry, updated: !!out.updated, log: testDayLog(30), calibration: calibrationSummary(ladder, state, { nodeId: body.nodeId ?? null }) });
        }
        if (body.action === 'manual') {
          const out = recordTestDay(ladder, paths, state, { manual: { car: body.car, rangeMin: body.rangeMin, rangeMax: body.rangeMax, position: body.position, gridSize: body.gridSize, bestLap: body.bestLap, note: body.note } });
          return sendJson(res, 200, { ok: true, entry: out.entry, log: testDayLog(30), calibration: calibrationSummary(ladder, state, { nodeId: body.nodeId ?? null }) });
        }
        return sendJson(res, 200, { ok: true, log: testDayLog(30), calibration: calibrationSummary(ladder, state, { nodeId: body.nodeId ?? null }) });
      } catch (e) {
        return sendJson(res, e.code ? 409 : 500, { error: e.message, code: e.code, detail: e.detail });
      }
    }
    case 'tracks': {
      // il libro delle piste: record personali e di sessione PER LAYOUT (tempi dai
      // file risultato, nomi e lunghezze ufficiali dal catalogo) + schede storiche
      let catalog = null;
      try { catalog = loadCatalog(paths); } catch { catalog = null; } // il catalogo non deve rompere il libro
      const book = trackBook(ladder, paths, state, { testdayFile: join(DATA_DIR, 'testdays.json'), catalog });
      return sendJson(res, 200, { ...book, next: nextTrackOf(ladder, state), driver: state.driver ?? null });
    }
    case 'cars': {
      // libro delle auto + Perf. index e varianti dal catalogo del server dedicato
      let catalog = null;
      try { catalog = loadCatalog(paths); } catch { catalog = null; }
      // economia reale delle serie (dal ladder): acquisto/noleggio del sedile, iscrizione, premio.
      // Se un'auto compare in più serie si tengono le condizioni migliori per il pilota
      // (spesa minima, premio massimo) e si elencano tutte le serie.
      const economy = {};
      const better = (cur, val, min = true) => {
        const v = Number.isFinite(Number(val)) ? Number(val) : null;
        if (v == null) return cur;
        if (cur == null) return v;
        return min ? Math.min(cur, v) : Math.max(cur, v);
      };
      for (const n of ladder.nodes ?? []) {
        for (const cid of n.cars ?? []) {
          const e = (economy[cid] ??= { buy: null, rent: null, entry: null, prize: null, series: [] });
          e.buy = better(e.buy, n.econ?.buy, true);
          e.rent = better(e.rent, n.econ?.rent, true);
          e.entry = better(e.entry, n.econ?.entry, true);
          e.prize = better(e.prize, n.econ?.prize, false);
          if (!e.series.includes(n.display)) e.series.push(n.display);
        }
      }
      const inGarage = (state?.garage?.cars ?? []).map((c) => c.carId);
      return sendJson(res, 200, { ...carsBook(ladder, { catalog }), economy, inGarage });
    }
    case 'planner': return sendJson(res, 200, { rows: careerPlanner(ladder, state), money: state.money, rep: state.rep, season: state.season });
    case 'challenge-accept': {
      const c = challengeFor(ladder, state);
      if (!c) return sendJson(res, 400, { error: 'Nessuna sfida disponibile per questa ronda.' });
      if (c.verdict) return sendJson(res, 400, { error: 'La sfida di questa ronda è già stata valutata.' });
      acceptChallenge(state, c);
      persist(state);
      return sendJson(res, 200, { ok: true, challenge: c, header: viewHeader(ladder, state) });
    }
    case 'sponsor-accept': {
      const list = sponsorOffers(ladder, state);
      const wanted = Number(body.tier);
      const offer = list.find((o) => o.tier === wanted) ?? list[list.length - 1];
      if (!offer) return sendJson(res, 400, { error: 'Nessuna offerta di sponsor disponibile.' });
      acceptSponsor(state, offer);
      pushMessage(state, `Contratto sponsor firmato: ${offer.name}. ${offer.note}.`, 'money');
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'sponsor-decline': {
      declineSponsor(state);
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'review-export': {
      const seasons = reviewableSeasons(state);
      const wanted = Number.isFinite(Number(body.season)) && Number(body.season) > 0 ? Number(body.season) : seasons[0] ?? state.season;
      const rev = seasonReview(ladder, state, { season: wanted });
      const file = exportReview(rev);
      return sendJson(res, 200, { ok: true, file, season: wanted });
    }
    case 'flows': return sendJson(res, 200, { flows: recentFlows(40) });
    case 'season-end': {
      const node = nodeById(ladder, state.node);
      const played = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).length;
      if (played < node.calendar.length && !body.force) {
        return sendJson(res, 409, { error: `Stagione incompleta: ${played}/${node.calendar.length} gare disputate. Conferma per chiudere comunque.`, code: 'SEASON_INCOMPLETE' });
      }
      const result = seasonEnd(ladder, state);
      // chiuso il campionato: invito garantito al Gran Finale dei Campioni
      let finale = null;
      try { finale = maybeSpawnEvent(ladder, state, { seasonJustEnded: true }); } catch (e) { recordWarning('events.spawn', 'invito finale non generato', e?.message ?? null); }
      persist(state);
      const memNow = state.heritage?.active ?? null;
      return sendJson(res, 200, {
        ok: true,
        champion: result.champion,
        me: result.me,
        bonus: result.bonus,
        offers: result.offers.map((o) => ({ ...o, discipline: disciplineName(ladder, o.discipline) })),
        eventSpawned: finale ? { id: finale.id, theme: finale.theme.name, track: finale.trackDisplay } : null,
        memoryAssigned: memNow ? { title: memNow.title, ancestor: memNow.ancestor, relation: memNow.relation, era: memNow.era, series: memNow.series, objective: memNow.objective?.text ?? '', inherit: memNow.inherit, carName: memNow.carName ?? null } : null,
        header: viewHeader(ladder, state),
      });
    }
    case 'setup-save': {
      const patch = {};
      if (typeof body.dataDir === 'string' && body.dataDir.trim()) {
        const dir = body.dataDir.trim();
        let isDir = false; try { isDir = statSync(dir).isDirectory(); } catch { /* non esiste */ }
        if (!isDir) return sendJson(res, 400, { error: `La cartella dati non esiste: ${dir}` });
        patch.dataDir = dir;
      }
      if (typeof body.gameExe === 'string' && body.gameExe.trim()) {
        const exe = body.gameExe.trim();
        // da qui si lancia il gioco (cmd /c start): solo l'exe ufficiale di EVO,
        // solo un file esistente, mai una cartella di rete — così nessuna pagina
        // web può farsi eseguire un binario a scelta
        if (basename(exe).toLowerCase() !== GAME_EXE.toLowerCase()) return sendJson(res, 400, { error: `Serve il percorso completo di ${GAME_EXE}.` });
        if (exe.startsWith('//') || (exe[0] === '\\' && exe[1] === '\\')) return sendJson(res, 400, { error: 'Percorso di rete non consentito: il gioco deve stare su un disco locale.' });
        let isFile = false; try { isFile = statSync(exe).isFile(); } catch { /* non esiste */ }
        if (!isFile) return sendJson(res, 400, { error: `File non trovato: ${exe}` });
        patch.gameExe = exe;
      }
      if (!Object.keys(patch).length) return sendJson(res, 400, { error: 'Nessun percorso da salvare.' });
      const cfg = writeConfig(patch);
      const fresh = resolvePaths({ ...process.env, ACE_DATA: cfg.dataDir, ACE_ROOT: cfg.gameExe ? dirname(cfg.gameExe) : undefined });
      return sendJson(res, 200, { ok: true, setup: { dataDirs: fresh.dataDirs, resultsDirs: fresh.resultsDirs, gameExe: fresh.gameExe } });
    }
    default:
      return sendJson(res, 404, { error: `Azione "${action}" non prevista.` });
  }
}

// porta robusta e PER SLOT: slot 1 → 8642, slot 2 → 8643, slot 3 → 8644.
// Così si possono tenere aperti più piloti insieme, ognuno con la sua carriera
// e il suo watcher, senza che un'istanza agganci la porta di un'altra.
// "--port N" resta l'override manuale (senza --port argv[idx+1] sarebbe undefined/NaN).
const _portIdx = process.argv.indexOf('--port');
const PORT_SLOT = 8641 + SLOT; // 8642/8643/8644
let PORT = Number(_portIdx > 0 ? process.argv[_portIdx + 1] : NaN) || Number(process.env.ACE_UI_PORT) || PORT_SLOT;
const OPEN = process.argv.includes('--open');

/* ------------------------------------------------------------------ */
/* watcher: import automatico quando la gara termina                   */
/* ------------------------------------------------------------------ */
/* Polling leggero: quando il gioco è in Race e la pista combacia con
   la ronda attesa, monitora il flag "gara finita" (checkered o ritorno
   al menu col risultato nei Results). Appena un risultato compatibile
   appare nei Results, lo deposita in carriera con la logica standard. */

const watcher = {
  timer: null,
  busy: false,
  armed: false,      // vero quando siamo dentro la gara giusta
  armedAt: null,     // quando ci si è armati (per il filtro "solo file nuovi")
  sinceImport: null, // limite temporale per l'import dopo la gara
  seenNonRace: false,// già avvisato che la sessione vista non è la gara
  racedEnd: false,   // gara vista e terminata: cerca il file
  lastMsg: null,
  events: [],        // ultimi eventi per la GUI
  push(msg, kind = 'info') {
    this.lastMsg = { msg, kind, at: new Date().toISOString() };
    this.events.unshift(this.lastMsg);
    this.events = this.events.slice(0, 5);
  },
};

function watcherTick() {
  if (watcher.busy) return;
  watcher.busy = true;
  (async () => {
    try {
      liveReader().start(); // il watcher deve vivere anche senza browser aperto
      const { ladder, paths } = context();
      if (!existsSync(SAVE_FILE)) return;
      const state = requireState();
      const snap = liveReader().snapshot();

      if (!snap.game) {
        if (watcher.armed) {
          // chiuso il gioco mentre eravamo in gara: la gara è finita lo stesso
          watcher.armed = false;
          watcher.seenNonRace = false;
          watcher.sinceImport = (watcher.armedAt ?? Date.now()) - 60 * 1000;
          watcher.racedEnd = true;
          watcher.push('Gioco chiuso in gara: cerco il risultato nei file del gioco…', 'info');
        } else if (watcher.racedEnd) {
          watcher.push('Gioco chiuso.', 'info');
        }
        watcher.seenNonRace = false;
        return;
      }

      const g = snap.session;
      const player = snap.player ?? {};
      const pending = state.pending;
      const node = pending ? nodeById(ladder, pending.node) : nodeById(ladder, state.node);
      const rnd = pending ? node.calendar[pending.round] : node.calendar[state.round];
      const expectedTrack = rnd?.track ?? null;
      // "Donington Park" (gioco) e "donington_park" (ladder) devono combaciare:
      // si eguagliano spazi/underscore e si scarta l'evento quando il game mode
      // mostra la pista senza layout ("Donington Park GP"), non la pista attesa
      const normTrack = (s) => norm(s).replace(/[_\-]+/g, ' ').replace(/\s+gp$/,'').replace(/\s+/g, ' ').trim();
      const trackOk = g.track && expectedTrack && (
        normTrack(g.track).includes(normTrack(expectedTrack)) || normTrack(expectedTrack).includes(normTrack(g.track))
      );

      /* Nel "weekend di gara" EVO etichetta prove/qualifica come TimeAttack/Practice:
         la gara vera si riconosce dal nome ("Race"/"Gara") o dal numero di giri
         prefissato (le sessioni a tempo non ce l'hanno). Copre entrambe le modalità. */
      const raceish = g.type === 'Race'
        || /race|gara/i.test(String(g.name ?? ''))
        || (Number(player.lapsTotal) > 0 && Number(player.lapsTotal) < 100);

      if (snap.live && trackOk && !raceish && !watcher.armed && !watcher.racedEnd && !watcher.seenNonRace) {
        watcher.seenNonRace = true;
        watcher.push(`Vedo ${g.track}: ${g.name ?? g.type} (prove/qualifica). Registro solo quando inizia la gara.`, 'info');
      }

      if (snap.live && trackOk && raceish) {
        if (!watcher.armed) {
          watcher.armed = true;
          watcher.armedAt = Date.now();
          watcher.racedEnd = false;
          watcher.seenNonRace = false;
          watcher.push(`Gara di carriera rilevata: ${g.track} ${g.layout ?? ''}. Sto registrando.`, 'good');
        }
      } else if (watcher.armed && ((!snap.live && !snap.paused) || !trackOk)) {
        // usciti dalla gara armata (menu, schermata risultati, gioco chiuso):
        // la PAUSA non conta come fine gara — restiamo armati
        watcher.armed = false;
        watcher.seenNonRace = false;
        watcher.sinceImport = (watcher.armedAt ?? Date.now()) - 60 * 1000;
        watcher.racedEnd = true;
        watcher.push('Gara terminata: cerco il risultato nei file del gioco…', 'info');
      }

      if (watcher.racedEnd) {
        // dai al gioco il tempo di scrivere il file risultato, poi importalo
        if (!watcher.wait) watcher.wait = Date.now();
        if (Date.now() - watcher.wait < 8000) return;
        try {
          // in coda con le richieste API: nessuno sovrascrive lo state dell'altro
          const out = await serialize(async () => {
            const out = doImport(ladder, paths, state, { allowAny: false, force: false, since: watcher.sinceImport ?? null });
            persist(state);
            return out;
          });
          watcher.racedEnd = false;
          watcher.wait = null;
          watcher.importSeq = (watcher.importSeq ?? 0) + 1; // la GUI se ne accorge e si ricarica da sola
          watcher.push(out.duplicate
            ? `Import ignorato: ${out.node} R${out.round} era già in carriera (nessun doppio premio).`
            : `RISULTATO IMPORTATO: ${out.node} R${out.round} — ${out.entry.dnf ? 'ritiro' : 'P' + out.entry.position} · +${out.entry.points} pt · +${out.entry.prize} €`, out.duplicate ? 'warn' : 'good');
        } catch (e) {
          // niente risultati ancora scritti: riprova al prossimo giro per un po', poi molla
          if (!watcher.tries) watcher.tries = 0;
          watcher.tries += 1;
          if (watcher.tries > 20) {
            watcher.racedEnd = false;
            watcher.wait = null;
            watcher.tries = 0;
            watcher.push(`Nessun risultato importabile trovato (${e.message.slice(0, 80)}). Importa a mano dai Risultati.`, 'warn');
          }
        }
      }
    } catch (e) {
      const msg = `Watcher: ${e?.message ?? e}`;
      if (watcher.lastMsg?.msg !== msg) watcher.push(msg, 'warn');
    }
    finally { watcher.busy = false; }
  })();
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Le richieste API si mettono in coda: ogni azione lavora su una fotografia dello
// state caricata dal file. Senza coda, un'azione lenta (es. "race" che attende
// isGameRunning/launch) può sovrascrivere con il suo state vecchio un import
// appena finito dal watcher — e la gara sparirebbe dal salvataggio.
let _apiChain = Promise.resolve();
function serialize(task) {
  const run = _apiChain.then(task, task);
  _apiChain = run.then(() => {}, () => {});
  return run;
}

/** Solo richieste nate dal proprio browser: l'Host è sempre il loopback locale
 *  (chiude il DNS rebinding) e l'Origin, quando il browser lo manda, deve essere
 *  il proprio (chiude il CSRF da qualunque sito aperto nel browser). Nessun
 *  Origin = client locale (curl, CLI, il probe di porta): consentito. */
function requestFromLocalBrowser(req) {
  const host = String(req.headers.host ?? '');
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}` && host !== `[::1]:${PORT}`) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(String(origin));
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.port !== String(PORT)) return false;
    } catch { return false; }
  }
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/api/')) {
      if (!requestFromLocalBrowser(req)) {
        return sendJson(res, 403, { error: 'Richiesta rifiutata: origine non locale (Host/Origin non riconosciuti).' });
      }
      if (req.method === 'POST') {
        const ct = String(req.headers['content-type'] ?? '');
        const hasBody = Number(req.headers['content-length'] ?? 0) > 0;
        if (hasBody && !ct.includes('application/json')) {
          return sendJson(res, 415, { error: 'Le API parlano solo application/json.' });
        }
      }
      const action = url.pathname.slice('/api/'.length);
      const body = req.method === 'POST' ? await readBody(req) : {};
      return await serialize(() => api(context(), req, res, action, body));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const file = join(GUI_DIR, 'index.html');
      if (!existsSync(file)) { res.writeHead(500); return res.end('gui/index.html mancante'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(readFileSync(file));
    }
    const safe = url.pathname.replace(/\.\./g, '').replace(/^\/+/, '');
    const file = join(GUI_DIR, safe);
    const rel = relative(GUI_DIR, file);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(readFileSync(file));
    }
    res.writeHead(404); res.end('non trovato');
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    // qualcosa gira già su questa porta: se è un'altra istanza di questo tool,
    // niente doppioni (due watcher importerebbero due volte) — aggancia ed esci
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/watcher`, { method: 'POST' });
      if (r.ok) {
        const addr = `http://127.0.0.1:${PORT}`;
        console.log(`\n  Il tool è già aperto su ${addr}.`);
        console.log(`  Apro solo il browser — nessuna seconda istanza (il watcher è unico).\n`);
        if (OPEN) {
          const { spawn } = await import('node:child_process');
          if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', addr], { detached: true, stdio: 'ignore' }).unref();
          else spawn('xdg-open', [addr], { detached: true, stdio: 'ignore' }).unref();
        }
        process.exit(0);
      }
    } catch { /* nessun altro server su questa porta: procediamo normali */ }
    // porta occupata da altro software: prova la successiva
    if (PORT < 8642) { PORT += 1; server.listen(PORT, '127.0.0.1'); return; }
    if (PORT < 8655) { PORT += 1; server.listen(PORT, '127.0.0.1'); return; }
  }
  console.error(`\n  Impossibile avviare l'interfaccia: ${e.message}`);
  console.error(`  Se un'altra finestra del tool è già aperta, usa quella.`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://127.0.0.1:${PORT}`;
  console.log(`\n  Carriera EVO — interfaccia grafica   [slot ${SLOT} di 3]`);
  console.log(`  ${addr}  (tieni questa finestra aperta; Ctrl+C per chiudere)`);
  console.log(`  Watcher import automatico: attivo (deposita il risultato quando la gara finisce)\n`);
  if (OPEN) {
    import('node:child_process').then(({ spawn }) => {
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', addr], { detached: true, stdio: 'ignore' }).unref();
      else spawn('xdg-open', [addr], { detached: true, stdio: 'ignore' }).unref();
    });
  }
});

// il watcher parte solo quando il server è davvero in ascolto (prima il primo
// tick poteva scattare prima del listen)
setInterval(watcherTick, 4000);
