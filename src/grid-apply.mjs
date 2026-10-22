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
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { sameTrack } from './tracknames.mjs';
import { gameRunning, encodeMsg, gridFileOf } from '../tools/evo-grid.mjs';
import { balanceCells, dropCells, setAiRange, planFromClass, readCells, DEFAULT_FILE } from '../tools/grid-balance.mjs';
import { loadClasses, pickClassInfo, buildGridMessage } from './gridbuilder.mjs';

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

/**
 * Ricostruisce la griglia della RONDA (multiclasse/auto della serie) dallo
 * stesso template che c'è sul disco, con il match della classe del builder:
 * è il gesto del CLI `griglia --servo-prepara` (cli.mjs cmdGriglia) messo a
 * disposizione dell'app GUI. A differenza di applyBalance/applyAi NON
 * presuppoone una classe combaciante per preset: se il customgrid sul disco
 * appartiene a un'altra serie (lezione del 23/10 mattina: avevo ancora
 * GT3-vs-EXP ma il save era sulla Coppa RX-7), la classe matchata è l'altra
 * e le zavorre scritte erano per lei; ricostruisce da template PLUS la
 * ricollocazione della classe della serie e delle sue poolAuto.
 * opts: { ladder, nodeId, roundIndex, file, force, dry }.
 * Ritorna { buffer, report, written, backup } o throw (NO_GRID / serie
 * fuori ladder / senza pool: il throw ha un messaggio già pronto come
 * commando per l'utente).
 */
export function rebuildGridApply({ ladder, nodeId, roundIndex, file = GRID_FILE, force = false, dry = false } = {}) {
  if (!ladder || !nodeId || roundIndex == null) throw Object.assign(new Error('rebuildGridApply: servono ladder, nodeId e roundIndex'), { code: 'NO_ARGS' });
  // il TEMPLATE è il file attuale; su una serie con poolAuto dichiarato il
  // template con quel pool può esistere solo nei backup .bak-griglia/.bak-apply
  // del passato (il file corrente appartiene a UN'altra serie). Provo il file
  // corrente e in sua mancanza a fondo la stringa pronunciata di backup più
  // recente che POSSIde il pool della serie — ma SEMPRE il file corrente resta
  // il file di partenza: la scrittura non tocca i backup, e no altro template
  // moderno venga usato.
  // La scelta del backup: cerco in ordine di mtime l'ultimo candidato
  // (bacgriglia/backu-apply) che passa una dry-run del builder col pool di
  // questa serie — quindi nessuna altra potrebbe scelcarsi da sé.
  try {
    const first = buildGridMessage({ ladder, nodeId, roundIndex, file });
    if (dry) return { report: first.report, written: false };
    const backup = writeSafe(first.buffer, file, { force });
    return { report: first.report, written: true, backup };
  } catch (firstErr) {
    if (firstErr.code || !existsSync(file)) throw firstErr;
    // 2) backup compatibile: stessa serie (poolAuto) presenti nel file.
    try {
      const cls = loadClasses().classi?.[nodeId] ?? null;
      const pool = Array.isArray(cls?.poolAuto) ? cls.poolAuto : (Array.isArray((ladder.nodes ?? []).find((n) => n.nodeId === nodeId)?.cars) ? ladder.nodes.find((n) => n.nodeId === nodeId).cars : null);
      if (!pool || pool.length < 2) throw firstErr;
      const dir = dirname(file);
      const baks = readdirSync(dir).filter((f) => f.startsWith(basename(file) + '.bak-'));
      baks.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
      let lastErr = firstErr;
      for (const nome of baks.slice(0, 40)) {
        try {
          const buf = readFileSync(join(dir, nome));
          // match veloce per CAR-ID di cella (il poolAuto è dichiarato a quelle
          // chiavi, non a preset): il builder filtro il pool con la STESSA
          // chiave (field 3), quindi un backup con ≥3 modelli del pool passa
          // dove un match per preset fallirebbe con acqua alla gola.
          const ids = new Set(gridFileOf(buf).cells.map((c) => c.carId).filter(Boolean));
          const hit = pool.filter((p) => ids.has(p)).length;
          if (hit < 3) continue;   // il backup non ha abbastanza auto del pool
          const { buffer, report } = buildGridMessage({ ladder, nodeId, roundIndex, file: join(dir, nome) });
          if (dry) return { report, written: false, source: nome };
          const backup = writeSafe(buffer, file, { force });
          return { report, written: true, backup, source: nome };
        } catch (e) { lastErr = e; }
      }
      throw lastErr;
    } catch (e) { throw e; }
  }
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
