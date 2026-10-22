// grid-calib.mjs — la CALIBRAZIONE che si paga da sola, dai risultati reali.
//
// Lezione del 19/10/2026: ogni supplemento per-traccia e ogni campo AI escrito
// a mano è stato dedotto da gare GIÀ CORSO (perTraccia COTA da 1629+1701,
// Sebring da 1755, aiStandard da 1558 a Brands). Ma la deduzione era a mano:
// filter gap, mediana best, caloletta pendenza, apporne su grid-classes.json.
// Questo modulo automatizza LESSONEDELLE gare:
//
//   A ogni import riuscito (runImport → recordRaceFromResult) il risultati grezzo
//   viene ANALIZZATO e APPESO a data/grid-calibrazione.json:
//     • per-auto: mediana del best-lap di ogni modello contro l'auto BASE della
//       classe + giri completati (il delta negativo = il modello sfugge);
//     • campo AI: quante AI davanti/dietro, la tua media contro la campo, il
//       margine sulla P2 quando vinchi.
//   e PROPONE:
//     • aggiustamenti del campo AI della classe (interval 21/22, base o
//       per-traccia, da cls.aiStandard / perTraccia[...] aiStandard);
//     • supplementi per-traccia immanito alla horizon: anche limiti __cap
//       del gioco, la proposta NON es conclude nulla ma è scritta nel evento;
//     • CONVALIDA: cere onde consistenti sulla STESSA pista alzano il
//       punteggio di confidenza → `griglia-calib --convalida` imposta la
//       corrispondente perTraccia.convalidato = true (una sola leva,
//       sotto il tuo comando: nulla viene stampo a disturbo).
//
// Il file calibrazione è SOLO APPEND + letture: tocca né carriera né customgrid.
// Le proposte restano proposte finché tu non esegui il comando che portano.

import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr } from './lang.mjs';
import { lapToMs, positionBase } from './results.mjs';
import { loadClasses, perTrackKey } from './gridbuilder.mjs';
import { readCells, DEFAULT_FILE as GRID_FILE } from '../tools/grid-balance.mjs';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);
// EVO_DATA_DIR: solo per i test (ridirige il registro in una cartella temporanea)
const DATA_DIR = process.env.EVO_DATA_DIR ?? join(PROJECT, 'data');
const CALIB_FILE = () => join(DATA_DIR, 'grid-calibrazione.json');
const CLASSES_FILE = join(PROJECT, 'data', 'grid-classes.json');
const BACKUP_DIR = join(DATA_DIR, 'backups');

const TOL_SEC = 0.8;         // "raggiunto" se il penalizzato sta entro quest'delta dalla base
const TOL_SPREAD_SEC = 1.5;  // spread mediana del campo considerato compatto
const PENDENZA_STD = 0.57;   // s/% di penalità, da 19/10 (Brands ~0.55, Sebring ~0.57) — sovrascrivibile per classe
const OBS_ALTA = 2;          // osservazioni coerenti par convincere

/* ---------- nomi auto: match per classe con lo stesso filtro del gioco ---------- */

const strip = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '')
  .toLowerCase();

/** L'etichetta auto COMPLETA di marchio, come nel risultato EVO ("Mazda MX-5 ND Cup"). */
function carLabelOf(d) {
  if (!d) return null;
  if (d.car_name && d.car_brand && String(d.car_name).toLowerCase().startsWith(String(d.car_brand).toLowerCase())) return d.car_name;
  return `${d.car_brand ?? ''} ${d.car_name ?? ''}`.trim() || null;
}

/** Classe combaciante per NOMI AUTI (il risultato non contiene i preset). */
export function matchClassByCars(classes, carLabels) {
  const labels = [...new Set(carLabels.filter(Boolean).map((s) => strip(s)))];
  if (!labels.length) return null;
  let best = null;
  for (const [id, cls] of Object.entries(classes.classi ?? {})) {
    const hits = (cls.regole ?? []).filter((r) => r.auto && labels.includes(strip(r.auto))).length;
    if (hits >= 2 && (!best || hits > best.hits)) best = { id, cls, hits };
  }
  return best;
}

const median = (vals) => {
  const v = vals.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
const sec = (ms) => ms == null ? null : Math.round(ms / 10) / 100;
const fmt = (v) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + 's';

/** Campi AI attivi della classe su quella pista (per-traccia poi classe). */
export function aiRangeOf(cls, trackRef) {
  if (!cls) return null;
  const trk = perTrackKey(cls, trackRef);
  const from = trk ? cls.perTraccia?.[trk]?.aiStandard : null;
  const ai = from ?? cls.aiStandard ?? null;
  return Array.isArray(ai) && ai.length === 2 ? { ai, origine: from ? `per-traccia "${trk}"` : 'standard della classe', trk } : null;
}

/** Regola applicata a quell'auto (con override per-traccia del restrictor) */
function ruleFor(cls, label, trackRef) {
  const lab = strip(label);
  const r = (cls?.regole ?? []).find((x) => x.auto && strip(x.auto) === lab);
  if (!r) return null;
  const trk = trackRef ? perTrackKey(cls, trackRef) : null;
  const ov = trk ? cls.perTraccia?.[trk]?.restrictorPct : null;
  const pct = (ov && r.preset != null && ov[r.preset] != null) ? ov[r.preset] : (r.restrictorPct ?? 0);
  const caps = cls?.LIMITI_GIOCO ?? {};
  const capKg = caps.ballastMaxKg ?? 100, capPct = caps.restrictorMaxPct ?? 20;
  return {
    auto: r.auto, preset: r.preset ?? null, kg: r.ballastKg ?? 0, pct,
    base: label === (cls?.autoBase ?? null),
    capRaggiunto: (r.ballastKg ?? 0) >= capKg && pct >= capPct,
    capKg, capPct,
  };
}

const toMs = (t) => { // i total_time di EVO arrivano h:mm:ss.d o m:ss.d
  const m = String(t ?? '').match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$|^(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return m[1] != null ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 : (+m[4] * 60 + +m[5]) * 1000;
};

/* ---------- l'analisi di UNA gara (pura) ---------- */
/**
 * `result` è il file sessionresults grezzo; `playerDriver` l'oggetto tuo (da findPlayerDriver).
 * Ritorna { evento, proposte } — evento appese, proposte riassunte.
 */
export function analyzeRace(result, { track = null, playerDriver = null, customgrid = null, sourceFile = null } = {}) {
  const drivers = result?.drivers ?? [];
  if (!drivers.length) return { evento: null, proposte: [] };
  const classes = loadClasses();
  const carLabels = drivers.map(carLabelOf);
  const matched = matchClassByCars(classes, carLabels);
  const evento = {
    at: new Date().toISOString(),
    file: sourceFile,
    pista: track ?? result?.track ?? null,
    classe: null,
    aiCampo: null,
    campo: null,
    perAuto: [],
    segnale: { tipo: 'classe-sconosciuta', proposte: [] },
  };
  if (!matched) return { evento, proposte: [] };
  evento.classe = matched.id;

  // campo AI come scritto nel customgrid (se leggibile), con origine dichiarata
  let aiRead = null;
  if (typeof customgrid === 'string') {
    try {
      const st = readCells(readFileSync(customgrid));
      if (st.aiMin != null && st.aiMax != null) aiRead = [st.aiMin, st.aiMax];
    } catch { /* file assente o illeggibile: si usa quello della classe */ }
  }
  // per il CAMPO AI conta prima il range REALE nel customgrid (i slider per-serie dell'utente
  // non seguono la classe); il range della classe è il fallback quando il file non si legge
  const aiRange = (aiRead ? { ai: aiRead, origine: 'customgrid' } : null) ?? aiRangeOf(matched.cls, track ?? result?.track);
  evento.aiCampo = {
    visDa: aiRange ? aiRange.ai[0] : (aiRead ? aiRead[0] : null),
    visA: aiRange ? aiRange.ai[1] : (aiRead ? aiRead[1] : null),
    origine: aiRange?.origine ?? (aiRead ? 'customgrid' : null),
  };

  // --- per-auto: mediana best-lap contro la base ---
  const { zeroBased } = positionBase(result);
  const posOf = (p) => (zeroBased ? Number(p) + 1 : Number(p));
  // il TURNO del pallino non basta: il tuo pilota spesso non lo porta ("senza contrassegno AI")
  const isAi = (d) => /^[•\u2022]/.test(String(d.driver_name ?? '').trim()) && d !== playerDriver;
  const aiRows = drivers.filter((d) => isAi(d));
  const byLabel = new Map();
  for (const d of aiRows) {
    if (!d.best_lap) continue;
    const ms = lapToMs(d.best_lap);
    if (!Number.isFinite(ms)) continue;
    const label = carLabelOf(d) ?? '?';
    const e = byLabel.get(label) ?? { auto: label, giri: [], best: [] };
    e.giri.push(Number(d.laps ?? 0) || 0);
    e.best.push(ms);
    byLabel.set(label, e);
  }
  // la base è l'autoBase della classe: se nessun AI l'ha girata non si può dire nulla sul delta
  const baseMedian = byLabel.get(matched.cls?.autoBase ?? '') ? median(byLabel.get(matched.cls.autoBase).best) : null;
  const rows = [];
  for (const [label, e] of byLabel) {
    const rule = ruleFor(matched.cls, label, track) ?? { auto: label, preset: null, kg: 0, pct: 0, base: false, capRaggiunto: false };
    const medSec = sec(median(e.best));
    rows.push({
      auto: label, preset: rule.preset, kg: rule.kg, pct: rule.pct, base: rule.base,
      giri: Math.max(0, ...e.giri), bestMedSec: medSec,
      deltaVsBaseSec: (baseMedian != null && medSec != null) ? sec(medSec * 1000 - baseMedian) : null,
      capRaggiunto: rule.capRaggiunto === true,
    });
  }
  rows.sort((a, b) => (a.deltaVsBaseSec ?? 0) - (b.deltaVsBaseSec ?? 0));
  evento.perAuto = rows;
  evento.campoSpreadSec = rows.length > 1
    ? sec((rows[rows.length - 1].bestMedSec ?? 0) - (rows[0].bestMedSec ?? 0))
    : null;

  // --- il tuo pilota contro il campo ---
  if (playerDriver) {
    const myBest = lapToMs(playerDriver.best_lap);
    const aiMed = median(aiRows.map((d) => { const ms = lapToMs(d.best_lap); return Number.isFinite(ms) ? ms : undefined; }).filter(Number.isFinite));
    const dnf = !playerDriver.total_time || (Number(playerDriver.laps ?? 0) === 0);
    const myPos = dnf ? null : posOf(playerDriver.position);
    evento.campo = {
      miaPos: myPos, dnf, grid: drivers.length,
      aiTotale: aiRows.length,
      aiDavanti: aiRows.filter((d) => posOf(d.position) < (myPos ?? Infinity) && Number(d.laps ?? 0) > 0).length,
      giri: Number(playerDriver.laps ?? 0),
      miaBestSec: Number.isFinite(myBest) ? sec(myBest) : null,
      campoMedSec: sec(aiMed ?? null),
      campoVsMeSec: (Number.isFinite(myBest) && aiMed != null) ? sec(myBest - aiMed) : null,
      margineP2Sec: null,
    };
    // margine sulla P2 (solo se hai vinto): tempo P2 - tempo P1 dal file grezzo
    const starters = [...drivers].map((d) => ({ pos: posOf(d.position), time: toMs(d.total_time) }))
      .filter((d) => Number.isFinite(d.pos) && d.time != null).sort((a, b) => a.pos - b.pos);
    if (myPos === 1 && starters[0] && starters[1]) evento.campo.margineP2Sec = sec(starters[1].time - starters[0].time);
  }

  const proposte = buildProposte(evento, matched.cls, track ?? result?.track);
  evento.segnale = {
    tipo: segnaleTipo(evento, proposte),
    proposte,
  };
  return { evento, proposte };
}

/* ---------- le proposte ---------- */
function buildProposte(evento, cls, track) {
  const prop = [];
  const pendenza = cls?.pendenzaSecPerPct ?? PENDENZA_STD;
  const aiRange = aiRangeOf(cls, track);
  const ai = (evento.aiCampo?.visA != null) ? [evento.aiCampo.visDa, evento.aiCampo.visA] : (aiRange?.ai ?? null);
  const trackArg = track ? ` --track "${track}"` : '';
  const cmdAi = (lo, hi) => `node tools/grid-balance.mjs --serie ${evento.classe}${trackArg} --ai ${lo}-${hi}`;

  // A) CAMPO TROPPO FORTE: la mediana best dell'AI scappa davanti a te E almeno 2 AI
  // ti hanno battuto in gara (non è questione di auto: è lo slider)
  const f = evento.campo;
  if (f && !f.dnf && (f.campoVsMeSec ?? 0) >= 2 && (f.aiDavanti ?? 0) >= 2 && f.aiTotale >= 3 && ai) {
    const step = f.campoVsMeSec >= 8 ? 3 : f.campoVsMeSec >= 4 ? 2 : 1;
    const hi = ai[1] - step;
    const lo = Math.max(0, ai[0] - Math.max(0, (ai[0] + 1) - hi)); // se la cima è già a soffitto scende anche il piano
    const hi2 = Math.max(lo + 1, hi);
    const propostaAi = `${lo}-${hi2}`;
    if (propostaAi !== ai.join('-')) prop.push({
      leva: 'campo-ai', direzione: 'giù', da: ai.join('-'), a: propostaAi,
      perche: tr({ it: `campo troppo forte: mediana best AI ${fmt(f.campoVsMeSec)} sopra di te (P${f.miaPos}/${f.grid}, ${f.aiDavanti} AI davanti)`, en: `field too strong: median AI best ${fmt(f.campoVsMeSec)} above you (P${f.miaPos}/${f.grid}, ${f.aiDavanti} AI cars ahead)` }),
      comando: cmdAi(lo, hi2),
    });
  } else if (f && !f.dnf && f.miaPos === 1 && (f.margineP2Sec ?? 0) > 10 && ai && ai[1] < 100) {
    prop.push({
      leva: 'campo-ai', direzione: 'su', da: ai.join('-'), a: `${ai[0]}-${Math.min(100, ai[1] + 1)}`,
      perche: tr({ it: `vittoria con ${fmt(f.margineP2Sec)} sulla P2: campo troppo debole per la tua mano`, en: `win with a ${fmt(f.margineP2Sec)} gap on P2: field too weak for your hand` }),
      comando: cmdAi(ai[0], Math.min(100, ai[1] + 1)),
    });
  }

  // B) PER-AUTO: le penalizzate che TUTTAVIA sfuggono dalla base (mentre il cap non è raggiunto)
  const capPct = cls?.LIMITI_GIOCO?.restrictorMaxPct ?? 20;
  for (const r of evento.perAuto) {
    if (r.base || r.deltaVsBaseSec == null) continue;
    const sosta = r.pct > 0 || r.kg > 0;
    if (!sosta) continue;
    // cap raggiunto e sfugge ANCORA: l'unica leva che resta è l'esclusione (nota di classe 19/10 Sebring)
    if (r.capRaggiunto || r.pct >= capPct) {
      if (r.deltaVsBaseSec < -2 && r.preset) prop.push({
        leva: 'escludi', auto: r.auto, preset: r.preset, da: `${r.kg}kg/${capPct}% (cap)`, a: 'escludi dal pool',
        perche: `al cap e sfugge ancora: ${fmt(r.deltaVsBaseSec)} dalla base su ${evento.pista ?? '?'}`,
        comando: `grid-classes.json → perTraccia["${track}"].escludiAuto += "${r.preset}" · poi nel file: node tools/grid-balance.mjs --drop ${r.preset}`,
      });
      continue;
    }
    if (r.deltaVsBaseSec > -TOL_SEC) continue;                      // in pace con la base (o più lenta): si deve le regole
    const proposta = Math.min(capPct, Math.round((r.pct + ((-r.deltaVsBaseSec) / pendenza)) * 2) / 2);
    if (proposta <= r.pct) continue;
    prop.push({
      leva: 'perTraccia', auto: r.auto, da: `${r.kg}kg/${r.pct}%`, a: `${r.kg}kg/${proposta}%`,
      perche: `${fmt(r.deltaVsBaseSec)} dalla base su ${evento.pista ?? '?'}`,
      comando: `grid-classes.json → perTraccia["${track}"].restrictorPct["${r.preset ?? r.auto}"] = ${proposta} (ora ${r.pct})`,
    });
  }
  return prop;
}

function segnaleTipo(evento, proposte) {
  const campo = proposte.find((p) => p.leva === 'campo-ai');
  if (campo) return campo.direzione === 'su' ? 'campo-troppo-debole' : 'campo-troppo-forte';
  const perAuto = proposte.filter((p) => p.leva === 'perTraccia');
  if (perAuto.length) return 'auto-troppo-veloci';
  return 'in-tolleranza';
}

/* ---------- registro append-only ---------- */

function loadLog() {
  try {
    const j = JSON.parse(readFileSync(CALIB_FILE(), 'utf8'));
    if (j && Array.isArray(j.eventi)) return j;
  } catch { /* assente o guasto: si riparte puliti, MAI bloccare l'import */ }
  return {
    _readme: [
      'Registro della calibrazione dai risultati reali:append-only, scritto da recordRaceFromResult a ogni import.',
      'Un evento per gara: per-auto (mediana best vs base), campo vs te, proposte di campo-AI e perTraccia.',
      'La CONVALIDA per traccia si valuta con calibSummary (--convalida la stampa con confidenza: griglia-calib --convalida).',
    ],
    eventi: [],
  };
}

export function calibFile() { return CALIB_FILE(); }

/** Appende un evento (già analizzato) e ritorna il riepilogo breve. Processo libero da effetti. */
export function recordEvent(evento, { classesNow = null } = {}) {
  const log = loadLog();
  // stesso FILE = stessa gara: la carriera ha il ledger anti-doppioni, il registro
  // calibrazione non può doppia-registrare (gonferebbe la confidenza con gare finte)
  if (evento?.file != null) {
    const stesso = log.eventi.find((e) => e.file === evento.file);
    if (stesso) return brief(stesso, classesNow ?? loadClasses());
  }
  log.eventi.push(evento);
  try { writeJsonAtomic(CALIB_FILE(), log); } catch { /* mai bloccare l'import */ }
  return brief(evento, classesNow ?? loadClasses());
}

/** Punto d'aggancio per runImport: analizza il grezzo e appende. Mai eccezioni fuori. */
export function recordRaceFromResult({ result, playerDriver, track = null, gridFile = GRID_FILE, sourceFile = null } = {}) {
  try {
    const { evento, proposte } = analyzeRace(result, { track, playerDriver, customgrid: gridFile, sourceFile });
    if (!evento) return null;
    return recordEvent(evento);
  } catch (e) {
    try { console.error('[grid-calib]', e.message); } catch {}
    return null;
  }
}

export function resetCalib() {
  try { writeJsonAtomic(CALIB_FILE(), { _readme: [], eventi: [] }); } catch {}
}

/* ---------- confidenza e riepilogo ---------- */

/** Un evento "vuole" la convalida se il campo penalizzato sta in pace con la base. */
function eventoOk(evento) {
  if (!evento || !Array.isArray(evento.perAuto)) return false;
  const penalizzate = evento.perAuto.filter((r) => (r.pct > 0 || r.kg > 0) && !r.capRaggiunto);
  if (!penalizzate.length) return false; // tutto al cap o base nuda: non dice niente sui supplementi
  return penalizzate.every((r) => (r.deltaVsBaseSec == null || r.deltaVsBaseSec >= -TOL_SEC));
}

/** Punteggio di confidenza per classe+traccia: { obs, ok, fino, confidenza, suggerisciConvalida } */
export function confidenzaOf(eventi, classe, trkKey) {
  const ev = (eventi ?? []).filter((e) => e.classe === classe && trkKeyOf(e) === trkKey);
  const ok = ev.filter(eventoOk).length;
  const obs = ev.length;
  let confidenza = 'nessuna';
  if (obs >= OBS_ALTA && obs === ok) confidenza = 'alta';
  else if (obs >= 1 && ok / obs >= 0.5) confidenza = 'media';
  else if (obs >= 1) confidenza = 'bassa';
  return { classe, trkKey, obs, ok, confidenza, suggerisciConvalida: confidenza === 'alta' };
}

const trkKeyOf = (e) => e.trkKey ?? e.pista ?? '(sconosciuta)';

/** Chiave traccia canonica per classe: perTraccia combaciata, altrimenti la pista grezza. */
export function trkKeyFor(cls, track) {
  return (track && cls ? perTrackKey(cls, track) : null) ?? (track ? track : '(sconosciuta)');
}

/**
 * Riepilogo per la CLI e la GUI: per classe+traccia obs/confidenza, i delta per-auto
 * medi, l'ultima proposta e le classi che GUADAGNERE× la convalida.
 */
export function calibSummary(classes = loadClasses()) {
  const log = (() => { try { return loadLog(); } catch { return { eventi: [] }; } })();
  const eventi = log.eventi ?? [];
  const out = [];
  const gruppi = new Map();
  for (const e of eventi) {
    if (!e.classe) continue;
    const cls = classes.classi?.[e.classe];
    const key = `${e.classe}||${trkKeyFor(cls, e.pista)}`;
    if (!gruppi.has(key)) gruppi.set(key, { classe: e.classe, trkKey: trkKeyFor(cls, e.pista), eventi: [] });
    gruppi.get(key).eventi.push(e);
  }
  for (const { classe, trkKey, eventi: ev } of gruppi.values()) {
    const cls = classes.classi?.[classe];
    const c = confidenzaOf(ev, classe, trkKey);
    const perAuto = {};
    for (const e of ev) for (const r of (e.perAuto ?? [])) {
      if (r.base || r.deltaVsBaseSec == null) continue;
      const k = r.auto;
      (perAuto[k] ??= { deltas: [] }).deltas.push(r.deltaVsBaseSec);
    }
    for (const k of Object.keys(perAuto)) perAuto[k].medSec = median(perAuto[k].deltas.map((v) => v));
    const ult = ev[ev.length - 1] ?? null;
    const perTraccia = cls?.perTraccia?.[trkKey];
    out.push({
      classe, trkKey, obs: c.obs, ok: c.ok, confidenza: c.confidenza,
      convalidatoAdesso: perTraccia?.convalidato === true || (cls?.convalidatoSu ?? []).some((s) => trkKey.toLowerCase()?.includes?.(String(s).toLowerCase())) || false,
      suggerisciConvalida: c.suggerisciConvalida && perTraccia?.convalidato !== true,
      perAuto: Object.entries(perAuto).map(([auto, v]) => ({ auto, medSec: v.medSec })).sort((a, b) => a.medSec - b.medSec),
      ultimaProposta: ult?.segnale?.proposte ?? [],
      ultimoAt: ult?.at ?? null,
    });
  }
  return { file: CALIB_FILE(), eventi: eventi.length, gruppi: out.sort((a, b) => String(b.ultimoAt ?? '').localeCompare(String(a.ultimoAt ?? ''))) };
}

function brief(evento, classes) {
  const cls = classes.classi?.[evento.classe];
  const trkKey = trkKeyFor(cls, evento.pista);
  const c = confidenzaOf(
    [...loadLog().eventi.filter((e) => e.classe === evento.classe && trkKeyOf(e) === trkKey)],
    evento.classe,
    trkKey,
  );
  return { classe: evento.classe, traccia: trkKey, segnale: evento.segnale.tipo, proposte: evento.segnale.proposte, confidenza: c.confidenza, obs: c.obs };
}

/* ---------- il timbro: --convalida ---------- */

/** imposta perTraccia[trkKey].convalidato = true SU classi con confidenza alta. Ritorna le firme applicate. */
export function appuntaConvalida({ classe = null, trkKey = null, dry = false } = {}) {
  const classes = loadClasses();
  const sum = calibSummary(classes);
  const messaggio = [], applicate = [];
  for (const g of sum.gruppi) {
    if (classe && g.classe !== classe) continue;
    if (trkKey && g.trkKey !== trkKey) continue;
    if (!g.suggerisciConvalida) continue;
    if (dry) { messaggio.push(`(dry) ${g.classe} · ${g.trkKey}: confidenza ${g.confidenza} su ${g.obs} gare → convalidato: true`); continue; }
    const cls = classes.classi[g.classe];
    cls.perTraccia ??= {};
    cls.perTraccia[g.trkKey] ??= {};
    cls.perTraccia[g.trkKey].convalidato = true;
    applicate.push({ classe: g.classe, trkKey: g.trkKey, obs: g.obs });
    messaggio.push(`✓ ${g.classe} · ${g.trkKey}: convalidato: true (${g.obs} gare coerenti)`);
  }
  if (!dry && applicate.length) {
    try { mkdirs(BACKUP_DIR); copyFileSync(CLASSES_FILE, join(BACKUP_DIR, `grid-classes.bak-${stamp()}.json`)); } catch { /* il backup non deve bloccare */ }
    writeJsonAtomic(CLASSES_FILE, classes);
  }
  return { applicate, messaggio };
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function mkdirs(p) { try { mkdirSync(p, { recursive: true }); } catch { /* pazienza */ } }
