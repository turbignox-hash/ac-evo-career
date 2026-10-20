// grid-restore.mjs — il ripristino del BILANCIO PERSO.
//
// Lezione del 19/10/2026 (weekend Sebring): il menu di EVO, risalvando il
// customgrid (p.e. al cambio di sede del weekend), PUÒ PERDERE le zavorre e
// le penalità delle celle (tornano 0/0) mentre il resto — AI 99-100, finestra
// PI, auto e piloti — salta intatto. La gara parte "nuda": il pool si spalanca
// e la calibrazione di classe non conta nulla.
//
// Questo modulo rileva il caso dal FILE (non dal gioco): se ≥minCells celle
// di una classe conocsciuta (match per preset, come fa gridbuilder) sono a
// 0/0 mentre le regole della classe le caricherebbero, ritorna la proposta
// con il comando ESATTO da rilanciare a EVO chiuso.
//
// 20/10/2026: anche il CAMPO AI (config 21/22) può perdersi/alterarsi al
// risalvataggio dal menu — la classe che lo PINNA (aiStandard) lo fa
// controllare da aiRangeProposal (il builder lo riscrive, ma il risalvataggio
// dal menu può arrivare DOPO).
//
// uso (da cli.mjs in watch/import):
//   import { zeroBalanceProposal, aiRangeProposal } from './grid-restore.mjs';
//   const p = zeroBalanceProposal(GRID_FILE, { track });
//   if (p) console.log(p.msg);
import { readFileSync } from 'node:fs';
import { decodeMsg, gridFileOf } from '../tools/evo-grid.mjs';
import { loadClasses } from './gridbuilder.mjs';

const f32of = (b) => (b && b.length >= 4) ? Buffer.from(b).readFloatLE(0) : null;

/** celle del customgrid come { name, mech, kg, pct } (dieci celle o niente). */
export function celleBilancio(file) {
  const g = gridFileOf(readFileSync(file));
  return g.cells.map((c) => {
    let mech = c.mechPreset ?? null, kg = 0, pct = 0;
    for (const f of decodeMsg(c.raw)) {
      if (f.field === 10) mech = decodeMsg(f.bytes).filter((x) => x.field === 1).map((x) => Buffer.from(x.bytes).toString('utf8'))[0] ?? mech;
      else if (f.field === 24) kg = Number(f.varint);
      else if (f.field === 25) pct = f32of(f.bytes) * 100 ?? 0;
    }
    return { name: c.carName ?? c.carId ?? '?', mech, kg, pct };
  });
}

/** classe combaciante SOLO per preset (logica condivisa dalle due vigie). */
function classMatch(cells) {
  const presets = [...new Set(cells.map((c) => c.mech).filter(Boolean))];
  const classes = loadClasses().classi ?? {};
  let best = null;
  for (const [id, cls] of Object.entries(classes)) {
    const hits = (cls.regole ?? []).filter((r) => r.preset && presets.includes(r.preset));
    if (hits.length >= 2 && (!best || hits.length > best.hits.length)) best = { id, cls, hits };
  }
  return best;
}

/**
 * null = niente da dire (o classe non nota, o bilancio in piedi).
 * `track` aggancia il supplemento per-traccia giusto al comando proposto.
 */
export function zeroBalanceProposal(file, { track = null, minCells = 3 } = {}) {
  let cells;
  try { cells = celleBilancio(file); } catch { return null; }
  if (!cells.length) return null;

  const best = classMatch(cells);
  if (!best) return null;

  const ruleByPreset = new Map((best.cls.regole ?? []).filter((r) => r.preset).map((r) => [r.preset, r]));
  const perse = cells.filter((c) => {
    const r = ruleByPreset.get(c.mech);
    return r && ((r.ballastKg ?? 0) > 0 || (r.restrictorPct ?? 0) > 0) && c.kg === 0 && c.pct === 0;
  });
  if (perse.length < Math.min(minCells, cells.length)) return null;

  const trackArg = track ? ` --track "${track}"` : '';
  const perModello = {};
  for (const c of perse) perModello[c.name] = (perModello[c.name] ?? 0) + 1;
  const elenco = Object.entries(perModello).map(([k, n]) => `${k}×${n}`).join(' · ');
  const msg = [
    `⚠  BILANCIO PERSO sul customgrid: ${perse.length}/${cells.length} celle della classe "${best.id}" sono a 0/0`,
    `   (il menu di EVO, risalvando il file, può perdere zavorre/penalità — verificato 19/10 a Sebring)`,
    `   auto nude: ${elenco}`,
    `   → chiudi EVO e rilancia:  node tools/grid-balance.mjs --serie ${best.id}${trackArg} --apply`,
  ].join('\n');
  return { classe: best.id, perse: perse.length, celle: cells.length, track, msg };
}

/* ---------- vigia sul CAMPO AI (config 21/22) ---------- */
/**
 * Come il campo 3 può perdere zavorre al risalvataggio dal menu, l'intervallo
 * AI (21/22) può perdersi o alterarsi. Confronta il range scritto nel file con
 * l'aiStandard della classe matchata (match per preset — e SOLO se la classe
 * PINNA il campo: senza aiStandard la vigia resta zitta) e segnala la differenza.
 * Ritorna { classe, atteso, trovato, msg } o null.
 */
export function aiRangeProposal(file) {
  try {
    const fields = decodeMsg(readFileSync(file));
    const f3 = fields.find((f) => f.field === 3 && f.wire === 2);
    if (!f3) return null;
    const inner = decodeMsg(f3.bytes);
    const n21 = inner.find((x) => x.field === 21);
    const n22 = inner.find((x) => x.field === 22);
    if (!n21 || !n22) return null;
    const found = [Number(n21.varint), Number(n22.varint)];

    const cells = celleBilancio(file);
    const best = classMatch(cells);
    if (!best?.cls?.aiStandard) return null;   // senza pin la vigia non giudica
    const atteso = best.cls.aiStandard;
    if (atteso[0] === found[0] && atteso[1] === found[1]) return null;   // in piedi
    const msg = [
      `⚠  CAMPO AI PERSO sul customgrid: trovato ${found[0]}-${found[1]}, la classe "${best.id}" pinna ${atteso[0]}-${atteso[1]}`,
      `   → chiudi EVO e rilancia:  node tools/grid-balance.mjs --ai ${atteso[0]} ${atteso[1]} --apply`,
    ].join('\n');
    return { classe: best.id, atteso, trovato: found, msg };
  } catch { return null; }
}
