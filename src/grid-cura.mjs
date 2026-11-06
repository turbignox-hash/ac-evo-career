// grid-cura.mjs — la cura d'identità delle griglie EVO (3/11).
//
// IL FATTO: il generatore di griglie di EVO scrive per alcune auto (caso in
// punto: Toyota Supra MKIV) una coppia d'identità che il client non sa
// risolvere — f10 con l'etichetta del catalogo SERVER («Toyota Supra MKIV -
// Standard»), f11 con la voce visual sbagliata (Visual 2) e senza la porta
// d'attacco nel campo 3 → celle VUOTE in Personalizzazione Griglia e crash
// al load della sessione (lezione del 718 del 1/11, report/crash-261101-16.51).
// LA CURA: fotocopia dei SOLI campi f10/f11 da una FOTO scritta da EVO
// (23/10: «Supra MKIV Preset Base» + campo 3 = 1 + voce Visual 1); tutto il
// resto della cella resta di EVO — livree f14, PI f28, piloti f31/f33 — e le
// celle restano byte-distinte fra loro.
// REGOLA DI CASA: le celle si fotocopiano, non si inventano.
//
// Donatore: la foto del gioco ripatriata nel mirror data/griglie-grezz
// (gitignored, vive sul disco come tutti i mirror del gioco). FALLBACK:
// la STESSA foto incisa nel codice (documentata qui sotto) — nessuna
// dipendenza da fabbrica o magazzino, come deciso con Mauro il 3/11.
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg, encodeMsg, bakName, gameRunning, GAME_MODES_DIR } from './evo-grid.mjs';
import { celleDiGrid, syncRoster } from './weekend-roster.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
export const GREZZE = join(QUI, '..', 'data', 'griglie-grezz');
const VIVO = join(GAME_MODES_DIR, 'last_grid.customgrid');
const WEEKEND_FILE = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');

export const AUTO_CURA = 'ks_toyota_supra_mkiv';
export const SEGNO_VERO = 'Supra MKIV Preset Base';

const findF = (campi, campo) => campi.find((g) => g.field === campo);
// Buffer.from: i subarray di decodeMsg su Uint8Array (encodeMsg) NON sono
// Buffer e .toString('binary') su di loro ignorerebbe l'encoding (lezione test 3/11)
const txt = (b) => (b ? Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.byteLength).toString('binary') : '');
const eSupra = (cella) => txt(findF(cella, 3)?.bytes).includes(AUTO_CURA);
const eVera = (cella) => eSupra(cella) && txt(findF(cella, 10)?.bytes).includes(SEGNO_VERO);

/* ---- il donatore: la foto EVO del 23/10, incisa (fallback di rete zero) ---- */
const FOTO_F10 =
  '\n\x17preset_supramkiv_mech_1\x12\x16Supra MKIV Preset Base\x18\x01\x22\x08Standard';
const FOTO_F11 = '\n\x19preset_supramkiv_visual_1\x12\x13Supra MKIV Visual 1';
const donoreInciso = () => [
  { field: 3, wire: 2, bytes: Buffer.from(AUTO_CURA) },
  { field: 10, wire: 2, bytes: Buffer.from(FOTO_F10, 'binary') },
  { field: 11, wire: 2, bytes: Buffer.from(FOTO_F11, 'binary') },
];

let _donore;
export function dimenticaDonore() { _donore = undefined; }

/** La cella del donatore: dalla grezza nel mirror, altrimenti la foto incisa. */
export function trovaDonore({ grezze = GREZZE } = {}) {
  if (_donore) return _donore;
  try {
    for (const n of readdirSync(grezze).filter((f) => f.endsWith('.customgrid'))) {
      for (const f of decodeMsg(readFileSync(join(grezze, n)))) {
        if (f.field !== 1 || f.wire !== 2) continue;
        const cella = decodeMsg(f.bytes);
        if (eVera(cella)) { _donore = cella; return _donore; }
      }
    }
  } catch { /* grezze assente o illeggibile: la foto incisa copre */ }
  _donore = donoreInciso();
  return _donore;
}

/** Quante celle velenose porta il buffer griglia (Supra con l'identità che il client non risolve). */
export function veleniIn(buf) {
  let n = 0;
  for (const f of decodeMsg(buf)) {
    if (f.field !== 1 || f.wire !== 2) continue;
    const cella = decodeMsg(f.bytes);
    if (eSupra(cella) && !eVera(cella)) n++;
  }
  return n;
}

/** La cura: fotocopia dei soli f10/f11 su ogni cella velenosa. null se non serve. */
export function curaBuf(buf, { donore = null } = {}) {
  const d = donore ?? trovaDonore();
  const f10 = Buffer.from(findF(d, 10).bytes);
  const f11 = Buffer.from(findF(d, 11).bytes);
  const campiTop = decodeMsg(buf);   // TOCCHIAMO i campi e ricodificiamo DA LORO (lezione nel test: encodeMsg(decodeMsg(buf)) ridarebbe il veleno, buf non è mai mutato)
  let tocchi = 0;
  for (const f of campiTop) {
    if (f.field !== 1 || f.wire !== 2) continue;
    const cella = decodeMsg(f.bytes);
    if (!eSupra(cella) || eVera(cella)) continue;
    f.bytes = encodeMsg(cella.map((g) => {
      if (g.field === 10) return { ...g, bytes: f10 };
      if (g.field === 11) return { ...g, bytes: f11 };
      return g;
    }));
    tocchi++;
  }
  return tocchi ? encodeMsg(campiTop) : null;
}

/** L'autocura del last_grid VIVO: solo a gioco chiuso. Ritorna il resoconto:
 *  { stato: 'assente' | 'pulito' | 'gioco-aperto' | 'senza-donore' | 'curata', ... } */
export function autocuraVivo() {
  if (!existsSync(VIVO)) return { stato: 'assente' };
  const buf = readFileSync(VIVO);
  const veleni = veleniIn(buf);
  if (!veleni) return { stato: 'pulito' };
  if (gameRunning()) return { stato: 'gioco-aperto', veleni };
  const nuovo = curaBuf(buf);
  if (!nuovo) return { stato: 'senza-donore', veleni };
  const bak = bakName(VIVO, 'autocura');
  copyFileSync(VIVO, bak);
  writeFileSync(VIVO + '.tmp', nuovo);
  renameSync(VIVO + '.tmp', VIVO);
  let roster;
  try { roster = syncRoster(celleDiGrid(readFileSync(VIVO)), { file: WEEKEND_FILE }); }
  catch (e) { roster = { errore: String(e.message).split('\n')[0] }; }
  return { stato: 'curata', veleni, backup: basename(bak), roster };
}
