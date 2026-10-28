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
import { findPlayerDriver, penaltyOf, officialPositionOf, dedupeDriverDiRiga } from './results.mjs';
import { nomePilota } from './nome-pilota.mjs';

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
}/* QUANDO VERO dalla SESSIONE e non dal mtime (28/10, i "duplicati
   nell'Archivio"): le copie/ripristini del disco dimenticano l'ora originale
   (tutti i file ricopiati la stessa sera compaiono con lo stesso minuto),
   quindi l'archivio raggruppava come «tentativi ×N» gare di GIORNI diversi.
   La data vera sta nel nome che EVO dà al file: YYMMDD-HHMMSS o YYMMDD-HHMM.
   Fallback: mtime. A livello MODULO: serve anche all'archivio online. */

/** Data ISO se la data è valida, altrimenti il fallback mtime/adesso: anche
 *  un nome YYMMDD può inventare date inesistenti (2026-02-30 e simili, 28/11). */
const isoOr = (d, file, mtime) => {
  if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString();
  return sessionMtime(file, mtime);
};

/** Fallback mtime: mai far esplodere l'archivio per un file che il disco
 *  restituisce con mtime zero o sporco (26/11): si scala all'adesso con avviso. */
const sessionMtime = (file, mtime) => {
  const d = new Date(mtime);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  recordWarning('catalog.archive', 'file con data sconosciuta, uso l\'adesso: ' + file, String(mtime));
  return new Date().toISOString();
};

/** Quando di una sessione dal NOME del file (il secolo si antepone al testo:
 *  «20»+«26» = 2026, senza aritmetica; con «2»+«26» veniva l'anno 226). */
const sessionWhen = (file, mtime) => {
  let m = String(file).match(/^(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (m) return isoOr(new Date(`20${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`), file, mtime);
  m = String(file).match(/^(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})[^\d]/);
  if (m) return isoOr(new Date(`20${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`), file, mtime);
  return sessionMtime(file, mtime);
};

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
      when: sessionWhen(e.file, e.mtime),
      kind,
      season: r.season ?? '?', event: r.event ?? '?', session,
      track: r.track ?? '?', layout: r.layout ?? '',
      weather: String(r.weather_type ?? '').replace('GameModeSelectionWeatherType_', '').replace('WeatherType_', '') || null,
      hour: r.hour ?? null,
      drivers: drivers.length,
      winner: winner ? nomePilota(winner.driver_name, winner.driver_surname) : null,
      me: me ? { position: myPos, bestLap: me.best_lap ?? null, car: carLabel(me) } : null,
    });
  }
  return { total: entries.length, rows, scoped: !!afterMs };
}

/* ------------------------------------------------------------------ */
/* ARCHIVIO ONLINE (31/10): le gare multiplayer, la memoria che non     */
/* doveva perdere nessuno                                               */
/* ------------------------------------------------------------------ */

/** Un file risultato MULTIPLAYER ha il tag _MP_ nel nome (SP = singolo). */
export const isMpResultFile = (name) => /_MP_/.test(String(name ?? ''));

/** Nome completo del pilota da una riga del risultato. */
const mpDriverName = (d) => `${String(d?.driver_name ?? '').replace(/^[\u2022\s]+/, '').trim()} ${String(d?.driver_surname ?? '').trim()}`.trim();

/** Identità STABILE nelle gare online: il driver_id del gioco (a|b) sopravvive
 *  a nickname e community; senza, il nome normalizzato è l'unica chiave. */
const mpKeyOf = (d) => {
  const id = d?.driver_id;
  if (id?.a != null && String(id.a).length > 1) return `id:${id.a}|${id.b ?? ''}`;
  const nome = mpDriverName(d).toLowerCase();
  return nome.length > 1 ? `nome:${nome}` : null;
};

/**
 * L'ARCHIVIO ONLINE in una sola passata di lettura dai file _MP_ dei Results:
 *  - `rows`: le sessioni con community/server, pista, meteo, ora, i "TUOI"
 *    numeri (il flag is_current_driver del gioco, col nome della carriera a
 *    ripiego) e il vincitore;
 *  - `rivals`: il LIBRO DEI RIVALI ONLINE — chi incroci più spesso, quante
 *    volte ti ha battuto, dove, in quale community e l'ultima volta. Identità
 *    dal driver_id (stabile fra sessioni), a ripiego dal nome.
 * LETTURA PURA: carriera, soldi e punti MAI toccati (la salvaguardia sta in
 * results.mjs pickCandidate e watch.mjs). Un file mezzo-scritto il gioco può
 * lasciare in disco (.json.out) o un JSON rotto: engullito in pace.
 */
export function onlineArchive(paths, { limit = 200, driver = null, afterMs = 0 } = {}) {
  const rows = [];
  const book = new Map();
  for (const dir of resultDirs(paths)) {
    if (!existsSync(dir)) continue;
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json') && isMpResultFile(f)); } catch { continue; }
    for (const f of files) {
      const full = join(dir, f);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (afterMs && st.mtimeMs < afterMs) continue;
      const r = dedupeDriverDiRiga(readJsonSafe(full));
      if (!r) continue;
      const when = sessionWhen(f, st.mtimeMs);
      const drivers = Array.isArray(r.drivers) ? r.drivers : [];
      const zeroBased = drivers.some((d) => Number(d.position) === 0);
      const winner = drivers.find((d) => Number(d.position) === (zeroBased ? 0 : 1));
      const found = driver ? findPlayerDriver(r, driver) : { driver: drivers.find((d) => d.is_current_driver === true) ?? null };
      const me = found.driver ?? null;
      const myPos = me ? Number(me.position) + (zeroBased ? 1 : 0) : null;
      const community = r.season ?? '?';
      rows.push({
        file: f,
        when,
        community,
        event: r.event ?? '?',
        session: r.session ?? '?',
        track: r.track ?? '?',
        layout: r.layout ?? '',
        weather: String(r.weather_type ?? '').replace('GameModeSelectionWeatherType_', '').replace('WeatherType_', '') || null,
        hour: r.hour ?? null,
        drivers: drivers.length,
        winner: winner ? nomePilota(winner.driver_name, winner.driver_surname) : null,
        me: me ? { position: myPos, bestLap: me.best_lap ?? null, car: carLabel(me) } : null,
      });
      // IL LIBRO DEI RIVALI: solo le gare in cui ti sei davvero incrociato
      if (me) {
        for (const d of drivers) {
          if (d === me) continue;
          const key = mpKeyOf(d);
          if (!key || key === mpKeyOf(me)) continue;   // righe riciclate dal gioco: stesso uomo
          const e = book.get(key) ?? { key, meetings: 0, beats: 0, beaten: 0, communities: [], names: [], lastWhen: null, lastTrack: null, lastMePos: null, hist: [], tracks: {}, cars: {} };
          e.meetings++;
          if (e.names.length < 3 && !e.names.includes(mpDriverName(d))) e.names.push(mpDriverName(d));
          if (e.communities.length < 3 && !e.communities.includes(community)) e.communities.push(community);
          e.lastWhen = !e.lastWhen || when > e.lastWhen ? when : e.lastWhen;
          e.lastTrack = r.track ?? null;
          e.lastMePos = myPos;
          e.name = e.names[e.names.length - 1] ?? e.name;
          const rPos = Number(d.position) + (zeroBased ? 1 : 0);
          if (Number.isFinite(rPos) && rPos > 0) {
            // IL CONTO PISTE: in quante gare su QUELLA pista vi siete incrociati,
            // e in quante tu sei arrivato davanti — la «pista preferita» nasce qui.
            const tk = e.tracks[r.track] ?? (e.tracks[r.track] = { n: 0, tu: 0 });
            tk.n++;
            if (myPos != null && rPos > myPos) tk.tu++;
            const car = carLabel(d);
            if (car) e.cars[car] = (e.cars[car] ?? 0) + 1;
            if (myPos != null) {
              if (rPos > myPos) e.beaten++; else e.beats++;
              e.hist.push({ when, track: r.track ?? null, pos: myPos, beat: rPos > myPos });
            }
          } else if (myPos != null) {
            // lui classificato a P0 (ritirato/DSQ): la tua posizione vale nella forma,
            // ma il testa a testa non può dire né «lui» né «tu»
            e.hist.push({ when, track: r.track ?? null, pos: myPos, beat: null });
          }
          book.set(key, e);
        }
      }
    }
  }
  rows.sort((a, b) => (b.when > a.when ? 1 : b.when < a.when ? -1 : 0));
  // DAI CONTI ALLA FORMA: per ogni rivale gli ultimi incroci in ordine di data
  // (la scansione non è cronologica), la pista più frequente e l'auto abituale.
  for (const e of book.values()) {
    e.hist.sort((a, b) => (b.when > a.when ? 1 : b.when < a.when ? -1 : 0)); // la più nuova prima
    e.form = e.hist.slice(0, 5).map((h) => ({ pos: h.pos ?? null, beat: h.beat }));
    const top = Object.entries(e.tracks).sort((a, b) => b[1].n - a[1].n)[0] ?? null;
    e.favTrack = top ? { track: top[0], n: top[1].n, tu: top[1].tu } : null;
    const topCar = Object.entries(e.cars).sort((a, b) => b[1] - a[1])[0] ?? null;
    e.favCar = topCar ? topCar[0] : null;
    delete e.tracks; delete e.cars; delete e.hist;
  }
  const rivals = [...book.values()]
    .sort((a, b) => b.meetings - a.meetings || b.beats - a.beats)
    .slice(0, limit);
  return { total: rows.length, rows: rows.slice(0, limit), rivals };
}

/** Dettaglio di un file risultato: griglia completa con giri, tempi e gap.
 *  Per le sessioni ONLINE (_MP_) con `driver` noto aggiunge per ogni pilota il
 *  TESTA A TESTA col libro dei rivali: { incroci, tu, lui } su TUTTE le
 *  sessioni multiplayer, l'identità riconosciuta dai nickname alternativi. */
const nomeChiave = (n) => String(n ?? '').toLowerCase().trim();

/** La label auto senza marca raddoppiata: nel file il modello porta spesso
 *  già il brand («Peugeot 205 T16»), e brand+modello stampava «Peugeot Peugeot…». */
const carLabel = (d) => {
  const brand = String(d?.car_brand ?? '').trim();
  const name = String(d?.car_name ?? '').trim();
  if (!brand) return name;
  if (!name) return brand;
  return RegExp('^' + brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i').test(name)
    ? name : `${brand} ${name}`;
};
export function resultDetail(paths, fileName, { driver = null } = {}) {
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
    // IL TUO POSTO (27/10): flag del gioco se parla solo di te (una fila cabinata
    // «tutti te» non vale nulla), altrimenti il riconoscimento per nome di
    // findPlayerDriver — lo stesso identità usata da archivio e import.
    const meDriver = (driver ? findPlayerDriver(r, driver).driver : null)
      ?? (drivers.filter((d) => d.is_current_driver === true).length === 1
        ? drivers.find((d) => d.is_current_driver === true) : null);
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
        name: nomePilota(d.driver_name, d.driver_surname),
        nation: d.driver_nation ?? null, car: carLabel(d),
        isAI: /^[•\u2022]/.test(String(d.driver_name ?? '').trim()), me: d === meDriver,
        laps: d.laps ?? 0, bestLap: d.best_lap ?? null, hasBest: d.has_best_lap === true,
        totalTime: d.total_time ?? null, gap, pits: d.num_pits ?? 0,
        penalty: penaltyOf(d).label,
        offSort: (off.position ?? 0) || (1000 + pos),
      };
    }).sort((a, b) => a.offSort - b.offSort);
    // TESTA A TESTA (solo sessioni _MP_ con la carriera nota): il libro dei
    // rivali parlato per NICKNAME — un rivale cambia nickname tra server, va
    // riconosciuto dai nomi alternativi del libro.
    const isMp = isMpResultFile(safe);
    if (isMp && driver) {
      const arch = onlineArchive(paths, { driver, afterMs: 0 });
      const perNome = new Map();
      for (const e of arch.rivals ?? []) {
        for (const n of e.names) perNome.set(nomeChiave(n), e);
      }
      for (const row of rows) {
        const e = perNome.get(nomeChiave(row.name));
        row.h2h = e ? { meetings: e.meetings, tu: e.beaten, lui: e.beats } : null;
      }
    }
    return {
      file: safe, season: r.season ?? '?', event: r.event ?? '?', session: r.session ?? '?',
      track: r.track ?? '?', layout: r.layout ?? '',
      weather: String(r.weather_type ?? '').replace('GameModeSelectionWeatherType_', '').replace('WeatherType_', '') || null,
      hour: r.hour ?? null, min: r.min ?? 0, rows, is_mp: isMp,
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
