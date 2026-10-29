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

/* ------------------------------------------------------------------ */
/* finestra pit: QUANDO fermarsi                                        */
/* ------------------------------------------------------------------ */

/**
 * La finestra pit ragionata: fonde le due ragioni di sosta e dice «entro
 * questo giro, se non vuoi finire a corto».
 *
 *  - benzina: se i giri copribili (lapsOnFuel) non bastano ai giri restanti
 *    (lapsLeft) la sosta è obbligatoria; l'orario più tardi possibile è il
 *    giro in cui il serbatoio si asciuga.
 *  - gomme: dal consumo medio di gomma (usura / giri fatti) stima il giro in
 *    cui la gomma peggiore tocca la soglia critica dell'85%; si consiglia la
 *    sosta solo se quel limite torna DENTRO la gara.
 *
 * Decide QUANDO, non CONVIENE: sapere se fermarsi è più veloce resta
 * all'umano — qui il numero arriva prima che arrivi la gomma a terra.
 *
 * Input: gauges = le misure già assemblate da engineerLive; opts = { inRace, lapsTotal, pitLossSec }
 * Ritorna: null (fuori gara / senza dati) oppure:
 *  { need: 'fuel'|'wear'|'both', reason, pitLap, lapsToWindow,
 *    window: [startLap, endLap], wear: {worst, rate, criticalLap}|null,
 *    fuel: {lapsOnFuel, lapsLeft, deficit, pitLap}|null, pitLossSec }
 */
export function pitWindow(gauges, opts = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const lapsTotal = num(opts.lapsTotal);
  const lapsDone = num(gauges?.lapsDone);
  const wear = Array.isArray(gauges?.wear) ? gauges.wear.filter((v) => v != null) : [];
  const lapsOnFuel = num(gauges?.lapsOnFuel);
  const lapsLeft = num(gauges?.lapsLeft);
  const inRace = !!opts.inRace;
  const pitLossSec = num(opts.pitLossSec) > 5 ? Math.round(num(opts.pitLossSec)) : 30;
  if (!inRace || lapsDone == null) return null;

  /* ---------- benzina ---------- */
  let fuel = null;
  if (lapsOnFuel != null && lapsLeft != null && lapsLeft > 0) {
    const deficit = r1(lapsLeft - lapsOnFuel);
    if (deficit > 0.5) {
      // il giro più tardi possibile: sì a completare il giro, ma su quell'ultimo giro
      // il serbatoio è uguale a zero: fermarci è l'ultimissima chance.
      const latest = lapsTotal != null ? Math.min(lapsTotal - 1, lapsDone + Math.max(0, Math.ceil(lapsOnFuel) - 1)) : lapsDone + Math.max(0, Math.ceil(lapsOnFuel) - 1);
      fuel = { lapsOnFuel, lapsLeft, deficit, pitLap: Math.max(lapsDone + 1, latest) };
    }
  }

  /* ---------- gomme ---------- */
  let wearOut = null;
  const worst = wear.length ? r1(Math.max(...wear)) : null;
  if (worst != null && lapsDone > 0) {
    const rate = Math.round((worst / lapsDone) * 100) / 100;   // % di usura per giro
    if (rate > 0) {
      const CRIT = 85;                                         // sopra la soglia la gomma non regge
      const remain = CRIT - worst;
      if (remain <= 0) {
        wearOut = { worst, rate, criticalLap: lapsDone, now: true };
      } else {
        const criticalLap = lapsDone + Math.ceil(remain / rate);
        // consiglio di fermarsi SOLO se il limite torna dentro la gara
        if (lapsTotal == null || criticalLap <= lapsTotal - 1) {
          wearOut = { worst, rate, criticalLap, now: false };
        }
      }
    } else if (worst >= 85) {
      wearOut = { worst, rate: 0, criticalLap: lapsDone, now: true };
    }
  }

  /* ---------- fonde le due pressioni: il pit lap è la prima scadenza ---------- */
  const scadenze = [fuel?.pitLap, wearOut?.criticalLap].filter((v) => Number.isFinite(v));
  if (!scadenze.length && !fuel && !wearOut) {
    // niente benzina esplicita e niente usura fuori soglia: nessuna sosta prevista
    return { need: null, reason: tr({ it: 'nessuna sosta prevista', en: 'no stop expected' }), pitLap: null, lapsToWindow: null, window: null, wear: null, fuel: null, pitLossSec };
  }
  const pitLap = scadenze.length ? Math.max(lapsDone + 1, Math.min(...scadenze)) : lapsDone + 1;
  const both = fuel && wearOut && Math.abs(fuel.pitLap - wearOut.criticalLap) <= 1;
  const need = both ? 'both' : (fuel ? 'fuel' : 'wear');
  const reason = both
    ? tr({ it: 'benzina e gomme scadono nello stesso giro', en: 'fuel and tyres due the same lap' })
    : need === 'fuel'
      ? tr({ it: `benzina manca di ${fuel.deficit} giri`, en: `fuel short by ${fuel.deficit} laps` })
      : (wearOut?.now
        ? tr({ it: `gomma ${worst}% al limite: fermarsi`, en: `tyre at ${worst}%: pit now` })
        : tr({ it: `gomma peggiore (${worst}%) al limite al giro ${wearOut.criticalLap + 1}`, en: `worst tyre (${worst}%) hits the limit on lap ${wearOut.criticalLap + 1}` }));
  // la finestra: si può anticipare di un giro (traction e buon senso), non ritardare
  const window = [Math.max(lapsDone + 1, pitLap - 1), Math.max(lapsDone + 1, pitLap)];
  return { need, reason, pitLap, lapsToWindow: Math.max(0, pitLap - (lapsDone + 1)), window, wear: wearOut, fuel, pitLossSec };
}

/**
 * Consigli live dell'ingegnere.
 *
 * snap = snapshot() del liveReader, arricchita nel chiamante: player.fuel,
 *        player.tyreWear, player.lapsDone, player.lapsTotal,
 *        player.gapAhead, player.gapBehind, player.inPit, player.timeLeft
 * ctx  = { fuelPerLap, raceLaps, timedRace }
 *        fuelPerLap: consumo medio dell'auto dalla telemetria recente
 *                    (può mancare: allora si usa lapsPossibleFuel del gioco
 *                    se il giocatore l'ha in HUD — non lo leggiamo dai dati)
 *        raceLaps:   giri previsti dalla ronda (card.round.laps)
 *
 * ritorna { ok, live, tips: [{icon,title,text}], gauges, pit }
 *  - tips:   SOLO i consigli validi ADESSO (stesso formato dei tips statici del
 *            box radio del cruscotto: icona + titolo + testo)
 *  - gauges: i numeri crudi per il pannello (fuel, giri, gomme, gap)
 *  - pit:    la finestra sosta calcolata da pitWindow (null fuori gara)
 */
export function engineerLive(snap, ctx = {}) {
  const player = snap?.player ?? null;
  const sessionType = snap?.session?.type ?? null;
  // L'ingegnere parla in TUTTE le sessioni in pista (lezione 23/10: EVO codifica
  // le prove libere come «TimeAttack», non come «Race» — restando muti su
  // Race-only il pannello delta/resta spento proprio nei giri di prova dove
  // serve). La FINESTRA PIT resta invece una cosa da soltanto gara.
  const inSession = !!snap?.live && ['Race', 'HotStint', 'TimeAttack'].includes(sessionType) && !!player;
  const inRace = sessionType === 'Race';
  const gauges = {
    lapsDone: null, lapsTotal: null, fuel: null, lapsOnFuel: null, lapsLeft: null,
    wear: null, temp: null, gapAhead: null, gapBehind: null,
    // GREZZI dei gap (31/10): passano il valore del gioco SENZA filtro — la
    // diagnosi «campo morto in SP vs offset sbagliato» sta nei raw (shmem.mjs)
    gapAheadRaw: null, gapBehindRaw: null,
    position: null, drivers: null, timeLeft: null,
    raceLaps: ctx.raceLaps ?? null, fuelPerLap: ctx.fuelPerLap ?? null,
  };
  if (!player || !inSession) return { ok: true, live: false, tips: [], gauges, pit: null };

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

  /* ---------- gomme: usura per ruota, già 0-1 (vita rimasta) o 0-100 ---------- */
  const wear = (player.tyreWear ?? []).map((v) => Number(v));
  const wearVals = wear.filter(Number.isFinite);
  if (wearVals.length === 4) {
    // il gioco può mandare 0-1 o 0-100: normalizziamo al posto giusto
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
  // FINESTRA PIT ESPLICITA (30/10): la radio la dice COME SI FERMA, non solo «chi»
  // — giri della finestra, chi la chiede e quanto COSTA la baia in tempo. Così
  // il pilota in gara non deve indovinare: pit lap, finestra e «pena» li sente.
  if (player.inPit) {
    tips.push({ icon: '🔧', title: tr({ it: 'In pitlane', en: 'In pitlane' }), text: tr({ it: 'limiter on, no throttle — guarda la lavagna gomme prima di uscire', en: 'limiter on, no throttle — check the tyre board before leaving' }), prio: 1 });
  }
  if (player.timeLeft && lapsLeft == null) {
    tips.push({ icon: '⏱️', title: tr({ it: `Timer gara: ${player.timeLeft}`, en: `Race timer: ${player.timeLeft}` }), text: tr({ it: 'gara a tempo: finisce al taglio del giro corrente, il risparmio benzina conta fino a lì', en: 'timed race: it ends when the current lap is crossed, fuel saving counts until then' }), prio: 2 });
  }

  /* ---------- bandiera blu (28/10 notte, endurance multi-classe) ---------- */
  // Il flag PER AUTO della MMF grafica (shmem FLAG[4]='blu') è nella
  // snapshot da sempre, ma NESSUNA vista lo consumava: nelle endurance il
  // copilota e il pannello restavano muti proprio quando ti doppiano. Il
  // tip va in cima (prio 0): è l'istruzione più urgente del giro — lascia
  // passare chi ti doppietta.
  if (player.flag === 'blu') {
    tips.push({
      icon: '🔵',
      title: tr({ it: 'Bandiera blu', en: 'Blue flag' }),
      text: tr({ it: 'sei in doppiata: lascia la linea al rettilineo, chi ti doppietta passa', en: 'you are being lapped: give up the line on the straight, let them past' }),
      prio: 0,
    });
  }

  tips.sort((a, b) => (a.prio ?? 9) - (b.prio ?? 9));
  gauges.lapsDone = player.lapsDone ?? null;
  gauges.lapsTotal = player.lapsTotal ?? null;
  gauges.fuel = Number.isFinite(fuel) ? r1(fuel) : null;
  gauges.lapsOnFuel = lapsOnFuel;
  gauges.lapsLeft = lapsLeft;
  gauges.gapAhead = Number.isFinite(gapAhead) ? r1(gapAhead) : null;
  gauges.gapBehind = Number.isFinite(gapBehind) ? r1(gapBehind) : null;
  gauges.gapAheadRaw = Number.isFinite(Number(player.gapAheadRaw)) ? Number(player.gapAheadRaw) : null;
  gauges.gapBehindRaw = Number.isFinite(Number(player.gapBehindRaw)) ? Number(player.gapBehindRaw) : null;
  gauges.position = player.position ?? null;
  gauges.drivers = player.drivers ?? null;
  gauges.timeLeft = player.timeLeft ?? null;
  // SENSORE DIRETTO DELL'ULTIMO GIRO (28/10): il flag isLastLap della MMF
  // grafica, già parseato in shmem.mjs — arriva ai narratori del copilota
  // (narratore 8 di viste-a.js, «Ultimo giro!») che prima dipendevano SOLO
  // dal contatore giri, fermo a 0 per tutta la gara del 24/10.
  gauges.isLastLap = player.isLastLap ?? null;
  // SENSORE BOX (28/10 sera, richiesta Mauro: «per il copilot implementa la
  // voce quando apre/chiude i box»): il flag pitlane della MMF (carLocation 1,
  // già arrivato in player.inPit dalla SM) passa nei gauges come isLastLap:
  // i narratori del copilota lo usano per parlare l'INGRESSO in pitlane
  // (limiter acceso) e l'USCITA dalla baia. Prima non usciva: il tip «In
  // pitlane» c'era, la voce della stessa cosa no.
  gauges.inPit = player.inPit ?? null;
  // BANDIERA NEI GAUGES (28/10 notte, same road as inPit/isLastLap): il flag
  // per auto e quello globale della MMF grafica passano ai narratori del
  // copilota (narratore 10: «Bandiera blu»). Contratto identico a inPit:
  // null senza il campo, MAI undefined — il narratore distingue sul null.
  gauges.flag = player.flag ?? null;
  gauges.globalFlag = player.globalFlag ?? null;
  // IL GREZZO ACCANTO ALLA PAROLA (28/10 notte, «bandiere blu non segnano
  // giusto nelle endurance»): shmem ora porta anche il codice numerico
  // scritto dal gioco (flagCode/globalFlagCode). Il consumatore è diagnos-
  // tico (il monitor copilota lo mette nel registro): se una endurance
  // scrivesse un valore fuori dalla mappa FLAG la parola sarebbe null e
  // nessuno saprebbe perché — col grezzo il registro lo denuncia da solo.
  gauges.flagCode = player.flagCode ?? null;
  gauges.globalFlagCode = player.globalFlagCode ?? null;
  gauges.raceLaps = ctx.raceLaps ?? null;
  // PENALITÀ TAGLI NEI GAUGES (30/10, «penalità a voce» richiesta da Mauro):
  // i ms cumulativi guadagnati tagliando (shmem player.cutPenaltyMs) in
  // secondi a una virgola: il narratore del copilota parla quando sale,
  // il monitor lo copia nel registro. A zero/assente lo lascia null:
  // niente «penalità 0» a ogni tick.
  gauges.cutSec = player.cutPenaltyMs != null && player.cutPenaltyMs > 0
    ? Math.round(player.cutPenaltyMs / 100) / 10
    : null;
  gauges.fuelPerLap = Number.isFinite(fuelPerLap) ? fuelPerLap : null;
  const pit = pitWindow(gauges, { inRace, lapsTotal: gauges.lapsTotal });
  if (pit && Number.isFinite(pit.pitLap) && pit.window) {
    tips.push({
      icon: '🛞',
      title: tr({ it: `Finestra pit: giri ${pit.window[0]}–${pit.window[1]}`, en: `Pit window: laps ${pit.window[0]}–${pit.window[1]}` }),
      text: tr({ it: `${pit.reason} · la baia costa ≈ ${pit.pitLossSec} s: fermati DENTRO la finestra, ogni giro dopo è tempo perso`, en: `${pit.reason} · the stop costs ≈ ${pit.pitLossSec} s: pit INSIDE the window, every lap after is time lost` }),
      prio: 1,
    });
    tips.sort((a, b) => (a.prio ?? 9) - (b.prio ?? 9));
  }
  return { ok: true, live: true, tips, gauges, pit };
}
