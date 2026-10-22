// engineer.mjs — l'ingegnere di gara LIVE del cruscotto.
// Il meccanico dice cosa settare PRIMA dell'uscita; l'ingegnere parla DURANTE:
// prende la snapshot della shared memory (benzina, usura gomme, giri, gap) e il
// consumo per giro dalla telemetria recente, e restituisce la radio del BOX
// aggiornata "adesso".
//
// Funzione pura: niente filesystem qui — l'input lo costruisce il chiamante,
// così è testabile anche senza il gioco aperto.

const WHEEL_NAMES = ['LF', 'RF', 'LR', 'RR'];

import { tr } from './lang.mjs';

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Consigli live dell'ingegnere.
 * snap = snapshot() del liveReader, arricchita nel chiamante: player.fuel,
 *        player.tyreWear, player.lapsDone, player.lapsTotal,
 *        player.gapAhead, player.gapBehind, player.inPit, player.timeLeft
 * ctx  = { fuelPerLap, raceLaps, timedRace }
 *        fuelPerLap: consumo medio dell'auto dalla telemetria recente
 *                    (può mancare: allora si usa lapsPossibleFuel del gioco
 *                    se il giocatore l'ha in HUD — non lo leggiamo dai dati)
 *        raceLaps:   giri previsti dalla ronda (card.round.laps)
 *
 * ritorna { ok, live, tips: [{icon,title,text}], gauges }
 *  - tips:   SOLO i consigli validi ADESSO (stesso formato dei tips statici del
 *            box radio del cruscotto: icona + titolo + testo)
 *  - gauges: i numeri crudi per il pannello (fuel, giri, gomme, gap)
 */
export function engineerLive(snap, ctx = {}) {
  const player = snap?.player ?? null;
  const inRace = !!snap?.live && snap?.session?.type === 'Race' && !!player;
  const gauges = {
    lapsDone: null, lapsTotal: null, fuel: null, lapsOnFuel: null, lapsLeft: null,
    wear: null, temp: null, gapAhead: null, gapBehind: null,
    position: null, drivers: null, timeLeft: null,
    raceLaps: ctx.raceLaps ?? null, fuelPerLap: ctx.fuelPerLap ?? null,
  };
  if (!player || !inRace) return { ok: true, live: false, tips: [], gauges };

  const tips = [];
  const fuelPerLap = Number(ctx.fuelPerLap);
  const fuel = Number(player.fuel);

  /* ---------- benzina ---------- */
  let lapsOnFuel = null;
  if (Number.isFinite(fuel) && fuel > 0) {
    const gameLaps = Number(player.lapsPossible);
    if (Number.isFinite(gameLaps) && gameLaps > 0) {
      lapsOnFuel = r1(gameLaps);
    } else if (Number.isFinite(fuelPerLap) && fuelPerLap > 0) {
      lapsOnFuel = r1(fuel / fuelPerLap);
    }
  }
  const lapsLeft = Number(player.lapsTotal) > 0 ? Math.max(0, player.lapsTotal - player.lapsDone) : null;
  const deficit = lapsLeft != null && lapsOnFuel != null ? r1(lapsLeft - lapsOnFuel) : null;
  if (deficit != null && deficit > 0.5) {
    tips.push({
      icon: '⛽',
      title: tr({ it: `Benzina per ${lapsOnFuel} giri, ne restano ${lapsLeft}`, en: `Fuel for ${lapsOnFuel} laps, ${lapsLeft} to go` }),
      text: tr({
        it: deficit >= lapsLeft * 0.5 ? 'non arrivi: se il pit è aperto la sosta è adesso, altrimenti gestisci' : 'stretta in fondo: risparmia benzo — lifting sul rettilineo fa guadagnare 0.2-0.4 L/giro',
        en: deficit >= lapsLeft * 0.5 ? "you won't make it: if the pit is open stop now, otherwise manage" : 'tight at the end: save fuel — lifting on the straights earns 0.2-0.4 L/lap',
      }),
      prio: 1,
    });
  } else if (lapsOnFuel != null && lapsLeft != null && lapsLeft > 0) {
    tips.push({
      icon: '⛽',
      title: tr({ it: `Benzina per ${lapsOnFuel} giri`, en: `Fuel for ${lapsOnFuel} laps` }),
      text: tr({ it: `giri da coprire ${lapsLeft} — margine ${r1(lapsOnFuel - lapsLeft)} giri: benzina ok`, en: `${lapsLeft} laps to cover — margin ${r1(lapsOnFuel - lapsLeft)} laps: fuel ok` }),
      prio: 3,
    });
  }

  /* ---------- gomme: usura per ruota, oggigiorno è 0-1 (vita rimasta) o 0-100 ---------- */
  const wear = (player.tyreWear ?? []).map((v) => Number(v));
  const wearVals = wear.filter(Number.isFinite);
  if (wearVals.length === 4) {
    // gioco um può mandare 0-1 o 0-100: normalizziamo al posto giusto
    const scale = wearVals.some((v) => v > 1.5) ? 1 : 100;
    const pct = wear.map((v) => (Number.isFinite(v) ? Math.round(v * scale * 10) / 10 : null));
    const worst = pct.reduce((a, v, i) => (v != null && (a == null || v > a.wear) ? { wheel: WHEEL_NAMES[i], wear: v } : a), null);
    if (worst) {
      if (worst.wear >= 80) {
        tips.push({ icon: '🛞', title: tr({ it: `Gomma ${worst.wheel} al limite: ${worst.wear}%`, en: `Tyre ${worst.wheel} at the limit: ${worst.wear}%` }), text: tr({ it: 'usura critica: gestisci il ritmo e evita i duelli, la gomma non regge', en: 'critical wear: manage the pace and avoid duels, the tyre will not hold' }), prio: 1 });
      } else if (worst.wear >= 55) {
        tips.push({ icon: '🛞', title: tr({ it: `Gomma ${worst.wheel} al ${worst.wear}%`, en: `Tyre ${worst.wheel} at ${worst.wear}%` }), text: tr({ it: 'degrado visibile: stira la gomma se restano più di 4 giri', en: 'visible degradation: stretch the tyre if more than 4 laps remain' }), prio: 2 });
      } else {
        tips.push({ icon: '🛞', title: tr({ it: 'Gomme sane', en: 'Tyres healthy' }), text: tr({ it: `la più usata è la ${worst.wheel} al ${worst.wear}%. Spingi`, en: `the most used is ${worst.wheel} at ${worst.wear}%. Push` }), prio: 3 });
      }
    }
    gauges.wear = pct;
  }
  gauges.temp = player.tyreCoreTemp ?? null;

  /* ---------- gap: attacca o difendi ---------- */
  const gapAhead = Number(player.gapAhead), gapBehind = Number(player.gapBehind);
  if (Number.isFinite(gapAhead) && gapAhead > 0 && gapAhead < 1.5) {
    tips.push({ icon: '🏁', title: tr({ it: `A ${gapAhead.toFixed(1)}s da chi ti precede`, en: `${gapAhead.toFixed(1)}s behind the car ahead` }), text: tr({ it: "finestra d'attacco: cambia traiettoria in frenata, il sorpasso nasce in staccata", en: "attack window: change lines under braking, the overtake is born under braking" }), prio: 2 });
  }
  if (Number.isFinite(gapBehind) && gapBehind > 0 && gapBehind < 1.2) {
    tips.push({ icon: '🛡️', title: tr({ it: `Attacchi da ${gapBehind.toFixed(1)}s`, en: `Attacked from ${gapBehind.toFixed(1)}s behind` }), text: tr({ it: 'difendi coprendo la traiettoria interna alla prima curva', en: 'defend by covering the inside line into the first corner' }), prio: 2 });
  }

  /* ---------- pit / timer ---------- */
  if (player.inPit) {
    tips.push({ icon: '🔧', title: tr({ it: 'In pitlane', en: 'In pitlane' }), text: tr({ it: 'limiter on, no throttle — guarda la lavagna gomme prima di uscire', en: 'limiter on, no throttle — check the tyre board before leaving' }), prio: 1 });
  }
  if (player.timeLeft && lapsLeft == null) {
    tips.push({ icon: '⏱️', title: tr({ it: `Timer gara: ${player.timeLeft}`, en: `Race timer: ${player.timeLeft}` }), text: tr({ it: 'gara a tempo: finisce al taglio del giro corrente, il risparmio benzina conta fino a lì', en: 'timed race: it ends when the current lap is crossed, fuel saving counts until then' }), prio: 2 });
  }

  tips.sort((a, b) => (a.prio ?? 9) - (b.prio ?? 9));
  gauges.lapsDone = player.lapsDone ?? null;
  gauges.lapsTotal = player.lapsTotal ?? null;
  gauges.fuel = Number.isFinite(fuel) ? r1(fuel) : null;
  gauges.lapsOnFuel = lapsOnFuel;
  gauges.lapsLeft = lapsLeft;
  gauges.gapAhead = Number.isFinite(gapAhead) ? r1(gapAhead) : null;
  gauges.gapBehind = Number.isFinite(gapBehind) ? r1(gapBehind) : null;
  gauges.position = player.position ?? null;
  gauges.drivers = player.drivers ?? null;
  gauges.timeLeft = player.timeLeft ?? null;
  gauges.raceLaps = ctx.raceLaps ?? null;
  gauges.fuelPerLap = Number.isFinite(fuelPerLap) ? fuelPerLap : null;
  return { ok: true, live: true, tips, gauges };
}
