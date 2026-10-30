// stint-plan.mjs — IL PIANO STINT di endurance (DA-9): finestre di sosta e
// stint calcolati PRIMA della gara dai dati VERO del sedile.
//
// «Una sola verità»: qui non si inventa NIENTE.
//   • consumo (fuelPerLap) e ritmo (lapSec) → dalle uscite MoTeC del sedile
//     (i file .ld dell'auto che corri: collectSessions() di motec.mjs);
//   • serbatoio (tankMax) → il MASSIMO di benzina a inizio giro mai osservato
//     nel canale FUEL: il gioco non scrive la capacità, solo il vivo la mostra;
//   • durata gara (raceMin) → la ronda a tempo del calendario (durationMin).
// Se un pezzo manca, il piano ESCE SENZA QUEL PEZZO (ok:false + reason): la
// card non mostra una finestra che i dati non buttano fuori. La stima dei giri
// usa il MIGLIOR giro osservato: il piano preferisce essere CAUTO — cacciare
// fuori dalla pista per benzina finita è molto peggio che fermarsi un giretto
// prima del necessario.
//
// Esporta:
//   seatStintInputs(sessions)                          → { fuelPerLap, lapSec, tankMax, n } | null
//   stintPlanOf({ raceMin, lapSec, fuelPerLap, tankMax }) → piano | null
//   stintStopAlert(plan, lapsDone)                     → alert da dire con voce vivissima | null

const r1 = (v) => Math.round(v * 10) / 10;
import { tr } from './lang.mjs';

/** Margine sul consumo: il piano non parte mai da zero di benzina in fondo. */
export const DEFAULT_FUEL_MARGIN = 0.05;

/**
 * I INGREDIENTI del piano DAI DATI DEL TUO SEDILE. `sessions` è l'output di
 * collectSessions() (motec.mjs): file .ld veri dell'auto con laps[] che
 * portano fuelStart/fuelEnd. Aggrega:
 *   • fuelPerLap: media PESATA per giri validi delle sessioni (non media di medie);
 *   • lapSec: media dei MIGLIOR giri di sessione (ritmo da gara vera, non da prove fredde);
 *   • tankMax: il massimo benzina a bordo osservato a inizio giro — il serbatoio
 *     visto dal vivo (se i file partono sempre a metà serbatoio, il limite
 *     osservato è quello: il piano non finge di conoscerne di più);
 *   • n: quante sessioni hanno parlato.
 * Sotto UNA sessione con benzina utile → null: niente piano finto.
 */
export function seatStintInputs(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const utili = list.filter((s) => Number.isFinite(s?.fuelPerLap) && s.fuelPerLap > 0
    && Number.isFinite(s?.bestLapSec) && s.bestLapSec > 0
    && Array.isArray(s?.laps) && s.laps.length > 0);
  if (!utili.length) return null;
  let giriTot = 0, fuelSomma = 0;
  const best = [];
  let tankMax = 0;
  for (const s of utili) {
    const giri = Number(s.validLaps) > 0 ? Math.min(Number(s.validLaps), s.laps.length) : s.laps.length;
    giriTot += giri;
    fuelSomma += s.fuelPerLap * giri;
    best.push(s.bestLapSec);
    for (const l of s.laps) {
      const fs = Number(l?.fuelStart);
      if (Number.isFinite(fs) && fs > tankMax) tankMax = fs;
    }
  }
  const fuelPerLap = Math.round((fuelSomma / giriTot) * 100) / 100;
  const lapSec = Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 100) / 100;
  return {
    fuelPerLap,
    lapSec,
    tankMax: tankMax > 0 ? r1(tankMax) : null,
    n: utili.length,
  };
}

/**
 * Il piano di stint per una GARA A TEMPO. Tutto ciò che entra è misurato
 * (seatStintInputs) o scritto dal calendario (raceMin); se manca un pezzo:
 * ok:false + reason — i dati non bastano per promettere una finestra.
 * L'uscita parla con onestà: estLaps, stintLaps, n stint con i loro litri, e le
 * FINESTRE di sosta (per ogni sosta k: il giro più tardi senza rimanere a secco,
 * il più presto che non lascia giri impossibili all'ultimo stint).
 */
export function stintPlanOf({ raceMin, lapSec, fuelPerLap, tankMax, fuelMarginPct = DEFAULT_FUEL_MARGIN } = {}) {
  const rMin = Number(raceMin);
  const step = Number(lapSec);
  const perLap = Number(fuelPerLap);
  const tank = Number(tankMax);
  if (!Number.isFinite(rMin) || rMin < 5) return { ok: false, reason: 'durata' };
  if (!Number.isFinite(step) || step < 10) return { ok: false, reason: 'ritmo' };
  if (!Number.isFinite(perLap) || perLap <= 0) return { ok: false, reason: 'consumo' };
  if (!Number.isFinite(tank) || tank <= 0) return { ok: false, reason: 'serbatoio' };

  // durata → giri stimati col ritmo VERO del sedile
  const estLaps = Math.max(1, Math.floor((rMin * 60) / step));
  // benzina necessaria (con margine) e stint utile (93% del serbatoio osservato:
  // la riserva finale non è del piano, è del coraggio del pilota in pista)
  const totalFuel = Math.ceil(estLaps * perLap * (1 + fuelMarginPct));
  const usable = Math.floor(tank * 0.93);
  const stintLaps = Math.max(1, Math.floor(usable / perLap));
  const nStints = Math.max(1, Math.ceil(estLaps / stintLaps));
  const stops = nStints - 1;
  const stintLitri = Math.min(usable, totalFuel);

  // FINESTRE: la sosta k (k = 1..stops) deve avvenire
  //   • non DOPO il giro k·stintLaps (gli stint prima non superano il serbatoio)…
  //   • …ne PRIMA del giro che lascia ai stint restanti i giri che restano.
  const windows = [];
  for (let k = 1; k <= stops; k++) {
    const latest = Math.min(k * stintLaps, estLaps);
    const earliest = Math.max(1, estLaps - (nStints - k) * stintLaps);
    if (earliest > latest) continue;   // incoerenza della stima: non la si forza
    windows.push({ k, earliest, latest, mid: Math.floor((earliest + latest) / 2) });
  }

  const notes = [
    tr({
      it: `Gara da ~${estLaps} giri (${rMin} min col tuo ritmo ~${step.toFixed(1)} s): spendi ~${totalFuel} l`,
      en: `~${estLaps}-lap race (${rMin} min at your ~${step.toFixed(1)} s pace): ~${totalFuel} l burnt`,
    }),
    tr({
      it: stops === 0
        ? 'NESSUNA sosta necessaria: ci stai con un serbatoio pieno e margine'
        : `${stops === 1 ? '1 sosta' : `${stops} soste`}: stint da ~${stintLaps} giri (~${Math.round((stintLaps * step) / 60)} min), rifornisci ~${stintLitri} l per stint`,
      en: stops === 0
        ? 'NO stop needed: one full tank plus margin gets you there'
        : `${stops} stop${stops === 1 ? '' : 's'}: ~${stintLaps}-lap stints (~${Math.round((stintLaps * step) / 60)} min), fill ~${stintLitri} l per stint`,
    }),
  ];
  for (const w of windows) {
    notes.push(tr({
      it: `Sosta ${w.k}: tra il giro ${w.earliest} e il giro ${w.latest} (centrata: giro ${w.mid})`,
      en: `Stop ${w.k}: between lap ${w.earliest} and lap ${w.latest} (target: lap ${w.mid})`,
    }));
  }

  return {
    ok: true,
    raceMin: Math.round(rMin), estLaps, lapSec, fuelPerLap, tankMax: r1(tank),
    totalFuel, usable, stintLaps, nStints, stops, stintLitri,
    windows,
    marginPct: fuelMarginPct,
    notes,
  };
}

/**
 * LA FINESTRA VIVA del piano, dal contatore giri del vivo (DA-9 seconda fetta):
 * entra il piano e i GIRI COMPIUTI del sedile (lapsDone dell'HUD o la scorta
 * lapNo del delta — i narratori hanno già il loro contatore filtrato), esce la
 * PRIMA sosta la cui finestra è ancora raggiungibile (latest >= compiuto+1)
 * con `lapsTo` = quanti giri mancano all'ULTIMO giro utile (0 = QUESTO giro è
 * la scadenza del piano). Finestre già scadute si saltano: il piano non torna
 * indietro. Ferma un piano stoppato, senza finestre o con contatore assente →
 * null: i narratori gridano solo `'box entro N giri'` quando il piano ne
 * contiene davvero uno. CONSUMATORE: il narratore unico del copilota
 * (tools/_monitor-copilota.mjs) e il pannello dell'ingegnere (viste-a.js).
 */
export function stintStopAlert(plan, lapsDone) {
  if (!plan || plan.ok !== true || !Array.isArray(plan.windows)) return null;
  const done = Number(lapsDone);
  // null/undefined NON è 0: senza contatore (HUD muto) non si annuncia nulla —
  // «a quanti giri dal box» con il contatore finto è la stringa che mente
  if (lapsDone == null || !Number.isFinite(done) || done < 0) return null;
  const w = plan.windows.find((x) => x != null && Number.isFinite(x.latest) && x.latest >= done + 1);
  if (!w) return null;
  return { ...w, lapsTo: Math.max(0, w.latest - (done + 1)) };
}

