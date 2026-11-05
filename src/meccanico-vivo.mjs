// meccanico-vivo.mjs — i dati REALI del gioco per il meccanico.
//
// Il meccanicoBoxeseroggi può parlare solo di telemetria scritta a FINE
// sessione (file MoTeC .ld): base pista + correzione sui dati veri. Questo
// modulo aggiunge il terzo canale, quello che Mauro ha chiesto (5/11):
// «aggiorna il meccanico con i dati reali del gioco»: mentre il gioco gira,
// il blocco MMF sharedmemory (shmem.mjs) espone pressioni per gomma,
// temperature interne/centro/esterno, freni, bilanciere, pastiglie/dischi,
// camber in radianti, altezza di marcia, danni e benzina — valori VIVI,
// aggiornati 900 ms.
//
// NIENTE STIME QUI DENTRO: se il campo arriva dal gioco è scritto VERBATIM
// (arrotondato per leggibilita' della GUI); se non c'è, null. I consigli
// sono regole pure su quei numeri: niente magiche, soglie in chiaro.

const RUOTE = ['LF', 'RF', 'LR', 'RR'];           // [ant sx, ant dx, post sx, post dx]
const CHIAVI_GRAPHICS = ['lf', 'rf', 'lr', 'rr']; // come chiama la sub-struct SMEvoTyreState

const num = (v, dec = 0) => (Number.isFinite(v) ? (dec ? Math.round(v * 10 ** dec) / 10 ** dec : Math.round(v)) : null);
const num01 = (v) => (Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 100) : null);
const radAGradi = (v) => (Number.isFinite(v) ? Math.round(v * 180 / Math.PI * 10) / 10 : null);

export function vivoDaSnapshot(snap) {
  if (!snap?.game || !snap.live || !snap.player) return null;
  const p = snap.player;
  const g = snap.raw?.graphics?.tyres ?? {};
  const phys = snap.raw?.physics ?? {};
  const grafica = snap.raw?.graphics ?? {};   // l'oggetto GRAPHICS intero (elettronica, motore)
  const at = (arr, i) => (Array.isArray(arr) ? arr[i] ?? null : null);

  const gomme = {};
  RUOTE.forEach((w, i) => {
    const t = g[CHIAVI_GRAPHICS[i]] ?? {};
    gomme[w] = {
      psi: at(p.tyrePressure, i),
      intC: at(p.tyreInnerC, i),
      centroC: at(p.tyreTempC, i),
      extC: at(p.tyreOuterC, i),
      frenoC: at(p.brakeTempC, i),
      usuraPct: (() => { const v = at(p.tyreWear, i); return Number.isFinite(v) && v <= 1 ? Math.round(v * 100) : num(v); })(),
      bloccata: t.lock === true,
      slittamento: num(t.slip, 3),
      composto: (t.compoundFront || t.compoundRear || '') || null,
      // CANALI VIVI AGGIUNTIVI (6/11): carico, slittamento, angolo e forze
      caricoN: at(phys.wheelLoad, i),
      slittPct: (() => { const v = at(phys.slipRatio, i); return Number.isFinite(v) ? Math.round(v * 100) : null; })(),
      angoloDeg: (() => { const v = at(phys.slipAngle, i); return Number.isFinite(v) ? Math.round(v * 57.296) : null; })(),
      vertN: at(phys.mz, i),
      latN: at(phys.fy, i),
      soffrPct: (() => { const v = at(phys.suspensionDamage, i); return Number.isFinite(v) ? Math.round(v * 100) : null; })(),
    };
  });

  // il bilanciere lo scrive il physics (carta del 28/10): come scritto dal
  // gioco; in percent se lo scinde in 0–1, raw altrimenti.
  const bias = phys.brakeBias;
  const bilancierePct = (Number.isFinite(bias) && bias > 0 && bias <= 1)
    ? Math.round(bias * 100)
    : (Number.isFinite(bias) ? Math.round(bias) : null);

  return {
    sessione: { pista: snap.session?.track ?? null, tipo: snap.session?.type ?? null, nome: snap.session?.name ?? null },
    ambiente: { ariaC: p.airTempC ?? null, asfaltoC: p.roadTempC ?? null },
    gomme,
    freni: {
      bilancierePct,
      pastigliePct: (phys.padLife ?? []).map(num01),
      dischiPct: (phys.discLife ?? []).map(num01),
      tempC: (phys.brakeTemp ?? []).map(num),
    },
    assetto: {
      camberGradi: (p.camberRAD ?? []).map(radAGradi),
      // suspTravel è in metri nella physics: in mm per leggersi
      sospensioniMm: (p.suspensionTravel ?? []).map((v) => (Number.isFinite(v) ? Math.round(v * 1000) : null)),
      altezzaMm: (p.rideHeight ?? []).map((v) => (Number.isFinite(v) ? Math.round(v * 1000) : null)),
      dannoPct: Array.isArray(p.damage) && p.damage.some((v) => Number.isFinite(v) && v > 0)
        ? p.damage.map((v) => (Number.isFinite(v) ? Math.round(v) : null))
        : null,             // intatta: non la sceno, il cruscotto la sa già
    },
    benzina: { litri: num(p.fuel, 1), perGiro: num(p.fuelPerLap, 2) },
    // ELETTRONICA di bordo: i livelli CORRENTI letti dal gioco (non un
    // ripensamento): si vede cosa sta sostando realmente la macchina.
    elettronica: (() => {
      const elettr = grafica.electronics ?? {};
      const giusto = (v) => (v == null || !Number.isFinite(v) ? null : v);
      return {
        tc: giusto(elettr.tcLevel), abs: giusto(elettr.absLevel), esc: giusto(elettr.escLevel), ebb: giusto(elettr.ebbLevel),
        mappa: giusto(elettr.engineMapLevel), turbo: giusto(elettr.turboLevel),
        diffPotenza: giusto(elettr.diffPowerLevel), diffRilascio: giusto(elettr.diffCoastLevel),
        damperAntBump: giusto(elettr.frontBumpDamperLevel), damperAntRit: giusto(elettr.frontReboundDamperLevel),
        damperPostBump: giusto(elettr.rearBumpDamperLevel), damperPostRit: giusto(elettr.rearReboundDamperLevel),
        tcAttiva: grafica.tcActive === true, absAttiva: grafica.absActive === true, escAttiva: grafica.escActive === true,
      };
    })(),
    // MOTORE: temperature e pressione olio, dal pannello dell'HUD di EVO.
    motore: {
      acquaC: Number.isFinite(grafica.waterTempC) ? grafica.waterTempC : null,
      olioC: Number.isFinite(grafica.oilTempC) ? Math.round(grafica.oilTempC) : null,
      olioBar: Number.isFinite(grafica.oilPressureBar) ? Math.round(grafica.oilPressureBar * 10) / 10 : null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* consigli dal vivo: regole pure sui numeri                           */
/* ------------------------------------------------------------------ */

/** media dei valori VALIDI di un asse (2 ruote consecutive dell'ordine). */
const mediaAsse = (g, [wa, wb], chiave) => {
  const vals = [g[wa]?.[chiave], g[wb]?.[chiave]].filter((v) => Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

// SOGLIE, in chiaro come al box:
const CAMBER_DIFF_C = 20;   // bordo interno/esterno piu' caldo di 20° = piede storto
const PSI_SOGGIA = 0.8;     // oltre 0.8 psi dal bersaglio si corregge
const FRENI_DIFF_C = 120;   // asse freni piu' caldo di 120° = bilanciere da spostare
const PASTIGLIE_MIN_PCT = 20; // sotto il 20% le pastiglie vanno cambiate

/**
 * consigliVivo(dati, { targetPsi }) → righe consigli stile meccanico:
 * { vedi: 'camber'|'pressioni'|'freni', text, severita }: 'camber' e
 * 'pressioni' parlano per ASSE (fronte/posto), 'freni' guarda il
 * termografo e le pastiglie. `targetPsi` è il bersaglio che il
 * meccanicoBoxeseroggi calcola dall'ultima uscita (fourPsi): senza, si
 * parla solo di temperatura e usura, senza PRESSIONI INVENTATI.
 */
export function consigliVivo(dati, { targetPsi = null } = {}) {
  const g = dati?.gomme ?? {};
  const out = [];

  // CAMBER per asse: bordo interno piu' caldo dell'esterno = camber troppo
  // negativo (la gomma lavora sul fianco interno); al contrario, piu'
  // camber. Soglia in chiaro, vals legati al dato reale.
  for (const [, ruote, nome] of [['F', ['LF', 'RF'], 'fronte'], ['R', ['LR', 'RR'], 'posto']]) {
    const int = mediaAsse(g, ruote, 'intC');
    const ext = mediaAsse(g, ruote, 'extC');
    if (int == null || ext == null) continue;
    if (int - ext >= CAMBER_DIFF_C) {
      out.push({
        vedi: 'camber',
        severita: 'media',
        text: `Camber ${nome} TROPPO negativo: bordo interno +${Math.round(int - ext)}° sull'esterno — riduci camber ${nome} di ~0,3–0,5°.`,
      });
    } else if (ext - int >= CAMBER_DIFF_C) {
      out.push({
        vedi: 'camber',
        severita: 'media',
        text: `Camber ${nome} TROPPO lineare: bordo esterno +${Math.round(ext - int)}° sull'interno — aggiungi camber ${nome} di ~0,3–0,5°.`,
      });
    }
  }

  // PRESSIONI vs bersaglio: solo dove esiste un bersaglio (fourPsi di
  // sessioni reali), altrimenti sarebbe un numero inventato qui.
  const target = Number(targetPsi);
  if (Number.isFinite(target) && target > 0) {
    for (const [, ruote, nome] of [['F', ['LF', 'RF'], 'fronte'], ['R', ['LR', 'RR'], 'posto']]) {
      const psi = mediaAsse(g, ruote, 'psi');
      if (psi == null) continue;
      const d = psi - target;
      if (Math.abs(d) >= PSI_SOGGIA) {
        out.push({
          vedi: 'pressioni',
          severita: 'bassa',
          text: `Pressione ${nome} ${d > 0 ? 'alta' : 'bassa'}: medio ${psi.toFixed(1)} psi contro bersaglio ${target} psi — ${d > 0 ? 'sgonfia' : 'gonfia'} ${Math.abs(d).toFixed(1)} psi ${nome}.`,
        });
      }
    }
  }

  // FRENI: termografo + vita pastiglie. Il bilanciere non lo si può
  // spostare a mano in EVO mentre si va (già lo sa l'elettronica).
  const fr = mediaAsse(g, ['LF', 'RF'], 'frenoC');
  const rr = mediaAsse(g, ['LR', 'RR'], 'frenoC');
  const pastiglie = ['LF', 'RF', 'LR', 'RR'].map((w) => g[w]?.usuraPct).filter((v) => Number.isFinite(v));
  const pctPastiglie = () => (pastiglie.length ? Math.min(...pastiglie.map((v) => (v <= 1 ? Math.round(v * 100) : Math.round(v)))) : null);
  // le pastiglie in EVO arrivano 0-1 (padLife): qui ho usato sia lo lifè
  // dal physics che lo usuraPct: tengo il valore più utile.
  const padPct = dati?.freni?.pastigliePct?.filter((v) => v != null);
  const padMin = padPct?.length ? Math.min(...padPct) : pctPastiglie();
  if (padMin != null && padMin < PASTIGLIE_MIN_PCT) {
    out.push({
      vedi: 'freni',
      severita: 'alta',
      text: `Pastiglie al ${padMin}% — sotto la soglia del ${PASTIGLIE_MIN_PCT}%: cambiale, il freno diventa un dadi a chiacchiere.`,
    });
  }
  if (fr != null && rr != null) {
    if (fr - rr >= FRENI_DIFF_C) {
      out.push({
        vedi: 'freni',
        severita: 'bassa',
        text: `Frenano piu' davanti: fronte ${Math.round(fr)}° contro posto ${Math.round(rr)}° — sposta il bilanciere avanti di 1–2%.`,
      });
    } else if (rr - fr >= FRENI_DIFF_C) {
      out.push({
        vedi: 'freni',
        severita: 'bassa',
        text: `Frenano piu' dietro: posto ${Math.round(rr)}° contro fronte ${Math.round(fr)}° — sposta il bilanciere d'indietro di 1–2%.`,
      });
    }
  }
  return out;
}
