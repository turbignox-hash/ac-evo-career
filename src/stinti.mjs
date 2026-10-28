// stinti.mjs — analisi dei STINT dalla telemetria REALE di una sessione
// (file .ld di MoTeC prodotti dal gioco). Nessun dato inventato: i giri, il
// carburante a inizio/fine giro e le temperature arrivano da analyzeLd() di
// motec.mjs; la sola "correzione" che qui si fa è MISURATA, non assunta —
// la pendenza ritmo-vs-carburante esce dai minimi quadrati sui giri veri,
// senza coefficienti di peso tirati dal cappello.
// // LIMITE ONESTO: il .ld non registra la MESCOLA (soft/medio/dure non c'è):
// la "curva di degrado per mescola" non la si può fare in modo onesto da qui.
// Il confronto tra stint si fa tra stint REALI della stessa sessione.
//
// Esporta:
//   stintsOf(laps, { refillLitri? })     → stint spezzati sul rifornimento
//   fuelPaceOf(laps)                     → sec/LITRO misurati sul ritmo
//   stintsFromLd(ldFile, { refillLitri? }) → tutto insieme da un .ld

import { analyzeLd } from './motec.mjs';
import { lapDegradation } from './usura-gomme.mjs';

/** Un stint è nuovo quando il carburante a inizio giro L'HA RIFORNITO: salto di
 * almeno `refillLitri` litri sopra il fine giro precedente (legge dal dato, non
 * indovina). Default 2 l: un rifornimento reale salta decine di litri. */
const DEFAULT_REFILL = 2;

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;

function stintSummary(stintLaps, lapFrom) {
  const ds = stintLaps.map((l) => l.durationSec);
  const fuel = stintLaps.map((l) => l.fuelUsed).filter((v) => v != null && v > 0 && v < 10);
  const last = stintLaps[stintLaps.length - 1];
  return {
    fromLap: lapFrom,
    toLap: lapFrom + stintLaps.length - 1,
    nLaps: stintLaps.length,
    avgLapSec: r2(meanOf(ds)),
    bestLapSec: r1(Math.min(...ds)),
    fuelPerLap: fuel.length ? r2(meanOf(fuel)) : null,
    endFuel: last.endFuel ?? null,
    // degrado del ritmo DENTRO il stint (stessa regola di usura-gomme)
    degradation: lapDegradation(ds),
  };
}

/**
 * Spezzatura dei giri validi (> 15 s, convenzione di motec.mjs) in stint: un
 * nuovo stint comincia quando il carburante a inizio giro supera il fine giro
 * precedente di almeno `refillLitri` litri (segnale = rifornimento reale).
 * Se il canale FUEL manca (fuelStart null) il giro non spezza il stint — si
 * resta nel blocco corrente con onestà: nessun tentativo di indovinare.
 * Ritorna un array di stint: { fromLap, toLap, nLaps, avgLapSec, bestLapSec,
 * fuelPerLap, endFuel, degradation }.
 */
export function stintsOf(laps, { refillLitri = DEFAULT_REFILL } = {}) {
  const valid = (Array.isArray(laps) ? laps : [])
    .filter((l) => Number.isFinite(l?.durationSec) && l.durationSec > 15);
  const out = [];
  let cur = [];
  let prevEnd = null;
  for (const l of valid) {
    const refuel = prevEnd != null && l.fuelStart != null && l.fuelStart > prevEnd + refillLitri;
    if (refuel && cur.length) { out.push(stintSummary(cur, cur[0].lap)); cur = []; }
    cur.push(l);
    if (l.fuelEnd != null) prevEnd = l.fuelEnd;
  }
  if (cur.length) out.push(stintSummary(cur, cur[0].lap));
  return out;
}

/**
 * Ritmo corretto per carburante, senza ipotesi: la PENDENZA dei tempi di giro
 * rispetto al carburante a inizio giro, da minimi quadrati sui giri veri della
 * stessa sessione. `secPerLiter` positivo = più benzina a bordo, giro più
 * lento — così «quanto peso in più?» diventa un numero MISURATO sulla tua auto
 * quella sera, non un coefficiente da manuale. Con poca benzina a bordo o
 * pochi giri la pendenza è rumore: esce null sotto soglia (4 giri o bordo
 * stretto < 2 l). Ritorna { secPerLiter, fuelSpread, n } oppure null.
 */
export function fuelPaceOf(laps) {
  const pts = (Array.isArray(laps) ? laps : [])
    .filter((l) => Number.isFinite(l?.durationSec) && l.durationSec > 15
      && Number.isFinite(l?.fuelStart) && l.fuelStart > 0)
    .map((l) => [l.fuelStart, l.durationSec]);
  if (pts.length < 4) return null;
  const [fMin, fMax] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const spread = fMax - fMin;
  if (spread < 2) return null;                       // senza benzina diversa non si misura
  const mF = meanOf(pts.map((p) => p[0])), mT = meanOf(pts.map((p) => p[1]));
  let num = 0, den = 0;
  for (const [f, t] of pts) { num += (f - mF) * (t - mT); den += (f - mF) ** 2; }
  const slope = den > 0 ? r2(num / den) : null;
  return Number.isFinite(slope) ? { secPerLiter: slope, fuelSpread: r1(spread), n: pts.length } : null;
}

/**
 * Tutto insieme da un file .ld REALE: stint, pendenza ritmo-carburante e
 * confronto: `bestStint` è il blocco col ritorno medio migliore. Ritorna null
 * se il file non si legge.
 */
export function stintsFromLd(ldFile, opts = {}) {
  const an = analyzeLd(ldFile);
  if (!an) return null;
  const valid = an.laps.filter((l) => l.durationSec > 15);
  const stints = stintsOf(valid, opts);
  const fuelPace = fuelPaceOf(valid);
  // confronto stint: il migliore in ritmo medio
  const best = stints.length
    ? stints.reduce((a, s) => (s.avgLapSec != null && (a == null || s.avgLapSec < a.avgLapSec) ? s : a), null)
    : null;
  return {
    file: an.file,
    laps: valid.length,
    nStints: stints.length,
    refuels: Math.max(0, stints.length - 1),
    stints,
    fuelPace,
    bestStint: best ? { fromLap: best.fromLap, toLap: best.toLap, avgLapSec: best.avgLapSec } : null,
  };
}
