// coverage.mjs — LA COPERTURA DEI DATI (6/11).
//
// Perché esiste: la suite vale quanto i dati veri che ha dentro. Finora i
// numeri erano sparsi (Statistiche contava le gare, i giri liberi avevano il
// loro riepilogo, MoTeC il suo pannello) e non c'era un posto che dicesse
// «questo è quello che ho importato, e questo è quello che mi manca».
//
// Qui si contano SOLO cose presenti sul disco: nessuna stima, nessun punteggio
// inventato. I chilometri sono l'unica voce derivata — giri × lunghezza
// ufficiale del catalogo (`TRACK_INFO`) — e quando la pista non è in catalogo
// il giro resta contato ma NON diventa chilometri: `kmKnown` diventa false e
// la GUI lo dice, invece di gonfiare il totale.
//
// Il rapporto è PER PISTA (6/11, secondo giro): ogni riga porta con sé quello
// che serve per decidere se c'è lavoro da fare — telemetria (.ld), sessioni con
// un giro cronometrato, sessioni con i settori, miglior giro e ultimo dato — e
// le piste del catalogo mai corse entrano come righe a zero, con `never: true`,
// così i buchi si vedono invece di restare in una nota.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TRACK_INFO } from './tracks.mjs';
import { normTrack } from './tracknames.mjs';
import { HOTLAPS_FILE } from './hotlaps.mjs';
import { rivalsStore } from './rivals.mjs';
import { findPlayerDriver } from './results.mjs';
import { splitDaTelemetria } from './motec.mjs';

const CATALOG = Object.entries(TRACK_INFO)
  .map(([id, t]) => ({ id, name: t?.name ?? id, lengthKm: Number(t?.lengthKm) || null }))
  .filter((c) => c.lengthKm);

/** La pista del catalogo che corrisponde al nome scritto dal gioco, o null. */
export function catalogTrackOf(trackName) {
  const n = normTrack(trackName);
  if (!n) return null;
  let best = null, bestLen = 0;
  for (const c of CATALOG) {
    for (const alias of [c.name, c.id]) {
      const k = normTrack(alias);
      if (!k) continue;
      if ((n === k || n.startsWith(k) || k.startsWith(n)) && k.length > bestLen) {
        best = c;
        bestLen = k.length;
      }
    }
  }
  return best;
}

/** Lunghezza ufficiale (km) di una pista scritta come la scrive il gioco, o null. */
export function catalogLengthKm(trackName) {
  return catalogTrackOf(trackName)?.lengthKm ?? null;
}

/** "01:49.881" → 109881 ms; qualunque altra forma → null (niente numeri a caso). */
function lapTextMs(text) {
  const m = /^(\d+):(\d{2})\.(\d{1,3})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3].padEnd(3, '0'));
}

/**
 * Il rapporto di copertura, puro: prende i dati già letti e conta.
 * `results` è `state.results` (serie → gare importate), `freeSessions` le voci
 * di `data/hotlaps.json`, `rivals` e `telemetry` i due riepiloghi esterni.
 */
export function coverageReport({ results = {}, freeSessions = [], resultSectors = [], rivals = null, telemetry = null } = {}) {
  const byTrack = new Map();
  const cars = new Set();
  const types = new Map();
  let sessions = 0, races = 0, free = 0, laps = 0, km = 0, kmKnown = true, noTime = 0, lastAt = null;

  const bumpTrack = (name, lengthKm) => {
    /* Chiave = nome del catalogo quando la pista si riconosce: così "monza"
       (id del risultato) e "Monza GP" (nome del gioco) sono la STESSA riga,
       com'erano già per il matching. */
    const known = catalogTrackOf(name);
    const key = known?.name ?? (normTrack(name) || '?');
    let e = byTrack.get(key);
    if (!e) {
      e = {
        name: known?.name ?? name, lengthKm, sessions: 0, laps: 0,
        timed: 0, sectors: 0, bestLapMs: null, lastAt: null,
        telemetry: { files: 0, bytes: 0 }, never: false,
      };
      byTrack.set(key, e);
    } else if (e.lengthKm == null) {
      e.lengthKm = lengthKm;
    }
    return e;
  };
  const bumpType = (type, n) => {
    const t = types.get(type) ?? { type, sessions: 0, laps: 0 };
    t.sessions += 1;
    t.laps += n;
    types.set(type, t);
  };
  const noteAt = (at) => {
    if (!at) return null;
    if (!lastAt || String(at) > lastAt) lastAt = String(at);
    return String(at);
  };
  const noteLap = (e, ms, at) => {
    if (!ms) return;
    e.timed += 1;
    if (!e.bestLapMs || ms < e.bestLapMs) e.bestLapMs = ms;
    if (at && (!e.lastAt || String(at) > e.lastAt)) e.lastAt = String(at);
  };

  for (const arr of Object.values(results ?? {})) {
    for (const r of Array.isArray(arr) ? arr : []) {
      const name = r.trackPretty ?? r.track ?? '?';
      const len = catalogLengthKm(r.track ?? name);
      const n = Math.max(0, Number(r.laps) || 0);
      sessions += 1;
      races += 1;
      laps += n;
      if (len) km += n * len;
      else if (n) kmKnown = false;
      const e = bumpTrack(name, len);
      e.sessions += 1;
      e.laps += n;
      noteLap(e, lapTextMs(r.bestLap), r.at);
      if (r.car) cars.add(normTrack(r.car) || r.car);
      bumpType('Race', n);
      noteAt(r.at);
    }
  }

  for (const s of Array.isArray(freeSessions) ? freeSessions : []) {
    const name = s.trackPretty ?? s.track ?? '?';
    const len = catalogLengthKm(s.track ?? name);
    const n = Math.max(0, Number(s.lapsCount) || 0);
    sessions += 1;
    free += 1;
    laps += n;
    if (len) km += n * len;
    else if (n) kmKnown = false;
    if (!s.bestLapMs) noTime += 1;
    const e = bumpTrack(name, len);
    e.sessions += 1;
    e.laps += n;
    noteLap(e, Number(s.bestLapMs) || null, s.at);
    if (Array.isArray(s.sectors) && s.sectors.length) e.sectors += 1;
    const car = s.carPretty ?? s.car;
    if (car) cars.add(normTrack(car) || car);
    bumpType(String(s.session ?? 'Session'), n);
    noteAt(s.at);
  }

  /* I SETTORI DEI FILE RISULTATO (6/11): i `.ld` non hanno settori — solo
     LAP_BEACON — quindi non si possono ricavare dalla telemetria senza
     inventare dei confini. I file `sessionresults.json` però portano gli
     `splits` VERI (i tre settori del miglior giro) del giocatore: qui si
     contano, e se una pista non aveva un tempo di riferimento lo si prende
     dalla somma degli splits invece di lasciarla senza. */
  for (const r of Array.isArray(resultSectors) ? resultSectors : []) {
    const e = bumpTrack(r.track, catalogLengthKm(r.track));
    e.sectors += 1;
    const somma = (r.splitsMs ?? []).reduce((a, v) => a + (Number(v) || 0), 0);
    if (somma > 0 && (!e.bestLapMs || somma < e.bestLapMs)) e.bestLapMs = somma;
  }

  /* Le telemetrie per pista: contate e unite come le piste dei risultati. */
  for (const t of telemetry?.tracks ?? []) {
    const e = bumpTrack(t.name, catalogLengthKm(t.name));
    e.telemetry.files += Number(t.files) || 0;
    e.telemetry.bytes += Number(t.bytes) || 0;
  }

  const driven = byTrack.size;
  /* Le piste del catalogo mai corse: righe a zero, dichiarate (`never`). */
  for (const c of CATALOG) {
    if (!byTrack.has(c.name)) {
      byTrack.set(c.name, {
        name: c.name, lengthKm: c.lengthKm, sessions: 0, laps: 0,
        timed: 0, sectors: 0, bestLapMs: null, lastAt: null,
        telemetry: { files: 0, bytes: 0 }, never: true,
      });
    }
  }

  const byTrackRows = [...byTrack.values()]
    .map((e) => ({ ...e, km: e.lengthKm ? Math.round(e.laps * e.lengthKm * 10) / 10 : null }))
    .sort((a, b) => {
      if (a.never !== b.never) return a.never ? 1 : -1;
      return b.laps - a.laps || a.name.localeCompare(b.name);
    });

  const tel = telemetry && Number.isFinite(Number(telemetry.files))
    ? { files: Number(telemetry.files), bytes: Number(telemetry.bytes) || 0, cars: Number(telemetry.cars) || 0 }
    : null;
  const riv = rivals
    ? { drivers: Number(rivals.drivers) || 0, races: Number(rivals.races) || 0 }
    : null;

  return {
    totals: {
      sessions, races, free, laps,
      km: Math.round(km), kmKnown,
      tracks: driven,
      cars: cars.size,
    },
    byTrack: byTrackRows,
    bySessionType: [...types.values()].sort((a, b) => b.sessions - a.sessions),
    telemetry: tel,
    rivals: riv,
    neverDriven: byTrackRows.filter((r) => r.never).map((r) => ({ name: r.name, lengthKm: r.lengthKm })),
    noTime,
    lastAt,
  };
}

/** I file .ld sotto MoTeC\<auto>\<pista>\: totale, per pista e auto distinte. */
export function scanTelemetry(paths) {
  let files = 0, bytes = 0;
  const cars = new Set();
  const tracks = new Map();
  for (const dir of paths?.dataDirs ?? []) {
    const root = join(dir, 'MoTec');
    let carDirs = [];
    try {
      carDirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue; // PC senza MoTeC: zero, non un errore
    }
    for (const car of carDirs) {
      let trackDirs = [];
      try {
        trackDirs = readdirSync(join(root, car), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      } catch {
        continue;
      }
      let seen = false;
      for (const track of trackDirs) {
        let names = [];
        try {
          names = readdirSync(join(root, car, track)).filter((f) => f.toLowerCase().endsWith('.ld'));
        } catch {
          continue;
        }
        if (!names.length) continue;
        const key = catalogTrackOf(track)?.name ?? track;
        const e = tracks.get(key) ?? { name: key, files: 0, bytes: 0, latest: null };
        for (const f of names) {
          const full = join(root, car, track, f);
          let size = 0, mtimeMs = 0;
          try {
            const st = statSync(full);
            size = st.size;
            mtimeMs = st.mtimeMs;
          } catch {
            /* file sparito mentre leggevamo: si conta comunque */
          }
          bytes += size;
          e.files += 1;
          e.bytes += size;
          files += 1;
          seen = true;
          if (!e.latest || mtimeMs > e.latest.mtimeMs) e.latest = { file: full, mtimeMs };
        }
        tracks.set(key, e);
      }
      if (seen) cars.add(normTrack(car) || car);
    }
  }
  return { files, bytes, cars: cars.size, tracks: [...tracks.values()] };
}

/**
 * I settori del GIOCATORE nei file risultato, per pista.
 * Una sessione conta se il suo pilota ha `splits` (i tre settori del miglior
 * giro): i file sono centinaia ma piccoli, e la scansione costa ~135 ms — la
 * si tiene in memoria per un minuto invece di rifarla a ogni apertura.
 */
let _sectorCache = { key: '', at: 0, rows: [] };
export function scanResultSectors(paths, driver, { ttlMs = 60000, now = Date.now() } = {}) {
  const dirs = paths?.resultsDirs ?? [];
  const key = `${dirs.join('|')}::${driver?.name ?? ''}`;
  if (_sectorCache.key === key && now - _sectorCache.at < ttlMs) return _sectorCache.rows;
  const rows = [];
  for (const dir of dirs) {
    let names = [];
    try {
      names = readdirSync(dir).filter((f) => f.endsWith('.sessionresults.json'));
    } catch {
      continue;
    }
    for (const file of names) {
      let r = null;
      try {
        r = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch {
        continue; // file mezzo scritto: si salta, non si inventa
      }
      const me = driver ? findPlayerDriver(r, driver)?.driver : null;
      const splits = Array.isArray(me?.splits) ? me.splits : [];
      const splitsMs = splits.map(lapTextMs).filter((v) => Number.isFinite(v) && v > 0);
      if (!splitsMs.length) continue;
      rows.push({ track: r.track ?? '?', file, session: r.session ?? null, splitsMs });
    }
  }
  _sectorCache = { key, at: now, rows };
  return rows;
}

/** Legge le fonti vive (salvataggio, quaderno giri, libro rivali, MoTeC) e produce il rapporto. */
export function collectCoverage({ paths = null, state = null } = {}) {
  let freeSessions = [];
  try {
    const book = JSON.parse(readFileSync(HOTLAPS_FILE, 'utf8'));
    freeSessions = Array.isArray(book?.sessions) ? book.sessions : [];
  } catch {
    freeSessions = []; // nessun quaderno: la copertura è solo quella delle gare
  }
  let rivals = null;
  try {
    const store = rivalsStore();
    rivals = { drivers: Object.keys(store?.rivals ?? {}).length, races: (store?.races ?? []).length };
  } catch {
    rivals = null;
  }
  /* Le uscite libere sono GIÀ nei file risultato: si escludono per nome file,
     altrimenti i loro settori verrebbero contati due volte. */
  const telemetry = scanTelemetry(paths);
  const giaContate = new Set(freeSessions.map((s) => s.file).filter(Boolean));
  let resultSectors = [];
  try {
    resultSectors = scanResultSectors(paths, state?.driver).filter((r) => !giaContate.has(r.file));
  } catch {
    resultSectors = [];
  }
  const report = coverageReport({
    results: state?.results ?? {},
    freeSessions,
    resultSectors,
    rivals,
    telemetry,
  });
  /* Per le piste che non hanno NESSUN settore ufficiale ma hanno telemetria,
     si misurano gli split a terzi di distanza dal `.ld` più recente. Restano
     un campo diverso (`sectorsCalc`): non sono i settori del gioco. */
  for (const row of report.byTrack) {
    if (row.never || row.sectors > 0) continue;
    const t = telemetry.tracks.find((x) => x.name === row.name);
    if (!t?.latest) continue;
    const calc = splitTelemetryCached(t.latest);
    if (!calc) continue;
    row.sectorsCalc = { parti: calc.parti, splitsMs: calc.splitsMs, lapMs: calc.lapMs, lap: calc.lap };
    if (!row.bestLapMs) row.bestLapMs = calc.lapMs;
    // la telemetria ha trovato i beacon di almeno un giro: quella sessione è
    // cronometrata anche se il file risultato non portava il tempo
    if (!row.timed) row.timed = 1;
  }
  return report;
}

/* I `.ld` pesano megabyte: il calcolo degli split si fa una volta per file
   (chiave file+mtime) e resta in memoria, così /api/coverage resta leggero. */
const _splitCache = new Map();
function splitTelemetryCached({ file, mtimeMs }) {
  const key = `${file}|${mtimeMs}`;
  if (_splitCache.has(key)) return _splitCache.get(key);
  let out = null;
  try {
    out = splitDaTelemetria(file);
  } catch {
    out = null;
  }
  if (_splitCache.size > 60) _splitCache.clear();
  _splitCache.set(key, out);
  return out;
}
