// telemetria-curve.mjs — rileva le curve sulla traccia di velocità di un giro
// reale (file .ld di MoTeC prodotti dal gioco). Nessun dato inventato: la
// traccia arriva da sampleLap() di motec.mjs.
//
// Esporta:
//   findCorners(vs, { thresholdKmh?, window? })  → indici dei minimi locali
//   cornersOfLap(ldFile, { lap?, points? })       → curve del giro da un .ld

import { sampleLap } from './motec.mjs';

/** Velocità sotto la quale un minimo locale conta come curva (km/h). */
export const DEFAULT_CORNER_KMH = 120;
/** Semi-finestra (in campioni) entro cui il minimo deve essere il più basso. */
export const DEFAULT_WINDOW = 5;

/**
 * Indici dei minimi locali della velocità sotto `thresholdKmh`. Un punto è un
 * minimo se nessun campione entro `window` campioni per lato è più basso di lui.
 * Ritorna un array vuoto se la traccia non è valida.
 */
export function findCorners(vs, { thresholdKmh = DEFAULT_CORNER_KMH, window = DEFAULT_WINDOW } = {}) {
  if (!Array.isArray(vs) || vs.length < 3) return [];
  const w = Math.max(1, Math.floor(window));
  const out = [];
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    if (!Number.isFinite(v) || v >= thresholdKmh) continue;
    let isMin = true;
    for (let j = Math.max(0, i - w); j <= Math.min(vs.length - 1, i + w); j++) {
      if (j !== i && Number.isFinite(vs[j]) && vs[j] < v) {
        isMin = false;
        break;
      }
    }
    if (isMin) out.push(i);
  }
  return out;
}

/**
 * Curve del giro (default: il best) letto da un file .ld reale. Ritorna
 * { lap, lapSec, corners: [{ index, distFrac, speedKmh }] } oppure null se il
 * file non si legge o il giro non è disponibile.
 */
export function cornersOfLap(ldFile, { lap = 'best', points = 240, thresholdKmh, window } = {}) {
  const s = sampleLap(ldFile, lap, points);
  if (!s) return null;
  const idx = findCorners(s.vs, { thresholdKmh, window });
  const n = s.vs.length - 1;
  return {
    lap: s.lap,
    lapSec: s.durationSec,
    corners: idx.map((i) => ({ index: i, distFrac: n ? i / n : 0, speedKmh: s.vs[i] })),
  };
}
