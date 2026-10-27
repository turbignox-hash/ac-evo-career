// rivals.mjs — il registro dei rivali: trasforma i file risultato di EVO (che contengono
// TUTTI i piloti, non solo te) in un campionato vivo: chi ti sfida, chi ti batte, la loro
// classifica e le battaglie testa a testa. Da qui in poi non corri contro "11 AI anonime":
// corri contro persone con nome, squadra e storia.
//
// Fonte unica: i file nativi di EVO (.sessionresults.json) già letti dall'import.
// Persistenza: data/rivals.json (indipendente dal salvataggio carriera).

import { readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { lapToMs, officialPositionOf } from './results.mjs';
import { writeJsonAtomic } from './atomic.mjs';
import { recordWarning } from './warnings.mjs';
import { slotDataDir } from './state.mjs';


// nido per-slot (24/10): il campione di rivali vive con la SUA carriera — slot 1 = data,
// slot 2-3 = data/slot-N vergini. Ciclo con state.mjs innocuo: slotDataDir è una
// function hoisted (richiamabile anche a metà del giro di import circolare).
const DATA_DIR = slotDataDir();
const RIVALS_FILE = join(DATA_DIR, 'rivals.json');

/* ------------------------------------------------------------------ */
/* utilità                                                             */
/* ------------------------------------------------------------------ */

const strip = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '')
  .toLowerCase();

export const rivalKey = (first, last) => strip(`${first}|${last}`);

function driverName(d) {
  const first = String(d?.driver_name ?? '').replace(/^[\u2022\s]+/, '').trim();
  const last = String(d?.driver_surname ?? '').trim();
  return { first, last, key: rivalKey(first, last), full: `${first} ${last}`.trim() };
}

function loadStore() {
  if (!existsSync(RIVALS_FILE)) return { rivals: {}, races: [] };
  try { return JSON.parse(readFileSync(RIVALS_FILE, 'utf8')); } catch (e) {
    // archivio illeggibile: copia di recupero e warning, invece di ripartire in silenzio
    try { copyFileSync(RIVALS_FILE, `${RIVALS_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`); } catch { /* pazienza */ }
    recordWarning('rivals', 'archivio rivali illeggibile (copia .corrupt salvata): riparto da vuoto', e?.message ?? null);
    return { rivals: {}, races: [] };
  }
}

function saveStore(store) {
  mkdirSync(dirname(RIVALS_FILE), { recursive: true });
  writeJsonAtomic(RIVALS_FILE, store); // atomico: l'archivio non deve mai restare a metà
}

/* ------------------------------------------------------------------ */
/* ingestione: griglia completa da ogni gara importata                 */
/* ------------------------------------------------------------------ */

/** Lettura in sola-libera dell'archivio rivali (registri/analisi esterni). */
export function rivalsStore() { return loadStore(); }

/**
 * Registra una gara appena importata in carriera: estrae l'intera griglia
 * (te + rivali), aggiorna testa a testa, statistiche dei rivali e archivio.
 * `result` è il JSON nativo di EVO; `playerPayload` è l'entry già calcolata dall'import.
 */
export function recordRaceGrid(result, playerPayload, { season, round, nodeId, nodeDisplay, trackDisplay }) {
  if (!result || String(result.session ?? '').toLowerCase() !== 'race') return null;

  const store = loadStore();
  // stessa stagione + ronda + serie già in archivio: niente doppi record
  // (il watcher a volte ri-importa un file vecchio: qui si ferma)
  if (store.races.some((r) => r.season === season && r.round === round && r.nodeId === nodeId)) return null;

  const drivers = result.drivers ?? [];
  const positions = drivers.map((d) => Number(d.position)).filter(Number.isFinite);
  const zeroBased = positions.length ? Math.min(...positions) === 0 : true;
  const toPos = (p) => (zeroBased ? Number(p) + 1 : Number(p));

  const meKey = rivalKey(playerPayload.driverFirst, playerPayload.driverLast);
  const vendetta = { newNemesi: [], settled: [] }; // nemesi dichiarate e vendette assestate in questa gara

  const raceRow = {
    at: new Date().toISOString(),
    season, round, nodeId, nodeDisplay,
    track: String(result.track ?? '').toLowerCase(),
    trackDisplay: trackDisplay ?? result.track ?? null,
    layout: result.layout ?? null,
    gridSize: drivers.length,
    playerKey: meKey,
    grid: [],
  };

  for (const d of drivers) {
    const { first, last, key, full } = driverName(d);
    if (!key) continue;
    const isPlayer = d.is_current_driver === true || key === meKey;
    /* PUNTI/PODI COERENTI (28/10): la posizione qui sotto NON è più quella
     * grezza del file (ordine di pista, PRIMA della penalità) ma quella
     * UFFICIALE come la ricalcola il gioco con total_time + penalità — identica
     * a quella del pilota della carriera in classify(). Un rivale con +5.0s
     * che il file segna P1 perde il posto e le statistiche lo vedono davvero:
     * niente più vittorie/podi incassati dal file grezzo. DSQ → ritiro. */
    const off = officialPositionOf(result, d);
    const dnfRow = !d.total_time || Number(d.laps ?? 0) === 0 || off.dsq;
    const row = {
      key, first, last, full, isPlayer,
      team: d.team ?? null, nation: d.driver_nation ?? null,
      position: off.position ?? toPos(d.position),
      dnf: dnfRow,
      dsq: !!off.dsq, penalty: off.penalty ?? null,
      laps: Number(d.laps ?? 0) || 0,
      bestLap: d.best_lap || null,
      car: `${d.car_brand ?? ''} ${d.car_name ?? ''}`.trim(),
    };
    raceRow.grid.push(row);
    if (isPlayer) continue;

    // registro del rivale
    const rv = store.rivals[key] ??= {
      key, first, last, full,
      team: row.team, nation: row.nation,
      since: raceRow.at,
      totals: { races: 0, wins: 0, podiums: 0, fastestLaps: 0 },
      h2h: { beats: 0, losses: 0, ties: 0 },
      last5: [],
    };
    rv.team = row.team ?? rv.team;
    rv.car = row.car ?? rv.car;
    const t = rv.totals;
    t.races += 1;
    if (!row.dnf && row.position === 1) t.wins += 1;
    if (!row.dnf && row.position <= 3) t.podiums += 1;
    if (!row.dnf && row.bestLap) {
      const fl = drivers.filter((x) => x.has_best_lap && x.best_lap)
        .sort((a, b) => lapToMs(a.best_lap) - lapToMs(b.best_lap))[0];
      if (fl && fl.driver_name === d.driver_name && fl.driver_surname === d.driver_surname) t.fastestLaps += 1;
    }

    // testa a testa con il giocatore (dalla verità del payload già calcolato)
    const myPos = playerPayload.dnf ? drivers.length + 1 : playerPayload.position;
    // vite/penalità reali: DSQ o senza giri → fuori classifica come il resto
    const hisPos = row.dnf ? drivers.length + 1 : row.position;
    if (myPos < hisPos) rv.h2h.losses += 1;   // lui sotto di me: ho vinto io
    else if (myPos > hisPos) rv.h2h.beats += 1; // lui sopra di me: ha vinto lui
    else rv.h2h.ties += 1;

    // vendetta: due scontri persi di fila -> nemesi dichiarata; battermi spezza la serie.
    // Se la nemesi mi batte di nuovo la serie continua; se la batto, la faida si chiude.
    if (myPos > hisPos) {
      rv.streakBeatMe = (rv.streakBeatMe ?? 0) + 1;
      if (rv.streakBeatMe >= 2 && !rv.nemesis) { rv.nemesis = true; vendetta.newNemesi.push(rv.full); }
    } else if (myPos < hisPos) {
      rv.streakBeatMe = 0;
      if (rv.nemesis) { rv.nemesis = false; vendetta.settled.push(rv.full); }
    }

    rv.last5.push({ at: raceRow.at, node: nodeDisplay, round, season, nodeId, track: raceRow.trackDisplay, pos: row.dnf ? null : row.position, dnf: row.dnf, dsq: row.dsq ?? false, penalty: row.penalty ?? null, beatMe: myPos < hisPos });
    if (rv.last5.length > 5) rv.last5 = rv.last5.slice(-5);
  }

  // archivio (mantiene le ultime 200 gare)
  store.races.push(raceRow);
  if (store.races.length > 200) store.races = store.races.slice(-200);
  saveStore(store);
  raceRow.vendetta = vendetta;
  return raceRow;
}

/* ------------------------------------------------------------------ */
/* report pre-gara: chi aspetta alla prossima ronda                    */
/* ------------------------------------------------------------------ */

/** I rivali già incontrati in questa serie, per la scheda gara.
 * Oltre a testa-a-testa e best, porta FORMA (ultime 5 gare) e MOMENTUM
 * (media ultime 3 vs precedenti), così la riga è leggibile come «voci dal
 * paddock»: chi va forte, chi crolla, chi ti batte — senza aprire la scheda. */
export function rivalsOutlook(_ladder, state, nodeId) {
  const store = loadStore();
  const races = store.races.filter((r) => r.nodeId === nodeId);
  const out = [];
  for (const rv of Object.values(store.rivals)) {
    const mine = races.filter((r) => r.grid.some((g) => g.key === rv.key));
    if (!mine.length) continue;
    const seq = rv.last5.map((x) => (x.dnf ? 99 : x.pos ?? 99));
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const recent = avg(seq.slice(-3)); const older = avg(seq.slice(0, -3));
    out.push({
      key: rv.key, name: (state?.alias?.[rv.key] ?? null) ?? rv.full, realName: rv.full, team: rv.team ?? null,
      inSeries: mine.length,
      h2h: { ...rv.h2h },
      bestPos: Math.min(...mine.flatMap((r) => r.grid.filter((g) => g.key === rv.key).map((g) => (g.dnf ? 99 : g.position)))),
      form: rv.last5.map((x) => (x.dnf ? 'DNF' : x.pos)),
      trend: recent == null ? null : older == null ? 0 : Math.round(older - recent),
    });
  }
  return { rivals: out.sort((a, b) => b.inSeries - a.inSeries || a.bestPos - b.bestPos), racesInSeries: races.length };
}

/**
 * Chi corre nella serie `nodeId`: per ogni rivale le gare della serie, i piazzamenti
 * e chi ha battuto il giocatore in ognuna. Serve all'import per il verdetto sfida
 * ("chiudi davanti a X") e alla gazzetta (nomi battuti / che hanno battuto te).
 */
export function rivalsForNode(nodeId) {
  const store = loadStore();
  const races = store.races.filter((r) => r.nodeId === nodeId);
  const byKey = new Map();
  for (const race of races) {
    const me = (race.grid ?? []).find((g) => g.isPlayer);
    for (const g of race.grid ?? []) {
      if (g.isPlayer) continue;
      const rv = byKey.get(g.key) ?? { key: g.key, name: g.full, races: [], beatenMe: 0, beatenByMe: 0 };
      rv.races.push({ season: race.season, round: race.round, pos: g.dnf ? null : g.position, dnf: g.dnf, mePos: me ? (me.dnf ? null : me.position) : null });
      if (me && !g.dnf && (me.dnf || g.position < me.position)) rv.beatenMe += 1;
      if (me && !me.dnf && (g.dnf || me.position < g.position)) rv.beatenByMe += 1;
      byKey.set(g.key, rv);
    }
  }
  return [...byKey.values()];
}

/* Soprannomi del pilota (26/10): gli alias vivono nel save (state.alias) e
   toccano SOLO la visualizzazione — i record di gara su rivals.json restano
   con i nomi veri, così gli storici non si impallano. */
/** La scheda completa di un rivale: storia, vittorie, dove ti batte. */
export function rivalDetail(key, state) {
  const store = loadStore();
  const rv = store.rivals[key];
  if (!rv) return null;
  const races = store.races.filter((r) => r.grid.some((g) => g.key === key));
  const meetings = races.map((race) => {
    const g = race.grid.find((x) => x.key === key);
    const me = race.grid.find((x) => x.isPlayer);
    return {
      at: race.at, season: race.season, round: race.round,
      node: race.nodeDisplay ?? race.nodeId, track: race.trackDisplay ?? race.track,
      pos: g.dnf ? null : g.position, dnf: g.dnf, bestLap: g.bestLap ?? null, car: g.car ?? null,
      mePos: me ? (me.dnf ? null : me.position) : null,
      beatMe: me ? (!g.dnf && (me.dnf || g.position < me.position)) : false,
    };
  }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const wins = meetings.filter((m) => m.pos === 1);
  const alias = state?.alias?.[key] ?? null;
  return {
    key, name: alias ?? rv.full, realName: rv.full, team: rv.team ?? null, nation: rv.nation ?? null, car: rv.car ?? null,
    since: (rv.since ?? '').slice(0, 10),
    totals: { ...rv.totals }, h2h: { ...rv.h2h },
    bestPos: meetings.length ? Math.min(...meetings.map((m) => (m.pos ?? 99))) : null,
    winsDetail: wins.map((m) => ({ track: m.track, season: m.season, round: m.round, car: m.car, at: m.at })),
    beatsMeAt: [...new Set(meetings.filter((m) => m.beatMe).map((m) => m.track))],
    meetings,
  };
}

/* ------------------------------------------------------------------ */
/* viste per la GUI                                                    */
/* ------------------------------------------------------------------ */

/** Panoramica rivali per la GUI: profili ordinati per scontri, testa a testa, classifica. */export function rivalsOverview(_ladder, state, { q = null } = {}) {
  const store = loadStore();
  const meKey = rivalKey(state.driver.first, state.driver.last);

  const all = Object.values(store.rivals).map((rv) => {
    const alias = state?.alias?.[rv.key] ?? null;
    const meets = store.races.filter((r) => r.grid.some((g) => g.key === rv.key));
    const last = rv.last5[rv.last5.length - 1] ?? null;
    // momentum: media delle ultime 3 gare contro la media delle precedenti (dnf = ultima posizione)
    const seq = rv.last5.map((x) => (x.dnf ? 99 : x.pos ?? 99));
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const recent = avg(seq.slice(-3)), older = avg(seq.slice(0, -3));
    const trend = recent == null ? null : older == null ? 0 : Math.round(older - recent); // >0 = in salita
    return {
      key: rv.key, name: alias ?? rv.full, realName: rv.full, team: rv.team ?? null, nation: rv.nation ?? null,
      car: rv.car ?? null, since: (rv.since ?? '').slice(0, 10),
      races: rv.totals.races, wins: rv.totals.wins, podiums: rv.totals.podiums, fl: rv.totals.fastestLaps,
      h2h: { ...rv.h2h }, net: rv.h2h.losses - rv.h2h.beats, // >0 = dominato da te
      nemesis: !!rv.nemesis, streakBeatMe: rv.streakBeatMe ?? 0,
      trend,
      form: rv.last5.map((x) => (x.dnf ? 'DNF' : x.pos)),
      lastSeen: last ? { node: last.node, round: last.round + 1, pos: last.pos } : null,
      sharedRaces: meets.length,
    };
  }).filter((rv) => rv.races > 0);

  if (q) {
    const n = strip(q);
    const filtered = all.filter((rv) => strip(rv.name).includes(n) || strip(rv.team ?? '').includes(n));
    return { totals: { rivals: filtered.length, races: store.races.length }, rivals: filtered.sort((a, b) => b.sharedRaces - a.sharedRaces || b.races - a.races), nemesi: [], vittime: [], meKey };
  }

  const nemesi = all.filter((rv) => rv.h2h.beats > rv.h2h.losses).sort((a, b) => (b.h2h.beats - b.h2h.losses) - (a.h2h.beats - a.h2h.losses));
  const vittime = all.filter((rv) => rv.h2h.losses > rv.h2h.beats).sort((a, b) => (b.h2h.losses - b.h2h.beats) - (a.h2h.losses - a.h2h.beats));

  return {
    totals: { rivals: all.length, races: store.races.length },
    rivals: all.sort((a, b) => b.sharedRaces - a.sharedRaces || b.races - a.races),
    nemesi, vittime,
    meKey,
  };
}

/* ------------------------------------------------------------------ */
/* CONTO della FAIDA e BOLLETTINO DI GARA (richiesta Mauro 21/10)       */
/* ------------------------------------------------------------------ */

/** Il CONTO con la NEMESI: il rivale che ti batte di più in questi giorni,
 *  con la sua serie di sconfitte inflitte, le piste dove ti domina e quelle
 *  dove invece lo uccidi. Dal registro già esistente: niente nuovo storage.
 *  Ritorna null se non c'è nessuno con 2+ sconfitte consecutive inflitte a te
 *  o una serie attiva. */
export function nemesisReport() {
  const store = loadStore();
  // candidato nemesi: più sconfitte consecutive inflitte (streakBeatMe) o più
  // battute in assoluto (h2h.beats) con almeno 3 scontri
  const cand = Object.values(store.rivals)
    .filter((rv) => (rv.streakBeatMe ?? 0) >= 2 || (rv.h2h?.beats ?? 0) >= 3)
    .sort((a, b) =>
      (b.streakBeatMe ?? 0) - (a.streakBeatMe ?? 0) ||
      (b.h2h?.beats ?? 0) - (a.h2h?.beats ?? 0) ||
      (b.h2h?.losses ?? 0) - (a.h2h?.losses ?? 0))[0];
  if (!cand) return null;
  const races = store.races.filter((r) => r.grid.some((g) => g.key === cand.key));
  const meetings = races.map((race) => {
    const g = race.grid.find((x) => x.key === cand.key);
    const me = race.grid.find((x) => x.isPlayer);
    return {
      track: race.trackDisplay ?? race.track,
      beatMe: me ? (!g.dnf && (me.dnf || g.position < me.position)) : false,
      season: race.season, round: race.round,
    };
  });
  const beatsMeAt = [...new Set(meetings.filter((m) => m.beatMe).map((m) => m.track))];
  const losesAt = [...new Set(meetings.filter((m) => !m.beatMe).map((m) => m.track))];
  return {
    key: cand.key, name: cand.full, team: cand.team ?? null,
    streak: cand.streakBeatMe ?? 0, nemesis: !!cand.nemesis,
    h2h: { ...cand.h2h },
    beatsMeAt, losesAt,
    totalScontri: meetings.length,
  };
}

/** Il BOLLETTINO dell'ultima gara importata: chi è salito davanti (o ha
 *  difeso il posto) e chi hai superato in classifica — per l'email post-gara
 *  cliccabile. Usa la raceRow più recente del registro. */
export function raceBulletin() {
  const store = loadStore();
  const race = store.races[store.races.length - 1];
  if (!race) return null;
  const me = race.grid.find((x) => x.isPlayer);
  if (!me) return null;
  const davanti = race.grid
    .filter((x) => !x.isPlayer && !x.dnf && x.position < me.position)
    .sort((a, b) => a.position - b.position)
    .slice(0, 3)
    .map((g) => ({ key: g.key, name: g.full, team: g.team ?? null, pos: g.position }));
  const dietro = race.grid
    .filter((x) => !x.isPlayer && !x.dnf && x.position > me.position)
    .sort((a, b) => a.position - b.position)
    .slice(0, 1)
    .map((g) => ({ key: g.key, name: g.full, pos: g.position }));
  return {
    at: race.at, node: race.nodeDisplay ?? race.nodeId, track: race.trackDisplay ?? race.track,
    season: race.season, round: race.round,
    mePos: me.dnf ? null : me.position, dnf: me.dnf,
    davanti, dietro,
  };
}

