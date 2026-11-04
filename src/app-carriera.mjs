// app-carriera.mjs — il calendario della carriera, letto dal journal nostro.
//
// `saveState` riscrive `evo-calendar[-N].json` accanto al save (src/journal.mjs)
// con le ronde del sedile attivo. Qui lo leggiamo e lo adattiamo ai consumatori
// (webui, race, CLI): nessuna lettura di journal o cartelle esterne.
//
// Il file è una copia: se manca o è illeggibile, i consumatori restano sulla
// ladder. La cache è per mtime, così il server vivo resta al passo.

import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr } from './lang.mjs';
import { journalPathForSave } from './journal.mjs';
import { TRACK_INFO } from './tracks.mjs';
import { sameTrack } from './tracknames.mjs';

const _cache = { file: null, mtime: 0, val: null };

/** Il journal del calendario nostro, o null se assente/non è un mirror. */
export function journalNostro(env = process.env) {
  const slot = Math.max(1, Math.min(3, Math.floor(Number(env.ACE_SLOT) || 1)));
  const dataDir = env.EVO_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const nomiSave = slot === 1 ? 'evo-career.save.json' : `evo-career.save-${slot}.json`;
  const file = journalPathForSave(join(dataDir, nomiSave));
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { return null; }
  if (_cache.file === file && _cache.mtime === mtime) return _cache.val;
  let val = null;
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    if (j?.mirror && Array.isArray(j.rounds)) val = j;
  } catch { val = null; }
  _cache.file = file; _cache.mtime = mtime; _cache.val = val;
  return val;
}

/** Il mtime del mirror in ISO (per il campo `at`): null se assente. */
function journalNostroStamp(env = process.env) {
  if (!journalNostro(env)) return null;
  return _cache.file && _cache.mtime ? new Date(_cache.mtime).toISOString() : null;
}

/** Svuota la cache (i test; in produzione decide il mtime). */
export function journalNostroCacheClear() { _cache.file = null; _cache.mtime = 0; _cache.val = null; }
export function appCacheClear() { journalNostroCacheClear(); }

/** Il calendario della stagione in corso, nella forma usata dalla GUI. */
export function appCalendar(env = process.env) {
  const j = journalNostro(env);
  if (!j?.rounds?.length) return { ok: false, rounds: [], standings: [] };
  return {
    ok: true,
    series: j.series ?? null,
    seriesId: null,
    car: j.car ?? j.rounds.find((r) => r?.car)?.car ?? null,
    season: j.season ?? null,
    status: null,
    summary: j.summary ?? null,
    rounds: j.rounds,
    standings: [],
    mirror: true,
    at: journalNostroStamp(env),
  };
}

/** Parole che indicano pista bagnata nel calendario. */
export const WET_WORDS = ['pioggia', 'rain', 'scrosci', 'temporale', 'wet'];

export function appWet(weather) {
  const w = String(weather ?? '').toLowerCase();
  return WET_WORDS.some((word) => w.includes(word));
}

/**
 * La scheda della prossima ronda dal calendario nostro.
 * Per una gara bagnata allega i suggerimenti di assetto.
 */
export function appNextRace(env = process.env) {
  const cal = appCalendar(env);
  if (!cal.ok) return null;
  const next = cal.rounds.find((r) => r?.state === 'next') ?? null;
  if (!next?.track) return null;
  const wet = appWet(next.weather);
  const tips = [];
  if (wet) {
    tips.push(tr({ it: "Gara BAGNATA in programma: monta l'assetto pioggia PRIMA di partire", en: 'WET race scheduled: fit the wet setup BEFORE you leave' }));
    tips.push(tr({ it: 'pressioni: parti ~0.4 PSI sotto il target a caldo (la gomma lavora più fredda in pioggia), dolce in trazione', en: 'pressures: start ~0.4 PSI under the hot target (the tyre runs cooler in the rain), gentle on traction' }));
    tips.push(tr({ it: 'frenate: anticipa la staccata di 10–15 m, le traiettorie asciutte non le regge', en: 'braking: brake 10–15 m earlier, dry lines are not going to hold' }));
  }
  if (next.time) {
    const hour = Number(String(next.time).split(':')[0] ?? 12);
    if (hour >= 17) tips.push(tr({ it: `partenza alle ${next.time}: sera — la pista si raffredda giro dopo giro, la pressione scende`, en: `start at ${next.time}: evening — the track cools down lap after lap, pressure drops` }));
  }
  return {
    ok: true,
    series: cal.series,
    car: next.car ?? cal.car ?? null,
    season: cal.season,
    round: next.n ?? null,
    total: cal.rounds.length,
    track: next.track,
    layout: next.layout ?? null,
    laps: next.laps ?? null,
    time: next.time ?? null,
    weather: next.weather ?? null,
    wet,
    opponents: null,
    rank: null,
    points: null,
    done: cal.summary?.done ?? cal.rounds.filter((r) => r?.state === 'done').length,
    image: null,
    map: null,
    tips,
    at: cal.at,
  };
}

/** Bonus gara pulita: 10% del premio, zero con penalità o premio nullo. */
export function cleanRaceBonusOf(prize, penalties = 0) {
  const p = Number(prize) || 0;
  if (p <= 0 || Number(penalties) > 0) return 0;
  return Math.round(p * 0.1);
}

/* Il meteo del calendario (parole) → i due idi usati da round.weather e dai
 * preset: id scala ladder (0..5), idPreset scala preset (0..6), spia bagnata. */
export const METEO_WORDS = [
  ['pioggia battente', 5, 6], ['bombo', 5, 6], ['temporale', 5, 6], ['pioggia intensa', 5, 6], ['heavy rain', 5, 6],
  ['drizzle', 3, 4], ['pioggerella', 3, 4], ['pioggia leggera', 3, 4], ['light rain', 3, 4],
  ['pioggia', 4, 5], ['rain', 4, 5], ['scrosci', 4, 5],
  ['parzialmente nuvoloso', 1, 1], ['nuvole sparse', 1, 1], ['scattered clouds', 1, 1], ['few clouds', 1, 1],
  ['coperto', 2, 3], ['overcast', 2, 3],
  ['nuvoloso', 2, 2], ['cloudy', 2, 2],
  ['sereno', 0, 0], ['clear', 0, 0], ['sole', 0, 0], ['sunny', 0, 0],
];

/** Il meteo a parole del calendario → { id, idPreset, spia }. */
export function meteoIndex(word) {
  const s = String(word ?? '').trim().toLowerCase();
  const hit = METEO_WORDS.find(([w]) => s.includes(w));
  if (!hit) return { id: null, idPreset: null, spia: null };
  return { id: hit[1], idPreset: hit[2], spia: hit[2] >= 4 ? 'wet' : null };
}

/** Normalizzatore dei nomi (minuscolo, solo lettere+cifre, niente accenti). */
const nugno = (s) => String(s ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

/** La serie del nodo combacia con quella del calendario? */
export function stessaSerie(node, cal) {
  const car = nugno(cal?.car ?? '');
  if (car.length >= 6) {
    for (const c of node?.cars ?? []) {
      const x = nugno(String(c)).replace(/^ks/, '');
      if (x.length < 6) continue;
      if (x === car) return true;
      if (car.includes(x) && x.length >= Math.min(10, car.length - 2)) return true;
      if (x.includes(car) && car.length >= Math.min(10, x.length - 2)) return true;
    }
  }
  const a = nugno(node?.display ?? node?.series ?? '');
  const b = nugno(cal?.series ?? '');
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

/** "Brands Hatch" (o già "brands_hatch") → ID della ladder | null. */
export function trackIdDaNome(name) {
  const s = String(name ?? '').trim();
  if (!s) return null;
  for (const [id, t] of Object.entries(TRACK_INFO)) {
    if (id === s || t.name === s) return id;
    if (sameTrack(t.name, s) || sameTrack(t.fullName ?? '', s)) return id;
  }
  return null;
}

/**
 * La ronda del calendario nostro che va corsa adesso (prima non DONE):
 * { n, pistaParola, trackId, layout, laps, hour, minute, weather, idPreset,
 * meteoParola, spia, serie, stagione, statoRonda } | null.
 */
export function rondaDelCalendario(node, env = process.env) {
  const cal = appCalendar(env);
  if (!cal.ok || !stessaSerie(node, cal)) return null;
  const rounds = Array.isArray(cal.rounds) ? cal.rounds : [];
  const r = rounds.find((x) => x?.state === 'next') ?? null;
  if (!r?.track) return null;
  const trackId = trackIdDaNome(r.track);
  if (!trackId) return null;
  const wx = meteoIndex(r.weather);
  const [hh, mm] = String(r.time ?? '14:00').split(':');
  return {
    n: Number.isFinite(Number(r.n)) ? Number(r.n) : rounds.indexOf(r) + 1,
    pistaParola: r.track,
    trackId,
    layout: r.layout ?? null,
    laps: r.laps ?? null,
    hour: Number.isFinite(parseInt(hh, 10)) ? parseInt(hh, 10) : 14,
    minute: Number.isFinite(parseInt(mm, 10)) ? parseInt(mm, 10) : 0,
    weather: wx.id,
    idPreset: wx.idPreset,
    meteoParola: r.weather ?? null,
    spia: wx.spia,
    serie: cal.series ?? null,
    stagione: cal.season ?? null,
    statoRonda: r.state ?? null,
  };
}
