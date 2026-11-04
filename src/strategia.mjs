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
export function pitBattle({ gapAheadSec, gapBehindSec, degSecPerLap, pitLossSec = 30, pitLossSource = 'default', lapsLeft, maxGapSec = 5 } = {}) {
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
  return { action, breakEvenLaps, usableLaps, gainSec, undercut, overcut, degSecPerLap: r2(deg), pitLossSec: Math.round(pit), pitLossSource: pitLossSource === 'measured' ? 'measured' : 'default', lapsLeft: Math.floor(laps) };
}

/**
 * PIT LOSS MISURATO dai giri di INGRESSO/USCITA (4/11).
 *
 * Un giro di ingresso finisce in corsia box (ultimi secondi sotto gli 80 km/h),
 * il successivo esce dalla corsia (primi secondi sotto gli 80 km/h). Il costo
 * della sosta è la somma dei due scarti dal ritmo verde di riferimento:
 * `(inLap − ref) + (outLap − ref)`. Il riferimento è la MEDIANA degli altri
 * giri della stessa sessione, così una sosta non sporca il ritmo di gara.
 *
 * Servono entrambi i lati e una coppia CONSECUTIVA: con un solo lato (out-lap
 * iniziale o in-lap finale di sessione) non si conosce il costo completo e la
 * funzione restituisce null — meglio il default dichiarato che un numero
 * costruito a metà. Con più soste nella stessa sessione restituisce la mediana.
 */
export function pitLossFromLaps(laps, { minSlowPct = 50, minDeltaSec = 2, minSec = 8, maxSec = 120 } = {}) {
  const valid = (Array.isArray(laps) ? laps : [])
    .filter((l) => Number.isFinite(l?.durationSec) && l.durationSec > 15);
  if (valid.length < 3) return null;
  const median = (vals) => {
    const a = vals.filter(Number.isFinite).sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)] : null;
  };
  const samples = [];
  for (let i = 0; i + 1 < valid.length; i++) {
    const inLap = valid[i], outLap = valid[i + 1];
    if ((inLap.endSlowPct ?? 0) < minSlowPct || (outLap.startSlowPct ?? 0) < minSlowPct) continue;
    const others = valid.filter((_, j) => j !== i && j !== i + 1).map((l) => l.durationSec);
    const ref = median(others);
    if (ref == null) continue;
    const inDelta = inLap.durationSec - ref;
    const outDelta = outLap.durationSec - ref;
    if (inDelta < minDeltaSec || outDelta < minDeltaSec) continue;
    const sec = inDelta + outDelta;
    if (sec < minSec || sec > maxSec) continue;
    samples.push({ sec, inLap: inLap.lap ?? i + 1, outLap: outLap.lap ?? i + 2, refSec: Math.round(ref * 10) / 10 });
    i++; // l'out-lap non può essere anche l'in-lap della sosta successiva
  }
  if (!samples.length) return null;
  const sec = median(samples.map((s) => s.sec));
  return {
    sec: Math.round(sec * 10) / 10,
    samples: samples.length,
    inLap: samples[0].inLap,
    outLap: samples[0].outLap,
    refSec: samples[0].refSec,
  };
}
