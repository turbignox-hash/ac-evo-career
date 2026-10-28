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
