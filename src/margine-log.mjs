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
          // i giri della finestra, settore per settore: serve alla COSTANZA
          // (quanto ballano i settori tra un giro e l'altro) e, col numero di
          // giro, a separare gli stint. `t` = ora dell'ultimo settore del giro.
          giriSettori: fratrie.map((x) => ({ s: x.s, lap: x.lap, t: x.t })),
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

/* ================================================================== */
/* COSTANZA SUI SETTORI (6/11, richiesta Mauro: «la costanza sui       */
/* settori tra i giri, non solo il miglior giro»)                      */
/* ================================================================== */

const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;
/** Deviazione standard CAMPIONARIA. Sotto 3 valori non è statistica: null. */
function sdSample(vals) {
  if (vals.length < 3) return null;
  const m = meanOf(vals);
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1));
}

/**
 * LA PENDENZA di un settore giro dopo giro (6/11): regressione lineare ai
 * minimi quadrati con x = posizione del giro dentro lo stint (0, 1, 2…).
 * Ritorna ms per giro: positivo = il settore CRESCE (si perde tempo), negativo
 * = cala. Sotto 3 giri resta null: con due punti la retta passa sempre e un
 * numero lì sarebbe rumore spacciato per degrado — la stessa regola della σ.
 */
function pendenzaPerGiro(vals) {
  if (vals.length < 3) return null;
  const mx = (vals.length - 1) / 2;
  const my = meanOf(vals);
  let num = 0;
  let den = 0;
  for (let i = 0; i < vals.length; i++) {
    num += (i - mx) * (vals[i] - my);
    den += (i - mx) ** 2;
  }
  return num / den;
}

/** La pendenza di OGNI settore dentro lo stint, più quella della somma dei
 *  settori (il giro intero): quanto cresce il settore a ogni giro, misurato
 *  sui giri che il log porta davvero. */
function pendenzaStint(giri) {
  const perSettore = [0, 1, 2].map((i) => {
    const vals = giri.map((g) => g.s[i]);
    return {
      settore: i + 1,
      giri: vals.length,
      pendenzaMsGiro: pendenzaPerGiro(vals),
      primoMs: vals[0],
      ultimoMs: vals[vals.length - 1],
    };
  });
  const tot = giri.map((g) => g.s.reduce((a, b) => a + b, 0));
  return {
    giri: giri.length,
    perSettore,
    totale: {
      giri: tot.length,
      pendenzaMsGiro: pendenzaPerGiro(tot),
      primoMs: tot[0],
      ultimoMs: tot[tot.length - 1],
    },
  };
}

/**
 * La costanza settore per settore, dai giri veri: per ogni settore il migliore,
 * la media, il peggiore, l'escursione (peggiore − migliore), la deviazione
 * standard e la costanza % (σ/media, la stessa unità del debrief degli stint).
 * Sotto 3 giri σ e costanza % restano null — con due giri la statistica non
 * esiste, e un numero lì sarebbe rumore spacciato per misura. Nessun giudizio
 * («buono/cattivo»): solo i numeri che il log porta.
 */
export function costanzaSettori(giriSettori) {
  // accetta sia le triple grezze sia i giri completi { s, lap, t }
  const giri = (Array.isArray(giriSettori) ? giriSettori : [])
    .map((g) => (Array.isArray(g) ? g : g?.s))
    .filter((s) => Array.isArray(s) && s.length === 3 && s.every((v) => Number.isFinite(v) && v > 1000));
  if (!giri.length) return null;
  const perSettore = [0, 1, 2].map((i) => {
    const vals = giri.map((g) => g[i]);
    const media = meanOf(vals);
    const sigma = sdSample(vals);
    const migliore = Math.min(...vals);
    const peggiore = Math.max(...vals);
    return {
      settore: i + 1,
      giri: vals.length,
      miglioreMs: migliore,
      mediaMs: media,
      peggioreMs: peggiore,
      escursioneMs: peggiore - migliore,
      sigmaMs: sigma,
      costanzaPct: sigma == null ? null : (sigma / media) * 100,
    };
  });
  const totali = giri.map((g) => g.reduce((a, b) => a + b, 0));
  const mediaTot = meanOf(totali);
  const sigmaTot = sdSample(totali);
  return {
    giri: giri.length,
    perSettore,
    totale: {
      miglioreMs: Math.min(...totali),
      mediaMs: mediaTot,
      peggioreMs: Math.max(...totali),
      escursioneMs: Math.max(...totali) - Math.min(...totali),
      sigmaMs: sigmaTot,
      costanzaPct: sigmaTot == null ? null : (sigmaTot / mediaTot) * 100,
    },
  };
}

/**
 * La costanza dei settori di UNA sessione: la stessa finestra di log che dà il
 * margine vero (giro legato dalla tripla del file risultato, stessa pista,
 * giri entro 50%…130% del giro legato per non pesare uscite e errori).
 * `bestSplits` sono i tre settori del giro migliore del file risultato.
 * Ritorna null se i log di quella sessione non ci sono più (o non c'è il giro).
 */
export function costanzaSettoriDaLog(logsDirs, { track = null, bestSplits = null } = {}) {
  if (!Array.isArray(bestSplits) || bestSplits.length !== 3 || !bestSplits.every(Number.isFinite)) return null;
  let hit = null;
  try {
    hit = margineVeroDaLog(logsDirs, [{ chiave: 'costanza', track, bestSplits }]).get('costanza') ?? null;
  } catch {
    return null;
  }
  const stats = costanzaSettori(hit?.giriSettori);
  if (!stats) return null;
  // gli stint: la costanza spezzata dove c'è una sosta o un salto di giri
  return { ...stats, stinti: stintiSettori(hit.giriSettori), auto: hit.car ?? null, track: hit.track ?? null, type: hit.type ?? null };
}

/**
 * GLI STINT DAI GIRI DEL LOG (6/11, richiesta Mauro: «la costanza dei settori
 * separata per stint, così si vede se il degrado nasce in un settore preciso»).
 * Il log non porta il carburante, quindi la sosta si riconosce da due segnali
 * MISURATI:
 *   - la pausa: tra la fine di un giro e quella del successivo passa più del
 *     tempo del giro stesso; oltre `pausaMs` di differenza c'è una fermata
 *     (ai box o una pausa). Sui giri veri del 5–6/11 lo scarto normale sta
 *     entro ±700 ms: 10 s è una soglia larghissima, non un caso limite;
 *   - il salto di numero di giro: se un giro è stato scartato dalla finestra
 *     (fuori pista, uscita), tra due giri consecutivi del log il contatore
 *     salta e la continuità del run non è dimostrabile: si apre un nuovo stint
 *     invece di attribuire il salto a un degrado.
 * Nessun numero inventato: ogni stint porta i suoi giri e il conto della pausa
 * che l'ha aperto (`pausaPrimaMs`, null per il primo).
 */
export function stintiSettori(giriSettori, { pausaMs = 10000 } = {}) {
  const giri = (Array.isArray(giriSettori) ? giriSettori : [])
    .filter((g) => g && Array.isArray(g.s) && g.s.length === 3 && g.s.every((v) => Number.isFinite(v) && v > 1000))
    .slice()
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  if (!giri.length) return [];
  const somma = (g) => g.s.reduce((a, b) => a + b, 0);
  const gruppi = [];
  let cur = [giri[0]];
  let pausaApertura = null;
  for (let i = 1; i < giri.length; i++) {
    const prev = giri[i - 1];
    const g = giri[i];
    const pausa = Number.isFinite(prev.t) && Number.isFinite(g.t) ? (g.t - prev.t) - somma(g) : 0;
    const saltoGiri = Number.isFinite(prev.lap) && Number.isFinite(g.lap) && g.lap - prev.lap !== 1;
    if (saltoGiri || pausa >= pausaMs) {
      gruppi.push({ giri: cur, pausaPrimaMs: pausaApertura });
      cur = [g];
      // il salto di giro porta via un giro intero: quel tempo non è una sosta,
      // quindi non si dichiara nessuna pausa (meglio null che un numero falso)
      pausaApertura = !saltoGiri && pausa >= pausaMs ? pausa : null;
    } else {
      cur.push(g);
    }
  }
  gruppi.push({ giri: cur, pausaPrimaMs: pausaApertura });
  return gruppi.map((gr, i) => ({
    numero: i + 1,
    giri: gr.giri.length,
    fromLap: gr.giri[0].lap ?? null,
    toLap: gr.giri[gr.giri.length - 1].lap ?? null,
    pausaPrimaMs: gr.pausaPrimaMs,
    costanza: costanzaSettori(gr.giri),
    pendenza: pendenzaStint(gr.giri),
  }));
}
