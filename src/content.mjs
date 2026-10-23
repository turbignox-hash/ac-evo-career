// content.mjs — catalogo dei contenuti visti nell'installazione e verifica della scala carriera.
//
// Assetto Corsa EVO tiene il contenuto ufficiale dentro content.kspkg (non leggibile come cartella),
// quindi il catalogo si ricostruisce da tre fonti complementari:
//   1. i file che il gioco scrive (log, season definition, driver manager, impostazioni)
//   2. gli ID auto (famiglia ks_*) citati da qualunque file di gioco (es. CarMirrors)
//   3. il catalogo ufficiale del server dedicato (cars.json + events_race_weekend.json),
//      normalizzato per nome ("Porsche 911 GT3 RS (992)" → "porsche911gt3rs992")
// Le piste della scala (es. "redbull_ring") vengono confrontate in modo tollerante col
// nome leggibile ("Red Bull Ring"): match se l'uno contiene l'altro, spazi/punteggiatura a parte.

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { recordWarning } from './warnings.mjs';
import { isDir } from './paths.mjs';
import { loadCatalog } from './catalog.mjs';

const CONTENT_RE = /content[\\/]+(cars|tracks)[\\/]+([A-Za-z0-9_]+)/g;
const KS_CAR_RE = /\b(ks_[a-z0-9_]{4,50})\b/g;
const IGNORED = new Set(['common_assets', 'common_phsx', 'interns', 'commos', 'commod']);

const normId = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const SKIP_DIRS = new Set(['Replay']);

function walk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(p, depth + 1, out);
    } else if (entry.isFile()) {
      out.push(p);
    }
  }
  return out;
}

/** Estrae gli ID di auto e piste dai file dati dell'installazione. */
export function scanContent(paths) {
  const cars = new Set();
  const tracks = new Set();
  const carNames = new Set(); // nomi ufficiali normalizzati (dal catalogo del server)
  const sources = new Map();

  const dirs = [...paths.dataDirs];
  for (const d of dirs) {
    for (const file of walk(d)) {
      let size = 0;
      try { size = statSync(file).size; } catch { continue; }
      if (size > 40 * 1024 * 1024) continue; // evita dump enormi
      let text;
      try { text = readFileSync(file, 'latin1'); } catch { continue; }
      const seen = [];
      for (const m of text.matchAll(CONTENT_RE)) {
        const kind = m[1] === 'cars' ? 'car' : 'track';
        const id = m[2];
        if (IGNORED.has(id)) continue;
        (kind === 'car' ? cars : tracks).add(id);
        seen.push(id);
      }
      // gli ID auto della famiglia ks_* citati dal gioco sono auto reali dell'installazione
      for (const m of text.matchAll(KS_CAR_RE)) {
        if (!IGNORED.has(m[1])) cars.add(m[1]);
      }
      if (seen.length) sources.set(file.replace(paths.primary, '.'), [...new Set(seen)].length);
    }
  }

  // catalogo ufficiale del server dedicato: nomi normalizzati come chiavi
  try {
    const catalog = loadCatalog(paths);
    if (catalog.serverFound) {
      for (const c of catalog.cars) carNames.add(normId(c.name));
      for (const t of catalog.tracks) tracks.add(normId(t.name));
    }
  } catch (e) {
    recordWarning('content.catalog', 'catalogo server non leggibile (continuo senza): ' + (e?.message ?? ''));
  }

  return { cars, tracks, carNames, sources };
}

/*
 * CACHE del catalogo per il server GUI.
 * scanContent cammina RICORSIVAMENTE l'intera cartella dati di EVO leggendo e
 * analizzando con regex ogni file <40MB: costoso, e /api/boot lo chiamava ad
 * OGNI caricamento di pagina. Per la GUI basta una copia fresca: qui una cache
 * TTL breve (default 30s, regolabile con ACE_CONTENT_TTL), chiave = cartelle
 * dati scandite. La CLI NON lo usa (comandi di consapevolezza: vogliono il
 * ritorno fresco) e continua su scanContent diretto.
 */
const _contentCache = new Map(); // key (dirs) → { at, val }
export function scanContentCached(paths, { ttlMs = Number(process.env.ACE_CONTENT_TTL) * 1000 || 30_000 } = {}) {
  const key = (paths.dataDirs ?? []).join('|');
  const hit = _contentCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.val;
  const val = scanContent(paths);
  _contentCache.set(key, { at: Date.now(), val });
  return val;
}

/** Svuota la cache del catalogo (per i test). */
export function contentCacheClear() { _contentCache.clear(); }

/** Distanza di Levenshtein, per suggerire l'ID giusto quando uno non esiste. */
export function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** I tre ID più simili a uno sconosciuto. */
export function closest(id, pool, count = 3) {
  const lower = String(id).toLowerCase();
  const scored = [...pool].map((candidate) => {
    const cl = candidate.toLowerCase();
    let score = levenshtein(lower, cl);
    if (cl.includes(lower) || lower.includes(cl)) score -= 3;
    return { candidate, score };
  });
  scored.sort((x, y) => x.score - y.score);
  return scored.slice(0, count).map((s) => s.candidate);
}

/** Match auto: ID esatto (ks_* o preset_*) oppure il nome dichiarato della scala esiste nel catalogo.
 *  Esportato per il gate delle GRIGLIE DI FABBRICA (grid-apply.mjs: una griglia
 *  spedita col programma va giudicata con gli STESSI criteri di validateLadder). */
export function carExists(id, ladder, content) {
  if (content.cars.has(id)) return true;
  const disp = ladder.contentNames?.cars?.[id];
  if (disp && content.carNames?.size) {
    const n = normId(disp);
    if (n) {
      for (const c of content.carNames) if (c === n || c.includes(n) || n.includes(c)) return true;
    }
  }
  return false;
}

/** Match tollerante per le piste: "redbull_ring" combacia con "Red Bull Ring". */
function trackExists(id, pool) {
  if (pool.has(id)) return true;
  const n = normId(id);
  if (!n) return false;
  for (const p of pool) {
    const pn = normId(p);
    if (pn === n || pn.includes(n) || n.includes(pn)) return true;
  }
  return false;
}

/**
 * Verifica ogni nodo della scala: auto e piste esistono nell'installazione?
 * Restituisce la lista dei problemi con i suggerimenti.
 */
export function validateLadder(ladder, content) {
  const issues = [];
  for (const node of ladder.nodes) {
    for (const car of node.cars ?? []) {
      if (!carExists(car, ladder, content)) {
        issues.push({ node: node.nodeId, kind: 'car', id: car, display: ladder.contentNames?.cars?.[car] ?? car, suggestions: closest(car, content.cars) });
      }
    }
    for (const round of node.calendar ?? []) {
      if (!trackExists(round.track, content.tracks)) {
        issues.push({ node: node.nodeId, kind: 'track', id: round.track, display: ladder.contentNames?.tracks?.[round.track] ?? round.track, suggestions: closest(round.track, content.tracks) });
      }
    }
    if (!ladder.pointsSystems[node.points]) {
      issues.push({ node: node.nodeId, kind: 'points', id: node.points, display: node.points, suggestions: Object.keys(ladder.pointsSystems) });
    }
    if (!ladder.profiles[node.profile]) {
      issues.push({ node: node.nodeId, kind: 'profile', id: node.profile, display: node.profile, suggestions: Object.keys(ladder.profiles) });
    }
  }
  // gate verso nodi inesistenti = carriera bloccata
  const ids = new Set(ladder.nodes.map((n) => n.nodeId));
  for (const node of ladder.nodes) {
    const req = node.requires?.nodeId;
    if (req && !ids.has(req)) {
      issues.push({ node: node.nodeId, kind: 'gate', id: req, display: `richiede ${req}`, suggestions: closest(req, ids) });
    }
  }
  return issues;
}

/** Ricerca nel catalogo: ID e nomi visualizzati. */
export function searchContent(content, ladder, term) {
  const needle = term.toLowerCase();
  const cars = [...content.cars].filter((id) => id.toLowerCase().includes(needle) || (ladder.contentNames?.cars?.[id] ?? '').toLowerCase().includes(needle));
  const tracks = [...content.tracks].filter((id) => id.toLowerCase().includes(needle) || (ladder.contentNames?.tracks?.[id] ?? '').toLowerCase().includes(needle));
  return { cars, tracks };
}

export { isDir, basename, join };
