// app-carriera.mjs — il ponte CON L'APP DEL GIOCO (la UI di carriera che gira
// dentro EVO: profilo, calendario, catalogo). L'app scrive i suoi dati come
// journal JSON `pd-<vista>-<hash>.json` nella sua cartella uiresource;
// qui li LEGGIAMO in sola lettura:
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
// (override esplicito: variabile d'ambiente APP_JOURNAL_DIR).

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDirCandidates } from './paths.mjs';
import { tr } from './lang.mjs';
// JOURNAL NOSTRO (2/11): il calendario delle ronde lo abbiamo ANCHE NOI
// (src/journal.mjs lo rispecchia accanto al save a ogni saveState); è il
// fall-back per chi NON ha l'app del gioco. journal.mjs è una foglia
// (importa tracks + weather): nessun ciclo con state.mjs.
import { journalPathForSave } from './journal.mjs';
// TRACK_INFO e sameTrack servono al «cerchio» della gara: la ronda del
// pd-calendar arriva con il NOME della pista dell'app ("Brands Hatch") e il
// resto del motore vuole l'ID della ladder ("brands_hatch"). tracks.mjs è
// già la base di set-track e di journal.mjs (che è tra i suoi importi):
// niente ciclo; sameTrack (tracknames.mjs) è l'unica regola del matching.
import { TRACK_INFO } from './tracks.mjs';
import { sameTrack } from './tracknames.mjs';

const _cache = new Map();      // kind → { file, mtime, val }
let _rootCache = null;       // { root, at } — la scansione si ripete al massimo ogni 30s

/** La cartella journal dell'app del gioco (o null: l'app non è installata). */
export function appRoot(env = process.env) {
  const now = Date.now();
  if (_rootCache && now - _rootCache.at < 30000) return _rootCache.root;
  let root = null;
  if (env.APP_JOURNAL_DIR) {
    // override esplicito: se la cartella NON esiste è un errore di configurazione
    // — meglio NIENTE app che un ritorno silenzioso ai journal veri di gioco,
    // che il chiamante leggerrebbe senza accorgersene (lezione dai test del 2/11:
    // la suite del ponte leggeva Suzuka dell'installazione reale per un typo del nido)
    root = existsSync(env.APP_JOURNAL_DIR) ? env.APP_JOURNAL_DIR : null;
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
// IL FALL-BACK DEL CALLENDARIO NOSTRO (2/11). La funzione calcola file/
// evo-calendar[-N].json dalla stessa regola di cli.mjs (EVO_DATA_DIR o data/,
// ACE_SLOT nel nome) e lo legge SOLO se ha il flag `mirror` — guardia contro
// scritture insensate nel file se qualcuno lo tocca a mano.
// Il mirror vive nella DATA_DIR del TOOL, che ha la STESSA regola di cli.mjs:
// processo una volta sola per mtime.
const _nostroCache = { file: null, mtime: 0, val: null };
export function journalNostro(env = process.env) {
  const slot = Math.max(1, Math.min(3, Math.floor(Number(env.ACE_SLOT) || 1)));
  const dataDir = env.EVO_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const nomiSave = slot === 1 ? 'evo-career.save.json' : `evo-career.save-${slot}.json`;
  const file = journalPathForSave(join(dataDir, nomiSave));
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { return null; }
  if (_nostroCache.file === file && _nostroCache.mtime === mtime) return _nostroCache.val;
  let val = null;
  try { const j = JSON.parse(readFileSync(file, 'utf8')); if (j?.mirror && Array.isArray(j.rounds)) val = j; } catch { val = null; }
  _nostroCache.file = file; _nostroCache.mtime = mtime; _nostroCache.val = val;
  return val;
}

/** Il mtime del mirror in ISO (per il campo `at` del fall-back): null se assente. */
function journalNostroStamp(env = process.env) {
  const has = journalNostro(env);
  if (!has) return null;
  return _nostroCache.file && _nostroCache.mtime ? new Date(_nostroCache.mtime).toISOString() : null;
}

/** Svuota la cache del journal nostro (i test; in produzione decide il mtime). */
export function journalNostroCacheClear() { _nostroCache.file = null; _nostroCache.mtime = 0; _nostroCache.val = null; }

function latestJournal(kind, env = process.env) {
  const root = appRoot(env);
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
export function appCacheClear() { _cache.clear(); _rootCache = null; }

/* ------------------------------------------------------------------ */
/* viste sul journal                                                   */
/* ------------------------------------------------------------------ */

/** Il catalogo auto dell'app del gioco: curva, versus, prezzo/noleggio, serie. */
export function appCatalog(env = process.env) {
  const j = readJournal('catalog', env);
  if (!j?.cars?.length) return { ok: false, cars: [] };
  return { ok: true, cars: j.cars, at: journalStamp('catalog', env) };
}

/** Il calendario della stagione in corso (meteo/ora per ogni ronda). FAMIGLIA
 *  2/11: quando il ponte manca (app del gioco non installata) LEGGE IL MIRROR
 *  (file evo-calendar[-N].json accanto al save, rispecchiato da saveState);
 *  shape identica di risposta, col flag `mirror: true` che segnala alla GUI
 *  la sorgente — la classifica e i MESSAGES del resto restano vuoti perché
 *  SOLO il ponte li misura. */
export function appCalendar(env = process.env) {
  const j = readJournal('calendar', env) ?? journalNostro(env);
  if (!j?.rounds?.length) return { ok: false, rounds: [], standings: [] };
  return {
    ok: true, series: j.series ?? null, seriesId: j.series_id ?? null,
    car: j.car ?? null, season: j.season ?? null, status: j.status ?? null,
    summary: j.summary ?? null, rounds: j.rounds, standings: j.standings ?? [],
    mirror: !!j.mirror,   // 2/11: la copia è la NOSTRA (app del gioco non installata)
    at: j.mirror ? journalNostroStamp(env) : journalStamp('calendar', env),
  };
}

/** La schermata "home" dell'app: profilo, prossima gara, messaggi del team. */
export function appHome(env = process.env) {
  const j = readJournal('home', env);
  if (!j) return { ok: false };
  return { ok: true, ...j };
}

/** Il registro contabile (righe di premi/bonus/spese). */
export function appLedger(env = process.env) {
  const j = readJournal('ledger', env);
  if (!j) return { ok: false };
  return { ok: true, ...j };
}

/** Il team di corrente + le offerte. */
export function appTeams(env = process.env) {
  const j = readJournal('teams', env);
  if (!j) return { ok: false };
  return { ok: true, ...j };
}

/** Lo storico gare (spaccato di premi, classifica di ogni gara). */
export function appHistory(env = process.env) {
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
/* la prossima gara                                                    */
/* ------------------------------------------------------------------ */

/** Parole che indicano PISTA BAGNATA nei journal (stringhe italiane del gioco). */
export const APP_WET_WORDS = ['pioggia', 'rain', 'scrosci', 'temporale', 'wet'];

export function appWet(weather) {
  const w = String(weather ?? '').toLowerCase();
  return APP_WET_WORDS.some((word) => w.includes(word));
}

/**
 * La scheda della prossima ronda: il journal pd-home la pubblica già pronta
 * (round/track/laps/time/weather/car); in mancanza si ricava dal `pd-calendar`
 * (la ronda con state:"next"), o dal mirror nostro se manca anche il ponte.
 * Per una gara BAGNATA allega i suggerimenti di assetto: la card che prima si
 * scriveva a mano, qui arriva AUTOMATICA dal calendario.
 */
export function appNextRace(env = process.env) {
  const home = appHome(env);
  const cal = appCalendar(env);
  const hn = home.ok ? (home.next ?? null) : null;           // { track, laps, time, weather, … }
  const rn = cal.ok ? (cal.rounds ?? []).find((r) => r.state === 'next') ?? null : null;
  const next = hn ?? rn;
  if (!next || !next.track) return null;
  const wet = appWet(next.weather) || appWet(hn?.weather ?? rn?.weather);
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
    // la classifica dell'app del gioco (più fresca della nostra: conta ANCHE le ronde importate da lì)
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
  if (_catIdx && _catIdx.envKey === String(env.APP_JOURNAL_DIR ?? '') && Date.now() - _catIdx.at < 60000) return _catIdx;
  const cat = appCatalog(env);
  const idx = new Map();
  if (cat.ok) {
    for (const c of cat.cars) {
      if (c && norm(c.name)) idx.set(norm(c.name), c);
      if (c?.slug && norm(c.slug)) idx.set(norm(c.slug), c);
    }
  }
  _catIdx = { envKey: String(env.APP_JOURNAL_DIR ?? ''), at: Date.now(), idx };
  return _catIdx;
}

/**
 * L'extra tecnico che SOLO l'app del gioco conosce per un'auto (dal nome mostrato o slug):
 * { torqueCurve, versus, kw, cv, mass, torque, induction, gears, price, rental, brand, series, perf }.
 * Null se l'auto non è nel catalogo: chi chiama semplicemente non la mostra.
 */
export function carAppSpecsOf(nameOrId, env = process.env) {
  if (!nameOrId) return null;
  const idx = catalogIndex(env);
  const key = norm(nameOrId);
  const hit = idx.idx.get(key) ?? null;
  if (!hit) return null;
  const curve = Array.isArray(hit.curve) && hit.curve.length > 1
    && hit.curve.every((p) => Array.isArray(p) && p.length >= 2) ? hit.curve : null;
  return {
    source: 'app',
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
 * Il bonus \"gara pulita\" dell'app (10% del premio della ronda, arrotondato):
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
 * La nota di rep-cap scritta nelle ronde dell'app ("Reputazione al massimo…")
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
/* IL «CERCHIO» DELLA GARA «Iscriviti e divertiti»                      */
/* ------------------------------------------------------------------ */
/* La serie/campionato del nodo ladder VIENE SEMINATO NELL'APP DEL GIOCO
 * (tools/semina-campionato.mjs): le ronde del pd-calendar sono le stesse della
 * ladder, ma l'app le ha elargite con data, ora, meteo e LAYOUT scelti dai
 * preset di gioco — è L'UNICA cronologia che il giocatore vede sul tasto
 * «Iscriviti e divertiti» del cruscotto. Da qui la regola una-sola-verità:
 * chi deve CONDURRE la ronda (race.mjs, la griglia, la banda stato) legge da
 * qui con rondaDelCalendario(), non dalla calendar dell ladder grezza.
 * Fall-back automatico: senza app del gioco, appCalendar() beve già dal
 * mirror journal (2/11), quindi lo stesso helper regge anche lì — nessuna
 * seconda fonte, mai. */

/* Il meteo che L'APP scrive nelle ronde ("Pioggia leggera") → l'ID del meteo
 * NELLA LADDER (weatherNames 0..5: Clear/Scattered clouds/Overcast/Light rain/
 * Rain/Heavy rain), che è la numerazione usata da round.weather, dai template
 * griglia e da tutte le weatherNames. ATTENZIONE (module weather.mjs): NON
 * coincide con la numerazione dei preset EVO del selettore (0..7, dove
 * «Coperto» è il 3) — qui si traduce per NOME, mai per numero. "Coperto"/
 * "Overcast" e "Nuvoloso"/"Cloudy" cadono entrambe su Overcast (2): la ladder
 * non ha due parole per il cielo grigio. Parola ignota → null: la ronda resta
 * col meteo della ladder (nessun «Sereno» forzato per difetto). */
export const METEO_PD = [
  // le specifiche PRIMA di quelle generiche: 'pioggia battente' contiene
  // 'pioggia', 'light rain' contiene 'rain', 'heavy rain' contiene 'rain'.
  ['pioggia battente', 5, 6], ['bombo', 5, 6], ['temporale', 5, 6], ['pioggia intensa', 5, 6], ['heavy rain', 5, 6],
  ['drizzle', 3, 4], ['pioggerella', 3, 4], ['pioggia leggera', 3, 4], ['light rain', 3, 4],
  ['pioggia', 4, 5], ['rain', 4, 5], ['scrosci', 4, 5],
  ['parzialmente nuvoloso', 1, 1], ['nuvole sparse', 1, 1], ['scattered clouds', 1, 1], ['few clouds', 1, 1],
  ['coperto', 2, 3], ['overcast', 2, 3],
  ['nuvoloso', 2, 2], ['cloudy', 2, 2],
  ['sereno', 0, 0], ['clear', 0, 0], ['sole', 0, 0], ['sunny', 0, 0],
];

/** Il meteo che L'APP scrive nelle ronde («Pioggerella», «Coperto»…) → i due
 *  idi che servono ai due consumatori, UNA verità e DUE formati:
 *    { id: ladder, idPreset: preset, spia }
 *  — id, scala LADDER (weatherNames 0..5): round.weather, template griglia, card;
 *  — idPreset, scala PRESETS di weather.mjs (0..6): setWeatherPreset del CLI.
 *  spia: 'wet' solo se il preset porta la pioggia (4+). Parola ignota → null:
 *  la ronda resta col meteo che aveva (nessun «Sereno» forzato per difetto). */
export function meteoPdIndex(word) {
  const s = String(word ?? '').trim().toLowerCase();
  const hit = METEO_PD.find(([w]) => s.includes(w));
  if (!hit) return { id: null, idPreset: null, spia: null };
  return { id: hit[1], idPreset: hit[2], spia: hit[2] >= 4 ? 'wet' : null };
}

/** Il normalizzatore dei match di nomi (accensi via, solo lettere+cifre):
 *  la STESSA regola che tools/ronda-ladder.mjs usava per il pd-calendar. */
const nugno = (s) => String(s ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

/* Il match fra la serie del nodo ladder e quella del calendario dell'app o
 * del mirror. NON un ==: due giri (lezione del 2/11 sul Trofeo MX-5:
 * l'ND della serie ND e la NA della serie NA condividono il medesimo nome
 * corto; la lettera che DECIde è l'AUTO del calendario, contro le auto del
 * nodo; la serie dell'app è quella delle ND e il nodo solo-NA NON la prende):
 *   1) l'AUTO del calendario («Mazda MX-5 ND Cup») contro le auto del nodo
 *      spogliate di «ks_» — il legame forte;
 *   2) il NOME: un display contiene l'altro dopo la normalizzazione. */
/** La serie del nodo ladder combacia con quella del calendario dell'app? */
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

/* Nome di pista (pd-calendar: "Brands Hatch") → ID nella ladder
 * ("brands_hatch"): TRACK_INFO è un oggetto chiave→info, vale la regola del
 * matching di tracknames.mjs sull'id, sul nome e sul nome completo
 * ("Autodromo Internazionale Enzo e Dino Ferrari" → "imola"). */

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
 * La ronda DEL CALENDARIO (pd-calendar dell'app, o MIRROR journal nostro:
 * appCalendar fa già così il fall-back) che dev'essere corsa adesso
 * (prima non DONE): { n, pistaParola, trackId, layout, laps, hour, minute,
 * weather, idPreset, meteoParola, spia, serie, stagione, statoRonda } | null.
 *
 * - in ordine: la prima con stato «next» (le DONE prima restano consumate:
 *   non si ripetono); se «next» non c'è — stagione chiusa, app legata ad altro
 *   save — si torna null e chi chiama resta sulla ladder grezza.
 * - n: il numero della ronda se il calendario lo porta, altrimenti il
 *   POSIZIONALE (index+1: il mirror è posizionale).
 * - trackId: ID della ladder per la pista (trackIdDaNome); pistaParola: la
 *   PAROLA che il calendario portava (per i report CLI).
 * - weather: id scala LADDER (weatherNames 0..5) per round.weather;
 *   idPreset: id scala PRESETS di weather.mjs (0..6) per setWeatherPreset;
 *   meteoParola: la parola che il calendario portava. Parola ignota →
 *   weather null (nessun «Sereno» forzato per difetto).
 * - hour/minute: dall'orario "HH:MM" del calendario (la ladder ha solo
 *   l'ora tonda, l'app ha i minuti).
 * - la SERIE deve combaciare con il nodo (stessaSerie) e la ronda avere la
 *   PISTA: senza, ritorna null e chi chiama resta sulla ladder come prima.
 */
export function rondaDelCalendario(node, env = process.env) {
  const cal = appCalendar(env);
  if (!cal.ok || !stessaSerie(node, cal)) return null;
  const rounds = Array.isArray(cal.rounds) ? cal.rounds : [];
  const r = rounds.find((x) => x?.state === 'next') ?? null;
  if (!r?.track) return null;   // senza pista NON si può correre la ronda dell'app
  const trackId = trackIdDaNome(r.track);
  if (!trackId) return null;    // pista che non compare nella ladder: nessuna supposizione
  const wx = meteoPdIndex(r.weather);
  const [hh, mm] = String(r.time ?? '14:00').split(':');
  return {
    n: Number.isFinite(Number(r.n)) ? Number(r.n) : rounds.indexOf(r) + 1,
    pistaParola: r.track,          // la parola del calendario (report CLI)
    trackId,                       // l'ID di ladder — la pista ufficiale
    layout: r.layout ?? null,      // il layout scelto dall'APP ("GP", "Full")
    laps: r.laps ?? null,
    hour: Number.isFinite(parseInt(hh, 10)) ? parseInt(hh, 10) : 14,
    minute: Number.isFinite(parseInt(mm, 10)) ? parseInt(mm, 10) : 0,
    weather: wx.id,                // scala LADDER (0..5) — per round.weather
    idPreset: wx.idPreset,         // scala PRESETS (0..6) — per setWeatherPreset
    meteoParola: r.weather ?? null,
    spia: wx.spia,
    serie: cal.series ?? null,
    stagione: cal.season ?? null,
    statoRonda: r.state ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* riepilogo per l'API webui                                           */
/* ------------------------------------------------------------------ */

/** Il pannello dell'app di gioco nel cruscotto: tutto in una risposta. */
/** Quante auto del catalogo dell'app hanno la scheda vettura MUTA (RA) completa. */
export function carAppCompleteCount(env = process.env) {
  const cat = appCatalog(env);
  if (!cat.ok) return { count: 0, missing: [] };
  const missing = [];
  let count = 0;
  for (const c of cat.cars) {
    if (!c || !c.name) continue;
    const s = carAppSpecsOf(c.name, env);
    if (s?.torqueCurve && s.torque != null && s.mass != null) count++;
    else missing.push(c.name);
  }
  return { count, missing };
}

/** Statistiche di copertura del catalogo dell'app (per lo stato del cruscotto). */
export function appStats(env = process.env) {
  const cat = appCatalog(env);
  if (!cat.ok) return { ok: false, cars: 0, withCurve: 0, complete: 0 };
  const cars = cat.cars;
  const withCurve = cars.filter((c) => Array.isArray(c.curve) && c.curve.length > 1).length;
  const complete = carAppCompleteCount(env);
  return { ok: true, cars: cars.length, withCurve, complete: complete.count };
}

/* ------------------------------------------------------------------ */
/* la tessera del livello: VERA col ponte, STIMA altrimenti            */
/* ------------------------------------------------------------------ */

// L'unico paio (livello, soglia) OSSERVATO sul vivo nel journal (31/10):
// Ace/Fuoriclasse — floor 490 rep, colore #f5c542 (il giallo "Ace" delle
// note di release 1.0.2). Ogni altra soglia NON esiste ancora per noi:
// inventarla sarebbe la seconda verità.
export const APP_LEVEL_FLOOR_ACE = 490;
export const APP_LEVEL_COLOR_ACE = '#f5c542';

/**
 * La tessera del livello pilota, secondo «una sola verità»:
 *   • App installata      → { name, color, source:'app' } dal journal
 *     pd-home (profile.level, la 1.0.2 la scrive insieme al colore);
 *   • App assente         → SOLO la stima difendibile: reputazione della
 *     NOSTRA carriera ≥ 490 (la soglia osservata) → Fuoriclasse giallo,
 *     source:'stima'. Sotto la soglia: null — niente chip, niente buffo.
 */
export function appLevelBadge(rep, env = process.env) {
  const home = appHome(env);
  const lvl = home.ok ? home.profile?.level ?? null : null;
  if (lvl?.name && lvl?.color)
    return { name: String(lvl.name), color: String(lvl.color), source: 'app', pct: lvl.pct ?? null };
  const r = Number(rep) || 0;
  if (r >= APP_LEVEL_FLOOR_ACE)
    return { name: tr({ it: 'Fuoriclasse', en: 'Ace' }), color: APP_LEVEL_COLOR_ACE, source: 'stima', pct: null };
  return null;
}

export function appOverview(env = process.env) {
  const root = appRoot(env);
  const nostro = !root ? journalNostro(env) : null;   // 2/11: app del gioco non installata → calendario dal mirror nostro
  if (!root && !nostro) return { ok: false, reason: 'not-installed' };
  const cal = appCalendar(env);
  const next = appNextRace(env);
  const cat = appCatalog(env);
  const led = appLedger(env);
  const teams = appTeams(env);
  const hist = appHistory(env);
  const home = appHome(env);
  return {
    ok: true, root, mirror: !root,    // 2/11: root null → la sorgente è il journal NOSTRO
    next,   // la scheda della prossima gara (wet → tips)
    stats: appStats(env),
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
    at: { home: journalStamp('home', env), calendar: cal.mirror ? journalNostroStamp(env) : journalStamp('calendar', env), catalog: journalStamp('catalog', env) },
  };
}
