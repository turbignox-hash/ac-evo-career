// bilancio-freni.mjs — BILANCIO DI FRENATA PER RUOTA dai file .ld di MoTeC
// che EVO scrive da solo in Saved Games\ACE\MoTec\<auto>\<pista>\.
//
// Cosa misura, e da quali canali (niente stime quando il canale manca):
//   - RIPARTIZIONE: coppia frenante APPLICATA per ruota (BRAKE_TORQUE_LF/RF/LR/RR,
//     Nm) integrata nel tempo di frenata (BRAKE > 5%): quota per ruota, asse
//     anteriore/posteriore e sbilanciamento sinistra/destra DENTRO l'asse.
//   - FADE: coppia per unità di pedale (Nm per punto di BRAKE) nella stessa
//     fascia di pedale, confrontata tra i campioni più FREDDI e i più CALDI
//     (quarti di temperatura dell'asse). Se la coppia per pedale cala col calore,
//     i freni svaniscono: la percentuale è la perdita misurata.
//
// Onestà del dato:
//   - Senza BRAKE_TORQUE_xx il modulo NON stima niente: risponde ok:false con
//     l'elenco dei canali mancanti (alcuni .ld vecchi non li hanno).
//   - La fascia di pedale 30–85% evita il fondo corsa, dove la coppia satura e
//     il rapporto coppia/pedale mentirebbe.
//   - Il fade si dichiara solo con campioni sufficienti e con un salto termico
//     vero tra i due gruppi; altrimenti il campo è null con il motivo.
//
// Esporta: brakeBalance(ldFile, opts)

import { ldReader, parseLdx } from './motec.mjs';
import { tr } from './lang.mjs';

const WHEELS = ['LF', 'RF', 'LR', 'RR'];
const AXLES = { front: ['LF', 'RF'], rear: ['LR', 'RR'] };

/** fascia di pedale usata per il fade: sotto saturazione, sopra il trascinamento. */
export const FADE_PEDAL_BAND = [0.3, 0.85];
/** campioni minimi per gruppo (freddo/caldo) perché il fade sia dichiarabile. */
export const FADE_MIN_SAMPLES = 25;
/** salto termico minimo (°C) tra i due gruppi. */
export const FADE_MIN_SPREAD_C = 40;

const r0 = (v) => (Number.isFinite(v) ? Math.round(v) : null);
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/** BRAKE è in % (0–100) nei file EVO; accetta anche 0–1 senza ambiguità. */
function pedal01(v) {
  if (!Number.isFinite(v)) return null;
  const x = v <= 1.5 ? v : v / 100;
  return Math.max(0, Math.min(1, x));
}

const median = (vals) => {
  const v = vals.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Bilancio di frenata di un file .ld.
 *
 * opts.step     passo di campionamento in secondi (default 0.05 = 20 Hz)
 * opts.maxLaps  limite di giri nel dettaglio per giro (default 12)
 */
export function brakeBalance(ldFile, { step = 0.05, maxLaps = 12 } = {}) {
  const rd = ldReader(ldFile);
  if (!rd) return null;

  const missing = [];
  if (!rd.has('BRAKE')) missing.push('BRAKE');
  for (const w of WHEELS) if (!rd.has('BRAKE_TORQUE_' + w)) missing.push('BRAKE_TORQUE_' + w);
  if (missing.length) {
    return {
      ok: false,
      reason: 'canali',
      missing,
      durationSec: r0(rd.duration),
      hint: tr({
        it: `Questo .ld non porta i canali della coppia frenante (${missing.join(', ')}): la ripartizione per ruota non si può misurare. Servono sessioni registrate con la telemetria completa.`,
        en: `This .ld has no brake torque channels (${missing.join(', ')}): per-wheel split cannot be measured. Sessions recorded with full telemetry are required.`,
      }),
    };
  }

  const torqueTime = { LF: 0, RF: 0, LR: 0, RR: 0 }; // Nm·s durante la frenata
  const torqueSum = { LF: 0, RF: 0, LR: 0, RR: 0 };
  const torquePeak = { LF: 0, RF: 0, LR: 0, RR: 0 };
  const tempSum = { LF: 0, RF: 0, LR: 0, RR: 0 };
  const tempPeak = { LF: 0, RF: 0, LR: 0, RR: 0 };
  const tempN = { LF: 0, RF: 0, LR: 0, RR: 0 };
  const fadePairs = { front: [], rear: [] };
  let brakeSamples = 0;
  let samples = 0;
  let pedalSum = 0;
  let pedalPeak = 0;

  for (let t = 0; t < rd.duration; t += step) {
    const p = pedal01(rd.at('BRAKE', t));
    if (p == null) continue;
    samples++;
    if (p <= 0.05) continue;
    brakeSamples++;
    pedalSum += p;
    if (p > pedalPeak) pedalPeak = p;

    const tq = {};
    for (const w of WHEELS) tq[w] = Math.max(0, rd.at('BRAKE_TORQUE_' + w, t) ?? 0);

    for (const w of WHEELS) {
      torqueTime[w] += tq[w] * step;
      torqueSum[w] += tq[w];
      if (tq[w] > torquePeak[w]) torquePeak[w] = tq[w];
      const temp = rd.at('BRAKE_TEMP_' + w, t);
      if (temp != null) {
        tempSum[w] += temp;
        tempN[w]++;
        if (temp > tempPeak[w]) tempPeak[w] = temp;
      }
    }

    // FADE: solo nella fascia di pedale utile, con le temperature dell'asse
    if (p >= FADE_PEDAL_BAND[0] && p <= FADE_PEDAL_BAND[1]) {
      for (const [axle, wheels] of Object.entries(AXLES)) {
        const temps = wheels.map((w) => rd.at('BRAKE_TEMP_' + w, t));
        if (temps.some((v) => v == null)) continue;
        const gain = (tq[wheels[0]] + tq[wheels[1]]) / p; // Nm per punto di pedale
        fadePairs[axle].push({ temp: (temps[0] + temps[1]) / 2, gain });
      }
    }
  }

  const totalTorqueTime = WHEELS.reduce((a, w) => a + torqueTime[w], 0);
  if (!(totalTorqueTime > 0) || brakeSamples < 20) {
    return {
      ok: false,
      reason: 'dati',
      durationSec: r0(rd.duration),
      hint: tr({
        it: 'La sessione non contiene frenate misurabili (pedale o coppia sempre a zero): fai qualche giro con la telemetria attiva.',
        en: 'This session has no measurable braking (pedal or torque always zero): drive a few laps with telemetry on.',
      }),
    };
  }

  const share = (w) => r1((torqueTime[w] / totalTorqueTime) * 100);
  const wheels = {};
  for (const w of WHEELS) {
    wheels[w] = {
      sharePct: share(w),
      torqueAvgNm: r0(torqueSum[w] / brakeSamples),
      torquePeakNm: r0(torquePeak[w]),
      tempAvgC: tempN[w] ? r0(tempSum[w] / tempN[w]) : null,
      tempPeakC: tempN[w] ? r0(tempPeak[w]) : null,
    };
  }

  const frontPct = r1(((torqueTime.LF + torqueTime.RF) / totalTorqueTime) * 100);
  const rearPct = r1(100 - frontPct);
  const leftPct = r1(((torqueTime.LF + torqueTime.LR) / totalTorqueTime) * 100);
  const frontSplit = torqueTime.LF + torqueTime.RF;
  const rearSplit = torqueTime.LR + torqueTime.RR;
  const lfOfFrontPct = frontSplit > 0 ? r1((torqueTime.LF / frontSplit) * 100) : null;
  const lrOfRearPct = rearSplit > 0 ? r1((torqueTime.LR / rearSplit) * 100) : null;

  const fadeOf = (pairs) => {
    const valid = pairs.filter((x) => Number.isFinite(x.temp) && Number.isFinite(x.gain));
    const n = valid.length;
    if (n < FADE_MIN_SAMPLES * 2) {
      return {
        pct: null, fromC: null, toC: null, samples: n,
        reason: tr({
          it: `campioni insufficienti nella fascia ${Math.round(FADE_PEDAL_BAND[0] * 100)}–${Math.round(FADE_PEDAL_BAND[1] * 100)}% di pedale (${n})`,
          en: `not enough samples in the ${Math.round(FADE_PEDAL_BAND[0] * 100)}–${Math.round(FADE_PEDAL_BAND[1] * 100)}% pedal band (${n})`,
        }),
      };
    }
    const sorted = valid.slice().sort((a, b) => a.temp - b.temp);
    const k = Math.max(1, Math.floor(n / 4));
    const cold = sorted.slice(0, k);
    const hot = sorted.slice(n - k);
    const gCold = median(cold.map((x) => x.gain));
    const gHot = median(hot.map((x) => x.gain));
    const tCold = median(cold.map((x) => x.temp));
    const tHot = median(hot.map((x) => x.temp));
    if (gCold == null || gHot == null || !(gCold > 0)) {
      return { pct: null, fromC: r0(tCold), toC: r0(tHot), samples: n, reason: tr({ it: 'coppia per pedale non calcolabile', en: 'torque per pedal not computable' }) };
    }
    if (!(tHot - tCold >= FADE_MIN_SPREAD_C)) {
      return {
        pct: null, fromC: r0(tCold), toC: r0(tHot), samples: n,
        reason: tr({
          it: `salto termico troppo piccolo (${r0(tHot - tCold)} °C, servono ${FADE_MIN_SPREAD_C})`,
          en: `temperature spread too small (${r0(tHot - tCold)} °C, ${FADE_MIN_SPREAD_C} needed)`,
        }),
      };
    }
    const pct = r1(((gHot - gCold) / gCold) * 100);
    const verdict = pct <= -8
      ? tr({ it: `fade: -${Math.abs(pct)}% di coppia per punto di pedale tra ${r0(tCold)} e ${r0(tHot)} °C`, en: `fade: -${Math.abs(pct)}% torque per pedal point between ${r0(tCold)} and ${r0(tHot)} °C` })
      : pct >= 5
        ? tr({ it: `guadagno +${pct}%: i freni entrano in finestra salendo di temperatura (${r0(tCold)} -> ${r0(tHot)} °C)`, en: `gain +${pct}%: brakes come into window as they warm up (${r0(tCold)} -> ${r0(tHot)} °C)` })
        : tr({ it: `nessun fade misurabile (${pct > 0 ? '+' : ''}${pct}%): coppia stabile tra ${r0(tCold)} e ${r0(tHot)} °C`, en: `no measurable fade (${pct > 0 ? '+' : ''}${pct}%): torque stable between ${r0(tCold)} and ${r0(tHot)} °C` });
    return { pct, fromC: r0(tCold), toC: r0(tHot), samples: n, verdict };
  };

  // DETTAGLIO PER GIRO: la deriva della ripartizione e delle temperature nel
  // corso della sessione (un asse che si scalda più dell'altro sposta il bias).
  const beacons = parseLdx(String(ldFile).replace(/\.ld$/i, '.ldx'));
  const bounds = [];
  if (beacons.length >= 2) {
    for (let g = 0; g < beacons.length && bounds.length < maxLaps; g++) {
      bounds.push([beacons[g], g + 1 < beacons.length ? beacons[g + 1] : rd.duration]);
    }
  }
  const perLap = [];
  bounds.forEach(([a, b], i) => {
    if (!(b - a > 10)) return;
    let ft = 0, rt = 0, fPeak = 0, rPeak = 0, n = 0;
    for (let t = a; t < b; t += 0.1) {
      const p = pedal01(rd.at('BRAKE', t));
      if (p == null || p <= 0.05) continue;
      const lf = Math.max(0, rd.at('BRAKE_TORQUE_LF', t) ?? 0);
      const rf = Math.max(0, rd.at('BRAKE_TORQUE_RF', t) ?? 0);
      const lr = Math.max(0, rd.at('BRAKE_TORQUE_LR', t) ?? 0);
      const rr = Math.max(0, rd.at('BRAKE_TORQUE_RR', t) ?? 0);
      ft += lf + rf;
      rt += lr + rr;
      n++;
      for (const w of AXLES.front) fPeak = Math.max(fPeak, rd.at('BRAKE_TEMP_' + w, t) ?? 0);
      for (const w of AXLES.rear) rPeak = Math.max(rPeak, rd.at('BRAKE_TEMP_' + w, t) ?? 0);
    }
    if (!n || !(ft + rt > 0)) return;
    perLap.push({
      lap: i + 1,
      durationSec: r1(b - a),
      frontPct: r1((ft / (ft + rt)) * 100),
      frontPeakC: fPeak ? r0(fPeak) : null,
      rearPeakC: rPeak ? r0(rPeak) : null,
    });
  });

  return {
    ok: true,
    durationSec: r0(rd.duration),
    laps: perLap.length || null,
    wheels,
    balance: {
      frontPct,
      rearPct,
      leftPct,
      rightPct: r1(100 - leftPct),
      lfOfFrontPct,
      lrOfRearPct,
    },
    pedal: {
      brakingSharePct: r1((brakeSamples / Math.max(1, samples)) * 100),
      avgPct: r1((pedalSum / Math.max(1, brakeSamples)) * 100),
      peakPct: r1(pedalPeak * 100),
      fadeBandPct: [Math.round(FADE_PEDAL_BAND[0] * 100), Math.round(FADE_PEDAL_BAND[1] * 100)],
    },
    fade: { front: fadeOf(fadePairs.front), rear: fadeOf(fadePairs.rear) },
    perLap,
  };
}
