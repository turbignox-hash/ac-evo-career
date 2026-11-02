/* margine-log.mjs — IL MARGINE VERO (3/11, domanda Mauro sul «margine a 0.00»).
   Il file risultato ha SOLO i settori del giro migliore (quindi giro teorico ≡
   best, vedasi la nota di tettoReport): nessun margine misurabile da lì.
   La fonte dei settori GIRO-PER-GIRO sono i LOG del gioco (Saved Games/ACE/Logs):
     «[ts] [gameplay] [info] Split completed for car <carId>: (M ms, splitindex N) lap:L»
   dove N = 0/1/2 (S1/S2/S3) e L = contatore giri della sessione (0 = giro di
   uscita, con righe dai valori cumulativi di inizio sessione: si scartano).
   Ogni apertura di weekend scrive «Game Started! … | <Pista> <Layout> <tipo> …»:
   i giri di quell'auto si riportano alla FINESTRA del marker che li precede —
   così le gare della stessa serate su piste diverse non si inquinano mai.
   Semantica del margine (coerente con il tetto): best = il giro che il GIOCO ha
   accreditato (la tripla del file risultato, già nell'entry dell'import);
   settori = minimo per settore sui giri segnati (lap ≥ 1) della finestra, con
   ogni settore entro 50%…130% del corrispondente del giro legato (freccia anti-
   rumore). Il margine può uscire NEGATIVO: significa che nel log c'è potenziale
   settoriale più veloce del giro che il gioco ha accreditato (es. ultimi giri
   andati a vigliettati/fuori pista ma con settori validi).
*/

import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { listFiles } from './paths.mjs';

const SPLIT_RE = /Split completed for car ([0-9a-fA-F-]+): \((\d+) ms, splitindex (\d+)\)/;
const TS_RE = /\[([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:.]+)\]/;
const SESSION_WORDS = ['Time Attack Practice', 'Hotlap', 'Practice', 'Qualifying', 'Warmup', 'Time Attack', 'Race'];
const LOG_CAP = 14; // gli ultimi log bastano: una serata di gare sta in 1-2 file
const CACHE_MAX = 24;

const _cache = new Map(); // file → { mtimeMs, size, val } come analyzeLd di motec.mjs

/** «2026-10-31 22:33:43.164» → ms (Date.UTC: i confronti restano interni al log) */
function tsToMs(s) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[T ]([0-9]{2}):([0-9]{2}):([0-9]{2})/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0;
}

/** Confronto pista tollerante: results «Kyalami» vs marker «Kyalami GP». */
function stessoCircuito(a, b) {
  const x = String(a ?? '').toLowerCase().trim();
  const y = String(b ?? '').toLowerCase().trim();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function tripleKey(s) {
  return s.join(':');
}

/** La riga di apertura del weekend: pista + tipo della PRIMA sessione. */
function parseStart(line) {
  const i = line.indexOf('Game Started!');
  if (i < 0) return null;
  const bar1 = line.indexOf('|', i);
  const bar2 = line.indexOf('|', bar1 + 1);
  if (bar1 < 0 || bar2 < 0 || bar2 <= bar1) return null;
  const desc = line.slice(bar1 + 1, bar2);
  const low = desc.toLowerCase();
  let at = desc.length;
  let type = null;
  for (const w of SESSION_WORDS) {
    const j = low.indexOf(w.toLowerCase());
    if (j >= 0 && j < at) { at = j; type = w; }
  }
  const ts = TS_RE.exec(line);
  return { t: ts ? tsToMs(ts[1]) : 0, track: desc.slice(0, at).trim(), type };
}

/** Tutta la materia di un log: marker di weekend + splits non duplicati per auto. */
function parseLog(content) {
  const markers = [];
  const raws = new Map(); // carId → [{ t, id, ms, lap }]
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(SPLIT_RE);
    if (m) {
      const ts = TS_RE.exec(line);
      const t = ts ? tsToMs(ts[1]) : 0;
      const car = m[1];
      const ev = { t, id: +m[3], ms: +m[2], lap: null };
      const lm = line.match(/lap:(\d+)/);
      if (lm) ev.lap = +lm[1];
      // deduplica: il gioco scrive la STESSA riga (auto, id, ms, ts) più volte di fila
      const arr = raws.get(car) ?? raws.set(car, []).get(car);
      const p = arr[arr.length - 1];
      if (p && p.t === t && p.id === ev.id && p.ms === ev.ms) continue;
      arr.push(ev);
      continue;
    }
    if (line.includes('Game Started!')) {
      const mk = parseStart(line);
      if (mk) markers.push(mk);
    }
  }
  markers.sort((a, b) => a.t - b.t);

  // giri per auto: id 0 apre, id 2 chiude; le righe lap:0 (uscita, con ms
  // cumulativi e incompleti) si perdono da sole: il giro senza i tre settori
  // non è misurabile e non entra.
  const sessIndex = (t) => {
    let k = -1;
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].t <= t) k = i; else break;
    }
    return k;
  };
  const laps = new Map();
  for (const [car, arr] of raws) {
    const ofCar = [];
    let cur = null;
    const push = () => {
      if (cur && cur.lap >= 1 && cur.s.every(Number.isFinite) && cur.s.every((v) => v > 1000)) ofCar.push(cur);
      cur = null;
    };
    for (const e of arr) {
      if (e.id === 0) push();
      if (e.id === 0) cur = { s: [e.ms, null, null], t: e.t, sIdx: sessIndex(e.t), lap: e.lap };
      else if (e.id === 1 && cur) { cur.s[1] = e.ms; cur.t = e.t; }
      else if (e.id === 2 && cur) { cur.s[2] = e.ms; cur.t = e.t; push(); }
    }
    if (ofCar.length) laps.set(car, ofCar);
  }
  return { markers, laps };
}

function parseLogFile(file) {
  const st = statSync(file);
  const mtimeMs = Math.round(st.mtimeMs);
  const hit = _cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs && hit.size === st.size) return hit.val;
  const val = parseLog(readFileSync(file, 'latin1'));
  _cache.set(file, { mtimeMs, size: st.size, val });
  if (_cache.size > CACHE_MAX) {
    for (const k of [..._cache.keys()].slice(0, _cache.size - CACHE_MAX)) _cache.delete(k);
  }
  return val;
}

/**
 * Il margine vero per una lista di richieste:
 *   richieste: [{ chiave, track, bestSplits: [s1ms, s2ms, s3ms] }]
 * Risponde Map(chiave → { margineMs, bestMs, settoriMs: [..], giri, car, track, type })
 * (le richieste senza abbinamento nel log restano fuori dalla Map).
 */
export function margineVeroDaLog(logsDirs, richieste) {
  const files = [];
  for (const d of logsDirs ?? []) {
    for (const f of listFiles(d)) {
      if (!/^log-[\d-]+\.txt$/i.test(basename(f))) continue;
      try { files.push({ f, mtime: statSync(f).mtimeMs }); } catch { /* il log è sparito: avanti */ }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  files.length = Math.min(files.length, LOG_CAP);

  const resto = new Map();
  for (const r of richieste ?? []) {
    if (!r || !Array.isArray(r.bestSplits) || r.bestSplits.length !== 3 || !r.bestSplits.every(Number.isFinite)) continue;
    resto.set(tripleKey(r.bestSplits), r);
  }

  const out = new Map();
  for (const { f } of files) {
    if (!resto.size) break;
    let parsed;
    try { parsed = parseLogFile(f); } catch { /* log illeggibile: il prossimo */ continue; }
    for (const [car, laps] of parsed.laps) {
      for (const lr of laps) {
        const req = resto.get(tripleKey(lr.s));
        if (!req) continue;
        const marker = parsed.markers[lr.sIdx];
        if (!stessoCircuito(marker?.track, req.track)) {
          // il giro legato esiste ma su un'altra pista (benchmark condiviso?): non è la nostra sessione
          continue;
        }
        // la finestra del marker che ospita il giro legato: SOLO giri della
        // stessa finestra, e ogni settore plausibile rispetto a quello legato
        const fratrie = laps.filter((x) => x.sIdx === lr.sIdx
          && [0, 1, 2].every((i) => x.s[i] >= 0.5 * lr.s[i] && x.s[i] <= 1.3 * lr.s[i]));
        if (!fratrie.length) continue;
        const settori = [0, 1, 2].map((i) => Math.min(...fratrie.map((x) => x.s[i])));
        const bestMs = req.bestSplits.reduce((a, b) => a + b, 0);
        out.set(req.chiave, {
          chiave: req.chiave,
          car,
          track: marker?.track ?? null,
          type: marker?.type ?? null,
          giri: fratrie.length,
          bestMs,
          settoriMs: settori,
          sommaMs: settori.reduce((a, b) => a + b, 0),
          margineMs: bestMs - settori.reduce((a, b) => a + b, 0),
        });
        resto.delete(req.chiave);
        if (!resto.size) return out;
      }
    }
  }
  return out;
}
