// motec.mjs — lettura della telemetria MoTeC che Assetto Corsa EVO scrive da solo
// in Saved Games\ACE\MoTec\<auto>\<circuito>\<file>.ld (+ indice beacon .ldx).
//
// Formato .ld decodificato e verificato sulle sessioni reali di Imola (MX-5 ND Cup):
//   header 64B: u32@8 = inizio tabella canali, u32@12 = fine tabella
//   record canale (124B): u32@+8 offset dati, u32@+12 numero campioni,
//     u32@+20 bit alti = frequenza in Hz, nome (24B) a +32, unità (8B) a +72
//   i dati sono blocchi contigui di float32 LE, UNO PER CANALE (offset+4*cnt = offset successivo)
//   I CANALI HANNO FREQUENZE DIVERSE (LAP_BEACON 100Hz, SPEED/THROTTLE/TEMP 60Hz,
//   FUEL/PRESS/TAIR 20Hz) e la stessa durata complessiva.
//   LAP_BEACON nel .ld è tipicamente tutto a zero: i VERI beacon sono nel .ldx
//   come Marker Time in MICROSECONDI (es. 1.79892e8 = 179.892s).
// Canali chiave: FUEL (litri a bordo), TYRE_PRESS_xx (psi), TYRE_TAIR_xx (°C),
//   L/C/R_SURF_TEMP_xx (°C bordo gomma), BRAKE_TEMP_xx, SPEED, THROTTLE, BRAKE, GEAR, RPMS.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fourPsi } from './setup.mjs';
import { writeJsonAtomic } from './atomic.mjs';
import { sameTrack } from './tracknames.mjs';

const WHEELS = ['LF', 'RF', 'LR', 'RR'];
const HERE = dirname(fileURLToPath(import.meta.url));
export const PRESSURE_LOG_FILE = join(HERE, '..', 'data', 'motec-pressure-log.json');

const r1 = (v) => Math.round(v * 10) / 10;
export const KIND_IT = { race: 'gara', qualifying: 'qualifica', practice: 'prove libere' };
export const kindIt = (k) => KIND_IT[String(k ?? '').toLowerCase()] ?? 'sessione libera';
// normTrack/sameTrack arrivano da tracknames.mjs: UNA sola implementazione del
// matching piste, condivisa con tracks.mjs/results.mjs/testday.mjs (vedi lì la storia)

function parseLd(buf) {
  if (buf.length < 20000) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const t0 = dv.getUint32(8, true), t1 = dv.getUint32(12, true);
  if (!t0 || !t1 || t1 <= t0 || (t1 - t0) % 124 !== 0) return null;
  const n = Math.floor((t1 - t0) / 124);
  if (n < 5 || n > 500) return null;
  const channels = new Map();
  let duration = null;
  for (let k = 0; k < n; k++) {
    const R = t0 + k * 124;
    const off = dv.getUint32(R + 8, true);
    const cnt = dv.getUint32(R + 12, true);
    const rate = (dv.getUint32(R + 20, true) >> 16) & 0xFFFF;
    const name = buf.slice(R + 32, R + 56).toString('latin1').replace(/\0.*$/, '').trim();
    const unit = buf.slice(R + 72, R + 80).toString('latin1').replace(/\0.*$/, '').trim();
    if (!name || !off || !cnt || !rate || off + cnt * 4 > buf.length) continue;
    if (duration == null) duration = cnt / rate;
    channels.set(name, { off, cnt, rate, unit });
  }
  if (!channels.has('FUEL') || !duration) return null;
  return { dv, channels, duration };
}

function parseLdx(file) {
  // Marker Time in microsecondi → secondi
  try {
    const xml = readFileSync(file, 'latin1');
    const times = [...xml.matchAll(/ClassName="BCN"[^>]*Time="([\d.eE+]+)"/g)].map((m) => parseFloat(m[1]) / 1e6);
    return times.filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  } catch { return []; }
}

/** Legge un canale campione per indice. */
function sampler(ld, name) {
  const c = ld.channels.get(name);
  if (!c) return null;
  return (i) => ld.dv.getFloat32(c.off + Math.max(0, Math.min(c.cnt - 1, i)) * 4, true);
}

/** Indice del campione di un canale al tempo t (secondi dall'inizio sessione). */
function idxAt(c, t) {
  return Math.max(0, Math.min(c.cnt - 1, Math.round(t * c.rate)));
}

/**
 * Analizza una sessione MoTeC (.ld + .ldx): per ogni giro, benzina usata,
 * pressioni a fine giro (la lettura a caldo per la regola dei 4 PSI),
 * temperature gomma (aria e bordo) e freni.
 *
 * Con CACHE in RAM (stesso pattern di _sessCache in tracks.mjs): il risultato è
 * calcolato UNA volta per versione del file (chiave file+mtime+size) e riusato
 * a ogni /api/card, garage/sessions e azione motec. I .ld possono pesare decine
 * di MB: senza cache ogni cruscotto rileggeva e riparseggiava gli stessi file.
 * La chiave include mtime e size: se EVO riscrive/aggiunge file la voce riparte
 * pulita; il processo resta l'unico proprietario (nessuna scrittura su disco).
 */
const _ldCache = new Map(); // path → { mtimeMs, size, val }
const _ldStats = { hits: 0, misses: 0 };
const CACHE_MAX_FILES = 64; // bordo superiore: poche sessioni, memoria irrisoria

export function motecCacheStats() {
  return { ..._ldStats, entries: _ldCache.size };
}

/** Svuota la cache del parsing (usato dai test; in produzione non serve: il mtime decide). */
export function motecCacheClear() {
  _ldCache.clear();
  _ldStats.hits = 0; _ldStats.misses = 0;
}

export function analyzeLd(ldFile) {
  let mtimeMs = 0, size = 0;
  try { const st = statSync(ldFile); mtimeMs = Math.round(st.mtimeMs); size = st.size; } catch { return analyzeLdUncached(ldFile); }
  const hit = _ldCache.get(ldFile);
  if (hit && hit.mtimeMs === mtimeMs && hit.size === size) {
    _ldStats.hits++;
    return hit.val;
  }
  _ldStats.misses++;
  const val = analyzeLdUncached(ldFile);
  _ldCache.set(ldFile, { mtimeMs, size, val });
  if (_ldCache.size > CACHE_MAX_FILES) {
    // scarta le voci più vecchie per mtime del file (le sessioni recenti sono le più richieste)
    for (const k of [..._ldCache.keys()].slice(0, _ldCache.size - CACHE_MAX_FILES)) _ldCache.delete(k);
  }
  return val;
}

/** Il vero parsing, senza cache: usato solo dalla prima analyzeLd per versione di file. */
function analyzeLdUncached(ldFile) {
  let ld;
  try { ld = parseLd(readFileSync(ldFile)); } catch { return null; }
  if (!ld) return null;
  const ldxFile = ldFile.replace(/\.ld$/i, '.ldx');
  const beacons = parseLdx(ldxFile);

  const F = ld.channels.get('FUEL');
  const bounds = [];
  if (beacons.length >= 2) {
    for (let g = 0; g < beacons.length; g++) {
      bounds.push([beacons[g], g + 1 < beacons.length ? beacons[g + 1] : ld.duration]);
    }
  } else {
    // senza beacon: sessione intera come "giro unico" (dati aggregati comunque utili)
    bounds.push([0, ld.duration]);
  }

  const at = (name, t) => { const c = ld.channels.get(name); return c ? ld.dv.getFloat32(c.off + idxAt(c, t) * 4, true) : null; };
  const maxIn = (name, a, b) => {
    const c = ld.channels.get(name); if (!c) return null;
    let m = -Infinity; const i0 = idxAt(c, a), i1 = idxAt(c, b);
    for (let i = i0; i <= i1; i++) { const v = ld.dv.getFloat32(c.off + i * 4, true); if (v > m) m = v; }
    return Number.isFinite(m) ? m : null;
  };

  const laps = bounds.map(([a, b], gi) => {
    const fuelStart = at('FUEL', a), fuelEnd = at('FUEL', Math.max(a + 1, b - 0.2));
    const pressures = {}, tair = {}, surf = {}, brakes = {};
    for (const w of WHEELS) {
      pressures[w] = at('TYRE_PRESS_' + w, b - 0.5);
      tair[w] = at('TYRE_TAIR_' + w, b - 0.5);
      surf[w] = ['L_SURF_TEMP_' + w, 'C_SURF_TEMP_' + w, 'R_SURF_TEMP_' + w].map((n) => maxIn(n, a, b));
      brakes[w] = maxIn('BRAKE_TEMP_' + w, a, b);
    }
    return {
      lap: gi + 1,
      startSec: Math.round(a * 10) / 10,
      endSec: Math.round(b * 10) / 10,
      durationSec: Math.round((b - a) * 10) / 10,
      fuelStart: fuelStart != null ? Math.round(fuelStart * 100) / 100 : null,
      fuelEnd: fuelEnd != null ? Math.round(fuelEnd * 100) / 100 : null,
      fuelUsed: (fuelStart != null && fuelEnd != null) ? Math.round((fuelStart - fuelEnd) * 100) / 100 : null,
      pressures, tair, surf, brakes,
    };
  });

  // pressione a freddo = la più bassa registrata nelle prime battute
  const coldPressures = {};
  for (const w of WHEELS) {
    const c = ld.channels.get('TYRE_PRESS_' + w); if (!c) continue;
    let m = Infinity;
    for (let i = 0; i < Math.min(c.cnt, idxAt(c, Math.min(ld.duration, 60))); i++) {
      const v = ld.dv.getFloat32(c.off + i * 4, true);
      if (v > 0 && v < m) m = v;
    }
    coldPressures[w] = Number.isFinite(m) ? Math.round(m * 100) / 100 : null;
  }

  const air = at('AIR_TEMP', ld.duration / 2), road = at('ROAD_TEMP', ld.duration / 2);
  const valid = laps.filter((l) => l.durationSec > 15);
  const fuelPerLap = valid.map((l) => l.fuelUsed).filter((v) => v != null && v > 0 && v < 10);
  const lastPressures = valid.length ? valid[valid.length - 1].pressures : null;

  // assetto in pratica: escursione sospensioni, ingaggio bumpstop e delta termico L/C/R
  const sus = {}, bump = {};
  for (const w of WHEELS) {
    sus[w] = statsOf(ld, 'SUS_TRAVEL_' + w);
    bump[w] = bumpOf(ld, 'BUMPSTOPUP_TRAVEL_' + w);
  }
  const camberProxy = camberProxyOf(ld, valid);
  const bestLapSec = valid.length ? r1(Math.min(...valid.map((l) => l.durationSec))) : null;

  return {
    file: basename(ldFile),
    durationSec: Math.round(ld.duration),
    laps,
    validLaps: valid.length,
    fuelPerLap: fuelPerLap.length ? Math.round((fuelPerLap.reduce((a, b) => a + b, 0) / fuelPerLap.length) * 100) / 100 : null,
    coldPressures,
    lastPressures,
    airTemp: air != null ? Math.round(air * 10) / 10 : null,
    roadTemp: road != null ? Math.round(road * 10) / 10 : null,
    beaconsFromLdx: beacons.length,
    sus, bump, camberProxy, bestLapSec,
  };
}

/** Statistiche (min/max/media) di un canale sull'intera sessione. */
function statsOf(ld, name) {
  const c = ld.channels.get(name); if (!c) return null;
  let mn = Infinity, mx = -Infinity, sum = 0, n = 0;
  for (let i = 0; i < c.cnt; i++) {
    const v = ld.dv.getFloat32(c.off + i * 4, true);
    if (!Number.isFinite(v)) continue;
    if (v < mn) mn = v; if (v > mx) mx = v; sum += v; n++;
  }
  return n ? { min: r1(mn), max: r1(mx), mean: r1(sum / n) } : null;
}

/** Quanta strada fa il bumpstop: % di campioni oltre 1 mm e picco. */
function bumpOf(ld, name) {
  const c = ld.channels.get(name); if (!c) return null;
  let contact = 0, n = 0, mx = -Infinity;
  for (let i = 0; i < c.cnt; i++) {
    const v = ld.dv.getFloat32(c.off + i * 4, true);
    if (!Number.isFinite(v)) continue;
    n++; if (v > mx) mx = v; if (v > 1) contact++;
  }
  return n ? { contactPct: Math.round((1000 * contact) / n) / 10, maxMm: r1(mx) } : null;
}

/**
 * Proxy camber: per ogni ruota, la differenza media tra bordo interno ed esterno
 * della gomma (L−R sulle temperature di superficie) per giro, poi mediata.
 * Non è il camber impostato: è il suo EFFETTO termico in pista.
 */
function camberProxyOf(ld, laps) {
  const out = {};
  for (const w of WHEELS) {
    const cs = ['L_SURF_TEMP_' + w, 'C_SURF_TEMP_' + w, 'R_SURF_TEMP_' + w].map((n) => ld.channels.get(n) ?? null);
    if (cs.some((c) => !c)) continue;
    let dSum = 0, dN = 0;
    for (const l of laps) {
      const means = cs.map((c) => {
        const a = idxAt(c, l.startSec), b = idxAt(c, l.endSec);
        let s = 0, n = 0;
        for (let i = a; i <= b; i += 4) { s += ld.dv.getFloat32(c.off + i * 4, true); n++; }
        return n ? s / n : null;
      });
      if (means.some((m) => m == null)) continue;
      dSum += means[0] - means[2]; dN++;
    }
    out[w] = dN ? r1(dSum / dN) : null;
  }
  return out;
}

/** Sessioni MoTeC salvate (auto/circuito facoltativi), la più recente prima. */
export function listMotecSessions(motecRoot, { car = null, track = null } = {}) {
  const out = [];
  let carDirs = [];
  try { carDirs = readdirSync(motecRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const cd of carDirs) {
    if (car && cd.toLowerCase() !== String(car).toLowerCase()) continue;
    let trackDirs = [];
    try { trackDirs = readdirSync(join(motecRoot, cd), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    for (const td of trackDirs) {
      // sameTrack: "Fuji Speedway" deve combaciare con la cartella "Fuji Speedway GP"
      // (nomi carta vs nome cartella MoTeC, che spesso include il layout)
      if (track && !sameTrack(td, track)) continue;
      const tdir = join(motecRoot, cd, td);
      let files = [];
      try { files = readdirSync(tdir).filter((f) => f.toLowerCase().endsWith('.ld')); } catch { continue; }
      for (const f of files) {
        const full = join(tdir, f);
        let mtime = 0, size = 0;
        try { const st = statSync(full); mtime = st.mtimeMs; size = st.size; } catch { continue; }
        out.push({ file: full, name: f, car: cd, track: td, mtime, size });
      }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

/** preset_<nome> dal nome file (il setup usato in sessione). */
export function presetOf(fileName) {
  const m = String(fileName ?? '').match(/preset_([a-z0-9_]+?)_[^_]*_[^_]*_\w{3} /i);
  return m ? m[1] : (String(fileName ?? '').match(/preset_([a-z0-9_]+)/i)?.[1] ?? null);
}

/** Data/ora di inizio sessione dal nome file MoTeC ("... Sat Sep 26 200627 2026.ld"). */
export function sessionMetaOf(fileName) {
  const name = String(fileName ?? '');
  const m = name.match(/\b(\w{3}) (\d{1,2}) (\d{2})(\d{2})(\d{2}) (\d{4})\.ld$/i);
  let startAt = null;
  if (m) {
    const d = new Date(`${m[1]} ${m[2]} ${m[6]} ${m[3]}:${m[4]}:${m[5]}`);
    if (!Number.isNaN(d.getTime())) startAt = d;
  }
  return { startAt, startMs: startAt ? startAt.getTime() : null, preset: presetOf(name) };
}

/**
 * Trova il file Results scritto da EVO alla fine della sessione telemetrica
 * (mtime combacia entro la finestra) per sapere se era prove/qualifica/gara.
 */
export function readResultMeta(resultsDir, { endMs, track = null, windowMs = 120000 } = {}) {
  if (!endMs) return null;
  let files = [];
  try { files = readdirSync(resultsDir).filter((f) => f.endsWith('.json')); } catch { return null; }
  let best = null, bestFile = null, bestD = Infinity;
  for (const f of files) {
    const full = join(resultsDir, f);
    let mtime = 0, j = null;
    try { mtime = statSync(full).mtimeMs; j = JSON.parse(readFileSync(full, 'utf8')); } catch { continue; }
    const d = Math.abs(mtime - endMs);
    if (!sameTrack(track, j.track)) continue;
    if (d <= windowMs && d < bestD) { bestD = d; best = j; bestFile = f; }
  }
  if (!best) return null;
  return {
    kind: String(best.session ?? '').toLowerCase() || null,
    weather: String(best.weather_type ?? '').replace(/^.*WeatherType_/, '') || null,
    hour: best.hour ?? null, min: best.min ?? null,
    file: bestFile, track: best.track, layout: best.layout,
  };
}

/**
 * Storico sessioni di un'auto (ultime prima): ogni voce con tipo sessione
 * (incrociato con i file Results), giri, benzina, pressioni, assetto in pratica.
 */
export function collectSessions(motecRoot, resultsDir, { car = null, track = null, limit = 10 } = {}) {
  const list = listMotecSessions(motecRoot, { car, track });
  const out = [];
  for (const s of list) {
    if (out.length >= limit) break;
    const a = analyzeLd(s.file);
    if (!a) continue;
    const meta = sessionMetaOf(s.name);
    const res = readResultMeta(resultsDir, { endMs: s.mtime, track: s.track });
    out.push({
      file: s.name, car: s.car, track: s.track, mtimeMs: Math.round(s.mtime),
      when: new Date(s.mtime).toISOString(), whenLocal: new Date(s.mtime).toLocaleString('it-IT'), startAt: meta.startAt ? meta.startAt.toISOString() : null,
      kind: res?.kind ?? null, kindLabel: kindIt(res?.kind), weather: res?.weather ?? null,
      hour: res?.hour ?? null, min: res?.min ?? null,
      preset: meta.preset, durationSec: a.durationSec, validLaps: a.validLaps,
      fuelPerLap: a.fuelPerLap, bestLapSec: a.bestLapSec,
      coldPressures: a.coldPressures, hotPressures: a.lastPressures,
      sus: a.sus, bump: a.bump, camberProxy: a.camberProxy,
      airTemp: a.airTemp, roadTemp: a.roadTemp,
      laps: a.laps,
    });
  }
  return out;
}

/**
 * Diagnostica telemetria: per ogni auto, gli ultimi file .ld con dimensione,
 * validità (canali con dati > 0) e numero di beacon reali nel .ldx.
 * Legge solo l'header dei file: veloce anche con file da 10+ MB.
 * Serve a vedere al volo il bug EVO che scrive file .ld vuoti (solo intestazione).
 */
export function telemDiagnostics(motecRoot, { perCar = 6 } = {}) {
  const out = [];
  let carDirs = [];
  try { carDirs = readdirSync(motecRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const car of carDirs) {
    const all = listMotecSessions(motecRoot, { car });
    if (!all.length) continue;
    const files = [];
    for (const s of all.slice(0, perCar)) {
      // validità dall'header: tabella canali leggibile + almeno un canale con dati
      let valid = false, channels = 0, withData = 0;
      try {
        const fd = openSync(s.file, 'r');
        const head = Buffer.alloc(Math.min(s.size ?? 65536, 65536));
        readSync(fd, head, 0, head.length, 0);
        closeSync(fd);
        const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
        const t0 = dv.getUint32(8, true);
        const t1 = Math.min(dv.getUint32(12, true), head.length);
        if (t1 > t0 && (t1 - t0) % 124 === 0) {
          const n = Math.min(Math.floor((t1 - t0) / 124), 500);
          for (let k = 0; k < n; k++) {
            const R = t0 + k * 124;
            channels++;
            if (dv.getUint32(R + 12, true) > 0) withData++;
          }
        }
        valid = withData > 0;
      } catch { valid = false; }
      files.push({
        name: s.name, track: s.track, size: s.size,
        when: new Date(s.mtime).toISOString(), whenLocal: new Date(s.mtime).toLocaleString('it-IT'),
        valid, channels, withData,
      });
    }
    const okAll = all.filter((s) => (s.size ?? 0) > 65536).length; // stima rapida su tutti i file dell'auto
    out.push({ car, total: all.length, okEstimate: okAll, files });
  }
  out.sort((a, b) => (b.files[0]?.when ?? '').localeCompare(a.files[0]?.when ?? ''));
  return out;
}

/**
 * Suggerimento di pressione di partenza dai dati veri: cerca tra le uscite
 * (preferendo quelle con salto termico nella finestra sana 3–5 PSI) la sessione
 * col miglior giro, e proietta la sua partenza sul target della classe.
 */
export function pressureAdvice(sessions, { target } = {}) {
  const rows = [];
  for (const s of sessions) {
    const cold = s.coldPressures?.LF ?? s.coldPressures?.RR ?? null;
    const hotLaps = (s.laps ?? []).filter((l) => l.durationSec > 15 && l.pressures?.LF != null).map((l) => l.pressures.LF);
    if (cold == null || !hotLaps.length) continue;
    const hot = r1(hotLaps.slice(-2).reduce((a, b) => a + b, 0) / Math.min(2, hotLaps.length));
    rows.push({ cold: r1(cold), hot, rise: r1(hot - r1(cold)), kind: s.kind, kindLabel: s.kindLabel ?? kindIt(s.kind), when: s.when, bestLapSec: s.bestLapSec, preset: s.preset ?? null, validLaps: s.validLaps });
  }
  if (!rows.length) return { ok: false, advice: 'Nessuna sessione con pressioni leggibili: fai almeno un giro veloce.', considered: 0 };
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return { ok: false, advice: 'Target di pressione non noto per questa auto.', considered: rows.length };

  const mature = rows.filter((r) => r.rise >= 2.5 && r.rise <= 5.5);
  const pool = mature.length ? mature : rows;
  const base = pool.slice().sort((a, b) => (a.bestLapSec ?? 1e9) - (b.bestLapSec ?? 1e9))[0];
  const calc = fourPsi({ cold: base.cold, hot: base.hot, target: t });
  // pressioni medie a caldo per tipo di sessione (qualifica di solito viaggia più calda di una gara lunga)
  const byKind = {};
  for (const r of rows) {
    const k = r.kind ?? 'altro';
    (byKind[k] ??= { label: r.kindLabel, n: 0, hotSum: 0 });
    byKind[k].n++; byKind[k].hotSum += r.hot;
  }
  for (const k of Object.keys(byKind)) byKind[k].hotAvg = r1(byKind[k].hotSum / byKind[k].n);

  const lines = [];
  if (mature.length >= 2) {
    lines.push(`Su ${mature.length} uscite con salto termico sano la migliore (${kindIt(base.kind)}) è partita da ${r1(base.cold)} PSI e ha viaggiato a ${r1(base.hot)} a caldo.`);
  } else if (mature.length === 1) {
    lines.push(`Una sola uscita con salto termico sano (${kindIt(base.kind)}, ${r1(base.cold)}→${r1(base.hot)} PSI): consiglio provvisorio, conferma alla prossima sessione.`);
  } else {
    lines.push(`Nessuna uscita con salto termico nella finestra 3–5 PSI: per ora proietto la migliore sessione disponibile sul target.`);
  }
  if (calc.ok) lines.push(calc.advice);

  return {
    ok: true,
    suggestedStartPsi: calc.ok ? calc.newCold : null,
    range: calc.ok ? [r1(calc.newCold - 0.5), r1(calc.newCold + 0.5)] : null,
    target: t,
    basis: { kind: base.kind, kindLabel: kindIt(base.kind), when: base.when, startPsi: r1(base.cold), hotPsi: r1(base.hot), rise: base.rise, bestLapSec: base.bestLapSec, preset: base.preset },
    considered: rows.length, matureCount: mature.length, byKind,
    advice: lines.join(' '),
  };
}

/**
 * Consiglio pressioni specifico per la GARA: le uscite brevi (qualifica, giri singoli)
 * viaggiano più fredde di uno stint lungo — la pressione sale con la temperatura
 * che arriva dopo 5-6 giri. Qui si stima il "saldo di stint" (quanto sale ancora
 * la gomma tra il giro 3 e la fine dello stint) e si sottrae dalla proiezione.
 */
export function racePressureAdvice(sessions, { target, raceLaps = null } = {}) {
  const base = pressureAdvice(sessions, { target });
  if (!base.ok) return base;
  // uscite lunghe (= tipo gara): quelle con molti giri validi
  const long = sessions.filter((s) => (s.validLaps ?? 0) >= 5 && (s.hotPressures?.LF != null || s.hotPressures?.RR != null));
  const rows = [];
  for (const s of sessions) {
    const cold = s.coldPressures?.LF ?? s.coldPressures?.RR ?? null;
    if (cold == null || !s.laps?.length) continue;
    // pressione del primo tratto vs dell'ultimo tratto: il drift termico dello stint
    const ps = s.laps.filter((l) => l.durationSec > 15 && l.pressures?.LF != null).map((l) => l.pressures.LF);
    if (ps.length < 4) continue;
    const early = ps.slice(0, Math.max(1, Math.floor(ps.length / 3))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(ps.length / 3));
    const late = ps.slice(-Math.max(1, Math.floor(ps.length / 3))).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(ps.length / 3));
    rows.push({ when: s.when, kind: s.kind, kindLabel: s.kindLabel ?? kindIt(s.kind), laps: ps.length, early: r1(early), late: r1(late), drift: r1(late - early), cold: r1(cold) });
  }
  const lines = [];
  let psiAdj = 0;
  if (rows.length) {
    const avgDrift = rows.reduce((a, r) => a + r.drift, 0) / rows.length;
    const longest = rows.slice().sort((a, b) => b.laps - a.laps)[0];
    lines.push(`Drift termico medio misurato: ${avgDrift > 0 ? '+' : ''}${r1(avgDrift)} PSI tra l'inizio e la fine delle uscite (la più lunga: ${longest.laps} giri, ${longest.early}→${longest.late}).`);
    // in gara lo stint è più lungo delle uscite viste: se il drift era ancora in corso
    // (la pressione saliva alla fine) serve una piccola correzione extra in contropartita
    const stintLaps = raceLaps || longest.laps + 2;
    const driftPerLap = avgDrift / Math.max(1, longest.laps);
    const extra = Math.max(0, (stintLaps - longest.laps)) * driftPerLap;
    psiAdj = Math.round(Math.min(1.5, extra / 2) * 10) / 10;
    if (psiAdj > 0) lines.push(`Stint gara stimato ${stintLaps} giri: aggiungo ${psiAdj} PSI alla partenza per compensare il drift che ancora deve venire.`);
  } else {
    lines.push('Usate uscite brevi (qualifica/prove): in gara la gomma sale ancora di 0.5–1 PSI dopo il 5° giro — considera mezzo giro in più di bring-in.');
  }
  const start = base.suggestedStartPsi != null ? r1(base.suggestedStartPsi + psiAdj) : null;
  const short = base.suggestedStartPsi != null ? r1(base.suggestedStartPsi - 0.2) : null;
  return {
    ...base,
    raceStartPsi: start,
    raceRange: start ? [r1(start - 0.4), r1(start + 0.4)] : null,
    qualiStartPsi: short,
    raceAdvice: lines.join(' '),
    driftRows: rows.slice(0, 5),
  };
}

/** Registro persistente dei consigli dati (data/motec-pressure-log.json). */
export function logPressureAdvice(entry) {
  let log = { entries: [] };
  try { const j = JSON.parse(readFileSync(PRESSURE_LOG_FILE, 'utf8')); if (Array.isArray(j.entries)) log = j; } catch { /* primo avvio */ }
  log.entries.unshift({ at: new Date().toISOString(), ...entry });
  log.entries = log.entries.slice(0, 100);
  mkdirSync(dirname(PRESSURE_LOG_FILE), { recursive: true });
  writeJsonAtomic(PRESSURE_LOG_FILE, log); // atomico
  return log.entries.length;
}

export function readPressureLog(n = 5) {
  try { const j = JSON.parse(readFileSync(PRESSURE_LOG_FILE, 'utf8')); return (j.entries ?? []).slice(0, n); } catch { return []; }
}
