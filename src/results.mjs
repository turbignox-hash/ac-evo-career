// results.mjs — lettura dei risultati nativi di Assetto Corsa EVO.
//
// A fine sessione il gioco scrive, sia in Saved Games\ACE\Results che in Documents\ACE\Results:
//   <aaaammgg-hhmmss>_SP_<Sessione>.sessionresults.json
// con dentro classifica, giri, miglior giro, distacchi, penalita' e i nomi dei piloti.
// Questo e' il formato di import: niente da digitare a mano, la posizione la dice il gioco.

import { readFileSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { listFiles } from './paths.mjs';
import { matchesAnyTrack } from './tracknames.mjs';
import { nomePilota } from './nome-pilota.mjs';

export function listResultFiles(paths) {
  const files = [];
  for (const dir of paths.resultsDirs) {
    for (const file of listFiles(dir)) {
      if (!/\.sessionresults\.json$/i.test(file)) continue;
      let mtime = 0;
      try { mtime = statSync(file).mtimeMs; } catch { continue; }
      files.push({ file, mtime, name: basename(file), dir });
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

export function readSessionResult(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function isRaceSession(result) {
  return String(result?.session ?? '').toLowerCase() === 'race';
}

const strip = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '')
  .toLowerCase();

const cleanName = (s) => String(s ?? '').replace(/^[•\u2022\s]+/, '').trim();

/** Il pilota della carriera dentro un risultato: bandierina del gioco, nome, o esclusione. */
export function findPlayerDriver(result, driver) {
  const drivers = result?.drivers ?? [];
  // Attenzione: nelle qualifiche SP il gioco a volte marca is_current_driver su TUTTI
  // i piloti. Se il flag è su più di uno non vale nulla: si torna al riconoscimento
  // per nome (altrimenti si leggerebbe la griglia del primo pilota, non la tua).
  const flagged = drivers.filter((d) => d.is_current_driver === true);
  if (flagged.length === 1) return { driver: flagged[0], how: 'flag del gioco' };

  const pool = flagged.length > 1 ? flagged : drivers;
  const notAI = pool.filter((d) => !/^[•\u2022]/.test(String(d.driver_name ?? '').trim()));
  const wantedLast = strip(driver.last);
  const wantedFirst = strip(driver.first);
  const wantedFull = strip(driver.name);
  // nome di una parola sola: si confronta solo il nome di battesimo
  const singleWord = !wantedLast || wantedLast === wantedFirst;

  const match = notAI.find((d) => {
    const last = strip(cleanName(d.driver_surname));
    const first = strip(cleanName(d.driver_name));
    const full = strip(`${cleanName(d.driver_name)} ${cleanName(d.driver_surname)}`);
    if (full === wantedFull) return true;
    if (singleWord) return first === wantedFirst || (!!wantedFirst && first.startsWith(wantedFirst));
    if (!wantedLast) return false;
    return last === wantedLast || last.startsWith(wantedLast) || wantedLast.startsWith(last)
      || (last === wantedLast && first === wantedFirst);
  });
  if (match) return { driver: match, how: flagged.length > 1 ? 'nome pilota (il flag del gioco era generico)' : 'nome pilota' };
  if (notAI.length === 1) return { driver: notAI[0], how: 'unico pilota senza contrassegno AI' };
  return { driver: null, how: null, candidates: notAI };
}

export function lapToMs(t) {
  const m = String(t ?? '').match(/^(\d+):(\d+)\.(\d+)$/);
  if (!m) return Infinity;
  return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]);
}

/**
 * Nei file di EVO "position" puo' essere 0-based (0 = vincitore) oppure 1-based:
 * lo si capisce dal minimo. Restituisce anche com'e' stato letto.
 */
export function positionBase(result) {
  const positions = (result?.drivers ?? []).map((d) => Number(d.position)).filter((p) => Number.isFinite(p));
  if (!positions.length) return { zeroBased: true, base: 0 };
  const zeroBased = Math.min(...positions) === 0;
  return { zeroBased, base: zeroBased ? 0 : 1 };
}

/* ------------------------------------------------------------------ */
/* penalità di gara (richiesta Mauro 23/10: «il gioco le calcola, il tool no)  */
/* ------------------------------------------------------------------ */
//
// In pratica EVO scrive la penalità VERA nel campo `high_penalty` del pilota:
//   "+5.0s" / "+10.0s"  → tempo aggiunto a classificazione fatta
//   "DT"                → drive-through (il tempo perso resta nel total_time)
//   "DSQ"               → squalifica
// Il campo `position` del file è l'ordine DI PISTA, PRIMA della penalità:
// verificato su Paul Ricard 17/10/26 (P0 con +5.0s, gap P1 = 0.285s → ufficialmente P5)
// e su Red Bull Ring 17/04/26 (DSQ già in coda). L'array `penalties` è quasi
// sempre vuoto: non fidarsi di quello.

/** La penalità di un pilota come la scrive EVO: { label, kind, ms, dsq }. */
export function penaltyOf(d) {
  const raw = String(d?.high_penalty ?? '').trim();
  if (!raw) return { label: null, kind: null, ms: 0, dsq: false };
  const m = raw.match(/^\+(\d+(?:\.\d+)?)s$/i);
  if (m) return { label: raw, kind: 'time', ms: Math.round(Number(m[1]) * 1000), dsq: false };
  if (/^DSQ$/i.test(raw)) return { label: raw, kind: 'dsq', ms: 0, dsq: true };
  return { label: raw, kind: raw.toUpperCase(), ms: 0, dsq: false };   // es. "DT"
}

/** Tempera total_time di gara: supporta anche il formato h:mm:ss.d dei giri lunghi. */
const raceMsOf = (t) => {
  const m = String(t ?? '').match(/^(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?$/);
  if (!m) return Infinity;
  return ((Number(m[1] ?? 0) * 3600) + (Number(m[2]) * 60) + Number(m[3])) * 1000 + Number(m[4] ?? 0);
};

/** Positione UFFICIALE di un pilota: i classificati vengono riordinati con
 *  total_time + penalità a tempo; DSQ e non classificati escono dal conto.
 *  DT non si ricompone: il tempo dell'attraversamento è già nel giro. */
export function officialPositionOf(result, d) {
  const pen = penaltyOf(d);
  if (!d || !d.total_time || Number(d.laps ?? 0) === 0 || pen.dsq) {
    return { position: null, dsq: pen.dsq, penalty: pen.label };
  }
  const myMs = raceMsOf(d.total_time);
  const myLaps = Number(d.laps ?? 0);
  // Classificazione come la fa il gioco: prima i GIRI, poi il tempo corretto
  // (i doppiati restano dietro anche se total_time è più basso del leader!).
  const ahead = (result?.drivers ?? []).filter((o) => {
    if (o === d) return false;
    const p = penaltyOf(o);
    if (p.dsq) return false;
    if (!o.total_time || Number(o.laps ?? 0) === 0) return false;
    const oLaps = Number(o.laps ?? 0);
    if (oLaps !== myLaps) return oLaps > myLaps;
    const t = raceMsOf(o.total_time);
    return Number.isFinite(t) && (t + p.ms) < (myMs + pen.ms);
  }).length;
  return { position: ahead + 1, dsq: false, penalty: pen.label };
}

/** Miglior giro in assoluto e se il giocatore l'ha firmato. */
export function bestLapInfo(result, playerDriver) {
  const drivers = result?.drivers ?? [];
  const withLap = drivers.filter((d) => d.has_best_lap && d.best_lap);
  const sameDriver = (a, b) => !!a && !!b && a.driver_name === b.driver_name && a.driver_surname === b.driver_surname;
  if (!withLap.length) return { fastest: null, playerHasIt: false, fastestLap: null, gapMs: null };
  const sorted = [...withLap].sort((a, b) => lapToMs(a.best_lap) - lapToMs(b.best_lap));
  const fastest = sorted[0];
  const flagged = playerDriver?.has_best_lap === true;
  const allTimes = drivers.filter((d) => d.best_lap).sort((a, b) => lapToMs(a.best_lap) - lapToMs(b.best_lap));
  return {
    fastest,
    playerHasIt: flagged || sameDriver(fastest, playerDriver),
    fastestLap: fastest.best_lap,
    gapMs: playerDriver?.best_lap && allTimes[0] ? lapToMs(playerDriver.best_lap) - lapToMs(allTimes[0].best_lap) : null,
  };
}

/** Posizione finale, ritiro e dati di contorno del pilota della carriera.
 *  Con penalità a tempo la posizione viene RICOMPUTATA ufficiale (v. penaltyOf). */
export function classify(result, entry) {
  const drivers = result?.drivers ?? [];
  const d = entry.driver;
  const { zeroBased } = positionBase(result);
  const toPosition = (p) => (zeroBased ? Number(p) + 1 : Number(p));
  const winner = drivers.find((x) => Number(x.position) === (zeroBased ? 0 : 1));
  const rawPos = d ? toPosition(d.position) : null;
  const off = d ? officialPositionOf(result, d) : { position: null, dsq: false, penalty: null };
  const dnf = !d || !d.total_time || Number(d.laps ?? 0) === 0 || off.dsq;
  return {
    position: dnf ? drivers.length : (off.position ?? rawPos),   // considerata la penalità
    rawPos,
    gridSize: drivers.length,
    dnf,
    dsq: !!off.dsq,
    penalty: off.penalty ?? null,
    laps: d?.laps ?? 0,
    winnerLaps: winner?.laps ?? 0,
    bestLap: d?.best_lap ?? null,
    totalTime: d?.total_time ?? null,
    winnerTime: winner?.total_time ?? null,
    gapMs: (!dnf && d?.total_time && winner?.total_time && Number.isFinite(lapToMs(d.total_time)) && Number.isFinite(lapToMs(winner.total_time)))
      ? lapToMs(d.total_time) - lapToMs(winner.total_time)
      : null,
    // il gioco scrive car_name già completo di marchio ("Mazda MX-5 ND Cup"):
    // se il brand è già incluso non va ripetuto (evita "Mazda Mazda ...")
    car: d ? (d.car_name && d.car_brand && String(d.car_name).toLowerCase().startsWith(String(d.car_brand).toLowerCase())
      ? d.car_name
      : `${d.car_brand ?? ''} ${d.car_name ?? ''}`.trim()) : null,
    carNumber: d?.car_number ?? null,
    nation: d?.driver_nation ?? null,
    zeroBased,
  };
}

/** Confronto tollerante fra il nome pista atteso e quello scritto dal gioco:
 *  unica implementazione in tracknames.mjs (accenti + prefix-match, vedi lì la storia). */
export function trackMatches(expectedNames, actual) {
  return matchesAnyTrack(actual, expectedNames);
}

/** Il candidato più recente compatibile con la ronda attesa. */
export function pickCandidate(paths, { since = null, trackNames = [], allowAny = false } = {}) {
  const files = listResultFiles(paths);
  const usable = [];
  for (const f of files) {
    if (since && f.mtime < since - 5 * 60 * 1000) continue;
    let result;
    try { result = readSessionResult(f.file); } catch { continue; }
    if (!isRaceSession(result)) continue;
    const match = trackMatches(trackNames, result.track);
    if (!match && !allowAny) continue;
    usable.push({ ...f, result, trackMatch: match });
  }
  // prima le gare che combaciano con la pista attesa, poi le più recenti
  usable.sort((a, b) => (Number(b.trackMatch) - Number(a.trackMatch)) || (b.mtime - a.mtime));
  return usable;
}

export function describeResult(result) {
  const drivers = result?.drivers ?? [];
  const lines = [];
  lines.push(`file:      ${result?.season ?? '?'} / ${result?.event ?? '?'} / ${result?.session ?? '?'}`);
  lines.push(`pista:     ${result?.track ?? '?'} (${result?.layout ?? '?'})  ora ${result?.hour ?? '?'}:${String(result?.min ?? 0).padStart(2, '0')}`);
  lines.push(`meteo:     ${result?.weather_type ?? '?'}`);
  lines.push(`piloti:    ${drivers.length}`);
  const { zeroBased } = positionBase(result);
  // il campo penalties è quasi sempre vuoto; la penalità vera sta in high_penalty
  for (const d of drivers) {
    const shown = zeroBased ? Number(d.position) + 1 : Number(d.position);
    const flag = d.is_current_driver ? '  <= PILOTA ATTUALE' : /^[•\u2022]/.test(String(d.driver_name).trim()) ? '' : '  <= senza contrassegno AI';
    const labs = penaltyOf(d).label;
    lines.push(`  P${shown} ${nomePilota(d.driver_name, d.driver_surname)} (${d.driver_nation}) ${d.car_name} — giri ${d.laps}, best ${d.best_lap || '-'}${labs ? ` — penalità ${labs}` : ''}${flag}`);
  }
  return lines.join('\n');
}

export function archiveResult(file, archiveDir) {
  mkdirSync(archiveDir, { recursive: true });
  const target = join(archiveDir, basename(file));
  if (target !== file) copyFileSync(file, target);
  return target;
}

/**
 * La qualifica abbinata a una gara: stesso tracciato, file scritto vicino nel tempo
 * (stesso weekend). Serve per pole position e posizione di partenza (rimonte).
 */
export function findQualiResult(paths, raceMtime, trackNames = [], { windowMs = 6 * 60 * 60 * 1000 } = {}) {
  let best = null;
  for (const f of listResultFiles(paths)) {
    if (Math.abs(f.mtime - raceMtime) > windowMs) continue;
    let result;
    try { result = readSessionResult(f.file); } catch { continue; }
    if (String(result?.session ?? '').toLowerCase() !== 'qualifying') continue;
    if (!trackMatches(trackNames, result.track)) continue;
    const dist = Math.abs(f.mtime - raceMtime);
    if (!best || dist < best.dist) best = { ...f, result, dist };
  }
  return best;
}

export { basename, dirname };

/* ------------------------------------------------------------------ */
/* analisi settoriale (per il report gara e la giornata di prove)       */
/* ------------------------------------------------------------------ */

const lapToMsL = (t) => { const m = String(t ?? '').match(/^(\d+):(\d+)\.(\d+)$/); return m ? (+m[1] * 60000) + (+m[2] * 1000) + (+m[3]) : Infinity; };
const fmtLap = (ms) => (Number.isFinite(ms) && ms > 0)
  ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.round(ms % 1000)).padStart(3, '0')}`
  : '—';

/**
 * Analisi settoriale di una sessione: per ogni settore il tuo miglior tempo
 * contro il migliore della griglia, la distanza dai migliori 3 e il tuo "giro
 * teorico" (somma dei tuoi migliori settoriali, spesso più veloce del best reale).
 * La classica "dove guadagno / dove perdo" dopo la gara.
 */
export function sectorAnalysis(result, driver) {
  const drivers = result?.drivers ?? [];
  if (!drivers.length || !driver) return null;
  const meRow = driver;
  const splits = (meRow.splits ?? []).map(lapToMsL);
  if (!splits.length || splits.every((s) => !Number.isFinite(s))) return null;

  const bestSectors = [];
  const count = splits.length;
  for (let i = 0; i < count; i++) {
    let best = Infinity, bestName = null, mine = Infinity;
    for (const d of drivers) {
      const v = lapToMsL((d.splits ?? [])[i]);
      if (!Number.isFinite(v)) continue;
      if (v < best) { best = v; bestName = nomePilota(d.driver_name, d.driver_surname); }
    }
    mine = splits[i];
    bestSectors.push({
      index: i + 1,
      mine,
      mineText: fmtLap(mine),
      best,
      bestText: fmtLap(best),
      bestName,
      deltaMs: Number.isFinite(mine) && Number.isFinite(best) ? mine - best : null,
    });
  }

  // media dei 3 migliori per settore (escluso me): la distanza dai veloci, non solo dal fenomeno
  const top3Deltas = [];
  for (let i = 0; i < count; i++) {
    const vals = drivers.filter((d) => d !== meRow)
      .map((d) => lapToMsL((d.splits ?? [])[i]))
      .filter(Number.isFinite).sort((a, b) => a - b).slice(0, 3);
    top3Deltas.push(Number.isFinite(splits[i]) && vals.length ? Math.round(splits[i] - (vals.reduce((a, b) => a + b, 0) / vals.length)) : null);
  }

  const theoretical = splits.reduce((a, s) => a + (Number.isFinite(s) ? s : 0), 0);
  const bestLapMs = lapToMsL(meRow.best_lap);
  // il settore dove perdi di più rispetto al meglio della griglia (in millisecondi)
  const worst = bestSectors.filter((s) => s.deltaMs != null).sort((a, b) => b.deltaMs - a.deltaMs)[0] ?? null;
  const best = bestSectors.filter((s) => s.deltaMs != null).sort((a, b) => a.deltaMs - b.deltaMs)[0] ?? null;

  return {
    sectors: bestSectors,
    top3Deltas,
    theoreticalMs: theoretical,
    theoreticalText: fmtLap(theoretical),
    bestLapMs: Number.isFinite(bestLapMs) ? bestLapMs : null,
    bestLapText: fmtLap(bestLapMs),
    theoreticalGainText: Number.isFinite(bestLapMs) && theoretical < bestLapMs ? fmtLap(bestLapMs - theoretical) : null,
    worstSector: worst ? { index: worst.index, deltaMs: worst.deltaMs } : null,
    bestSector: best ? { index: best.index, deltaMs: best.deltaMs } : null,
  };
}
