// engineer.mjs — l'ingegnere di gara LIVE del cruscotto.
// Il meccanico dice cosa settare PRIMA dell'uscita; l'ingegnere parla DURANTE:
// prende la snapshot della shared memory (benzina, usura gomme, giri, gap) e il
// consumo per giro dalla telemetria recente, e restituisce la radio del BOX
// aggiornata "adesso".
//
// Funzione pura: niente filesystem qui — l'input lo costruisce il chiamante,
// così è testabile anche senza il gioco aperto.

const WHEEL_NAMES = ['LF', 'RF', 'LR', 'RR'];

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
      title: `Benzina per ${lapsOnFuel} giri, ne restano ${lapsLeft}`,
      text: deficit >= lapsLeft * 0.5
        ? 'non arrivi: se il pit è aperto la sosta è adesso, altrimenti gestisci'
        : 'stretta in fondo: risparmia benzo — lifting sul rettilineo fa guadagnare 0.2-0.4 L/giro',
      prio: 1,
    });
  } else if (lapsOnFuel != null && lapsLeft != null && lapsLeft > 0) {
    tips.push({
      icon: '⛽',
      title: `Benzina per ${lapsOnFuel} giri`,
      text: `giri da coprire ${lapsLeft} — margine ${r1(lapsOnFuel - lapsLeft)} giri: benzina ok`,
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
        tips.push({ icon: '🛞', title: `Gomma ${worst.wheel} al limite: ${worst.wear}%`, text: 'usura critica: gestisci il ritmo e evita i duelli, la gomma non regge', prio: 1 });
      } else if (worst.wear >= 55) {
        tips.push({ icon: '🛞', title: `Gomma ${worst.wheel} al ${worst.wear}%`, text: 'degrado visibile: stira la gomma se restano più di 4 giri', prio: 2 });
      } else {
        tips.push({ icon: '🛞', title: 'Gomme sane', text: `la più usata è la ${worst.wheel} al ${worst.wear}%. Spingi`, prio: 3 });
      }
    }
    gauges.wear = pct;
  }
  gauges.temp = player.tyreCoreTemp ?? null;

  /* ---------- gap: attacca o difendi ---------- */
  const gapAhead = Number(player.gapAhead), gapBehind = Number(player.gapBehind);
  if (Number.isFinite(gapAhead) && gapAhead > 0 && gapAhead < 1.5) {
    tips.push({ icon: '🏁', title: `A ${gapAhead.toFixed(1)}s da chi ti precede`, text: "finestra d'attacco: cambia traiettoria in frenata, il sorpasso nasce in staccata", prio: 2 });
  }
  if (Number.isFinite(gapBehind) && gapBehind > 0 && gapBehind < 1.2) {
    tips.push({ icon: '🛡️', title: `Attacchi da ${gapBehind.toFixed(1)}s`, text: 'difendi coprendo la traiettoria interna alla prima curva', prio: 2 });
  }

  /* ---------- pit / timer ---------- */
  if (player.inPit) {
    tips.push({ icon: '🔧', title: 'In pitlane', text: 'limiter on, no throttle — guarda la lavagna gomme prima di uscire', prio: 1 });
  }
  if (player.timeLeft && lapsLeft == null) {
    tips.push({ icon: '⏱️', title: `Timer gara: ${player.timeLeft}`, text: 'gara a tempo: finisce al taglio del giro corrente, il risparmio benzina conta fino a lì', prio: 2 });
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
