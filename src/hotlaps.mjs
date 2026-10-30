// hotlaps.mjs — il QUADERNO DEI GIRI LIBERI (24/10, Mauro: «e se l'utente
// volesse semplicemente girare per realizzare giri veloci da confrontare col
// motec, affinare assetti etc?»).
//
// Finora i file risultato NON-gara che arrivano in Results erano solo rumore
// di fondo: il watcher li ignorava («non è una gara») e la prova si importava
// a mano dal tab TESTDAY. Qui invece TUTTA sessione guidata che non sia una
// gara diventa una riga nel quaderno: pista, auto, meteo, giri, best lap e
// settoriali — deduplicata, senza mai toccare carriera, soldi, punti o rep.
//
// In più tiene il LIBRO PB: per ogni coppia auto+pista il giro migliore di
// sempre con i settoriali perfetti sommati (il classico «giro ideale»), come
// un MoTeC sa fare. Il confronto con la concorrenza resta nel risultato del
// file: qui è il duello con se stessi.

import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { writeJsonAtomic } from './atomic.mjs';
import { listResultFiles, readSessionResult, isRaceSession, findPlayerDriver, classify, sectorAnalysis } from './results.mjs';
import { slotDataDir } from './state.mjs';
import { matchTrackName, sameCar } from './tracknames.mjs';
import { TRACK_INFO } from './tracks.mjs';


// nido per-slot (24/10): le hotlap vivono con la SUA carriera
// (slot 1 = data/ com'è sempre stato, slot 2-3 = data/slot-N/ vergini)
export const HOTLAPS_FILE = join(slotDataDir(), 'hotlaps.json');

const lapToMs = (t) => {
  const m = String(t ?? '').match(/^(\d+):(\d+)\.(\d+)$/);
  if (!m) return Infinity;
  return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]);
};

function loadBook() {
  try {
    const b = JSON.parse(readFileSync(HOTLAPS_FILE, 'utf8'));
    if (b && Array.isArray(b.sessions)) return b;
  } catch { /* primo avvio: quaderno vuoto */ }
  return { sessions: [] };
}

function saveBook(book) {
  mkdirSync(dirname(HOTLAPS_FILE), { recursive: true });
  writeJsonAtomic(HOTLAPS_FILE, book); // atomico: il quaderno non si corrompe
}

/** Nome visualizzato della pista come nel quaderno prove (match normalizzato sul ladder). */
function prettyTrack(ladder, fileTrack) {
  if (!fileTrack) return null;
  const names = [], displayOf = new Map();
  for (const [id, display] of Object.entries(ladder?.contentNames?.tracks ?? {})) {
    names.push(display, id);
    displayOf.set(display, display);
    displayOf.set(id, display);
  }
  const hit = matchTrackName(fileTrack, names);
  return hit ? displayOf.get(hit) : fileTrack;
}

/** Nome auto display (contentNames.cars): il gioco scrive già il nome completo. */
function prettyCar(ladder, fileCar) {
  try {
    for (const display of Object.values(ladder?.contentNames?.cars ?? {})) {
      if (display && sameCar(display, fileCar)) return String(display);
    }
    for (const [id, display] of Object.entries(ladder?.contentNames?.cars ?? {})) {
      if (id && sameCar(id, fileCar)) return String(display ?? id);
    }
  } catch { /* ladder assente: resta il nome del file */ }
  return fileCar;
}

/**
 * Da un file risultato non-gara a una riga di quaderno. Ritorna null SE il
 * sessionType è una gara (non sono affari del quaderno) o non c'è niente
 * d'interessante (nessun pilota riconosciuto, nessun giro con tempo).
 */
function entryFromFile(ladder, f, driverNames) {
  let result;
  try { result = readSessionResult(f.file); } catch { return null; }
  if (isRaceSession(result)) return null;
  const found = findPlayerDriver(result, driverNames);
  const d = found?.driver;
  if (!d) return null;               // provenienze estranee (online, server, amici): silenzio
  const cl = classify(result, found); // riusa la stessa lettura dei risultati di gara
  // nelle sessioni libere la posizione di classify è finta (griglia di 1): niente posizioni qui
  const laps = Array.isArray(d.lap_times) ? d.lap_times.filter(Boolean) : [];
  const sec = sectorAnalysis(result, d);
  return {
    file: f.name,
    at: new Date(f.mtime).toISOString(),
    session: result?.session ?? '?',
    track: result?.track ?? null,
    trackPretty: prettyTrack(ladder, result?.track),
    layout: result?.layout ?? null,
    car: cl.car ?? null,
    carPretty: cl.car ? prettyCar(ladder, cl.car) : null,
    carNumber: d.car_number ?? null,
    hour: result?.hour ?? null,
    weather: String(result?.weather_type ?? '').replace(/^.*WeatherType_/, '')|| null,
    lapsCount: Number(d.laps ?? 0),
    lapTimes: laps.slice(-10), // gli ultimi 10 giri come scritti dal gioco
    bestLap: d.best_lap ?? null,
    bestLapMs: Number.isFinite(lapToMs(d.best_lap)) ? lapToMs(d.best_lap) : null,
    splits: (d.splits ?? []).map((s) => lapToMs(s)).filter((x) => Number.isFinite(x)),
    sectors: sec ? sec.sectors.map(({ index, mineText, best, bestText, bestName, deltaMs }) => ({ index, mineText, bestText, best, bestName, deltaMs })) : null,
    theoreticalMs: sec?.theoreticalMs ?? null,
    theoreticalText: sec?.theoreticalText ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* il LIBRO PB: per auto+pista il giro perfetto mai più veloce          */
/* ------------------------------------------------------------------ */

function keyOf(entry) {
  return `${(entry.car ?? '?').toLowerCase()}|${(entry.track ?? '?').toLowerCase()}`;
}

/** Ricalcola i flag isPB e lo stesso libro PB. Chiamato a ogni scrittura. */
function recomputePBs(book) {
  const groups = new Map();
  for (const e of book.sessions) {
    if (!e.bestLapMs) continue;
    const k = keyOf(e);
    (groups.get(k) ?? groups.set(k, []).get(k)).push(e);
  }
  book.records = [];
  for (const sessions of groups.values()) {
    for (const e of sessions) e.isPB = false; // tutto giù, poi su vince il migliore
    sessions.sort((a, b) => a.bestLapMs - b.bestLapMs);
    const best = sessions[0];
    best.isPB = true;
    // il giro ideale: per ogni settore il migliore MAI fatto da nessuna sessione
    const sectorBests = [];
    for (let i = 0; i < Math.max(...sessions.map((s) => s.splits?.length ?? 0)); i++) {
      let ms = Infinity;
      for (const s of sessions) { const v = s.splits?.[i]; if (Number.isFinite(v) && v < ms) ms = v; }
      sectorBests.push(Number.isFinite(ms) ? ms : null);
    }
    book.records.push({
      car: best.car,
      carPretty: best.carPretty,
      track: best.track,
      trackPretty: best.trackPretty,
      lapMs: best.bestLapMs,
      lap: best.bestLap,
      at: best.at,
      idealLapMs: sectorBests.filter((x) => x !== null).length === sectorBests.length && sectorBests.length
        ? sectorBests.reduce((a, b) => a + b, 0) : null,
      sectorMs: sectorBests,
    });
  }
  book.records.sort((a, b) => (a.trackPretty ?? '').localeCompare(b.trackPretty ?? '') || (a.carPretty ?? '').localeCompare(b.carPretty ?? ''));
}

/**
 * Registra UN file risultato (o i più recenti) nel quaderno.
 *  - { file }: importa proprio quel file (per il ripristino a mano di vecchi giri);
 *  - sennò: i file più recenti della finestra indicata, che il watcher non ha già messo.
 * Il ritorno dice cosa è stato registrato e cosa no (e perché) — per API e CLI.
 */
export function recordHotlaps(ladder, paths, state, { file = null, since = null } = {}) {
  const book = loadBook();
  const known = new Set(book.sessions.map((e) => e.file));
  const driverNames = {
    first: state?.driver?.first ?? '',
    last: state?.driver?.last ?? '',
    name: `${state?.driver?.first ?? ''} ${state?.driver?.last ?? ''}`.trim(),
  };
  const registered = [], skipped = [];
  const candidates = (file ? listResultFiles(paths).filter((x) => x.name === file) : listResultFiles(paths))
    .filter((x) => (since ? x.mtime >= since : true));

  for (const f of candidates) {
    if (known.has(f.name)) { skipped.push({ name: f.name, why: 'già nel quaderno' }); continue; }
    let result;
    try { result = readSessionResult(f.file); } catch { skipped.push({ name: f.name, why: 'file illeggibile' }); continue; }
    if (isRaceSession(result)) { skipped.push({ name: f.name, why: 'è una gara (affari del watcher)' }); continue; }
    const entry = entryFromFile(ladder, f, driverNames);
    if (!entry) { skipped.push({ name: f.name, why: 'nessun pilota della carriera riconosciuto' }); continue; }
    if (!entry.bestLapMs && !entry.lapsCount) { skipped.push({ name: f.name, why: 'nessun giro utile' }); continue; }
    entry.isPB = false; // la decide recomputePBs
    book.sessions.push(entry);
    known.add(f.name);
    registered.push(entry);
  }
  if (registered.length) {
    book.sessions.sort((a, b) => String(b.at).localeCompare(String(a.at))); // dal più recente
    recomputePBs(book);
    saveBook(book);
  }
  return { registered, skipped, book: loadBook() };
}

/** Il quaderno per la GUI (le ultime n righe + il libro PB). */
/* 28/10: il meteo dei vecchi capitoli salvati aveva il nome intero di EVO
 *  (GameModeSelectionWeatherType_CLEAR): lo pulisco QUI così gli storici e i
 *  nuovi si leggono uguale. */
const wxClean = (w) => String(w ?? '').replace(/^.*WeatherType_/, '')|| null;
/* i capitoli del 15/4 salvati col profilo nome=cognome: se il nome scritto è
 * «X X» si riduce a «X» (nei profili così il nome completo è il cognome solo). */
const nomeSenzaDoppione = (n) => { const w = String(n ?? '').trim().split(/\s+/); return w.length === 2 && w[0].toLowerCase() === w[1].toLowerCase() ? w[0] : String(n ?? ''); };
export function hotlapsLog(n = 40) {
  const b = loadBook();
  const sessions = b.sessions.slice(0, n).map((e) => ({
    ...e,
    weather: wxClean(e.weather),
    sectors: (e.sectors ?? []).map((s) => ({ ...s, bestName: nomeSenzaDoppione(s.bestName) })),
  }));
  return { sessions, records: b.records ?? [], total: b.sessions.length };
}

/* ------------------------------------------------------------------ */
/* ANALISI della gita (26/10, scelta Mauro sul tab): numeri, progresso   */
/* ------------------------------------------------------------------ */

/** Lunghezza (km) della pista come scritta dal gioco, se il libro la conosce. */
function trackLengthKm(fileTrack) {
  const names = Object.entries(TRACK_INFO).flatMap(([k, x]) => [k, x?.name]);
  const hit = matchTrackName(fileTrack ?? '', names);
  if (!hit) return null;
  for (const [k, x] of Object.entries(TRACK_INFO)) {
    if (k === hit || x?.name === hit) return Number(x?.lengthKm) || null;
  }
  return null;
}

/** La gita in numeri: sessioni, giri, km (dove la lunghezza è nota), PB, auto e piste. */
export function hotlapsStats() {
  const b = loadBook();
  let laps = 0, km = 0, kmKnown = true;
  const cars = new Set(), tracks = new Set();
  for (const e of b.sessions) {
    laps += Number(e.lapsCount) || 0;
    cars.add(e.carPretty ?? e.car ?? '?');
    tracks.add(e.trackPretty ?? e.track ?? '?');
    const len = trackLengthKm(e.track);
    if (len) km += (Number(e.lapsCount) || 0) * len;
    else kmKnown = false; // pista fuori dal libro: i km restano sottostimati onesto
  }
  return {
    sessions: b.sessions.length, laps,
    km: Math.round(km), kmKnown,
    pb: (b.records ?? []).length,
    cars: cars.size, tracks: tracks.size,
  };
}

/** La CURVA DI PROGRESSO: per auto+pista con almeno 2 uscite, la best lap nel
 *  tempo (più vecchia → più recente). Le uscite singole non fanno una curva. */
export function hotlapsProgress() {
  const b = loadBook();
  const groups = new Map();
  for (const e of b.sessions) {
    if (!e.bestLapMs) continue;
    const k = keyOf(e);
    if (!groups.has(k)) groups.set(k, {
      key: k, car: e.car, carPretty: e.carPretty, track: e.track, trackPretty: e.trackPretty,
      layout: e.layout ?? null, points: [],
    });
    groups.get(k).points.push({ at: e.at, ms: e.bestLapMs });
  }
  for (const g of groups.values()) g.points.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return [...groups.values()]
    .filter((g) => g.points.length >= 2)
    .sort((a, b) => (a.trackPretty ?? '').localeCompare(b.trackPretty ?? ''));
}

/**
 * La spazzata di servizio per il watcher del launcher: ogni giro guarda se e
 * sono nati file non-gara dai risultati e li accetta (deduplicati). Economica:
 * NIENTE letture se mtime non sopra l'acqua alta precedente.
 */
/* ------------------------------------------------------------------ */
/* DURATA CONSIGLIATA per pista (30/10, Mauro): il pannello «Gara al   */
/* volo» dice quanto girare PRIMA di scegli — la cifra nascosta è il   */
/* giro di riferimento della pista nel quaderno (qualunque auto: il    */
/* tempo è / della pista, non dell'auto che ci ho sopra IL POOL).      */
/* ------------------------------------------------------------------ */

const chiaviTrack = () => Object.entries(TRACK_INFO).flatMap(([k, x]) => [k, x?.name]).filter(Boolean);
const msFmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(Math.round(ms % 1000)).padStart(3, '0')}`;
};

/** Il giro di riferimento di UNA pista (e, se nota, dell'AUTO scelta):
 *  tra le righe del quaderno (prove e libere, MAI gara) quelle della
 *  pista matchata col libro TRACK_INFO; il giro è il migliore visto —
 *  con auto chiesta: il PB di QUELLA auto (e se non ha giri in pista,
 *  il PB di pista prende il suo posto, marcato perCar:false). null se la
 *  pista non è nel libro o il quaderno non la conosce: il pannello resta
 *  in silenzio, niente inventati. */
export function hotlapsPistaGiro(trackName, car = null) {
  const want = matchTrackName(String(trackName ?? ''), chiaviTrack());
  if (!want) return null;
  const stessaPista = (t) => t != null && matchTrackName(String(t), chiaviTrack()) === want;
  const lib = loadBook();
  const tutte = [...(lib.sessions ?? []), ...(lib.records ?? [])].filter((e) => e.bestLapMs && stessaPista(e.track));
  if (!tutte.length) return null;
  // l'auto richiesta si matcha col nome o con l'id (sameCar); se non ha giri
  // in questa pista, il PB di pista prende il suo posto (perCar:false).
  let perCar = false;
  if (car != null) {
    const own = tutte.filter((e) => sameCar(car, e.car ?? '') || sameCar(car, e.carPretty ?? ''));
    if (own.length) { perCar = true; tutte.splice(0, tutte.length, ...own); }
  }
  tutte.sort((a, b) => a.bestLapMs - b.bestLapMs);
  const best = tutte[0];
  return {
    lapMs: Math.round(best.bestLapMs), lapText: msFmt(best.bestLapMs),
    carPretty: best.carPretty ?? best.car ?? null,
    pista: best.trackPretty ?? best.track ?? null,
    at: best.at ?? null, perCar,
  };
}

export function hotlapSweep(ladder, paths, state, { since = 0 } = {}) {
  const fresh = listResultFiles(paths).filter((f) => f.mtime > since);
  if (!fresh.length) return { registered: [], skipped: [] };
  return recordHotlaps(ladder, paths, state, { since: since - 60 * 1000 });
}
