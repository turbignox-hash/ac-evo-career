// grid-guard.mjs — il GUARDIANO delle classi con regole non ancora convalidate.
//
// Chi spegne le luci a mezzanotte non deve ricordare a mano "analizza": il
// watcher, dopo aver incassato una gara, chiede a questo modulo se la classe
// Coinvolta ha regole NON convalidate sulla pista di quella gara. Se sì,
// propone la ricalibrazione CON i gap misurati in pista (centro = regola/base),
// così la decisione è un clic e non una carriera di memoria.
//
// Cosa rende una regola "convalidata" (dichiarato in grid-classes.json):
//   - regole BASE di classe:   "convalidatoSu": ["Brands Hatch", …] a livello classe
//   - supplementi perTraccia:  "convalidato": true dentro l'oggetto della traccia
// Senza queste firme la classe è DA CONVALIDARE (vedi strada-brands-9-10).
// Gare di calibrazione (bilanciamento uniforme: tutti allo stesso set o a zero)
// non producono proposta: il confronto fra modelli lì non misura niente.
//
// uso (da cli.mjs dopo un import, e nei test):
//   import { gridGuardProposal } from './grid-guard.mjs';
//   const p = gridGuardProposal(resultFile);
//   if (p) console.log(p.msg);
import { readFileSync } from 'node:fs';
import { sameTrack, sameCar } from './tracknames.mjs';
import { loadClasses } from './gridbuilder.mjs';

const msOf = (s) => { if (!s) return null; const m = s.match(/(\d+):(\d+)[.](\d+)/); return m ? +m[1] * 60000 + +m[2] * 1000 + +m[3] : null; };
const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const fmtLap = (v) => v == null ? '—' : `${Math.floor(v / 60000)}:${String(Math.floor((v % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor(v % 1000)).padStart(3, '0')}`;

/* ---------- misurazione dalla gara reale (file results) ---------- */
/** Mediana del best-lap per modello + ballast/penalità usati in gara. */
export function misureDaGara(result) {
  const rows = (result.drivers ?? []).filter((d) => d.ballast != null || d.restrictor != null);
  if (rows.length < 3) return null;                       // nonprofit: campione troppo piccolo
  const keys = new Set(rows.map((d) => `${d.ballast ?? 0}/${d.restrictor ?? 0}`));
  if (keys.size < 2) return null;                         // gara di calibrazione: ogni auto KO stesso set
  const perModello = {};
  for (const d of rows) {
    const modello = `${d.car_name}`.trim();
    const m = perModello[modello] ??= { n: 0, best: [], bal: new Set(), res: new Set() };
    m.n++;
    const b = msOf(d.best_lap); if (b) m.best.push(b);
    m.bal.add(`${d.ballast ?? 0}kg`); m.res.add(((d.restrictor ?? 0) * 100).toFixed(1).replace(/\.0$/, '') + '%');
  }
  const modelli = Object.entries(perModello).map(([auto, m]) => ({ auto, n: m.n, best: median(m.best), bal: [...m.bal].join('/'), res: [...m.res].join('/') })).filter((m) => m.best != null);
  if (modelli.length < 2) return null;
  return modelli.sort((a, b) => a.best - b.best);
}

/* ---------- match della classe ---------- */
/** La classe di grid-classes.json che copre più modelli della gara (≥2). */
export function matchClasse(modelli, classesDoc) {
  const CL = classesDoc?.classi ?? {};
  let best = null;
  for (const [id, c] of Object.entries(CL)) {
    const nHit = (c.regole ?? []).reduce((s, r) => s + (r.auto && modelli.some((m) => sameCar(m.auto, r.auto)) ? 1 : 0), 0);
    if (nHit >= 2 && (!best || nHit > best.nHit)) best = { id, cls: c, nHit };
  }
  return best;
}

/* ---------- stato di convalida ---------- */
/** null = convalidata (silenzio); stringa = perché NON è convalidata su questa pista. */
export function statoConvalida(classe, _id, track) {
  const per = classe.perTraccia ?? {};
  const trkKey = Object.keys(per).find((k) => !k.startsWith('_') && sameTrack(k, track));
  if (trkKey) {
    const ov = per[trkKey];
    if (ov?.convalidato === true) return null;   // supplementi da traccia già validati in pista
    return `i supplementi per-traccia "${trkKey}" non sono ancora convalidati in pista`;
  }
  if ((classe.convalidatoSu ?? []).some((t) => sameTrack(t, track))) return null;
  const su = (classe.convalidatoSu ?? []).map((t) => `"${t}"`).join(', ');
  return su
    ? `le regole base sono convalidate solo su ${su}, non su "${track}"`
    : 'la classe non ha ancora NISSUNA convalida in pista (ultima modifica senza gara di conferma)';
}

/* ---------- proposta ----------------------------------------------------- */
/**
 * Letto subito dopo un import (comando watch/import): file dei risultati,
 * matcha la classe e, se le sue regole non sono convalidate su QUESTA pista,
 * ritorna la proposta di ricalibrazione con i gap misurati; altrimenti null.
 * opts: { track?: override del nome pista, classes?: doc pre-caricato }
 */
export function gridGuardProposal(file, opts = {}) {
  let result;
  try { result = JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
  const track = opts.track ?? result.track ?? null;
  if (!track) return null;
  const classes = opts.classes ?? loadClasses();
  const modelli = misureDaGara(result);
  if (!modelli) return null;
  const matched = matchClasse(modelli, classes);
  if (!matched) return null;

  const motivo = statoConvalida(matched.cls, matched.id, track);
  if (!motivo) return null;

  // centro: il modello (pile vehicle) più vicino al set "base" (0/0 secondo le
  // regole); in sua mancanza il più veloce. Il gap utile è rispetto a QUELLO.
  const baseRule = (matched.cls.regole ?? []).find((r) => (r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0);
  const base = baseRule ? modelli.find((m) => sameCar(m.auto, baseRule.auto)) ?? modelli[0] : modelli[0];
  const scarto = 0.5; // soglia "a posto" in secondi
  const gaps = modelli.map((m) => ({ ...m, delta: (m.best - base.best) / 1000 }));
  const spread = (modelli[modelli.length - 1].best - modelli[0].best) / 1000;

  const righe = gaps.map((g) => `    ${g.auto.padEnd(30)} ${g.bal}/${g.res}  mediana ${fmtLap(g.best)}  ${((g.delta > 0.05 ? '+' : g.delta < -0.05 ? '' : '≈') + Math.abs(g.delta).toFixed(2) + 's').padStart(8)} dal centro${(baseRule && sameCar(g.auto, baseRule.auto)) ? '  ← centro' : ''}`);

  const fuori = gaps.filter((g) => Math.abs(g.delta) > scarto);
  const giudizio = spread <= 1.5
    ? `campo COMPATTO (${spread.toFixed(1)}s): propende per la convalida, solo conferma in pista`
    : fuori.length
      ? `sbilanciate: ${fuori.slice(0, 3).map((g) => `${g.auto} (${g.delta > 0 ? '+' : ''}${g.delta.toFixed(1)}s)`).join(' · ')}`
      : `campo largo ${spread.toFixed(1)}s ma nessun modello isolato`;

  const msg = [
    `⚠  ricalibrazione proposta — classe "${matched.id}" (${motivo})`,
    `    gara: ${track} · ${modelli.length} modelli, spread ${spread.toFixed(2)}s — ${giudizio}`,
    ...righe,
    `    → node tools/grid-tune.mjs --report 3  e, per afflare, grid-classes.json ("${matched.id}")`,
  ].join('\n');

  return { propose: true, classe: matched.id, track, motivo, spread, gaps, msg };
}

