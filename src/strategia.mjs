// strategia.mjs — calcolatore di strategia (funzioni pure, nessun I/O).
//
// Esporta:
//   fuelPlan({ lapsLeft, fuelPerLap, marginPct? })     → litri necessari con margine
//   pitWindow({ totalLaps, tankLaps, pitLossSec?, ... }) → giri in cui conviene fermarsi
//   weatherScenarios({ lapsLeft, changeLap, ... })      → tempi di rientro per scenario

const r2 = (v) => Math.round(v * 100) / 100;

/** Margine di sicurezza sul consumo (default 5%). */
export const DEFAULT_FUEL_MARGIN = 0.05;

/**
 * Carburante necessario per chiudere la gara, con margine percentuale.
 * Ritorna { base, withMargin, marginPct } o null se i dati non bastano.
 */
export function fuelPlan({ lapsLeft, fuelPerLap, marginPct = DEFAULT_FUEL_MARGIN } = {}) {
  const laps = Number(lapsLeft);
  const perLap = Number(fuelPerLap);
  if (!Number.isFinite(laps) || laps < 0 || !Number.isFinite(perLap) || perLap <= 0) return null;
  const base = laps * perLap;
  return { base: r2(base), withMargin: r2(base * (1 + marginPct)), marginPct };
}

/**
 * Finestra di una sosta singola. Il serbatoio copre tankLaps giri pieni: la
 * sosta deve avvenire al giro `latest` (tankLaps meno il margine), e il
 * secondo stint deve coprire i giri restanti, quindi la sosta non può essere
 * prima del giro `earliest` (totalLaps - tankLaps). Se earliest > latest una
 * sola sosta non basta. Ritorna { needed, feasible, earliest, latest }.
 */
export function pitWindow({ totalLaps, tankLaps, marginLaps = 1 } = {}) {
  const total = Number(totalLaps);
  const tank = Number(tankLaps);
  if (!Number.isFinite(total) || !Number.isFinite(tank) || tank <= 0 || total <= 0) return null;
  if (total <= tank) return { needed: false, feasible: true, earliest: null, latest: null };
  const latest = Math.max(1, Math.floor(tank) - marginLaps);
  const earliest = Math.max(1, total - Math.floor(tank));
  return { needed: true, feasible: earliest <= latest, earliest, latest };
}

/**
 * Scenari di cambio meteo: per ogni pista bagnata che arriva al giro changeLap,
 * stima il tempo di gara extra se si resta in slick (pioggia da fermo) oppure
 * se si rientra in pit per le intermedie. Il costo di rientro è pitLossSec.
 * Ritorna [{ name, extraSec, note }] ordinati per costo crescente.
 */
export function weatherScenarios({ lapsLeft, changeLap, slickPenaltySecPerLap = 3, pitLossSec = 25, wetLapGainSec = 0 } = {}) {
  const left = Number(lapsLeft);
  const change = Number(changeLap);
  if (!Number.isFinite(left) || !Number.isFinite(change) || left <= 0) return [];
  const rainLaps = Math.max(0, left - Math.max(0, change));
  const scenarios = [
    {
      name: 'resta in slick',
      extraSec: r2(rainLaps * slickPenaltySecPerLap),
      note: 'nessuna sosta, ma perdi tempo ad ogni giro bagnato',
    },
    {
      name: 'rientra per intermedie',
      extraSec: r2(pitLossSec - rainLaps * wetLapGainSec),
      note: 'costo fisso di una sosta, poi tempi regolari sul bagnato',
    },
  ];
  return scenarios.sort((a, b) => a.extraSec - b.extraSec);
}

/**
 * Battaglia ai box: UNDERCUT e OVERCUT dai numeri misurati.
 *
 * Modello esplicito, niente dati inventati:
 *  - `degSecPerLap` è il degrado del ritmo MISURATO da usura-gomme sul tuo .ld;
 *  - `pitLossSec` è il costo della sosta (default 30 s, come la finestra pit);
 *  - il break-even è `pitLoss / degrado`: quanti giri di gomma fresca servono
 *    per ripagare una sosta. Entro quel numero di giri la gomma fresca vale
 *    `deg * giri` secondi: è la finestra d'attacco.
 *
 * UNDERCUT: sei dietro a `gapAheadSec` e la finestra vale più del gap → rientra
 * ora, esci davanti. OVERCUT: sei davanti a `gapBehindSec`; il cuscinetto diviso
 * per il degrado dice quanti giri puoi restare fuori prima che l'inseguitore
 * ti sia addosso — se lui rientra prima, la posizione è tua.
 * Con dati incompleti (niente degrado, niente giri, niente gap) → null: la
 * radio tace invece di inventare una strategia.
 */
export function pitBattle({ gapAheadSec, gapBehindSec, degSecPerLap, pitLossSec = 30, lapsLeft, maxGapSec = 5 } = {}) {
  const deg = Number(degSecPerLap);
  const pit = Number(pitLossSec);
  const laps = Number(lapsLeft);
  const gapA = Number(gapAheadSec);
  const gapB = Number(gapBehindSec);
  if (!Number.isFinite(deg) || deg <= 0) return null;
  if (!Number.isFinite(pit) || pit <= 5) return null;
  if (!Number.isFinite(laps) || laps < 3) return null;
  if (!Number.isFinite(gapA) && !Number.isFinite(gapB)) return null;

  const breakEvenLaps = Math.ceil(pit / deg);
  const usableLaps = Math.min(Math.floor(laps), breakEvenLaps);
  const gainSec = r2(deg * usableLaps);

  const undercut = Number.isFinite(gapA) && gapA > 0 && gapA <= maxGapSec
    ? { gapSec: r2(gapA), netSec: r2(gainSec - gapA), possible: gainSec - gapA > 0 }
    : null;
  const overcutLaps = Number.isFinite(gapB) && gapB > 0 && gapB <= maxGapSec
    ? Math.floor(gapB / deg)
    : null;
  const overcut = overcutLaps != null
    ? { gapSec: r2(gapB), holdLaps: overcutLaps, possible: overcutLaps >= 1 }
    : null;

  const action = undercut?.possible ? 'undercut'
    : overcut?.possible ? 'overcut'
    : 'stay';
  return { action, breakEvenLaps, usableLaps, gainSec, undercut, overcut, degSecPerLap: r2(deg), pitLossSec: Math.round(pit), lapsLeft: Math.floor(laps) };
}
