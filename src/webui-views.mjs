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
import { agendaDay, dateLabel, scheduledDay, racesOnDay } from './agenda.mjs';
import { raceCard } from './race.mjs';
import { eventCard } from './events.mjs';
import { PIANI } from './orario.mjs';
import { tr } from './lang.mjs';
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

/** Etichette EN dei piani orari (l'italiano sta in PIANI.label, orario.mjs). */
export const PIANI_EN = {
  notte: 'Night race',
  crepuscolo: 'From dusk to night',
  alba: 'The gentle dawn',
  tramontoalba: 'Dusk to dawn (48x)',
  variabile: 'Different hours every time',
  mattina: 'Morning race',
};

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
    messages: (state.messages ?? []).slice(-12).reverse().map(messageForLang),
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
      tr({ it: `prove ${prof.practiceMin ?? 0} min`, en: `practice ${prof.practiceMin ?? 0} min` }),
      tr({ it: `qualifiche ${prof.qualifyMin ?? 0} min`, en: `qualifying ${prof.qualifyMin ?? 0} min` }),
      prof.start === 'grid' ? tr({ it: 'partenza da fermo (griglia)', en: 'standing start (grid)' }) : tr({ it: 'partenza lanciata', en: 'rolling start' }),
      prof.wx === 'dynamic' ? tr({ it: 'meteo dinamico', en: 'dynamic weather' }) : tr({ it: 'meteo fisso', en: 'fixed weather' }),
      tr({ it: prof.pitreq ? 'pit-stop obbligatorio' : 'niente pit obbligatorio', en: prof.pitreq ? 'mandatory pit-stop' : 'no mandatory pit' }),
      prof.timeScale > 1 ? tr({ it: `tempo ×${prof.timeScale}`, en: `time ×${prof.timeScale}` }) : tr({ it: 'tempo reale', en: 'real time' }),
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

/** Messaggi nati prima del doppio linguaggio: restano italiani nel save, ma
 *  i template deterministici si rigenerano in EN alla vista: la firma dello
 *  sponsor e gli annunci di contratto di stagione (i formati sono fissi). */
const LEGACY_CLAUSE_EN = [
  [/chiudi almeno (\d+) gare sul podio/g, (n) => `finish at least ${n} races on the podium`],
  [/totalizza almeno (\d+) punti in stagione/g, (n) => `score at least ${n} championship points in the season`],
  [/vinci almeno (\d+) gare/g, (n) => `win at least ${n} races`],
  [/prendi almeno il giro veloce nelle ultime (\d+) gare/g, (n) => `get at least the fastest lap in the last ${n} races`],
  [/nessun ritiro nelle prime 3 gare/g, () => 'no retirements in the first 3 races'],
  [/chiudi il campionato nei primi (\d+)/g, (n) => `close the championship in the top ${n}`],
];
function LegacyContractPhrasesEn(text) {
  let out = String(text ?? '');
  for (const [re, fn] of LEGACY_CLAUSE_EN) out = out.replace(re, (_, n) => fn(n));
  return out;
}
function legacyMessageEn(text) {
  const k = String(text ?? '');
  let m = k.match(/^Contratto sponsor firmato: (.+)\. (.+)\.$/);
  if (m) return `Sponsor contract signed: ${m[1]}. ` + LegacyContractPhrasesEn(m[2].replace(/(\d+) € a gara in stagione \+ (\d+) € se sali sul podio entro il round (\d+)/, '€$1 per race in the season + €$2 if you podium by round $3')) + '.';
  m = k.match(/^Contratto (.+): tutti gli obiettivi rispettati \((.+)\)\. Premio contrattuale \+(\d+)\.$/);
  if (m) return `Contract ${m[1]}: every objective met (${LegacyContractPhrasesEn(m[2])}). Contractual reward +${m[3]}.`;
  m = k.match(/^Contratto (.+): obiettivi mancati \((.+)\)\. Nessun premio contrattuale\.$/);
  if (m) return `Contract ${m[1]}: objectives missed (${LegacyContractPhrasesEn(m[2])}). No contractual reward.`;
  m = k.match(/^Contratto (.+): (.+)\. Premio al rispetto: (\d+) €$/);
  if (m) return `Contract ${m[1]}: ${LegacyContractPhrasesEn(m[2])}. Reward for compliance: €${m[3]}`;
  m = k.match(/^(.+?) · (.+?): (ritiro|P\d+)(.*?) · \+(\d+) premio( \(prova iconica\))? \(\+(\d+) sponsor\) · \+(\d+) reputazione$/);
  if (m) return `${m[1]} · ${m[2]}: ${m[3] === 'ritiro' ? 'retired' : m[3]}${String(m[4] ?? '').replace('giro veloce', 'fastest lap')} · +${m[5]} prize${m[6] ? ' (iconic race)' : ''} (+${m[7]} sponsor) · +${m[8]} reputation`;
  m = k.match(/^Iscrizione (.+) round (\d+) \(-(\d+)\)\.$/);
  if (m) return `Entry fee ${m[1]} round ${m[2]} (-${m[3]}).`;
  m = k.match(/^Stagione (\d+) in (.+) chiusa in P(\d+) con (\d+) punti\.$/);
  if (m) return `Season ${m[1]} in ${m[2]} closed in P${m[3]} with ${m[4]} points.`;
  m = k.match(/^CAMPIONE di (.+) \(stagione (\d+)\)! Bonus titolo \+(\d+)\.$/);
  if (m) return `CHAMPION of ${m[1]} (season ${m[2]})! Title bonus +${m[3]}.`;
  m = k.match(/^Carriera iniziata in (.+)\. Soldi in tasca: (\d+)\.$/);
  if (m) return `Career started in ${m[1]}. Cash on hand: €${m[2]}.`;
  m = k.match(/^Nuovo miglior giro personale a (.+): (\S+) \((.+)\)\.$/);
  if (m) return `New personal best lap at ${m[1]}: ${m[2]} (${m[3]}).`;
  m = k.match(/^Missione sponsor centrata: podio entro il round (\d+) \(\+(\d+) da (.+)\)\.$/);
  if (m) return `Sponsor mission met: podium by round ${m[1]} (+${m[2]} from ${m[3]}).`;
  m = k.match(/^Scelta la gara del giorno: (.+) R(\d+) \((.+)\)\.$/);
  if (m) return `Picked today's race: ${m[1]} R${m[2]} (${m[3]}).`;
  m = k.match(/^Iscritto a (.+?): le sue gare partono sulla griglia del calendario da oggi\.$/);
  if (m) return `Signed up for ${m[1]}: its races start from today's calendar grid.`;
  m = k.match(/^Difficoltà EVO di (.+) impostata a consiglio automatico\.$/);
  if (m) return `EVO difficulty of ${m[1]} set to auto suggestion.`;
  m = k.match(/^Difficoltà EVO di (.+) impostata a ([\d?]+–[\d?]+%)\.$/);
  if (m) return `EVO difficulty of ${m[1]} set to ${m[2]}.`;
  m = k.match(/^Difficoltà regolata a mano: trim ([+-]?\d+) su (.+)\.$/);
  if (m) return `Difficulty set by hand: trim ${m[1]} on ${m[2]}.`;
  m = k.match(/^Difficoltà di (.+) portata a trim ([+-]?\d+) \((.+)\): banda EVO ora ([\d?]+–[\d?]+%)\.$/);
  if (m) return `Difficulty of ${m[1]} moved to trim ${m[2]} (${m[3]}): EVO band now ${m[4]}.`;
  m = k.match(/^Modalità test attiva: tutte le gare a (\d+) giri \((.+)\)\. Riattiva con: (.+)$/);
  if (m) return `Test mode active: all races at ${m[1]} laps (${m[2]}). Restore with: ${m[3]}`;
  m = k.match(/^Difficoltà AI impostata su "(.+)"(?: \(valore (\d+)\))?\.$/);
  if (m) return `AI difficulty set to "${m[1]}"${m[2] ? ` (value ${m[2]})` : ''}.`;
  m = k.match(/^(.+): sei stato invitato a un evento speciale\. Guarda il pannello Eventi nel Cruscotto\.$/);
  if (m) return `${m[1]}: you have been invited to a special event. Check the Events panel on the Dashboard.`;
  m = k.match(/^Default difficoltà: AI ([\d-]+)% su tutte le serie \(modalità fissa, interna (\d+)\)\. È il tuo livello di gara dopo (la|le) (.+)\.$/);
  if (m) return `Default difficulty: AI ${m[1]}% on all series (fixed mode, internal ${m[2]}). It's your race level after ${m[4]}.`;
  m = k.match(/^Default difficoltà: AI ([\d-]+)% su tutte le serie \(modalità fissa, interna (\d+)\)\.$/);
  if (m) return `Default difficulty: AI ${m[1]}% on all series (fixed mode, internal ${m[2]}).`;
  return null;
}

/** Un messaggio del save nella lingua attiva: i bilingui (text, textEn)>
 *  prendono il testo della lingua; i vecchi monolingui passano da
 *  legacyMessageEn (template deterministici rigenerabili) e restano invariati
 *  se il formato non è noto. */
function messageForLang(m) {
  const raw = typeof m === 'string' ? { text: m } : { ...m };
  const it = typeof raw.text === 'string' ? raw.text : '';
  if (raw.textEn) { raw.text = tr({ it, en: raw.textEn }); return raw; }
  const en = legacyMessageEn(it);
  if (en) raw.text = tr({ it, en });
  return raw;
}

function viewMessages(ladder, state) {
  return {
    mailbox: mailbox(ladder, state),
    // bacheca nella lingua attiva: i messaggi nuovi portano textEn, i vecchi
    // restano quelli di nascita (salvo i template deterministici, rigenerabili)
    messages: (state.messages ?? []).slice(-20).reverse().map(messageForLang),
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
    // piani orari per la select "Piano orario della serie" (orario.mjs)
    piani: Object.fromEntries(Object.entries(PIANI).map(([id, p]) => [id, { label: tr({ it: p.label, en: PIANI_EN[id] ?? p.label }) }])),
    pianoCurrent: state.raceSettings?.[card.node.nodeId]?.piano ?? null,
    distPct: card.distPct ?? 100,
    baseLaps: card.baseLaps ?? null,
    laps: card.laps ?? null,
    prizeFull: card.prizeFull ?? null,
    prizeEff: card.prizeEff ?? null,
    practiceStart: card.practiceStart,
    qualifyStart: card.qualifyStart,
    warmupStart: card.warmupStart,
    raceHour: card.raceHour,
    settings: card.settings,
    warnings: card.warnings,
    // rituale della prima griglia della serie (23/10: serie nuova = template
    // assente sul disco): se c'è da fare tell'ora, la card la mostra in testa
    gridRitual: card.gridRitual ?? null,
    // PRIMA ACCENSIONE (26/10): il rituale «apri il Race Weekend una volta»
    // Compare SOLO se EVO non ha ancora nessun weekend su disco — appena il
    // round esiste (weekendSeen=true) l'avviso scompare da solo
    weekendSeen: card.weekendSeen ?? true,
    carAdvice: card.carAdvice,
    outlook: card.outlook,
    challenge: card.challenge ?? null,
    // il nudge "serie troppo facile" porta nel save la ragione in italiano:
    // i formati sono fissi (import.mjs), li rimappiamo alla lingua attiva.
    // Dal 27/10vale SOLO sulla serie che l'ha generato: firmata una serie
    // nuova, la "vecchia" Mazda RX-7 non compare più sulla sua scheda (bug
    // visto dal vivo 27/10: nudge dell'RX-7 sopra la scheda del NUOVO
    // campionato). Non si elimina il meccanismo: è la regolazione della
    // Veteran witnessed difficulty of that series — e qui una volta detta
    // (Applica +1 o «No, va bene così») sparisce per sempre: è già cosi
    // (difficulty-nudge / nudge-dismiss la cancellano dal save).
    pendingNudge: null,   // richiesto Mauro 27/10: banner «serie troppo facile» RIMOSSO
    // dalla scheda. Resta solo il banner nel debrief a fine gara (viste-c.js),
    // dove l'offerta del +1 è contestuale e non insegue per giorni la scheda
    // della serie successivemente iscritta. Il trim adattivo automatico vive
    // sempre (pagina Difficoltà, «Suggerimento in attesa» qui sotto).
    // il "Suggerimento in attesa" del trim adattivo (pagina Difficoltà) proposto anche qui
    pendingProposal: state.difficulty?.pending ?? null,
    heritageActive: (() => {
      const mem = state.heritage?.active;
      if (!mem || mem.done) return null;
      const isRound = mem.nodeId === card.node.nodeId && (mem.rounds ?? []).includes(card.round?.track);
      if (!isRound) return null;
      return { title: mem.title, titleEn: mem.titleEn ?? null, ancestor: mem.ancestor, relation: mem.relation, relationEn: mem.relationEn ?? null, era: mem.era, objective: mem.objective?.text ?? '', objectiveEn: mem.objective?.en ?? null, done: mem.progress?.length ?? 0, total: (mem.tracksDisplay ?? mem.rounds ?? []).length, inherit: mem.inherit };
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
        let sessions = collectSessions(root, resultsDir, { car: card.carName, track: card.trackName, limit: 8, afterMs: state.createdAt ?? 0 });
        // FALLBACK MAI PIU' SILENZIOSO: se il round ha una pista nota e non esiste
        // telemetria SU QUELLA pista, non prendiamo le sessioni recenti dell'auto —
        // subito dopo una gara sarebbero proprio la gara appena corsa (pista diversa):
        // pressioni e consumi cambiano da pista a pista e fuorviano. Il fallback
        // auto-only resta solo per i round senza pista nota (primissima partenza).
        if (!sessions.length && !card.trackName) sessions = collectSessions(root, resultsDir, { car: card.carName, limit: 8, afterMs: state.createdAt ?? 0 });
        // EVO a volte scrive il file MoTeC SENZA i dati (solo intestazione: capita in
        // alcune sessioni, es. time attack, o chiudendo il gioco di colpo): lo segnaliamo
        // invece di lasciare il box muto sulla pressione
        if (sessions.length) {
          telemEmpty = false;
        } else if (card.trackName) {
          wrongTrack = true; // niente telemetria utilizzabile su QUESTA pista
          wrongTrackName = listMotecSessions(root, { car: card.carName, afterMs: state.createdAt ?? 0 })[0]?.track ?? null;
        } else {
          telemEmpty = listMotecSessions(root, { car: card.carName, afterMs: state.createdAt ?? 0 }).length > 0;
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
        tips.push({ icon: '🔧', title: tr({ it: 'Pit-stop obbligatorio', en: 'Mandatory pit stop' }), text: laps
          ? tr({ it: `almeno 1 sosta: scendi tra il giro ${Math.max(2, Math.ceil(laps / 2) - 2)} e il giro ${Math.min(laps - 1, Math.ceil(laps / 2) + 2)} (finestra sicura) — limite box ${pitKmh} km/h, controlla la riga gomme`, en: `at least 1 stop: dive in between lap ${Math.max(2, Math.ceil(laps / 2) - 2)} and lap ${Math.min(laps - 1, Math.ceil(laps / 2) + 2)} (safe window) — pit limiter ${pitKmh} km/h, check the tyre row` })
          : tr({ it: `almeno 1 sosta — limite box ${pitKmh} km/h`, en: `at least 1 stop — pit limiter ${pitKmh} km/h` }) });
      } else if (laps != null && laps >= 12) {
        tips.push({ icon: '⛽', title: tr({ it: 'Sosta consigliata', en: 'Suggested stop' }), text: tr({ it: `gara di ${laps} giri senza pit obbligatorio: se la benzina non arriva${fuel ? ` (${fuel.need} L stimati)` : ''} o le gomme cedono dopo metà gara, la sosta a metà è quasi sempre vincente`, en: `a ${laps}-lap race with no mandatory pit: if the fuel does not arrive${fuel ? ` (~${fuel.need} L estimated)` : ''} or the tyres fade after mid-race, the mid-race stop is almost always the winner` }) });
      } else if (laps != null) {
        tips.push({ icon: '🚫', title: tr({ it: 'Niente sosta', en: 'No stop' }), text: tr({ it: `gara di ${laps} giri: benzina e gomme arrivano in fondo — il pit ti costa troppo tempo, evitalo a meno di danni`, en: `a ${laps}-lap race: fuel and tyres make it to the end — the pit costs you too much time, avoid it unless damaged` }) });
      }
      const wx = card.weather ?? '';
      const wet = /rain/i.test(wx);
      // pressione gomme ideale: il numero dell'ingegnere, con le correzioni di contesto
      if (race?.ok && race.raceStartPsi != null) {
        let psi = race.raceStartPsi;
        const notes = [];
        if (wet) { psi = Math.round((psi + 0.4) * 10) / 10; notes.push(tr({ it: '+0.4 per il bagnato (la gomma lavora più fredda)', en: '+0.4 for the wet (the tyre runs cooler)' })); }
        if (profile.pitreq && laps) { notes.push(tr({ it: 'dopo il pit: azzeri il bring-in, la gomma nuova riparte ~1 PSI sotto il target', en: 'after the pit: the bring-in resets, the new tyre leaves ~1 PSI below target' })); }
        if ((card.round?.hour ?? 12) >= 17) { notes.push(tr({ it: 'a sera la pista si raffredda: se dopo 5 giri sei sotto target, apri 0.2', en: 'in the evening the track cools down: if after 5 laps you are under target, open 0.2' })); }
        tips.push({ icon: '🛞', title: tr({ it: `Pressione gomme ideale: ${psi} PSI`, en: `Ideal tyre pressure: ${psi} PSI` }), text: tr({ it: `partenza da freddo per la gara di ${laps ?? '?'} giri (target a caldo ${tyre.target} PSI${notes.length ? ' · ' + notes.join(' · ') : ''})`, en: `cold start for the ${laps ?? '?'}-lap race (hot target ${tyre.target} PSI${notes.length ? ' · ' + notes.join(' · ') : ''})` }) });
      } else {
        // senza telemetria usabile: stima dalla classe gomme con la regola dei 4 PSI
        // (la gomma in stint sano sale di 3–5 PSI: parti ~4 sotto il target a caldo)
        const est = Math.round((tyre.target - 4 + (wet ? 0.4 : 0)) * 10) / 10;
        tips.push({ icon: '🛞', title: tr({ it: `Pressione gomme ideale: ~${est} PSI (stima)`, en: `Ideal tyre pressure: ~${est} PSI (estimate)` }), text: tr({ it: `nessun dato telemetrico ancora: regola dei 4 PSI — parti ~4 sotto il target (${tyre.target} a caldo${wet ? ' · +0.4 per il bagnato' : ''}) e correggi alla prossima uscita`, en: `no telemetry data yet: the 4-PSI rule — start ~4 under the target (${tyre.target} hot${wet ? ' · +0.4 for the wet' : ''}) and correct at the next session` }) });
      }
      if (telemEmpty) {
        tips.push({ icon: '📭', title: tr({ it: 'Telemetria di questa auto vuota', en: 'Empty telemetry for this car' }), text: tr({ it: 'EVO non ha scritto i dati nel file MoTeC (capita in alcune sessioni, es. time attack, o chiudendo il gioco di colpo): rifai un paio di giri in prova e i consigli torneranno calcolati sui tuoi dati veri', en: 'EVO wrote no data into the MoTeC file (happens in some sessions, e.g. time attack, or closing the game abruptly): run a couple of practice laps and the tips will be back, computed on your real data' }) });
      }
      if (wrongTrack) {
        tips.push({ icon: '📭', title: tr({ it: `Nessuna telemetria su ${card.trackName}`, en: `No telemetry on ${card.trackName}` }), text: wrongTrackName
          ? tr({ it: `l'ultima telemetria di questa auto è da ${wrongTrackName}: non la usiamo per questa gara perché pressioni e consumi cambiano da pista a pista — fai qualche giro in prova e i consigli torneranno calcolati sui tuoi dati veri`, en: `the latest telemetry of this car is from ${wrongTrackName}: not using it for this race, since pressures and consumption change track by track — run some practice laps and the tips will be back, computed on your real data` })
          : tr({ it: 'non hai ancora girato su questa pista con questa auto: fai qualche giro in prova e i consigli torneranno calcolati sui tuoi dati veri', en: 'you have not lapped this track with this car yet: run some practice laps and the tips will be back, computed on your real data' }) });
      }
      if (wet) {
        tips.push({ icon: '🌧️', title: tr({ it: 'Bagnato fisso', en: 'Fixed wet' }), text: tr({ it: `gara TUTTA in pioggia (${wx.replace(/^.*_/, '')}): accelera dolce in trazione e anticipa la frenata di 10–15 m`, en: `the WHOLE race in the rain (${wx.replace(/^.*_/, '')}): feed the throttle gently in traction and brake 10–15 m earlier` }) });
      }
      if ((card.round?.hour ?? 12) >= 17) {
        tips.push({ icon: '🌆', title: tr({ it: 'Gara serale', en: 'Evening race' }), text: tr({ it: `partenza alle ${String(card.round.hour).padStart(2, '0')}:00: la pista si raffredda col passare dei giri — la pressione scende, non strafare con la partenza`, en: `start at ${String(card.round.hour).padStart(2, '0')}:00: the track cools down lap after lap — pressure drops, keep the launch gentle` }) });
      }
      if (fuel?.need != null) {
        tips.push({ icon: '⛽', title: tr({ it: 'Benzina', en: 'Fuel' }), text: tr({ it: `${fuel.need} litri per ${fuel.laps} giri (consumo medio ${fuel.perLap} L/giro dalla telemetria) + 1 di riserva`, en: `${fuel.need} litres for ${fuel.laps} laps (average consumption ${fuel.perLap} L/lap from telemetry) + 1 in reserve` }) });
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
    // banda STRETTA di un punto (scelta Mauro 23/10: gap massimo 1% su tutte le serie)
    const baseBand = oMin ?? Math.max(0, Math.round(d.slider));
    rows.push({
      id: node.nodeId, display: node.display, discipline: disciplineName(ladder, node.discipline),
      current: node.nodeId === state.node,
      base: Math.round(d.base ?? 0), trim: d.trim, offClass: d.offClass, offTrack: d.offTrack,
      total: Math.round(d.total), slider: d.slider, locked: !!d.locked,
      rangeMin: baseBand,
      rangeMax: oMax ?? Math.min(100, baseBand + 1),
      overridden: oMin != null || oMax != null,
    });
  }
  // L'EVENTO SPECIALE non è una serie del ladder (lezione 23/10: la scheda
  // difficoltà lo ometteva e Mauro non vedeva la sua banda): con un evento
  // attivo lo si mostra in cima alla lista, con i suoi SOLO cursori — banda
  // fissa 88–93 della card evento, o l'override scritto dall'utente (id
  // `evento_*`, ce l'ha anche il tasto range del pannello). NON ha base/trim:
  // sono le colonne del ladder, qui segnata con "—".
  try {
    const evCard = eventCard(ladder, state);
    if (evCard) {
      const evId = `evento_${evCard.theme?.id ?? 'speciale'}`;
      const ov = state.raceSettings?.[evId] ?? {};
      const lo = Number.isFinite(Number(ov.sliderMin)) ? Number(ov.sliderMin) : evCard.diffMin;
      const hi = Number.isFinite(Number(ov.sliderMax)) ? Number(ov.sliderMax) : evCard.diffMax;
      rows.unshift({
        id: evId, display: `★ ${evCard.theme?.name ?? 'Evento speciale'} — evento speciale`, discipline: 'evento speciale',
        current: false, base: '—', trim: '—', offClass: '—', offTrack: '—',
        total: null, slider: lo, locked: false,
        rangeMin: lo, rangeMax: hi,
        overridden: ov.sliderMin != null || ov.sliderMax != null,
        evento: true,
      });
    }
  } catch { /* senza stato/eventi la scheda resta quella delle sole serie */ }
  return {
    mode: state.difficulty?.mode ?? 'adaptive',
    global: state.difficulty?.global ?? 0,   // registro dei nudge manuali: vale su ogni serie (Mauro 27/10)
    internalRange: { min: 70, max: 120 },
    trimRange: { min: -20, max: 20 },
    sliderRange,
    rows,
    pending: state.difficulty?.pending ?? null,
    pendingDisplay: state.difficulty?.pending ? nodeById(ladder, state.difficulty.pending.nodeId).display : null,
  };
}

function viewSetup(ladder, paths = null) {
  // paths può essere null (primo avvio senza cartella dati): non crasha MAI —
  // il wizard è lì per sistemare il percorso; qui va solo il minimo vitale.
  if (!paths) {
    try { paths = context().paths; } catch { paths = null; }
  }
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
  if (!paths) {
    return {
      dataDirs: [], resultsDirs: [], logsDirs: [], gameExe: null, slots,
      saved: existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {},
      content: { cars: 0, tracks: 0 },
      ladder: { nodes: ladder.nodes.length, disciplines: ladder.disciplines.length },
      issues: [],
      steamUrl: `steam://rungameid/${STEAM_APP_ID}`,
    };
  }
  // cache TTL 30s: scanContent cammina l'intera installazione EVO — /api/boot
  // veniva riscritto riga per riga ad ogni caricamento pagina (cache in content.mjs)
  const content = scanContentCached(paths);
  const issues = validateLadder(ladder, content);
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

export { viewStatus, seriesNodeView, viewCalendar, viewStandings, viewMessages, viewCard, viewDifficulty, viewSetup, legacyMessageEn };
