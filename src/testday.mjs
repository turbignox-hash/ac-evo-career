// testday.mjs — la "giornata di prove" ufficiale: sessioni che NON toccano la carriera.
//
// Nasce dopo la serata in cui il watcher ha importato come Imola R1 una sessione
// di prova finita dopo due giri (2026-09-26): i test servono, ma la carriera
// deve restare intoccata. Qui il risultato di una prova diventa un "rapporto
// prove": pista, auto, meteo, best lap, analisi settoriale, posizione simulata
// contro il livello AI usato — e poi via, senza soldi, punti o reputazione.
//
// In più tiene il QUADERNO DI CALIBRAZIONE (data/testdays.json): ogni prova con
// il range AI usato, la posizione ottenuta e le note di chi guida. Dopo qualche
// sessione la tabella dice da sola quale intervallo di difficoltà funziona.

import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';
import { listResultFiles, readSessionResult, findPlayerDriver, bestLapInfo, classify, sectorAnalysis } from './results.mjs';
import { nodeById } from './state.mjs';
import { alreadyImportedHash } from './import.mjs';
import { matchTrackName, sameTrack, matchesAnyTrack } from './tracknames.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// nido per-slot (24/10): il quaderno delle prove vive con la SUA carriera
// (slot 1 = data/ com'è sempre stato, slot 2-3 = data/slot-N/ vergini)
import { slotDataDir } from './state.mjs';
export const TESTDAY_FILE = join(slotDataDir(), 'testdays.json');

const trackName = (ladder, id) => ladder.contentNames?.tracks?.[id] ?? id;

/** Nome visualizzato della pista scritta nel file risultato (match normalizzato sul ladder,
 *  unica implementazione in tracknames.mjs: accenti + prefisso, come per MoTeC e Results). */
function prettyTrack(ladder, fileTrack) {
  if (!fileTrack) return null;
  const names = [], displayOf = new Map();
  for (const [id, display] of Object.entries(ladder.contentNames?.tracks ?? {})) {
    names.push(display, id);
    displayOf.set(display, display);
    displayOf.set(id, display); // combacia con l'id del ladder? mostro comunque il nome bello
  }
  const hit = matchTrackName(fileTrack, names);
  return hit ? displayOf.get(hit) : fileTrack;
}

function loadBook() {
  try {
    const b = JSON.parse(readFileSync(TESTDAY_FILE, 'utf8'));
    if (b && Array.isArray(b.sessions)) return b;
  } catch { /* primo avvio: quaderno vuoto */ }
  return { sessions: [] };
}

function saveBook(book) {
  mkdirSync(dirname(TESTDAY_FILE), { recursive: true });
  writeJsonAtomic(TESTDAY_FILE, book); // atomico: il quaderno di calibrazione non si corrompe
}

/** Ultimi n rapporti di prova, dal più recente. Per la GUI. */
export function testDayLog(n = 30) {
  return loadBook().sessions.slice(-n).reverse();
}

/**
 * Registra un rapporto di prova. Non tocca lo stato della carriera: accetta
 * solo lettura dei file risultato e scrittura del quaderno.
 *  - { nodeId, rangeMin, rangeMax, note }: arricchisce l'ultima prova o ne crea
 *    una manuale (per annotare i test fatti mentre il server era spento).
 *  - { importFile }: trasforma il file risultato indicato (o il più recente
 *    compatibile con la pista) in rapporto prove.
 */
export function recordTestDay(ladder, paths, state, opts = {}) {
  const book = loadBook();
  const now = new Date().toISOString();

  // ---- caso 1: nota manuale di calibrazione (test fatto a server spento) ----
  if (opts.manual) {
    const node = nodeById(ladder, state.node);
    const rnd = node.calendar[Math.min(state.round, node.calendar.length - 1)];
    const entry = {
      at: now,
      kind: 'manual',
      nodeId: state.node,
      nodeDisplay: node.display,
      track: rnd?.track ?? null,
      trackDisplay: trackName(ladder, rnd?.track),
      car: opts.manual.car ?? null,
      rangeMin: Number.isFinite(Number(opts.manual.rangeMin)) ? Number(opts.manual.rangeMin) : null,
      rangeMax: Number.isFinite(Number(opts.manual.rangeMax)) ? Number(opts.manual.rangeMax) : null,
      position: Number.isFinite(Number(opts.manual.position)) ? Number(opts.manual.position) : null,
      gridSize: Number.isFinite(Number(opts.manual.gridSize)) ? Number(opts.manual.gridSize) : (node.gridSize ?? null),
      bestLap: opts.manual.bestLap ?? null,
      note: String(opts.manual.note ?? '').slice(0, 400),
    };
    book.sessions.push(entry);
    saveBook(book);
    return { ok: true, entry };
  }

  // ---- caso 2: import del file risultato come rapporto prove ----
  const nodeId = opts.nodeId ?? state.node;
  const node = nodeById(ladder, nodeId);
  const rndTrack = trackName(ladder, node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track);
  const expectedList = (opts.trackNames ?? []).filter(Boolean).length ? opts.trackNames.filter(Boolean) : [rndTrack].filter(Boolean);
  const trackNames = expectedList;
  const allowAny = !!opts.allowAny;

  let candidate = null;
  if (opts.importFile) {
    const wanted = String(opts.importFile);
    const found = listResultFiles(paths).find((f) => f.name === wanted || f.file === wanted);
    if (!found) throw new Error(`File non trovato: ${wanted}`);
    candidate = { ...found, result: readSessionResult(found.file) };
  } else {
    // il più recente indipendentemente dalla sessione: in prova si testano anche le qualifiche
    let best = null;
    for (const f of listResultFiles(paths)) {
      let result;
      try { result = readSessionResult(f.file); } catch { continue; }
      const match = trackNames.some((t) => t && result.track && sameTrack(t, result.track));
      if (!match && !allowAny) continue;
      if (!best || f.mtime > best.mtime) best = { ...f, result, trackMatch: match };
    }
    if (!best) {
      const err = new Error(`Nessuna sessione trovata su ${trackNames.join(' / ')}. Fai la prova (o avvicina l'orologio del PC se il file è vecchio).`);
      err.code = 'NO_TEST_SESSION';
      throw err;
    }
    candidate = best;
  }

  const result = candidate.result;
  // criterio "onesto" del BOX (stesso contratto del cruscotto): se la pista della
  // sessione non è quella della ronda attesa va DICHIARATO, non lasciato implicito.
  const trackMatch = matchesAnyTrack(result.track, expectedList);
  // una gara già in carriera non è una prova: rifiutala (evita doppi conteggi nel quaderno)
  if (String(result.session ?? '').toLowerCase() === 'race' && alreadyImportedHash(candidate.file)) {
    const err = new Error('Questo file è una gara già registrata in carriera: non va nel quaderno prove (usa la pagina Risultati).');
    err.code = 'ALREADY_IN_CAREER';
    throw err;
  }
  const { driver, how } = findPlayerDriver(result, state.driver);
  if (!driver) {
    const err = new Error(`Non ho riconosciuto il tuo pilota in ${candidate.name}.`);
    err.code = 'PLAYER_NOT_FOUND';
    throw err;
  }
  const info = classify(result, { driver });
  const lap = bestLapInfo(result, driver);
  const sectors = sectorAnalysis(result, driver);
  // il form manda null quando la casella è vuota: 0 non è mai un range valido
  const numOrNull = (v) => (v == null || String(v).trim() === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const rangeMin = numOrNull(opts.rangeMin);
  const rangeMax = numOrNull(opts.rangeMax);

  const entry = {
    at: now,
    kind: 'file',
    file: candidate.name,
    fileMtime: candidate.mtime ?? null,
    sessionType: String(result.session ?? '?'),
    nodeId: node.nodeId,
    nodeDisplay: node.display,
    track: result.track ?? null,
    trackMatch,
    expectedTrack: rndTrack,
    // pista diversa da quella della ronda = lo si dice ad alta voce nel quaderno
    ...(trackMatch ? {} : { trackNote: `Sessione su ${result.track ?? 'pista n/d'}, NON su ${rndTrack ?? 'pista attesa n/d'}: resta nel quaderno come riferimento, ma non è la pista della prossima gara.` }),
    trackDisplay: prettyTrack(ladder, result.track) ?? result.track ?? rndTrack,
    car: info.car,
    position: info.dnf ? null : info.position,
    gridSize: info.gridSize,
    dnf: info.dnf,
    bestLap: info.bestLap,
    hasFastestLap: lap.playerHasIt,
    weather: String(result.weather_type ?? '').replace(/^.*WeatherType_/, '') || null,
    hour: result.hour ?? null,
    min: result.min ?? null,
    laps: info.laps,
    winnerLaps: info.winnerLaps,
    rangeMin, rangeMax,
    sectors,
    how,
    note: String(opts.note ?? '').slice(0, 400),
  };
  // stesso contenuto = stesso rapporto: EVO a volte riscrive la stessa sessione
  // con un nome file nuovo (es. all'uscita dal menu), quindi il confronto è sul
  // contenuto (tipo, pista, best lap al ms, giri, griglia, ora) oltre che sul nome
  const sig = (s) => [s.sessionType, s.track, s.bestLap, s.laps, s.gridSize, s.hour, s.min].join('|');
  const prev = [...book.sessions].reverse().find((s) => s.kind === 'file' && (s.file === candidate.name || sig(s) === sig(entry)));
  const prevIdx = prev ? book.sessions.indexOf(prev) : -1;
  if (prevIdx >= 0) {
    // ri-registrando la stessa sessione si mantengono range e note già scritti se ora vuoti
    entry.rangeMin = entry.rangeMin ?? prev.rangeMin ?? null;
    entry.rangeMax = entry.rangeMax ?? prev.rangeMax ?? null;
    entry.note = entry.note || prev.note || '';
    book.sessions[prevIdx] = entry;
  } else book.sessions.push(entry);
  saveBook(book);
  return { ok: true, entry, updated: prevIdx >= 0 };
}

/**
 * Riepilogo del quaderno per una serie: i range provati con posizione media e
 * numero di prove, per capire quale intervallo funziona davvero.
 */
export function calibrationSummary(ladder, state, { nodeId = null } = {}) {
  const book = loadBook();
  const target = nodeId ?? state.node;
  const rows = [];
  const byRange = new Map();
  for (const s of book.sessions) {
    if (s.nodeId !== target || s.rangeMin == null || s.rangeMax == null) continue;
    const key = `${s.rangeMin}-${s.rangeMax}`;
    if (!byRange.has(key)) byRange.set(key, { rangeMin: s.rangeMin, rangeMax: s.rangeMax, runs: [] });
    byRange.get(key).runs.push(s);
  }
  for (const [key, g] of byRange) {
    const positions = g.runs.map((r) => r.position).filter((p) => p != null);
    rows.push({
      range: key,
      rangeMin: g.rangeMin,
      rangeMax: g.rangeMax,
      tests: g.runs.length,
      avgPosition: positions.length ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null,
      bestPosition: positions.length ? Math.min(...positions) : null,
      lastAt: g.runs[g.runs.length - 1].at,
    });
  }
  rows.sort((a, b) => (a.avgPosition ?? 99) - (b.avgPosition ?? 99));
  return { nodeId: target, nodeDisplay: nodeById(ladder, target)?.display ?? target, rows };
}
