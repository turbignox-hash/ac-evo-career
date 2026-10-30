// paddock.mjs — il ponte CON L'APP PADDACK del gioco (quella che gira dentro
// EVO come app UI "Pitwall/Paddock"). Paddock scrive i suoi dati come journal
// JSON `pd-<vista>-<hash>.json` nella sua cartella uiresource; qui li
// LEGGIAMO in sola lettura:
//   • pd-home      → profilo pilota, prossima gara (meteo/ora scritti a monte),
//                    classifica della stagione, messaggi del team (consigli!)
//   • pd-calendar  → le ronde della stagione con meteo/ora per ognuna
//   • pd-catalog   → il catalogo auto con CURVA DI COPPIA e classifiche `versus`
//   • pd-ledger    →registro contabile
//   • pd-history   → storico gare con lo spaccato di premi/bonus
//   • pd-teams, pd-sponsors, pd-garage, pd-telemetry, pd-trophies
// I journal cambiano hash nel nome a ogni riscrittura: si prende SEMPRE il più
// recente (mtime) e la lettura è memo per mtime, così il server vivo resta al
// passo senza riscansare il disco a ogni richiesta API.
//
// Dove vivono i journal: <dati ACE>/mods/uiresources/ACEUIAppLoader/paddock/
// (override esplicito: variabile d'ambiente PADDOCK_JOURNAL_DIR).

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dataDirCandidates } from './paths.mjs';
import { tr } from './lang.mjs';

const _cache = new Map();      // kind → { file, mtime, val }
let _rootCache = null;       // { root, at } — la scansione si ripete al massimo ogni 30s

/** La cartella journal dell'app Paddock (o null: l'app non è installata). */
export function paddockRoot(env = process.env) {
  const now = Date.now();
  if (_rootCache && now - _rootCache.at < 30000) return _rootCache.root;
  let root = null;
  if (env.PADDOCK_JOURNAL_DIR) {
    // override esplicito: se la cartella NON esiste è un errore di configurazione
    // — meglio NIENTE paddock che un ritorno silenzioso ai journal veri di gioco,
    // che il chiamante leggerrebbe senza accorgersene (lezione dai test del 2/11:
    // la suite del ponte leggeva Suzuka dell'installazione reale per un typo del nido)
    root = existsSync(env.PADDOCK_JOURNAL_DIR) ? env.PADDOCK_JOURNAL_DIR : null;
  }
  else {
    // l'app vive dentro uiresources di EVO, SOTTO la cartella dati del gioco
    // (<Saved Games>\ACE\mods\uiresources\…): la lista delle cartelle dati la
    // costruisce già paths.mjs con i percorsi di Saved Games/Documents.
    for (const base of dataDirCandidates(env)) {
      const cand = join(base, 'mods', 'uiresources', 'ACEUIAppLoader', 'paddock');
      if (existsSync(cand)) { root = cand; break; }
    }
  }
  _rootCache = { root, at: now };
  return root;
}

/** Il journal `pd-<kind>-*.json` più recente (per mtime), o null. */
function latestJournal(kind, env = process.env) {
  const root = paddockRoot(env);
  if (!root) return null;
  let files = [];
  try { files = readdirSync(root).filter((f) => f.startsWith(`pd-${kind}-`) && f.endsWith('.json')); } catch { return null; }
  if (!files.length) return null;
  let best = null, bestM = -1;
  for (const f of files) {
    try {
      const st = statSync(join(root, f));
      if (st.mtimeMs > bestM) { bestM = st.mtimeMs; best = f; }
    } catch { /* file sparito a metà lettura: si guarda il prossimo */ }
  }
  return best ? join(root, best) : null;
}

/** Legge il journal più recente di `kind`, memo per mtime. */
function readJournal(kind, env = process.env) {
  const file = latestJournal(kind, env);
  if (!file) return null;
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { return null; }
  const hit = _cache.get(kind);
  if (hit && hit.file === file && hit.mtime === mtime) return hit.val;
  let val = null;
  try { val = JSON.parse(readFileSync(file, 'utf8')); } catch { val = null; }
  _cache.set(kind, { file, mtime, val });
  return val;
}

/** Svuota la cache (i test; in produzione decide il mtime). */
export function paddockCacheClear() { _cache.clear(); _rootCache = null; }

/* ------------------------------------------------------------------ */
/* viste sul journal                                                   */
/* ------------------------------------------------------------------ */

/** Il catalogo auto di Paddock: curva, versus, prezzo/noleggio, serie. */
export function paddockCatalog(env = process.env) {
  const j = readJournal('catalog', env);
  if (!j?.cars?.length) return { ok: false, cars: [] };
  return { ok: true, cars: j.cars, at: journalStamp('catalog', env) };
}

/** Il calendario della stagione in corso (meteo/ora per ogni ronda). */
export function paddockCalendar(env = process.env) {
  const j = readJournal('calendar', env);
  if (!j?.rounds?.length) return { ok: false, rounds: [], standings: [] };
  return {
    ok: true, series: j.series ?? null, seriesId: j.series_id ?? null,
    car: j.car ?? null, season: j.season ?? null, status: j.status ?? null,
    summary: j.summary ?? null, rounds: j.rounds, standings: j.standings ?? [],
    at: journalStamp('calendar', env),
  };
}

/** La schermata "home" dell'app: profilo, prossima gara, messaggi del team. */
export function paddockHome(env = process.env) {
  const j = readJournal('home', env);
  if (!j) return { ok: false };
  return { ok: true, ...j };
}

/** Il registro contabile (righe di premi/bonus/spese). */
export function paddockLedger(env = process.env) {
  const j = readJournal('ledger', env);
  if (!j) return { ok: false };
  return { ok: true, ...j };
}

/** Il team di corrente + le offerte. */
export function paddockTeams(env = process.env) {
  const j = readJournal('teams', env);
  if (!j) return { ok: false };
  return { ok: true, ...j };
}

/** Lo storico gare (spaccato di premi, classifica di ogni gara). */
export function paddockHistory(env = process.env) {
  const j = readJournal('history', env);
  if (!j) return { ok: false };
  return { ok: true, ...j };
}

function journalStamp(kind, env = process.env) {
  const file = latestJournal(kind, env);
  if (!file) return null;
  try { return new Date(statSync(file).mtimeMs).toISOString(); } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* la prossima gara secondo Paddock                                    */
/* ------------------------------------------------------------------ */

/** Parole che indicano PISTA BAGNATA nei journal (stringhe italiane del gioco). */
export const PADDOCK_WET_WORDS = ['pioggia', 'rain', 'scrosci', 'temporale', 'wet'];

export function paddockWet(weather) {
  const w = String(weather ?? '').toLowerCase();
  return PADDOCK_WET_WORDS.some((word) => w.includes(word));
}

/**
 * La scheda della prossima ronda di Paddock: il journal `pd-home` la pubblica
 * già pronta (round/track/laps/time/weather/car); in mancanza si ricava dal
 * `pd-calendar` (la ronda con state:"next"). Per una gara BAGNATA allega i
 * suggerimenti di assetto: la card che prima si scriveva a mano, qui arriva
 * AUTOMATICA dal calendario che Paddock ha pescato a monte.
 */
export function paddockNextRace(env = process.env) {
  const home = paddockHome(env);
  const cal = paddockCalendar(env);
  const hn = home.ok ? (home.next ?? null) : null;           // { track, laps, time, weather, … }
  const rn = cal.ok ? (cal.rounds ?? []).find((r) => r.state === 'next') ?? null : null;
  const next = hn ?? rn;
  if (!next || !next.track) return null;
  const wet = paddockWet(next.weather) || paddockWet(hn?.weather ?? rn?.weather);
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
  const countDone = (cal.rounds ?? []).filter((r) => r?.state === 'done').length;
  const done = home.ok ? (home.season?.done ?? countDone) : countDone;
  return {
    ok: true,
    series: home.ok ? (home.season?.series ?? cal.series) : cal.series,
    car: next.car ?? cal.car ?? null,
    season: home.ok ? (home.season?.number ?? cal.season) : cal.season,
    round: next.round ?? next.n ?? null,
    total: home.ok ? (home.season?.total ?? (cal.rounds ?? []).length) : (cal.rounds ?? []).length,
    track: next.track, layout: next.layout ?? rn?.layout ?? null,
    laps: next.laps ?? rn?.laps ?? null,
    time: next.time ?? null, weather: next.weather ?? rn?.weather ?? null, wet,
    opponents: next.opponents ?? null,
    // la classifica di Paddock (più fresca della nostra: conta ANCHE le ronde importate da lì)
    rank: home.ok ? (home.season?.rank ?? cal.summary?.rank ?? null) : cal.summary?.rank ?? null,
    points: home.ok ? (home.season?.points ?? cal.summary?.points ?? null) : cal.summary?.points ?? null,
    done: done ?? null,
    repCapped: home.ok ? !!home.season?.rep_capped : false,
    image: next.image ?? null, map: next.map ?? null,
    tips, at: journalStamp('home', env) ?? journalStamp('calendar', env),
  };
}

/* ------------------------------------------------------------------ */
/* scheda auto arricchita: curva di coppia e versus dal catalogo        */
/* ------------------------------------------------------------------ */

/** Chiave di matching: nome normalizzato (minuscolo, solo a-z0-9, niente accenti). */
const norm = (s) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

let _catIdx = null;
function catalogIndex(env = process.env) {
  if (_catIdx && _catIdx.envKey === String(env.PADDOCK_JOURNAL_DIR ?? '') && Date.now() - _catIdx.at < 60000) return _catIdx;
  const cat = paddockCatalog(env);
  const idx = new Map();
  if (cat.ok) {
    for (const c of cat.cars) {
      if (c && norm(c.name)) idx.set(norm(c.name), c);
      if (c?.slug && norm(c.slug)) idx.set(norm(c.slug), c);
    }
  }
  _catIdx = { envKey: String(env.PADDOCK_JOURNAL_DIR ?? ''), at: Date.now(), idx };
  return _catIdx;
}

/**
 * L'extra tecnico che SOLO Paddock conosce per un'auto (dal nome mostrato o slug):
 * { torqueCurve, versus, kw, cv, mass, torque, induction, gears, price, rental, brand, series, perf }.
 * Null se l'auto non è nel catalogo: chi chiama semplicemente non la mostra.
 */
export function carPaddockSpecsOf(nameOrId, env = process.env) {
  if (!nameOrId) return null;
  const idx = catalogIndex(env);
  const key = norm(nameOrId);
  const hit = idx.idx.get(key) ?? null;
  if (!hit) return null;
  const curve = Array.isArray(hit.curve) && hit.curve.length > 1
    && hit.curve.every((p) => Array.isArray(p) && p.length >= 2) ? hit.curve : null;
  return {
    source: 'paddock',
    torqueCurve: curve ? curve.map((p) => [Math.round(p[0]), Number(p[1])]) : null,
    versus: Array.isArray(hit.versus) ? hit.versus.filter((v) => v?.label) : [],
    kw: hit.kw ?? null, cv: hit.cv ?? null, mass: hit.mass ?? null,
    torque: hit.torque ?? null, induction: hit.induction ?? null, gears: hit.gears ?? null,
    kwPerT: hit.kw_per_t ?? null, perf: hit.perf ?? null,
    price: hit.price ?? null, rental: hit.rental ?? null, owned: !!hit.owned,
    brand: hit.brand ?? null,
    series: Array.isArray(hit.series) ? hit.series : [],
  };
}

/* ------------------------------------------------------------------ */
/* economia: bonus gara pulita + avviso rep-cap (nell'import)          */
/* ------------------------------------------------------------------ */

/**
 * Il bonus \"gara pulita\" alla Paddock (10% del premio della ronda, arrotondato):
 * lo incassa chi attraversa la gara senza penalità né incidenti, e va aggiunto
 * al cruscotto quando l'import conferma una gara senza warning. Restituisce
 * sempre un numero intero >= 0 per poter essere sommato al premio.
 */
export function cleanRaceBonusOf(prize, penalties = 0) {
  const p = Number(prize) || 0;
  if (p <= 0 || Number(penalties) > 0) return 0;
  return Math.round(p * 0.1);
}

/**
 * La nota di rep-cap scritta nelle ronde di Paddock (\"Reputazione al massimo…\")
 * è l'invito a correre in una categoria più alta: la ripeti alla carriera dopo
 * l'import di una gara che ha già chiuso questo tetto.
 */
export function padRepCapNote() {
  return tr({
    // la 📊 sta DENTRO la coppia: il guadra di pushMessage confronta il testo
    // con tr(){it,en} alla lettera, e un prefisso fuori dalla coppia (lezione
    // 31/10) rimanda la coppia stantia e stacca l'EN — alla gara dopo l'import
    // firmava la stessa nota anche in EN e la bacheca la teneva doppia.
    it: '📊 Reputazione al massimo per questo campionato: per farla salire corri in una categoria più alta.',
    en: '📊 Reputation is maxed out for this championship: run a higher category to grow it further.',
  });
}

/* ------------------------------------------------------------------ */
/* riepilogo per l'API webui                                           */
/* ------------------------------------------------------------------ */

/** Il pannello \"Paddock\" del cruscotto: tutto in una risposta. */
/** Quante auto del catalogo Paddock hanno la scheda vettura MUTA (RA) completa. */
export function carPaddockCompleteCount(env = process.env) {
  const cat = paddockCatalog(env);
  if (!cat.ok) return { count: 0, missing: [] };
  const missing = [];
  let count = 0;
  for (const c of cat.cars) {
    if (!c || !c.name) continue;
    const s = carPaddockSpecsOf(c.name, env);
    if (s?.torqueCurve && s.torque != null && s.mass != null) count++;
    else missing.push(c.name);
  }
  return { count, missing };
}

/** Statistiche di copertura del catalogo Paddock (per lo stato del cruscotto). */
export function paddockStats(env = process.env) {
  const cat = paddockCatalog(env);
  if (!cat.ok) return { ok: false, cars: 0, withCurve: 0, complete: 0 };
  const cars = cat.cars;
  const withCurve = cars.filter((c) => Array.isArray(c.curve) && c.curve.length > 1).length;
  const complete = carPaddockCompleteCount(env);
  return { ok: true, cars: cars.length, withCurve, complete: complete.count };
}

export function paddockOverview(env = process.env) {
  const root = paddockRoot(env);
  if (!root) return { ok: false, reason: 'not-installed' };
  const cal = paddockCalendar(env);
  const next = paddockNextRace(env);
  const cat = paddockCatalog(env);
  const led = paddockLedger(env);
  const teams = paddockTeams(env);
  const hist = paddockHistory(env);
  const home = paddockHome(env);
  return {
    ok: true, root,
    next,   // la scheda della prossima gara (wet → tips)
    stats: paddockStats(env),
    home: home.ok ? {
      // TESSERA PROFILO (1.0.2): name + level con i NUEVI colori driver
      // (Expert rosso, Professional lime, Ace giallo) scritti dall'app direttamente
      // nel journal pd-home; name/level.name arrivano nella LINGUA DELL'APP.
      profile: home.profile ?? null,
      season: home.season ?? null,
      standings: home.standings ?? cal.standings ?? [],
      recent: home.recent ?? [],
      messages: home.messages ?? [],
      sponsor: home.sponsor ?? null,
    } : null,
    calendar: cal.ok ? {
      series: cal.series, car: cal.car, season: cal.season, status: cal.status,
      summary: cal.summary, rounds: cal.rounds, standings: cal.standings,
    } : null,
    cars: cat.ok ? {
      count: cat.cars.length,
      withCurve: cat.cars.filter((c) => Array.isArray(c.curve) && c.curve.length > 1).length,
      rows: cat.cars.slice(0, 250),
    } : null,
    ledger: led.ok ? { rows: (led.rows ?? led.groups ?? []).slice(0, 30) } : null,
    teams: teams.ok ? { current: teams.current ?? null, offers: teams.offers ?? [] } : null,
    history: hist.ok ? { summary: hist.summary ?? null, races: (hist.races ?? []).slice(0, 10) } : null,
    at: { home: journalStamp('home', env), calendar: journalStamp('calendar', env), catalog: journalStamp('catalog', env) },
  };
}
