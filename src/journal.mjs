// journal.mjs — il calendario nostro, specchiato accanto al save.
//
// Ad ogni saveState riscrive `evo-calendar[-N].json` nella stessa cartella del
// save, con le ronde del sedile attivo prese da career.evo.ladder.json. È una
// copia: se manca, i consumatori restano sulla ladder. Nessun journal esterno.

import { readFileSync, writeFileSync, renameSync, statSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACK_INFO } from './tracks.mjs';
import { PRESETS } from './weather.mjs';
import { writeOrWarn } from './safe-write.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const LADDER_FILE = join(THIS_DIR, '..', 'config', 'career.evo.ladder.json');

/* ------------------------------------------------------------------ */
/* il nome file: accanto al save, stesso slot nel nome                  */
/* ------------------------------------------------------------------ */

/** Lo SLOT nel nome del save (slot 1 → '', slot 2 → "-2", slot 3 → "-3"):
 *  la regola «stesso slot nel nome, accanto al save» è UNA (2/11) e chi
 *  scrive ALTRO file per slot la reusa — il generatore di round (3/11) la
 *  porta sulla traccia della ronda. File che non è un save → '' . */
export function slotSuffix(saveFile) {
  const m = String(basename(saveFile ?? '')).match(/^evo-career\.save(?:-([1-3]))?\.json$/);
  return m?.[1] ? `-${m[1]}` : '';
}

/** `data/evo-calendar.json` (o `-2`/`-3`): nella STESSA cartella del save che
 *  lo alimenta. Attenzione: restituisce evo-calendar anche per file non save
 *  (i test lo usano con path sandbox). */
export function journalPathForSave(saveFile) {
  const dir = dirname(String(saveFile ?? ''));
  return join(dir, `evo-calendar${slotSuffix(saveFile)}.json`);
}

/* ------------------------------------------------------------------ */
/* campo per campo: la stessa famiglia di ronda dell'app                 */
/* ------------------------------------------------------------------ */

/** Il METEO: `id → parole del gioco` (l'unico dato che nel ladder è un numero
 *  mentre l'agenda del gioco lo porta come stringa: «Pioggia leggera»). Round-trip
 *  lossless per 0..6 (test); 7 = custom → «Sereno»: chi ha scelto un meteo
 *  custom l'ha pescato a mano in gioco, non lo inventiamo. */
export function meteoParole(id) {
  const preset = PRESETS.find((p) => p.id === Number(id));
  if (!preset || preset.id > 6) return 'Sereno';
  return preset.label;
}

/** Il TRACK: `id ladder → nome con parole` («brands-hatch → Brands Hatch»). */
export function trackParole(trackId) { return TRACK_INFO[trackId]?.name ?? trackId ?? null; }

/** L'AUTO: `ks_abarth_695_biposto` → `abarth 695 biposto` (per la GUI il.nome
 *  si legge senza prefisso di cartella). */
export function carParole(id) {
  return String(id ?? '').replace(/^ks_/, '').replace(/_/g, ' ') || null;
}

/** Il `time` della ronda: «14:00» dalla coppia hour/minute del ladder. */
export function oraParole(hour, minute = 0) {
  const h = Math.max(0, Math.min(23, Number(hour) ?? 0));
  const m = Math.max(0, Math.min(59, Number(minute) ?? 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Una RONDA: da una voce ladder a un round alla forma dell'app di carriera
 *  (stessa famiglia di campi, stesso `state`). */
export function rondaDaLadder(entry, n, car) {
  return {
    n,
    state: 'todo',
    name: entry.name ?? null,          // ladder conserva il nome scritto a mano
    track: trackParole(entry.track),
    layout: entry.layout ?? null,
    laps: entry.laps ?? null,
    time: oraParole(entry.hour ?? 14, entry.minute ?? 0),
    weather: meteoParole(entry.weather ?? 0),
    car: car ?? null,
  };
}

/** Il CALENDARIO di una carriera: dal nodo ladder del sedile attivo alla
 *  famiglia di round del ponte. Null se il nodo NON è di calendario (menu di
 *  partenza, sedile senza stagioni): niente mirror e i test lo verificano. */
export function calendarioDaLadder(ladder, state) {
  const node = (ladder?.nodes ?? []).find((nd) => nd?.nodeId === state?.node) ?? null;
  if (!node || !Array.isArray(node.calendar) || !node.calendar.length) return null;
  // L'auto della serie: la prima del nodo (il ladder mette in primis la
  // protagonista — nel monomarca è l'UNICA); `carParole` toglie il prefisso
  // `ks_` e i trattini bassi così la GUI mostra «abarth 695 biposto» in
  //_stampo_ com'era nell'app. NON è la seconda verità: ronda-ladder e
  //car-pool la spogliano comunque per il match (nugno).
  const car = carParole(node.cars?.[0]);
  const cal = {
    mirror: true,
    car,
    series: node.display ?? node.nodeId,
    season: Number(state?.season ?? 1),
    summary: { done: 0, total: node.calendar.length },
    rounds: node.calendar.map((entry, i) => rondaDaLadder(entry, i + 1, car)),
  };
  // Avanzamento vero: risultato per risultato della stagione attiva del sedile
  // (il `results` dello state è per nodo e ogni riga porta la season: la lista
  // della stagione attiva decide done/next/todo, niente contatori intoppi).
  const results = state?.results?.[node.nodeId] ?? [];
  const done = results.filter((r) => Number(r.season) === cal.season).length;
  for (const r of cal.rounds) r.state = r.n <= done ? 'done' : (r.n === done + 1 ? 'next' : 'todo');
  cal.summary.done = done;
  if (done >= cal.rounds.length) cal.season_done = true;
  return cal;
}

/* ------------------------------------------------------------------ */
/* il hook di scrittura: un solo chiamante, lo state.mjs               */
/* ------------------------------------------------------------------ */

/** L'HOOK: lo chiama `saveState` DOPO il rename del save (state.mjs).
 *  Un record non salvato NON è un danno ai dati (il journal è una copia, i
 *  consumatori delegano al ponte se non lo trovano), ma writeOrWarn lo
 *  annota in errors.jsonl. Il ladder si diceva una sola volta per processo. */
let _ladder = null;  // { mtime, data } — riletto solo se il file muta
export function loadLadder() {
  try {
    const mtime = statSync(LADDER_FILE).mtimeMs;
    if (!_ladder || _ladder.mtime !== mtime)
      _ladder = { mtime, data: JSON.parse(readFileSync(LADDER_FILE, 'utf8')) };
    return _ladder.data;
  } catch { return null; }
}

export function mirrorJournal(saveFile, state, ladder = loadLadder()) {
  writeOrWarn('journal.mirror', () => {
    const path = saveFile ? journalPathForSave(saveFile) : null;
    if (!path) return;
    const cal = calendarioDaLadder(ladder, state);
    if (!cal) return;                  // node senza calendario: NON sovrascrivere
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(cal, null, 2) + '\n', 'utf8');
    renameSync(tmp, path);
  });
}

// Chi legge il mirror: src/app-carriera.mjs.
