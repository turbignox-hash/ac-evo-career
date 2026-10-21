// agenda.mjs — il calendario CONTINUO della carriera (stile Zero to Apex).
//
// Rif. schermata "SERIE REALI · CALENDARIO" di Zero to Apex:
//  - la carriera comincia in una DATA REALE e avanza di 1 giorno a ogni gara;
//  - le gare di TUTTE le serie della scala vivono sulla griglia di giorni:
//    ogni serie corre a cadenza fissa da un giorno d'ancoraggio (la sua iscrizione,
//    o un sfasamento derivato dal nome della serie ⇒ le gare sono sparpagliate
//    sulle giornate, non impilate: ogni giorno ha TANTE gare);
//  - gli stati: iscritto (campionato tuo) · fattibile (gate/reputazione aperta) ·
//    bloccata (gate/reputazione chiusa) · chiusa?agna completa (serve season-end);
//  - solo le gare FATTIBILI possono essere scelte ("scegli la gara di oggi"):
//    le bloccate mostrano cosa manca, senza mai fingersi disponibili.
//
// Ogni serie ha la SUA numerazione di stagione: cambiare sedile e tornare non
// riparte da zero (le ronde corse restano corse).

import { nodeById, gateStatus } from './state.mjs';

export const CADENZA_GIORNI = 7;         // una ronda a SETTIMANA per le serie iscritte (scelta Mauro)
export const CADENZA_LIVELLI = 3;        // cadenza MINIMA delle serie non iscritte (gare "altrove")
/** Le serie non iscritte NON corrono tutte ogni 3 giorni (richiesta Mauro 21/10:
 *  l'agenda mostrava SEMPRE le stesse 25-30 gare, mai un buco). Ogni serie
 *  ricorre con cadenza PROPRIA, deterministica dal contatore della serie:
 *  3..10 giorni. Media ~6,5 → a ogni giornata solo una parte delle serie
 *  arriva, e il muro cambia ogni volta (con giorni più magri: i buchi). */
export function cadenzaSerie(seriesCounter) {
  const h = ((seriesCounter * 2654435761) >>> 0);   // Knuth multiplicative hash, spalma bene
  return CADENZA_LIVELLI + (h % 8);                  // 3..10
}
export const MAX_SCELTE_PER_GIORNO = 3;  // al massimo 3 gare in una giornata

/* ================================================= cDate util ================================================ */

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** La data di partenza della carriera (stabile): nel salvataggio, o la default (13 Apr 2025). */
export function careerStartDate(state) {
  const v = Number(state.agenda?.startDate);
  return Number.isFinite(v) && v >= 0 ? v : 0;   // offset in giorni dalla data base
}

/** Data REALE della carriera n-esima di calendario: 2025-04-13 + n giorni. */
export function realDate(day) {
  const base = new Date(Date.UTC(2025, 3, 13)); // 13 Apr 2025
  base.setUTCDate(base.getUTCDate() + (day - 1));
  return base;
}

export function dateLabel(day) {
  const d = realDate(day);
  return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function dateShort(day) {
  const d = realDate(day);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MESI[d.getUTCMonth()]}`;
}

/* ------------------------------------------------------------------ */
/* stato agenda                                                        */
/* ------------------------------------------------------------------ */

export function agendaDay(state) {
  return Math.max(1, Math.floor(Number(state.agenda?.day) || 1));
}

export function ensureAgenda(state) {
  state.agenda ??= { day: 1, startDate: 0 };
  if (!Number.isFinite(Number(state.agenda.startDate))) state.agenda.startDate = 0;
  state.seats ??= {};
  return state;
}

export function hasSeat(state, nodeId) {
  return !!(state.seats && state.seats[nodeId]);
}

/* ------------------------------------------------------------------ */
/* stagione di campagna di una serie                                   */
/* ------------------------------------------------------------------ */

/** La stagione proposta per la serie n è la più recente che è ancora usa
 *  1  ha ronde non corse), altrimenti la nuova. */
export function campaignSeason(ladder, state, node) {
  const results = state.results?.[node.nodeId] ?? [];
  let last = 0;
  for (const r of results) if (Number(r.season) > last) last = Number(r.season);
  if (last && results.filter((r) => Number(r.season) === last).length < node.calendar.length) return last;
  return state.season;
}

/** Indice della prossima ronda NON corsa nella stagione di campagna (0-based). */
export function nextUnplayedRoundIndex(ladder, state, node) {
  const season = campaignSeason(ladder, state, node);
  const played = new Set((state.results?.[node.nodeId] ?? []).filter((r) => Number(r.season) === season).map((r) => r.round));
  for (let i = 0; i < node.calendar.length; i++) {
    if (!played.has(i)) return { index: i, season, playedCount: played.size };
  }
  return { index: null, season, playedCount: node.calendar.length };
}

/* ------------------------------------------------------------------ */
/* ancoraggio serie → giorno                                           */
/* ------------------------------------------------------------------ */

/** Il giorno d'ancoraggio di una serie (istanza l'ha sempre):
 *  - le serie con sedile: il giorno dell'iscrizione;
 *  - le altre: deterministico dal nome della serie, sparpagliate sui giorni
 *    cosicché ogni giornata sia affollata (le gare di ZTA sono TANTE per giorno). */
export function seatAnchor(ladder, state, node) {
  const seat = state.seats?.[node.nodeId];
  if (seat && Number.isFinite(Number(seat.day)) && Number(seat.day) >= 1) {
    seat.day = Math.max(1, Math.floor(Number(seat.day)));
    seat.season = Number.isFinite(Number(seat.season)) ? Number(seat.season) || state.season : state.season;
    return seat.day;
  }
  // niente sedile = gare programmate comunque sulla griglia (le "serie reali"),
  // ma con ANCORAGGI SPARSI: la mod (%) dà ogni serie un giorno d'arrivo diverso
  const seriesCounter = ladder.nodes.findIndex((n) => n.nodeId === node.nodeId) + 1;
  return ((seriesCounter * 977) % CADENZA_LIVELLI) + 1;   // partenza tra giorno 1 e 3
}

/** Cadenza della serie: a SETTIMANA se iscritta (scelta Mauro); se no la
 *  cadenza PROPRIA (3..10) viene da cadenzaSerie(counter) — calcolata/dai
 *  chiamanti col contatore della serie per non riscorrere la scala qui. */
export function cadenzaOf(state, node, seriesCounter = null) {
  if (hasSeat(state, node.nodeId)) return CADENZA_GIORNI;
  return cadenzaSerie(seriesCounter ?? 1);
}

/** Giorno della PROSSIMA ronda non corsa della serie (0-based offset x cadenza). */
export function scheduledDay(ladder, state, node) {
  const { index, season } = nextUnplayedRoundIndex(ladder, state, node);
  if (index == null) return null;          // stagione completa: serve season-end
  const seat = state.seats?.[node.nodeId];
  const seatSeason = Number(seat?.season) || campaignSeason(ladder, state, node);
  const seasonsGap = seat ? Math.max(0, season - seatSeason) : 0;
  const offset = seasonsGap * node.calendar.length + index;
  return Math.max(1, seatAnchor(ladder, state, node) + offset * cadenzaOf(state, node));
}

export function nextUnplayedRound(ladder, state, node) {
  const { index, season } = nextUnplayedRoundIndex(ladder, state, node);
  if (index == null) return null;
  const round = node.calendar[index];
  const names = ladder.contentNames?.tracks ?? {};
  return {
    node, index, season,
    name: round.name ?? `Round ${index + 1}`,
    trackId: round.track,
    track: names[round.track] ?? round.track,
    laps: round.laps ?? null,
    hour: round.hour ?? null,
    weather: ladder.weatherNames?.[String(round.weather)] ?? null,
    scheduledDay: scheduledDay(ladder, state, node),
  };
}

/* ------------------------------------------------------------------ */
/* stato di una serie: iscritto | fattibile | bloccata | chiusa        */
/* ------------------------------------------------------------------ */

export function seriesStatus(ladder, state, node) {
  const r = nextUnplayedRound(ladder, state, node);
  if (!r) return 'completata';               // stagione completa (serve season-end)
  if (hasSeat(state, node.nodeId)) return 'iscritto';
  return gateStatus(ladder, state, node).ok ? 'fattibile' : 'bloccata';
}

/* ------------------------------------------------------------------ */
/* le gare di UNA giornata (griglia affollata, tutte le serie)         */
/* ------------------------------------------------------------------ */

/** Tutte le gare in programma nel giorno `d`.
 *  Serie ISCRITTE: calendario guidato dai risultati, gare in ritardo mai perdute.
 *  Serie NON iscritte: proiezione PROCEDURALE a tempo — la ronda k cade a
 *  giorno ancoraggio + k·cadenza e le stagioni si susseguono all'infinito:
 *  il calendario non cessa mai di creare campionati (niente "dopo il 4 maggio"). */
export function racesOnDay(ladder, state, d) {
  const out = [];
  for (const node of ladder.nodes) {
    if (hasSeat(state, node.nodeId)) {
      const r = nextUnplayedRound(ladder, state, node);
      if (r && r.scheduledDay != null && r.scheduledDay <= d) {
        out.push({
          node, index: r.index, season: r.season, name: r.name, trackId: r.trackId,
          track: r.track, laps: r.laps, hour: r.hour, weather: r.weather,
          scheduledDay: r.scheduledDay, late: r.scheduledDay < d, onSchedule: r.scheduledDay === d,
          champStarted: r.scheduledDay < d,  // il suo campionato riparte indietro: è già "iniziata"
          stato: 'iscritto', fattibile: true, gateReasons: [],
          isCurrent: node.nodeId === state.node,
        });
      }
      continue;
    }
    const len = node.calendar.length;
    if (len === 0) continue;
    const seriesCounter = ladder.nodes.findIndex((n) => n.nodeId === node.nodeId) + 1;
    const cadenza = cadenzaSerie(seriesCounter);   // 3..10, deterministica per serie
    // PROCEDURA A CICLO: la R1 della serie ricorre ogni len·cadenza giorni,
    // con sfasamento deterministico fra le serie. Con cadenze DIVERSE per serie,
    // le combinazioni si spalmano: ogni giorno il quadro è diverso e compaiono
    // buchi naturali (richiesta Mauro: modo più stimolante, muro sempre uguale no).
    const cycle = len * cadenza;
    const r1Day = ((seriesCounter * 713) % cycle) + 1;      // giorno del PROSSIMO/ATTUALE R1
    const sinceR1 = ((d - r1Day) % cycle + cycle) % cycle;   // giorni passati dall'ultimo R1
    if (sinceR1 % cadenza !== 0) continue;
    const k = sinceR1 / cadenza;
    const index = k % len;
    const season = (state.season ?? 1) + Math.floor((k + ((d >= r1Day ? 0 : 0))) / len);
    if (d < r1Day && sinceR1 !== 0) continue;               // prima del primo R1: niente
    const round = node.calendar[index];
    const names = ladder.contentNames?.tracks ?? {};
    const gate = gateStatus(ladder, state, node);
    out.push({
      node, index, season,
      name: round.name ?? `Round ${index + 1}`,
      trackId: round.track,
      track: names[round.track] ?? round.track,
      laps: round.laps ?? null, hour: round.hour ?? null,
      weather: ladder.weatherNames?.[String(round.weather)] ?? null,
      scheduledDay: d, onSchedule: true, late: false, procedural: true,
      // il campionato è GIÀ PARTITO se questo giorno mostra la R2+: la sua R1
      // è caduta giorni fa — serve a "nascondi gare già iniziate"
      champStarted: index > 0,
      stato: gate.ok ? 'fattibile' : 'bloccata',
      fattibile: gate.ok, gateReasons: gate.reasons,
      isCurrent: false,
    });
  }
  out.sort((a, b) =>
    (b.node.econ?.prize ?? 0) - (a.node.econ?.prize ?? 0) ||
    (a.node.level ?? 0) - (b.node.level ?? 0) ||
    a.node.display.localeCompare(b.node.display));
  return out;
}

/** Le gare DUE (o in ritardo) per un dato giorno, SOLO delle serie iscritte:
 *  la versione "agenda del pilota" (le card su cui si clicca davvero). */
export function gareDelGiorno(ladder, state, day = null) {
  ensureAgenda(state);
  const d = Math.max(1, Math.floor(Number(day) || agendaDay(state)));
  const out = [];
  for (const nodeId of Object.keys(state.seats ?? {})) {
    let node;
    try { node = nodeById(ladder, nodeId); } catch { continue; }
    const r = nextUnplayedRound(ladder, state, node);
    if (!r || r.scheduledDay == null) continue;
    if (r.scheduledDay <= d) {
      out.push({
        node, index: r.index, season: r.season, name: r.name, trackId: r.trackId,
        track: r.track, laps: r.laps, hour: r.hour, weather: r.weather,
        scheduledDay: r.scheduledDay,
        onSchedule: r.scheduledDay === d, late: r.scheduledDay < d,
        isCurrent: node.nodeId === state.node,
      });
    }
  }
  out.sort((a, b) =>
    (a.late ? 1 : 0) - (b.late ? 1 : 0) ||
    (a.node.level ?? 0) - (b.node.level ?? 0) ||
    a.node.display.localeCompare(b.node.display));
  return { day: d, gare: out };
}

export function prossimoGiornoConGara(ladder, state, fromDay = null) {
  ensureAgenda(state);
  const base = Math.max(1, Math.floor(Number(fromDay) || agendaDay(state)));
  let best = null;
  for (const nodeId of Object.keys(state.seats ?? {})) {
    let node;
    try { node = nodeById(ladder, nodeId); } catch { continue; }
    const sd = scheduledDay(ladder, state, node);
    if (sd == null || sd <= base) continue;
    if (best == null || sd < best) best = sd;
  }
  return best;
}

export function avanzaGiorno(state, to = null) {
  ensureAgenda(state);
  const t = to == null ? agendaDay(state) + 1 : Math.max(1, Math.floor(Number(to)));
  if (t > state.agenda.day) state.agenda.day = t;
  return agendaDay(state);
}

/**
 * Giornata AUTO-avanzata dopo la registrazione di una gara (richiesta Mauro
 * 19/10/2026): applyRaceResult già porta il giorno a +1, ma spesso il giorno
 * dopo i tuoi sedili NON hanno gare in programma e il calendario sembra fermo.
 * Criterio (testato 19/10): contano SOLO le gare IN PROGRAMMA oggi (onSchedule);
 * quelle passate restano comunque elencate come "in ritardo" (buon corso,
 * Ulisse) ma non devono più fermare il calendario: se oggi non c'è niente
 * in programma, salta direttamente al prossimo giorno che ne ospita una.
 * Nessuna gara in programma entro 28 giorni (tutti i sedili in ritardo): +1
 * semplice, tanto le gare dovute ti seguono dove vai.
 */
export function avanzaDopoGara(ladder, state) {
  ensureAgenda(state);
  const d = agendaDay(state);
  // solo i SEDILI iscritti contano: le serie “altrove” riempiono ogni giorno e
  // vanificherebbero il criterio (19/10: i 23 in-programma del giorno 19 erano
  // quasi tutte serie fattibili/bloccate, non gare TUOLE)
  const mie = (gare) => gare.filter((g) => state.seats?.[g.node?.nodeId] && g.onSchedule);
  const oggi = mie(racesOnDay(ladder, state, d));
  if (oggi.length) return { jump: false, day: d, gare: oggi.length };
  for (let v = d + 1, limite = d + 28; v <= limite; v++) {
    const gare = mie(racesOnDay(ladder, state, v));
    if (gare.length) { avanzaGiorno(state, v); return { jump: true, day: v, gare: gare.length }; }
  }
  avanzaGiorno(state, d + 1);
  return { jump: true, day: d + 1, gare: 0, nota: 'nessuna gara in programma entro 28 giorni: +1 semplice' };
}

export function avanzaDopoRisultato(state) {
  ensureAgenda(state);
  state.agenda.day += 1;
  return agendaDay(state);
}

/* ------------------------------------------------------------------ */
/* scelte del giorno: al massimo MAX_SCELTE_PER_GIORNO gare            */
/* ------------------------------------------------------------------ */

/** Le serie scelte per la giornata `d` (elenco di nodeId, senza doppioni). */
export function choicesForDay(state, d) {
  const k = Math.max(1, Math.floor(Number(d) || agendaDay(state)));
  return state.agenda?.choices?.[k] ?? [];
}

export function choicesOf(state, d) {
  const k = Math.max(1, Math.floor(Number(d) || agendaDay(state)));
  state.agenda ??= { day: 1 };
  state.agenda.choices ??= {};
  state.agenda.choices[k] ??= [];
  return state.agenda.choices[k];
}

/** Registra una scelta (idempotente): ritorna l'elenco aggiornato. */
export function recordChoice(state, d, nodeId) {
  const list = choicesOf(state, d);
  if (!list.includes(nodeId)) list.push(nodeId);
  return list;
}

/** Si può ancora scegliere una gara in questo giorno? (cap 3, come ZTA)
 *  Riscegliere una serie già scelta è sempre consentito. */
export function canChoose(state, d, nodeId = null) {
  const list = choicesOf(state, d);
  if (nodeId && list.includes(nodeId)) return true;
  return list.length < MAX_SCELTE_PER_GIORNO;
}

/* ------------------------------------------------------------------ */
/* impegni e CONFLITTI (l'header "I TUOI IMPEGNI" di Zero to Apex)     */
/* ------------------------------------------------------------------ */

/** Uno SPOSTAMENTO permanente: il sedile della serie slitta avanti di 
 *  `shiftDays` giorni di cadenza (le prossime ronde si spostano con lui). */
export function shiftSeat(state, nodeId, shiftDays = CADENZA_GIORNI) {
  ensureAgenda(state);
  const seat = state.seats?.[nodeId];
  if (!seat) return null;
  seat.day = Math.max(1, (Number(seat.day) || 1) + Math.max(1, Math.floor(Number(shiftDays) || CADENZA_GIORNI)));
  return seat.day;
}

/** Gli impegni del pilota: le serie iscritte con la loro prossima gara, e i
 *  CONFLITTI (due o più gare iscritte che cadono lo stesso giorno). Rispecchia
 *  l'header di ZTA: "I TUOI IMPEGNI — N iscritte · M conflitti". */
export function impegni(ladder, state) {
  ensureAgenda(state);
  const mine = [];
  for (const nodeId of Object.keys(state.seats ?? {})) {
    let node;
    try { node = nodeById(ladder, nodeId); } catch { continue; }
    const r = nextUnplayedRound(ladder, state, node);
    if (!r || r.scheduledDay == null) continue;
    mine.push({
      nodeId, display: node.display, level: node.level ?? 0, discipline: node.discipline,
      roundIndex: r.index, totalRounds: node.calendar.length, track: r.track,
      day: r.scheduledDay, date: dateLabel(r.scheduledDay), isCurrent: nodeId === state.node,
    });
  }
  // conflitti: stesso giorno con più di una serie iscritta
  const byDay = {};
  for (const m of mine) (byDay[m.day] ??= []).push(m);
  const conflitti = [];
  for (const [day, list] of Object.entries(byDay)) {
    if (list.length > 1) conflitti.push({ day: Number(day), date: dateLabel(Number(day)), gare: list });
  }
  conflitti.sort((a, b) => a.day - b.day);
  return { iscritte: mine.length, lista: mine, conflitti };
}

/* ------------------------------------------------------------------ */
/* strip calendario per la GUI (le sere VAI ALLA DATA di ZTA)          */
/* ------------------------------------------------------------------ */

/** La strip dei giorni da `from` a `from+N-1`, con il conteggio gare di ciascuno. */
export function calendarStrip(ladder, state, { from = null, days = 21 } = {}) {
  ensureAgenda(state);
  const start = Math.max(1, Math.floor(Number(from) || agendaDay(state)));
  const out = [];
  for (let i = 0; i < Math.max(1, Math.min(days, 60)); i++) {
    const d = start + i;
    const dayRaces = racesOnDay(ladder, state, d).filter((g) => g.stato !== 'completata');
    // il campionato corre UNA volta a settimana: nella strip il "mio" conto
    // solo sul giorno EFFETTIVO della gara. Le gare in ritardo restano
    // corribili in Agenda, ma non stellano tutto il calendario.
    const mineReal = dayRaces.filter((g) => g.stato === 'iscritto' && g.scheduledDay === d).length;
    out.push({
      day: d,
      date: dateShort(d),
      today: d === agendaDay(state),
      total: dayRaces.length,
      available: dayRaces.filter((g) => g.fattibile).length,
      mine: mineReal,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* elenco completo delle serie (per la tabella filtri)                 */
/* ------------------------------------------------------------------ */

export function elencoCompleto(ladder, state, { fattibili = false } = {}) {
  const out = [];
  for (const node of ladder.nodes) {
    const stato = seriesStatus(ladder, state, node);
    if (fattibili && stato !== 'fattibile' && stato !== 'iscritto') continue;
    const r = nextUnplayedRound(ladder, state, node);
    const gate = gateStatus(ladder, state, node);
    out.push({
      nodeId: node.nodeId,
      display: node.display,
      discipline: node.discipline,
      level: node.level ?? 0,
      gridSize: node.gridSize ?? null,
      prize: node.econ?.prize ?? null,
      entryFee: node.econ?.rent ?? node.econ?.buy ?? 0,
      repRequired: node.repRequired ?? 0,
      stato,
      iscritto: hasSeat(state, node.nodeId),
      fattibile: gate.ok,
      gateReasons: gate.reasons,
      next: r && {
        roundIndex: r.index, name: r.name, track: r.track, laps: r.laps,
        hour: r.hour, weather: r.weather, scheduledDay: r.scheduledDay,
      },
    });
  }
  out.sort((a, b) =>
    (b.iscritto ? 1 : 0) - (a.iscritto ? 1 : 0) ||
    (a.level ?? 0) - (b.level ?? 0) ||
    a.display.localeCompare(b.display));
  return out;
}
