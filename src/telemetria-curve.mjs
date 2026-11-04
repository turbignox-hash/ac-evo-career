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

const r1c = (v) => Math.round(v * 10) / 10;
const r2c = (v) => Math.round(v * 100) / 100;

/**
 * COACHING CURVA PER CURVA (4/11): confronta due giri campionati sullo stesso
 * numero di punti (quindi allineati per distanza) e per ogni curva del giro A
 * dice apex, metri di staccata e velocità d'uscita, con i delta contro B.
 * La staccata è la distanza fra il picco di velocità prima della curva e
 * l'apex: nessuna traiettoria inventata, solo la traccia SPEED del gioco.
 * entryM più grande = freni prima.
 */
export function coachingOfSamples(a, b, { thresholdKmh, window } = {}) {
  if (!a?.vs?.length || !b?.vs?.length) return null;
  const n = Math.min(a.vs.length, b.vs.length);
  if (n < 20) return null;
  const vsA = a.vs.slice(0, n);
  const vsB = b.vs.slice(0, n);
  const distKm = Number(a.distKm ?? a.distanceKm ?? 0);
  if (!(distKm > 0)) return null;
  const idx = findCorners(vsA, { thresholdKmh, window });
  if (!idx.length) return null;
  const mPerSample = (distKm * 1000) / Math.max(1, n - 1);
  const brakeLen = (vs, i) => {
    let peak = i;
    while (peak > 0 && vs[peak - 1] > vs[peak]) peak--;
    return Math.round((i - peak) * mPerSample);
  };
  const after = Math.max(3, Math.round(n / 50));
  const corners = idx.map((i, k) => {
    const entryM = brakeLen(vsA, i);
    const entryCompareM = brakeLen(vsB, i);
    const ex = Math.min(n - 1, i + after);
    return {
      n: k + 1,
      apexKmh: r1c(vsA[i]), apexCompareKmh: r1c(vsB[i]), dApexKmh: r1c(vsA[i] - vsB[i]),
      entryM, entryCompareM, dEntryM: entryM - entryCompareM,
      exitKmh: r1c(vsA[ex]), exitCompareKmh: r1c(vsB[ex]), dExitKmh: r1c(vsA[ex] - vsB[ex]),
    };
  });
  return { lap: a.lap ?? null, compare: b.lap ?? null, corners, points: n, distKm: r2c(distKm) };
}
