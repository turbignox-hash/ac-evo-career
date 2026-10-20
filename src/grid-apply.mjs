// grid-apply.mjs — I GESTI DI SCRITTURA sulla griglia, condivisi.
//
// Nato perché watch (ripristino automatico) e GUI (tab Griglia) devono fare
// LE STEESSE operazioni del tool grid-balance senza rilanciare un processo:
//   • applicare il bilancio della classe (con supplementi perTraccia)
//   • rimuovere dal file le auto ESCLUSE (di classe o per-traccia)
//   • riscrivere l'intervallo AI (config 21/22)
// Ogni scrittura è protetta dal guardiano EVO-chiuso e fa backup automatico.
//
// uso:
//   import { applyBalance, applyAi, dropCellsApply, gridStatus, matchCurrentClass } from './grid-apply.mjs';
//   const out = applyBalance({ track: 'Sebring International Raceway' });  // classe auto-matchata
//   const out = applyAi([94, 99]);
//   const out = dropCellsApply(['preset_mk8gti_mech_1', 'BMW M3 E46 CSL']);
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { sameTrack } from './tracknames.mjs';
import { gameRunning, encodeMsg } from '../tools/evo-grid.mjs';
import { balanceCells, dropCells, setAiRange, planFromClass, readCells, DEFAULT_FILE } from '../tools/grid-balance.mjs';
import { loadClasses, pickClassInfo } from './gridbuilder.mjs';

export const GRID_FILE = DEFAULT_FILE;

const writeSafe = (buf2, file = GRID_FILE, { force = false } = {}) => {
  if (gameRunning() && !force) throw Object.assign(new Error('EVO è APERTO: chiudi il gioco prima di scrivere la griglia.'), { code: 'GAME_RUNNING' });
  const backup = `${file}.bak-apply-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  writeFileSync(`${file}.tmp`, buf2);
  renameSync(`${file}.tmp`, file);
  return backup;
};

/**
 * Classe combaciante per i preset del file corrente (riusa il match del
 * builder: preset in comune con le regole, ≥2). { id, cls, hits } o null.
 */
export function matchCurrentClass(file = GRID_FILE) {
  const buf = readFileSync(file);
  const { cells } = readCells(buf);
  const presets = [...new Set(cells.map((c) => c.preset).filter(Boolean))];
  return pickClassInfo(loadClasses(), presets);
}

/**
 * Applica il bilancio della classe combaciata (match automatico per preset),
 * con supplementi perTraccia quando `track` è dato. opts: { track, file, force, dry }.
 */
export function applyBalance({ track = null, file = GRID_FILE, force = false, dry = false } = {}) {
  const buf = readFileSync(file);
  const { cells } = readCells(buf);
  const presets = [...new Set(cells.map((c) => c.preset).filter(Boolean))];
  const classes = loadClasses();
  const matched = pickClassInfo(classes, presets);
  if (!matched) throw Object.assign(new Error('nessuna classe conosciuta combacia con le auto del customgrid'), { code: 'NO_CLASS' });
  const { rules, trkMsg } = planFromClass(classes, matched.id, track);
  const res = balanceCells(buf, { rules });
  if (dry) return { classe: matched.id, trkMsg, report: res.report, written: false };
  const backup = writeSafe(encodeMsg(res.fields), file, { force });
  return { classe: matched.id, trkMsg, report: res.report, written: true, backup };
}

/** Riscrive l'intervallo AI nel config (21/22). opts: { file, force, dry }. */
export function applyAi([min, max], { file = GRID_FILE, force = false, dry = false } = {}) {
  const { fields } = setAiRange(readFileSync(file), min, max);
  if (dry) return { ai: [min, max], written: false };
  const backup = writeSafe(encodeMsg(fields), file, { force });
  return { ai: [min, max], written: true, backup };
}

/** Rimuove le auto (preset o nome) dal file. opts: { file, force, dry }. */
export function dropCellsApply(matchers, { file = GRID_FILE, force = false, dry = false } = {}) {
  const res = dropCells(readFileSync(file), matchers.map((v) => String(v).startsWith('preset_') ? { preset: v } : { carName: v }));
  if (res.empty) return { droppate: [], written: false };
  if (dry) return { droppate: res.droppate, written: false };
  const backup = writeSafe(encodeMsg(res.fields), file, { force });
  return { droppate: res.droppate, written: true, backup };
}

/** Stato della griglia per la GUI: celle, config, classe combaciata e perTraccia attiva. */
export function gridStatus({ track = null, file = GRID_FILE } = {}) {
  let buf;
  try { buf = readFileSync(file); } catch { return { file, exists: false }; }
  const info = readCells(buf);
  const presets = [...new Set(info.cells.map((c) => c.preset).filter(Boolean))];
  const classi = loadClasses().classi ?? {};
  let classe = null, hits = -1;
  for (const [id, cls] of Object.entries(classi)) {
    const h = (cls.regole ?? []).filter((r) => r.preset && presets.includes(r.preset)).length;
    if (h >= 2 && h > hits) { classe = id; hits = h; }
  }
  let perTraccia = null, convalidato = null, escluseClasse = [], escluseTraccia = [];
  if (classe) {
    const cls = classi[classe];
    escluseClasse = (cls.escludiAuto ?? []).filter((p) => presets.includes(p));
    if (track) {
      for (const [trk, ov] of Object.entries(cls.perTraccia ?? {})) {
        if (trk.startsWith('_') || !sameTrack(trk, track)) continue;
        perTraccia = trk;
        convalidato = ov.convalidato === true;
        escluseTraccia = (ov.escludiAuto ?? []).filter((p) => presets.includes(p));
        break;
      }
    }
  }
  return { file, exists: true, ...info, classe, perTraccia, convalidato, escluseClasse, escluseTraccia };
}
