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
        name: known?.name ?? name, lengthKm, sessions: 0, laps: 0, maxSessionLaps: 0,
        timed: 0, sectors: 0, splitSessions: 0, bestLapMs: null, lastAt: null,
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
      if (n > e.maxSessionLaps) e.maxSessionLaps = n;
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
    if (n > e.maxSessionLaps) e.maxSessionLaps = n;
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
    e.splitSessions += 1;
    const nLap = Math.max(0, Number(r.laps) || 0);
    if (nLap > e.maxSessionLaps) e.maxSessionLaps = nLap;
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
        name: c.name, lengthKm: c.lengthKm, sessions: 0, laps: 0, maxSessionLaps: 0,
        timed: 0, sectors: 0, splitSessions: 0, bestLapMs: null, lastAt: null,
        telemetry: { files: 0, bytes: 0 }, never: true,
      });
    }
  }

  const byTrackRows = [...byTrack.values()]
    .map((e) => ({
      ...e,
      // una sessione con gli splits HA un giro cronometrato (gli splits sono i
      // settori del miglior giro): il conteggio non può restare a zero. Il max
      // evita di sommare due volte le gare già contate dal testo `bestLap`.
      timed: Math.max(e.timed, e.splitSessions ?? 0),
      km: e.lengthKm ? Math.round(e.laps * e.lengthKm * 10) / 10 : null,
    }))
    .sort((a, b) => {
      if (a.never !== b.never) return a.never ? 1 : -1;
      return b.laps - a.laps || a.name.localeCompare(b.name);
    })
    .map(({ splitSessions, ...r }) => r);

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

export const ANALYSIS_MIN_LAPS = 3;
export const ANALYSIS_MIN_TELEMETRY_FILES = 2;
/* SOGLIA PER SESSIONE (6/11, richiesta Mauro: «almeno 3 giri nella stessa
   sessione»): il totale per pista può mettere insieme tre giri sparsi su tre
   uscite da un giro ciascuna — una pista così risulta «coperta» ma non regge
   né il confronto del passo né la costanza settoriale. */
export const ANALYSIS_MIN_SESSION_LAPS = 3;

/**
 * LE PISTE DOVE I DATI NON BASTANO (6/11, per il Cruscotto).
 * Una pista è «pronta per l'analisi» quando ha almeno 3 giri complessivi,
 * almeno 2 file `.ld`, almeno un giro cronometrato e almeno 3 giri dentro UNA
 * sessione (senza quest'ultima, tre uscite da un giro facevano una pista
 * «coperta» pur senza un run su cui misurare passo o degrado). I settori
 * mancanti si segnalano a parte (senza settori l'analisi per tratti non si
 * fa, ma il resto sì). Niente punteggi: solo cosa manca, pista per pista.
 */
/** PESO di un buco per l'ORDINE di gravità (6/11): prima quello che toglie
 *  l'analisi vera (telemetria e giro cronometrato), poi i giri, infine i
 *  settori. Il difetto NUMERICO conta: 1 giro su 3 pesa più di 2 su 3, zero
 *  file .ld più di uno. Non è una pagella: è solo l'ordine con cui nominare
 *  le piste (avviso del Cruscotto e pannello leggono lo stesso numero). */
const PESO_BUCO = {
  'telemetria-insufficiente': 4,
  cronometrati: 4,
  'pochi-giri': 3,
  'giri-sessione': 3,
  settori: 1,
};
function gravitaBuco(r) {
  const pesi = r.mancano.reduce((s, m) => s + (PESO_BUCO[m] ?? 1), 0);
  const deficit = Math.max(0, ANALYSIS_MIN_TELEMETRY_FILES - r.telemetryFiles)
    + Math.max(0, ANALYSIS_MIN_LAPS - r.laps)
    + Math.max(0, ANALYSIS_MIN_SESSION_LAPS - r.maxSessionLaps);
  return pesi + deficit;
}

export function analysisGaps(report) {
  const righe = (report?.byTrack ?? []).map((r) => {
    const mancano = [];
    const nGiri = Number(r.laps) || 0;
    const nLd = Number(r.telemetry?.files) || 0;
    const nSess = Number(r.maxSessionLaps) || 0;
    if (r.never) return { name: r.name, never: true, laps: 0, maxSessionLaps: 0, telemetryFiles: 0, mancano: ['dati'] };
    if (nLd < ANALYSIS_MIN_TELEMETRY_FILES) mancano.push('telemetria-insufficiente');
    if (!(r.timed > 0)) mancano.push('cronometrati');
    if (nGiri < ANALYSIS_MIN_LAPS) mancano.push('pochi-giri');
    if (nSess < ANALYSIS_MIN_SESSION_LAPS) mancano.push('giri-sessione');
    if (!(r.sectors > 0) && !r.sectorsCalc) mancano.push('settori');
    const pronta = nLd >= ANALYSIS_MIN_TELEMETRY_FILES && nGiri >= ANALYSIS_MIN_LAPS
      && nSess >= ANALYSIS_MIN_SESSION_LAPS && r.timed > 0;
    return { name: r.name, never: false, laps: nGiri, maxSessionLaps: nSess, telemetryFiles: nLd, pronta, mancano };
  });
  const scoperte = righe.filter((x) => x.never);
  const incomplete = righe
    .filter((x) => !x.never && x.mancano.length)
    .map((x) => ({ ...x, gravita: gravitaBuco(x) }))
    .sort((a, b) => b.gravita - a.gravita || a.laps - b.laps || a.name.localeCompare(b.name));
  return {
    piste: righe.length,
    pronte: righe.filter((x) => !x.never && x.pronta).length,
    soglia: { giri: ANALYSIS_MIN_LAPS, giriSessione: ANALYSIS_MIN_SESSION_LAPS, fileTelemetria: ANALYSIS_MIN_TELEMETRY_FILES },
    incomplete,
    scoperte: scoperte.map((x) => x.name),
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
      // l'auto serve al confronto settore per settore: giri con auto diverse
      // sulla stessa pista non si paragonano (una MX-5 non fa i settori di una GT3).
      // `carLabel` è il nome com'è scritto nel risultato (col marchio già dentro
      // quando il gioco lo mette), `car` la chiave normalizzata del confronto.
      const carLabel = (me?.car_name && me?.car_brand && String(me.car_name).toLowerCase().startsWith(String(me.car_brand).toLowerCase())
        ? me.car_name
        : `${me?.car_brand ?? ''} ${me?.car_name ?? ''}`).replace(/\s+/g, ' ').trim();
      rows.push({
        track: r.track ?? '?', file, session: r.session ?? null, splitsMs, car: carLabel.toLowerCase(), carLabel: carLabel || null,
        // i giri della sessione: servono alla soglia «3 giri nella STESSA sessione»
        // (un totale per pista può metterne insieme tre sparsi e sembrare pronto)
        laps: Math.max(0, Number(me?.laps) || 0),
        lapMs: splitsMs.reduce((a, b) => a + b, 0),
      });
    }
  }
  _sectorCache = { key, at: now, rows };
  return rows;
}

/**
 * CONFRONTO SETTORE PER SETTORE CON IL MIGLIOR GIRO (6/11, richiesta Mauro).
 * Prende le righe di `scanResultSectors` e il file della gara aperta, e mette
 * il giro di quella gara accanto al miglior giro della stessa auto sulla stessa
 * pista: per ogni settore il delta, più la somma dei migliori settori di sempre
 * (l'ideale, che NON è un tempo accreditato da nessuno).
 *
 * Regole, per non inventare nulla:
 * - il confronto è SOLO a parità di pista e auto, e con lo stesso numero di
 *   settori: una GT3 contro una MX-5 non è un confronto, è un altro sport;
 * - `lapMs` è la SOMMA DEI SETTORI (le `splits` del file), non il tempo
 *   ufficiale del giro: la GUI lo dice;
 * - se non c'è nessun altro giro con quell'auto, `rif` è null e la GUI mostra
 *   solo i settori di questa gara, invece di paragonarla a sé stessa;
 * - le sessioni delle uscite libere sono già nei file risultato: si passano
 *   dentro `rows` una volta sola, senza duplicarle.
 *
 * In più (6/11, richiesta Mauro: «anche il miglior giro della pista con auto
 * diversa, etichettato come paragone tra auto»), `altraAuto` porta il giro più
 * veloce della STESSA pista fatto con un'ALTRA auto. È un paragone tra auto,
 * non un riferimento della gara: resta un campo separato, con l'auto scritta
 * per esteso, e senza il numero di settori giusto non si mostra. Se l'auto
 * della gara non è nel file, «diversa» non è dimostrabile e non si finge.
 */
export function sectorCompare(rows, file) {
  const gara = (rows ?? []).find((r) => r.file === file);
  if (!gara) return null;
  const parti = gara.splitsMs.length;
  const vista = (r) => ({ file: r.file, session: r.session, splitsMs: r.splitsMs, lapMs: r.lapMs, stessoFile: r.file === gara.file, car: r.carLabel || r.car || null });
  const altra = !gara.car ? null : (rows ?? [])
    .filter((r) => r.track === gara.track && r.car && r.car !== gara.car && r.splitsMs.length === parti)
    .reduce((a, b) => (a == null || b.lapMs < a.lapMs ? b : a), null);
  const altraAuto = altra ? {
    car: altra.carLabel ?? altra.car,
    file: altra.file,
    session: altra.session,
    splitsMs: altra.splitsMs,
    lapMs: altra.lapMs,
    delta: gara.splitsMs.map((ms, i) => ms - altra.splitsMs[i]),
    deltaGiro: gara.lapMs - altra.lapMs,
  } : null;
  const stesse = (rows ?? []).filter((r) => r.track === gara.track && r.car === gara.car && r.splitsMs.length === parti);
  if (stesse.length < 2) {
    return { parti, track: gara.track ?? null, gara: vista(gara), rif: null, delta: null, ideale: null, altre: 0, altraAuto };
  }
  const rif = stesse.reduce((a, b) => (b.lapMs < a.lapMs ? b : a));
  const somma = (arr) => arr.reduce((a, b) => a + b, 0);
  const idealeMs = Array.from({ length: parti }, (_, i) => Math.min(...stesse.map((r) => r.splitsMs[i])));
  return {
    parti,
    track: gara.track ?? null,
    gara: vista(gara),
    rif: vista(rif),
    delta: gara.splitsMs.map((ms, i) => ms - rif.splitsMs[i]),
    ideale: { splitsMs: idealeMs, lapMs: somma(idealeMs) },
    altre: stesse.length,
    altraAuto,
  };
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
  return { ...report, gaps: analysisGaps(report) };
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
