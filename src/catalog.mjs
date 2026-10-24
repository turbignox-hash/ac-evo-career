// catalog.mjs — il "Content Manager" di EVO: legge dall'installazione e dalle
// cartelle dati tutto ciò che il gioco scrive in formato aperto:
//
//   cars.json (server dedicato)      → tutte le auto con indice di prestazione
//   events_race_weekend.json         → tutte le piste con layout e lunghezze
//   Saved Games\ACE\Results\*.json   → archivio sessioni con tempi e piloti
//   Saved Games\ACE\MoTec\...        → telemetria .ld per auto/pista
//   Documents\ACE\SavedCars          → livree salvate (thumbnail)
//
// Tutto in sola lettura: qui non si scrive mai nulla nel gioco.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { recordWarning } from './warnings.mjs';
import { dirname, join, basename } from 'node:path';
import { findPlayerDriver, penaltyOf, officialPositionOf } from './results.mjs';

/* ------------------------------------------------------------------ */
/* dove vive il server dedicato                                        */
/* ------------------------------------------------------------------ */

const SERVER_FOLDER = 'Assetto Corsa EVO Dedicated Server';

function serverDir(paths, env = process.env) {
  if (env.ACE_SERVER && existsSync(join(env.ACE_SERVER, 'cars.json'))) return env.ACE_SERVER;
  // dal gioco: <lib>/steamapps/common/<gioco>/AssettoCorsaEVO.exe → il server è un fratello della cartella del gioco
  if (paths?.gameExe) {
    const sibling = join(dirname(paths.gameExe), '..', SERVER_FOLDER);
    if (existsSync(join(sibling, 'cars.json'))) return sibling;
  }
  // ultimo tentativo: librerie Steam sui drive comuni
  for (const drive of ['C', 'D', 'E', 'F', 'G', 'H']) {
    for (const cand of [
      join(`${drive}:/SteamLibrary`, 'steamapps', 'common', SERVER_FOLDER),
      join(`${drive}:/Steam`, 'steamapps', 'common', SERVER_FOLDER),
    ]) {
      if (existsSync(join(cand, 'cars.json'))) return cand;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* catalogo auto e piste (dal server dedicato)                         */
/* ------------------------------------------------------------------ */

function carBaseId(presetName) {
  // preset_695b_mech_1 → 695b ; preset_r8gt4_mech_2 → r8gt4
  return String(presetName ?? '').replace(/^preset_/, '').replace(/_mech_\d+$/, '') || String(presetName ?? '');
}

function parseCars(dir) {
  const file = join(dir, 'cars.json');
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, 'utf8')).cars ?? [];
  const byModel = new Map();
  for (const c of raw) {
    const [modelName, variant] = String(c.display_name ?? c.name).split(' - ');
    const id = carBaseId(c.name);
    const model = byModel.get(modelName) ?? { id, name: modelName, variants: [], perf: [] };
    model.variants.push({ preset: c.name, variant: variant ?? 'Standard', pi: Number(c.performance_indicator ?? 0) });
    model.perf.push(Number(c.performance_indicator ?? 0));
    byModel.set(modelName, model);
  }
  const out = [...byModel.values()].map((m) => ({
    id: m.id, name: m.name,
    pi: Math.round(Math.max(...m.perf) * 100) / 100,
    piMin: Math.round(Math.min(...m.perf) * 100) / 100,
    variants: m.variants.map((v) => ({ variant: v.variant, pi: Math.round(v.pi * 100) / 100 })),
  }));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function parseTracks(dir) {
  const file = join(dir, 'events_race_weekend.json');
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, 'utf8')).events ?? [];
  const byTrack = new Map();
  for (const t of raw) {
    const cur = byTrack.get(t.track) ?? { name: t.track, layouts: [] };
    cur.layouts.push({ layout: t.layout, length: t.track_length, pits: t.max_pit_slot });
    byTrack.set(t.track, cur);
  }
  const out = [...byTrack.values()];
  for (const t of out) t.layouts.sort((a, b) => a.length - b.length);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/* ------------------------------------------------------------------ */
/* archivio risultati                                                  */
/* ------------------------------------------------------------------ */

export function resultDirs(paths) {
  const out = [];
  for (const d of paths?.resultsDirs ?? []) if (!out.includes(d)) out.push(d);
  return out;
}

function readJsonSafe(file) {
  const raw = (() => { try { return readFileSync(file, 'utf8'); } catch { return null; } })();
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch (e) {
    recordWarning('catalog', 'catalogo illeggibile, provo la sanifica: ' + file, e?.message ?? null);
    return null;
  }
  // i JSON di Kunos contengono accapo reali dentro le stringhe, commenti e virgole finali:
  // sanifica caratteri di controllo dentro le stringhe, poi pulisce il resto
  try {
    let text = raw.replace(/^\uFEFF/, '');
    let out = '';
    let inStr = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (!inStr) {
        if (ch === '"') inStr = true;
        out += ch;
        continue;
      }
      if (ch === '\\') { out += ch + (text[i + 1] ?? ''); i++; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      const code = ch.charCodeAt(0);
      if (code === 13) continue;            // CR buttato
      if (code === 10) { out += '\\n'; continue; }
      if (code === 9) { out += ' '; continue; }
      if (code < 32) { out += ' '; continue; }
      out += ch;
    }
    text = out
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"\\])\/\/[^\n\r]*/g, '$1')
      .replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(text);
  } catch { return null; }
}

export function listArchive(paths, { limit = 200, driver = null, afterMs = 0 } = {}) {
  // afterMs (24/10, slot 3): i Results di EVO sono UNA cartella per PC condivisa
  // da tutti gli slot — un archivio vergine incassava lo storico dello slot 1.
  // afterMs = nascita della carriera (state.createdAt): si mostra solo il POST.
  const entries = [];
  for (const dir of resultDirs(paths)) {
    if (!existsSync(dir)) continue;
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')); } catch { continue; }
    for (const f of files) {
      const full = join(dir, f);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (afterMs && st.mtimeMs < afterMs) continue; // prima della nascita: non è suo
      entries.push({ file: f, dir, mtime: st.mtimeMs, size: st.size });
    }
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  const rows = [];
  for (const e of entries.slice(0, limit)) {
    const r = readJsonSafe(join(e.dir, e.file));
    if (!r) continue;
    const drivers = Array.isArray(r.drivers) ? r.drivers : [];
    const zeroBased = drivers.some((d) => Number(d.position) === 0);
    const winner = drivers.find((d) => Number(d.position) === (zeroBased ? 0 : 1));
    // il pilota della carriera: flag del gioco se affidabile, altrimenti il nome
    // (nelle qualifiche SP EVO marca is_current_driver su TUTTI i piloti)
    const found = driver ? findPlayerDriver(r, driver) : { driver: drivers.find((d) => d.is_current_driver === true) ?? null };
    const me = found.driver ?? null;
    const myPos = me ? Number(me.position) + (zeroBased ? 1 : 0) : null;
    const kind = basename(e.file).includes('_MP_') ? 'online' : 'offline';
    const session = r.session ?? '?';
    rows.push({
      file: e.file,
      when: new Date(e.mtime).toISOString(),
      kind,
      season: r.season ?? '?', event: r.event ?? '?', session,
      track: r.track ?? '?', layout: r.layout ?? '',
      weather: String(r.weather_type ?? '').replace('GameModeSelectionWeatherType_', '').replace('WeatherType_', '') || null,
      hour: r.hour ?? null,
      drivers: drivers.length,
      winner: winner ? `${String(winner.driver_name ?? '').replace(/^[•\u2022]/, '').trim()} ${winner.driver_surname ?? ''}`.trim() : null,
      me: me ? { position: myPos, bestLap: me.best_lap ?? null, car: `${me.car_brand ?? ''} ${me.car_name ?? ''}`.trim() } : null,
    });
  }
  return { total: entries.length, rows, scoped: !!afterMs };
}

/** Dettaglio di un file risultato: griglia completa con giri, tempi e gap. */
export function resultDetail(paths, fileName) {
  const safe = basename(String(fileName ?? ''));
  for (const dir of resultDirs(paths)) {
    const full = join(dir, safe);
    if (!existsSync(full)) continue;
    const r = readJsonSafe(full);
    if (!r) return null;
    const drivers = Array.isArray(r.drivers) ? r.drivers : [];
    const zeroBased = drivers.length ? Math.min(...drivers.map((d) => Number(d.position))) === 0 : true;
    const winnerTime = drivers.find((d) => Number(d.position) === (zeroBased ? 0 : 1))?.total_time ?? null;
    const toMs = (t) => {
      const m = String(t ?? '').match(/^(\d+):(\d+)\.(\d+)$/);
      return m ? Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]) : null;
    };
    const wMs = toMs(winnerTime);
    // penalità vere di EVO: high_penalty ('+5.0s' | 'DT' | 'DSQ') — l'array
    // `penalties` è quasi sempre vuoto. La posizione ufficiale la ricalcola
    // officialPositionOf (i secondi il gioco li aggiunge a classificazione fatta,
    // il campo position del file resta l'ordine di pista).
    const rows = drivers.map((d) => {
      const pos = Number(d.position) + (zeroBased ? 1 : 0);
      const off = officialPositionOf(r, d);   // posizione ufficiale (penalità incluse)
      const tMs = toMs(d.total_time);
      const gap = tMs != null && wMs != null ? tMs - wMs : null;
      return {
        // la DSQ e i non classificati non hanno posizione ufficiale: resta
        // l'ordine di pista del file (sono già in coda)
        position: off.position ?? pos, rawPos: pos, dsq: !!off.dsq,
        name: `${String(d.driver_name ?? '').replace(/^[•\u2022]/, '').trim()} ${d.driver_surname ?? ''}`.trim(),
        nation: d.driver_nation ?? null, car: `${d.car_brand ?? ''} ${d.car_name ?? ''}`.trim(),
        isAI: /^[•\u2022]/.test(String(d.driver_name ?? '').trim()), me: d.is_current_driver === true,
        laps: d.laps ?? 0, bestLap: d.best_lap ?? null, hasBest: d.has_best_lap === true,
        totalTime: d.total_time ?? null, gap, pits: d.num_pits ?? 0,
        penalty: penaltyOf(d).label,
        offSort: (off.position ?? 0) || (1000 + pos),
      };
    }).sort((a, b) => a.offSort - b.offSort);
    return {
      file: safe, season: r.season ?? '?', event: r.event ?? '?', session: r.session ?? '?',
      track: r.track ?? '?', layout: r.layout ?? '',
      weather: String(r.weather_type ?? '').replace('GameModeSelectionWeatherType_', '').replace('WeatherType_', '') || null,
      hour: r.hour ?? null, min: r.min ?? 0, rows,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* telemetria MoTec                                                    */
/* ------------------------------------------------------------------ */

function scanMotec(roots) {
  const sessions = [];
  const byCar = new Map();
  const byTrack = new Map();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let cars = [];
    try { cars = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    for (const car of cars) {
      const carDir = join(root, car);
      let tracks = [];
      try { tracks = readdirSync(carDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
      for (const track of tracks) {
        let files = [];
        try { files = readdirSync(join(carDir, track)); } catch { continue; }
        const lds = files.filter((f) => f.toLowerCase().endsWith('.ld'));
        if (!lds.length) continue;
        let latest = 0;
        for (const f of lds) {
          try { latest = Math.max(latest, statSync(join(carDir, track, f)).mtimeMs); } catch (e) {
            recordWarning('catalog.telem', 'file .ld non stat-able: ' + join(carDir, track, f), e?.message ?? null);
          }
        }
        sessions.push({ car, track, files: lds.length, latest: latest ? new Date(latest).toISOString() : null, dir: join(carDir, track) });
        byCar.set(car, (byCar.get(car) ?? 0) + lds.length);
        byTrack.set(track, (byTrack.get(track) ?? 0) + lds.length);
      }
    }
  }
  sessions.sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''));
  return {
    total: sessions.reduce((a, s) => a + s.files, 0),
    latest: sessions.slice(0, 10),
    byCar: [...byCar.entries()].map(([car, files]) => ({ car, files })).sort((a, b) => b.files - a.files),
    byTrack: [...byTrack.entries()].map(([track, files]) => ({ track, files })).sort((a, b) => b.files - a.files),
  };
}

/* ------------------------------------------------------------------ */
/* livree salvate (SavedCars)                                          */
/* ------------------------------------------------------------------ */

function scanSavedCars(roots) {
  let thumbs = 0;
  for (const root of roots) {
    const t = join(root, 'SavedCars', 'Thumbnails');
    if (!existsSync(t)) continue;
    try { thumbs += readdirSync(t).filter((f) => f.toLowerCase().endsWith('.texture')).length; } catch (e) {
      recordWarning('catalog.savedcars', 'Thumbnails illeggibili: ' + t, e?.message ?? null);
    }
  }
  return thumbs;
}

/* ------------------------------------------------------------------ */
/* API del modulo                                                      */
/* ------------------------------------------------------------------ */

let cache = null;
let cacheAt = 0;
const TTL = 60 * 1000;

export function loadCatalog(paths, env = process.env, { fresh = false, driver = null, afterMs = 0 } = {}) {
  // la cache è solo per auto/piste del server; l'archivio si ricalcola sempre
  // (i Results cambiano di continuo) e riceve il pilota per il riconoscimento
  // e il confine temporale della carriera (afterMs, 24/10)
  const cached = !fresh && cache && Date.now() - cacheAt < TTL ? cache : null;
  if (cached) {
    return { ...cached, archive: listArchive(paths, { driver, afterMs }) };
  }
  const server = serverDir(paths, env);
  const dataRoots = (paths?.dataDirs ?? []).filter((d) => existsSync(d));
  const motecRoots = dataRoots.map((d) => join(d, 'MoTec'));
  const savedCarRoots = dataRoots.map((d) => join(d, 'SavedCars')).filter((d) => existsSync(d));

  const catalog = {
    serverFound: !!server,
    serverPath: server,
    cars: server ? parseCars(server) : [],
    tracks: server ? parseTracks(server) : [],
    archive: listArchive(paths, { driver, afterMs }),
    motec: scanMotec(motecRoots),
    savedCars: scanSavedCars(savedCarRoots),
    scannedAt: new Date().toISOString(),
  };
  cache = catalog;
  cacheAt = Date.now();
  return catalog;
}
