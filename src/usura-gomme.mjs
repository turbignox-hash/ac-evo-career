// usura-gomme.mjs — quanto costa la gomma, letto dalla telemetria REALE di una
// sessione (file .ld di MoTeC prodotti dal gioco). Nessun dato inventato: i
// giri e le temperature arrivano da analyzeLd() di motec.mjs; qui si calcola
// solo DENTRO i numeri veri. L'usura PERCENTUALE vive nella shared memory
// (engineer.mjs): da un .ld non c'è, quindi qui si stima il DEGRADO con i suoi
// due segnali misurabili — il ritmo che peggiora e la temperatura che sale.
//
// Esporta:
//   lapDegradation(durations, { window? })  → confronto primi vs ultimi giri
//   tyreTempsOf(laps)                       → trend termico per ruota
//   tyreWearFromLd(ldFile, { window? })     → tutto insieme da un .ld

import { analyzeLd } from './motec.mjs';

const WHEELS = ['LF', 'RF', 'LR', 'RR'];

/** Arrotonda al decimo, come fa motec.mjs. */
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/**
 * Degrado del ritmo: media dei PRIMI `window` giri vs media degli ULTIMI
 * `window` (con pochi giri le due finestre si spartiscono la metà a testa).
 * Ritorna { firstAvg, lastAvg, deltaSec, trendPerLap } oppure null se i giri
 * non bastano (meno di 2) o non sono numeri finiti. `deltaSec` positivo =
 * il ritmo si è rallentato camminando la sessione — gomma che cede, pista che
 * si allunga o pilota che stanca: il numero non dice chi, ma dice SE e QUANTO.
 */
export function lapDegradation(durations, { window = 3 } = {}) {
  const ds = (Array.isArray(durations) ? durations : [])
    .filter((v) => Number.isFinite(v) && v > 0);
  if (ds.length < 2) return null;
  const w = Math.min(Math.max(1, Math.floor(window)), Math.floor(ds.length / 2));
  const firstAvg = r2(meanOf(ds.slice(0, w)));
  const lastAvg = r2(meanOf(ds.slice(ds.length - w)));
  const deltaSec = r2(lastAvg - firstAvg);
  // il demarraggio che separa i baricentri delle due finestre: n − w giri di
  // superficie — la pendenza PRIMO→ULTIMO espresso a giro
  const trendPerLap = r2(deltaSec / (ds.length - w));
  return { firstAvg, lastAvg, deltaSec, trendPerLap };
}

/**
 * Trend termico per ruota: per ogni giro la media dei 3 bordi di superficie
 * (L/C/R, i null li scarta) e poi PRIMO vs ULTIMO giro in cui quella ruota ha
 * dati, più il picco assoluto. Serve a dire quale gomma sta soffrendo — e da
 * che parte: bordo interno caldo? quello lo racconta il calcolo L−R di
 * motec.mjs (camberProxy); qui si guarda l'ANDAMENTO nel tempo della sessione.
 * Ritorna { [w]: { first, last, deltaC, max } } per le sole ruote con dati.
 */
export function tyreTempsOf(laps) {
  const out = {};
  for (const w of WHEELS) {
    const series = laps
      .map((l) => {
        const s = l?.surf?.[w];
        const vs = Array.isArray(s) ? s.filter(Number.isFinite) : [];
        return vs.length ? { mean: meanOf(vs), peak: Math.max(...vs) } : null;
      })
      .filter(Boolean);
    if (!series.length) continue;
    const max = r1(Math.max(...series.map((s) => s.peak)));  // il PICCO è quello di bordo, non delle medie
    const first = r1(series[0].mean);
    const last = r1(series[series.length - 1].mean);
    out[w] = { first, last, deltaC: r1(last - first), max };
  }
  return out;
}

/**
 * Tutto insieme da un file .ld REALE: giri validi (> 15 s, la convenzione di
 * motec.mjs), degrado del ritmo, trend termico per ruota e slittamento di
 * trazione della sessione (già calcolato da analyzeLd). Ritorna null se il
 * file non si legge. `hottestWheel` è la gomma con il FINALE più caldo.
 */
export function tyreWearFromLd(ldFile, { window = 3 } = {}) {
  const an = analyzeLd(ldFile);
  if (!an) return null;
  const valid = an.laps.filter((l) => l.durationSec > 15);
  const degradation = lapDegradation(valid.map((l) => l.durationSec), { window });
  const temps = tyreTempsOf(valid);
  let hottestWheel = null;
  for (const w of WHEELS) {
    if (temps[w] && (hottestWheel === null || temps[w].last > temps[hottestWheel].last)) hottestWheel = w;
  }
  return {
    file: an.file,
    laps: valid.length,
    bestLapSec: an.bestLapSec,
    degradation,           // null se i giri validi non bastano (sessione breve)
    temps,                 // {} se nell'.ld non ci sono canali SURF_TEMP
    hottestWheel,          // null se temps è {}
    slipRearPct: an.assist?.slipRearPct ?? null,
  };
}
