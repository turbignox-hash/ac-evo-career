// setup.mjs — l'aiuto-meccanico del tool: pressioni gomme target per classe auto,
// calcolatore "regola dei 4 PSI" e quaderno note di setup per auto+pista.
//
// Fonte dei target: blog Kunos "AC EVO - Version 0.4 - State of Physics and Cars"
// (pressioni ottimali A CALDO per classe, in PSI):
//   Road & ECO 31.0 · Supercar 30.0 · Hypercar 29.0 · Slicks 27.0 · SF-25 25.0
// La regola dei 4 PSI: da freddo parte ~2 sotto il target; se dopo 3-4 giri la
// pressione è salita più di ~4 PSI la partenza era troppo bassa.

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const NOTES_FILE = join(HERE, '..', 'data', 'setup-notes.json');

export const TYRE_CLASSES = [
  { id: 'formula', label: 'Formula (SF-25)', target: 25.0 },
  { id: 'slicks', label: 'Slicks (GT/corse)', target: 27.0 },
  { id: 'hypercar', label: 'Hypercar', target: 29.0 },
  { id: 'supercar', label: 'Supercar', target: 30.0 },
  { id: 'road', label: 'Stradali & ECO', target: 31.0 },
];

const CLASS_RULES = [
  { re: /sf-?25|formula/i, id: 'formula' },
  { re: /gt3|gt4|gt2|cup|csl|_lm|f40 lm|super ?trofeo|evolution|gt ?rs|911 gt3/i, id: 'slicks' },
  { re: /countach|daytona sp3|288 gto|miura|f40(?! lm)|testarossa|porsche 959|f50|mc12|zonda|aga|huayra|svj|performante|tecnica|sterrato/i, id: 'hypercar' },
  { re: /r8|huracan|f8|296(?! gt3)|sf90|720s|765lt|gt63|c8|nsx|gt ?r|ams|cayman(?! gt4)|emira|supra|skyline|nsx|911(?! gt3)/i, id: 'supercar' },
];

/** Classe gomme di un'auto (dal modello; fallback: stradali). */
export function tyreClassOf(carNameOrId) {
  const s = String(carNameOrId ?? '').toLowerCase();
  for (const r of CLASS_RULES) if (r.re.test(s)) return TYRE_CLASSES.find((c) => c.id === r.id);
  return TYRE_CLASSES.find((c) => c.id === 'road');
}

/**
 * Giri di registrazione telemetria consigliati per un'auto, da impostare in EVO.
 * Il file .ld cresce con il TEMPO registrato: un'auto lenta fa più secondi per giro
 * (e più dati), quindi le bastano meno giri; le veloci possono permettersi di più.
 * Conta anche il coprifuoco del BOX: servono uscite da 3-5 giri per calibrare le pressioni.
 */
const TEL_LAPS = { road: 8, supercar: 10, hypercar: 12, slicks: 15, formula: 15 };
export function telemetryLapsFor(carNameOrId) {
  const cls = tyreClassOf(carNameOrId);
  return TEL_LAPS[cls.id] ?? 10;
}

function loadNotes() {
  try {
    const n = JSON.parse(readFileSync(NOTES_FILE, 'utf8'));
    if (n && typeof n === 'object' && n.notes) return n;
  } catch { /* primo avvio */ }
  return { notes: {} };
}

const keyOf = (car, track) => `${String(car ?? '?').toLowerCase()}|${String(track ?? '?').toLowerCase()}`;

export function setupNote(car, track) {
  return loadNotes().notes[keyOf(car, track)] ?? null;
}

export function setSetupNote(car, track, text) {
  const n = loadNotes();
  const key = keyOf(car, track);
  const t = String(text ?? '').slice(0, 500);
  if (!t) delete n.notes[key];
  else n.notes[key] = { text: t, at: new Date().toISOString() };
  mkdirSync(dirname(NOTES_FILE), { recursive: true });
  writeJsonAtomic(NOTES_FILE, n); // atomico
  return n.notes[key] ?? null;
}

/**
 * Regola dei 4 PSI: dati la pressione di partenza (fredda), quella letta a caldo
 * dopo 3-4 giri e il target della classe, dice cosa impostare alla prossima uscita.
 * La correzione principale punta a far arrivare il caldo sul target; il controllo
 * del salto (≈4 PSI) dice se la partenza era troppo bassa o troppo alta.
 */
export function fourPsi({ cold, hot, target }) {
  const c = Number(cold), h = Number(hot), t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(h) || !Number.isFinite(t) || c <= 0 || h <= 0) {
    return { ok: false, error: 'Servono pressione di partenza, pressione a caldo e target (numeri > 0).' };
  }
  const rise = Math.round((h - c) * 10) / 10;
  const newCold = Math.round((c + (t - h)) * 10) / 10;
  const lines = [];
  // salto termico: 3-5 PSI è la finestra sana
  if (rise > 5) lines.push(`Salto ${rise} PSI: troppo alto → la partenza era troppo bassa, aggiungi ~${(Math.min(rise - 4, 1.5)).toFixed(1)} PSI oltre alla correzione.`);
  else if (rise < 3) lines.push(`Salto ${rise} PSI: troppo basso → la partenza era troppo alta, togli ~${(Math.min(4 - rise, 1.5)).toFixed(1)} PSI oltre alla correzione.`);
  else lines.push(`Salto ${rise} PSI: nella finestra sana (3–5), la partenza era giusta come approccio.`);
  if (Math.abs(t - h) < 0.15) lines.push(`A caldo eri già sul target (${t} PSI): mantieni ${c} PSI da freddo.`);
  else lines.push(`Nuova partenza consigliata: ${newCold} PSI da freddo (target a caldo ${t} PSI).`);
  return { ok: true, rise, newCold, target: t, hot: h, cold: c, advice: lines.join(' ') };
}

/* ------------------------------------------------------------------ */
/* IL MECCANICO: consigli di setup per pista, dal carattere + telemetria */
/* ------------------------------------------------------------------ */

/**
 * Classifica il TRACCIATO da TRACK_INFO (e dai dati telemetrici se arrivano):
 * power (rettilinei dominanti, alettoni giù), tecnica (curve strette, alettoni
 * su + cambio corta), bilanciata. Dà la BASE del setup per pista;
 * i dati reali (bumpstop, camber-proxy, freni) la correggono come seconda voce.
 */
export function trackProfile(info, telem = null) {
  const corners = Number(info?.corners ?? 0), len = Number(info?.lengthKm ?? 0);
  if (!corners || !len) return { tipo: 'sconosciuta', aero: null, note: [] };
  const densita = corners / len;                 // curve per km
  let tipo, aero;   // aero: -1 scarica · +1 carica
  if (densita < 2.2) { tipo = 'power'; aero = -1; }
  else if (densita > 3.6) { tipo = 'tecnica'; aero = +1; }
  else { tipo = 'bilanciata'; aero = 0; }
  return { tipo, aero, densita: Math.round(densita * 10) / 10 };
}

/**
 * Il cuore del meccanico: input = info pista (TRACK_INFO) + analisi MoTeC dell'ultima
 * sessione (analyzeLd: sus/bump/camberProxy/pressures/temp freni) + ponte della
 * sessione (giri k). Output: consigli PRIORITIZZATI, ognuno con il DATO che lo
 * detta. Dove il gioco non espone i valori correnti (alettoni, barre, molle), il
 * consiglio è direzione + quantità, mai un numero assoluto da digitare.
 */
export function setupAdvice(info, telem, { laps = null } = {}) {
  const out = [];
  const add = (vedi, prio, text) => out.push({ vedi, prio, text });
  const prof = trackProfile(info, telem);
  const label = info?.name ?? 'pista';

  /* -- base dal carattere della pista -- */
  if (prof.tipo === 'power') {
    add('aero', 1, `**${label}** (${info?.lengthKm} km, ${info?.corners} curve · tracciato POWER): scarica GLI ALETTONI al minimo drag — il tempo si guadagna sui rettilinei. Se il fondo è stabile in curva, un gradino d'ala in meno vale più di una mano di camber.`);
    add('trasmissione', 2, `Cambio LUNGO (ultimo rapporto che arrivi a strappare sul rettifilo più lungo): a ${label} la velocità di punta paga i quarti del giro.`);
  } else if (prof.tipo === 'tecnica') {
    add('aero', 1, `**${label}** (${info?.corners} curve in ${info?.lengthKm} km · tracciato TECNICO): carica GLI ALETTONI (2-3 gradini sopra il minimo) — il tempo è in frenata e in uscita dalle curve strette.`);
    add('trasmissione', 2, `Cambio CORTO: le potenze medie contano più della punta (${label} non ha rettilinei per giustificare un'ultima marcia lunga).`);
  } else if (prof.tipo === 'bilanciata') {
    add('aero', 1, `**${label}** (${info?.corners} curve in ${info?.lengthKm} km · tracciato BILANCIATO): ala a metà carica — il compromesso giusto fra i tratti veloci e le curve medi-lente.`);
  }

  /* -- correzioni dai dati VERI (se la telemetria c'è) -- */
  const BUMP_SOGLIA = 0.7;       // % di tempo a fine corsa: sopra qui, il muro batte
  const CAMB_SANE = 0.5;         // |Δ int/est| sane per una gomma ben camberata (° esteso)
  if (telem) {
    const bumpMax = Math.max(...WHEEL_KEYS.map((w) => telem.bump?.[w]?.contactPct ?? 0));
    const wheelMax = WHEEL_KEYS.find((w) => (telem.bump?.[w]?.contactPct ?? 0) === bumpMax);
    if (bumpMax >= BUMP_SOGLIA) {
      add('assetto', 1, `Bumpstop ${wheelMax} al ${bumpMax}% del giro: il fondo batte — ALZA l'altezza (2 clic) o irigidisci i bumpstop su quel lato; su ${label} la superficie cresce col carico.`);
    } else if (bumpMax > 0) {
      add('assetto', 3, `Bumpstop max ${wheelMax} al ${bumpMax}%: marginale — soprattutto non toccare l'altezza per questo.`);
    }
    // camber dal proxy termico: l'interno scotta → troppo negativo
    for (const w of ['LF', 'RF']) {
      const d = telem.camberProxy?.[w];
      if (d == null) continue;
      if (d >= CAMB_SANE * 2) add('camber', 2, `Camber anteriore: Δ int/est ${w} +${d}° — l'interno scotta: TOGLI camber negativo (~0.3°) o la gomma lavora poco sul fianco esterno.`);
      else if (d <= -CAMB_SANE) add('camber', 2, `Camber anteriore: Δ int/est ${w} ${d}° — l'esterno scotta: AGGIUNGI camber negativo (~0.3°): in curva il muso non affonda.`);
      else add('camber', 4, `Camber ${w} in finestra (Δ ${d > 0 ? '+' : ''}${d}°): non toccare.`);
    }
    // freni: il termico svedisce più il moto che la mescola
    const brakeMax = Math.max(...WHEEL_KEYS.map((w) => telem.brakes?.[w] ?? 0));
    const bWheel = WHEEL_KEYS.find((w) => (telem.brakes?.[w] ?? 0) === brakeMax);
    if (brakeMax > 600) add('freni', 2, `Freni ${bWheel} picco ${Math.round(brakeMax)}°C: il termico è al limite — se svaniscono in fondo al giro, passa a una pastiglia più dura o sposta 1 tacca di bias del freno.`);
    // pressioni lontane dal target → promemoria (le regola coi 4 PSI già presente)
    const targ = tyreClassOf(info?.car ?? '').target ?? null;
    if (targ && telem.lastPressures) {
      const hot = (telem.lastPressures.LF + telem.lastPressures.RR) / 2;
      if (Math.abs(hot - targ) > 1.2) {
        add('pressioni', 1, `A caldo ${hot.toFixed(1)} PSI vs target ${targ}: fuori finestra — ricalibra la partenza con la regola dei 4 PSI (pannello su).`);
      }
    }
  } else {
    add('telemetria', 3, `Nessuna analisi MoTeC per questa sessione: i consigli sono SOLO pista. Fai una sessione con la telemetria attiva e il meccanico dà il secondo strato di correzione.`);
  }
  return { tipo: prof.tipo, densita: prof.densita, consigli: out.sort((a, b) => a.prio - b.prio) };
}

/** Ruote del decoder (riutilizzata: non duplicare la lista). */
const WHEEL_KEYS = ['LF', 'RF', 'LR', 'RR'];

/* ------------------------------------------------------------------ */
/* LA LISTA COLORATA DEL BOX: cosa dice il meccanico *stesso* quando    */
/* esce dal gioco — ogni area = un pallino e una riga capibile al volo. */
/* ------------------------------------------------------------------ */

/**
 * Valuta lo stato dell'assetto dai DATI VERI dell'ultima sessione telemetrica:
 * una voce per area (pressioni, bumpstop, camber, gomme, freni, benzina, tempo),
 * ogni voce con un LIVELLO da colore: 'ok' (verde) · 'info' (grigio) ·
 * 'warn' (arancio) · 'bad' (rosso). Quando nessuna voce è warn/bad la lista
 * collassa in «auto a punto»: niente fino al prossimo giro.
 *
 * Unico replace dei banner lunghi: capibile in 5 secondi, aperto la GUI.
 */
export function boxChecklist(sessions, { target = null } = {}) {
  const cur = sessions?.[0] ?? null;
  const prev = sessions?.[1] ?? null;
  if (!cur) {
    return { allGood: false, stato: null, items: [
      { area: 'telemetria', level: 'info', text: 'Nessuna sessione ancora: fai un giro e la lista si popola da sola.' },
    ] };
  }
  const items = [];
  const add = (area, level, text) => items.push({ area, level, text });
  const r1 = (v) => Math.round(v * 10) / 10;

  /* 1. PRESSIONI — dentro o fuori la finestra del target a caldo */
  const hot = cur.hotPressures?.LF ?? cur.hotPressures?.RR ?? null;
  const cold = cur.coldPressures?.LF ?? cur.coldPressures?.RR ?? null;
  const targ = Number(target) || null;
  if (hot != null && targ) {
    const diff = r1(targ - hot);
    if (Math.abs(diff) <= 0.6) add('pressioni', 'ok', `a caldo ${r1(hot)} PSI vs target ${targ}: in finestra, la partenza ${cold != null ? r1(cold) : ''} PSI era giusta.`);
    else {
      const novo = (cold != null) ? r1(cold + diff) : r1(hot + diff);
      const rise = (cold != null) ? r1(hot - cold) : null;
      add('pressioni', 'bad', `a caldo ${r1(hot)} PSI vs target ${targ}: mancano ${Math.abs(diff)} PSI → parti da ~${novo} PSI da freddo${rise != null ? ` (salto termico ${rise} PSI: le uscite brevi salgono poco — se il prossimo stint è lungo, conferma ${novo})` : ''}`);
    }
  } else add('pressioni', 'info', 'pressioni non leggibili in questa sessione.');

  /* 2. BUMPSTOP — se il fondo batte, e dove */
  const bumpPct = Math.max(...['LF','RF','LR','RR'].map((w) => cur.bump?.[w]?.contactPct ?? 0));
  const bumpWheel = ['LF','RF','LR','RR'].find((w) => (cur.bump?.[w]?.contactPct ?? 0) === bumpPct);
  if (bumpPct >= 15) add('bumpstop', 'bad', `il fondo ${bumpWheel} batte il ${bumpPct}% del giro: ALZA l'altezza di ~2 mm su quel lato o irigidisci i bumpstop.`);
  else if (bumpPct >= 5) add('bumpstop', 'warn', `il fondo ${bumpWheel} tocca il ${bumpPct}% del giro: marginale — alza l'altezza del lato più battuto solo se in gara senti colpi`);
  else if (bumpPct > 0) add('bumpstop', 'ok', `bumpstop quasi mai a fine corsa (${bumpPct}%): altezza giusta.`);

  /* 3. CAMBER — il proxy termico int/ext della gomma */
  const C_SANE = 0.75; // |Δ| sano sul proxy termico (°)
  let camOut = null;
  for (const w of ['LF','RF','LR','RR']) {
    const d = cur.camberProxy?.[w];
    if (d != null && Math.abs(d) > Math.abs(camOut ?? 0)) camOut = { w, d };
  }
  if (camOut && Math.abs(camOut.d) > C_SANE) add('camber', 'warn', `gomma ${camOut.w}: Δ int/est ${r1(camOut.d)}° — ${camOut.d > 0 ? 'l\'interno scotta: togli ~0.3° di camber negativo' : 'l\'esterno scotta: aggiungi ~0.3° di camber negativo'}`);
  else add('camber', 'ok', `camber in finestra: le gomme lavorano uniformi (Δ max ${camOut ? r1(camOut.d) : 0}° su ${camOut ? camOut.w : 'n/d'}).`);

  /* 4. TEMPERATURA GOMME — frede o scotta? Dal core dell'ultima volta a fine giro */
  const lastLap = (cur.laps ?? []).filter((l) => l.durationSec > 15).slice(-1)[0] ?? null;
  if (lastLap) {
    const tairF = (lastLap.tair?.LF != null && lastLap.tair?.RF != null) ? (lastLap.tair.LF + lastLap.tair.RF) / 2 : (lastLap.tair?.LF ?? lastLap.tair?.RF ?? null);
    if (tairF != null) {
      if (tairF < 70) add('gomme', 'info', `anteriori ${Math.round(tairF)}°C: ancora fredde (uscita breve) — in stint lungo arrivano.`);
      else if (tairF > 95) add('gomme', 'warn', `anteriori ${Math.round(tairF)}°C: sopra la finestra — se scivolano in gara, tocca l'assetto (più camber, meno pressione)`);
      else add('gomme', 'ok', `temperature in finestra (anteriori ${Math.round(tairF)}°C).`);
    }
  }

  /* 5. FRENI — solo se picchiano alto */
  const brMax = lastLap ? Math.max(...['LF','RF','LR','RR'].map((w) => lastLap.brakes?.[w] ?? 0)) : 0;
  if (brMax > 650) add('freni', 'warn', `termico freni al limite (picco ${Math.round(brMax)}°C): se svaniscono a fine stint, cambia pastiglia o sposta il bias`);
  else if (brMax > 0) add('freni', 'ok', `freni sotto controllo (picco ${Math.round(brMax)}°C).`);

  /* 6. BENZINA — quanto beve un giro, per pianificare i pit */
  if (cur.fuelPerLap != null) add('benzina', 'info', `${cur.fuelPerLap} L/giro → stint di 5 giri ≈ ${Math.ceil(cur.fuelPerLap * 5)} L (+ benzina di rimessa).`);

  /* 7. CONSISTENZA — la storia del meccanico: esita il tempo sta scendendo */
  const laps = (cur.laps ?? []).filter((l) => l.durationSec > 15 && l.fuelUsed != null && l.fuelUsed >= 0);
  const bestLap = laps.length ? Math.min(...laps.map((l) => l.durationSec)) : null;
  if (bestLap != null && laps.length >= 2) {
    add('tempo', 'info', `best ${fmtLapShort(bestLap)}; giri ${laps.map((l) => fmtLapShort(l.durationSec)).join(' · ')}.`);
  }
  /* 8. COSTANTE: si gira con lo stesso setup di última volta? */
  if (prev && cur.preset && prev.preset && cur.preset === prev.preset) {
    add('storia', 'info', `stesso preset (${cur.preset}) della sessione prima: se hai cambiato valori in EVO durante l'uscita, al prossimo giro la lista se ne accorge`);
  }

  const allGood = !items.some((i) => i.level === 'warn' || i.level === 'bad');
  return { allGood, target: targ, items };
}
/** 108.2 → «1:48.2» */
function fmtLapShort(s) {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ */
/* OLTRE LE PRESSIONI: le patch che il meccanico SCRIVE nel .carsetup  */
/* — ognuna legata a un segnale misurato, mai un numero in aria.       */
/* ------------------------------------------------------------------ */

/**
 * Costruisce le patch DA SCRIVERE oltre alle pressioni (21/10) partendo da un
 * setup corrente (`cur`) e dai SEGNALI dell'ultima sessione (`latest`).
 * Regole:
 *   1. bumpstop PER ASSE: ≥5% (≥15% forte) → altezza dell'ASSE che tocca +1 (+2) mm;
 *      (indietro senza perAsse: bumpMax unico → come prima, solo post.)
 *   2. profilo pista power/tecnico → ala posteriore ∓1;
 *   3. camber dal proxy termico (|Δ int/est| > 0.75°) → camber ±0.3°;
 *   4. freni termici >600°C sull'asse → bias ±1 verso l'asse più freddo;
 *   5. TC interviene >2% del giro → TC +1 (SOLO se il file ha il campo);
 *   6. benzina di gara: fuelPerLap misurato × giri gara (+5% riserva), cap 120 L
 *      (proxy prudenziale: il serbatoio dipende dall'auto — controllare in gara);
 *   7. RADDRIZZO l'ASIMMETRIA sx/dx (molle, ammortizzatori, RIGIDITÀ bumpstop,
 *      CAMPANATURE, convergenza): una macchina simmetrica è lo stato normale —
 *      sx e dx dello stesso asse DEVONO combaciare; alle soglia le allineo al
 *      valore PIÙ NEUTRO dell'asse (molla più morbida, smorzamento+ bump più
 *      basso, toe più vicino allo zero, campanatura = MEDIA dell'asse) e
 *      dichiaro tutto in lista.
 * NOTA onesta: la DIFF non si scrive sulla 296 GT3 (i campi diff non ci sono
 * nel save) — se un'auto li espone li vedremmo qui (root.1.f4). Ogni patch che
 * non trova il campo nel file viene semplicemente saltata dal decoder.
 * latest = { trackOk, bumpMax, camberProxy: {LF,RF,LR,RR}, brakes: {LF,RF,LR,RR}, tcPct }.
 * Ritorna { patches: {aero?, brakes?, elec?}, tiresExtra: [{i, camber}], text: [] }.
 */
export function mechanicExtraEdits({ cur, latest = {}, trackInfo = null, defaults = null }) {
  const patches = {}, text = [], tiresExtra = [];
  const r1 = (v) => Math.round(v * 10) / 10;
  const WHEELS = ['LF', 'RF', 'LR', 'RR'];

  /* 1+2. AERO: bumpstop PER ASSE → altezza dell'asse che tocca · profilo pista → ala post.
     Senza perAsse (vecchi dati) resta il comportamento attuale: solo post. */
  if (latest.trackOk !== false) {
    const bumpAxis = latest.bumpAxis ?? {};
    const bumpFront = Number(bumpAxis.front);
    const bumpRear = Number.isFinite(Number(bumpAxis.rear)) ? Number(bumpAxis.rear) : (latest.bumpMax ?? 0);
    const passo = (v) => (v >= 15 ? 2 : v >= 5 ? 1 : 0);
    const hRear = Number(cur.aero?.heightRear);
    if (Number.isFinite(hRear) && bumpRear >= 5) {
      const want = hRear + passo(bumpRear);
      if (want !== hRear) {
        patches.aero ??= {};
        patches.aero.heightRear = want;
        text.push(`Altezza posteriore: ${hRear} → ${want} mm — bumpstop POST al ${r1(bumpRear)}% del giro`);
      }
    }
    const hFront = Number(cur.aero?.heightFront);
    if (Number.isFinite(hFront) && Number.isFinite(bumpFront) && bumpFront >= 5) {
      const want = hFront + passo(bumpFront);
      if (want !== hFront) {
        patches.aero ??= {};
        patches.aero.heightFront = want;
        text.push(`Altezza ANTERIORE: ${hFront} → ${want} mm — bumpstop ANT al ${r1(bumpFront)}% del giro (prima regolaremmo solo il posteriore)`);
      }
    }
    const wing = Number(cur.aero?.wingRear);
    const prof = trackInfo ? trackProfile({ ...trackInfo }, null) : null;
    if (Number.isFinite(wing) && prof?.aero === -1 && wing > 1) {
      patches.aero ??= {}; patches.aero.wingRear = wing - 1;
      text.push(`Ala posteriore: ${wing} → ${wing - 1} — tracciato POWER (${trackInfo.name}): un gradino di drag in meno`);
    } else if (Number.isFinite(wing) && prof?.aero === 1) {
      patches.aero ??= {}; patches.aero.wingRear = wing + 1;
      text.push(`Ala posteriore: ${wing} → ${wing + 1} — tracciato TECNICO (${trackInfo.name}): un gradino di carico in più`);
    }
  }

  /* 3. CAMBER dal proxy termico: l'interno scotta (Δ>0) → meno camber negativo */
  (cur.tires ?? []).forEach((t, i) => {
    const w = WHEELS[i];
    const d = latest.camberProxy?.[w];
    const now = Number(t?.camber);
    if (d == null || !Number.isFinite(now)) return;
    if (Math.abs(d) <= 0.75) return;
    const want = d > 0 ? r1(now + 0.3) : r1(now - 0.3);
    if (want === now) return;
    tiresExtra.push({ i, camber: want });
    text.push(`Camber ${w === 'LF' ? 'ant sx' : w === 'RF' ? 'ant dx' : w === 'LR' ? 'post sx' : 'post dx'}: ${r1(now)}° → ${r1(want)}° — Δ int/est ${r1(d)}° in proxy termico`);
  });

  /* 4. FRENI: l'asse più caldo scarica un po' di lavoro sull'altro (bias ±1) */
  const b = latest.brakes ?? {};
  const fHot = Math.max(...['LF', 'RF'].map((w) => b[w] ?? 0));
  const rHot = Math.max(...['LR', 'RR'].map((w) => b[w] ?? 0));
  const bias = Number(cur.brakes?.bias);
  if (Number.isFinite(bias)) {
    if (fHot > 600 && rHot > 600) {
      text.push(`Freni: ENTRAMBI gli assi picco ${Math.round(fHot)}/${Math.round(rHot)}°C — serve una pastiglia più dura (nel file non si scrive)`);
    } else if (fHot > 600 && bias > 45) {
      patches.brakes ??= {}; patches.brakes.bias = r1(bias - 1);
      text.push(`Bias freni: ${r1(bias)} → ${r1(bias - 1)}% — anteriore a ${Math.round(fHot)}°C, sposto il lavoro verso il posteriore`);
    } else if (rHot > 600 && bias < 75) {
      patches.brakes ??= {}; patches.brakes.bias = r1(bias + 1);
      text.push(`Bias freni: ${r1(bias)} → ${r1(bias + 1)}% — posteriore a ${Math.round(rHot)}°C, sposto il lavoro verso l'anteriore`);
    } else if (fHot > 0) {
      text.push(`Freni in finestra (picco ${Math.round(Math.max(fHot, rHot))}°C): non tocco`);
    }
  }

  /* 5. TC: solo se il file contiene il campo (root.5.f1) */
  const tc1 = Number(cur.elec?.tc1);
  if ((latest.tcPct ?? 0) > 2 && Number.isFinite(tc1) && !('elec' in patches)) {
    if (tc1 < 10) {
      patches.elec ??= {}; patches.elec.tc1 = tc1 + 1;
      text.push(`Traction control: ${tc1} → ${tc1 + 1} — interviene il ${latest.tcPct}% del giro`);
    }
  }

  /* 6. BENZINA di gara: fuelPerLap misurato × giri + 5% di riserva, cap 120 L.
     Si tocca SOLO se la differenza supera un litro (niente variazioni da 0,2 L). */
  const fpl = Number(latest.fuelPerLap);
  const giri = Number(latest.raceLaps);
  const litri = Number(cur.fuel?.liters);
  if (Number.isFinite(fpl) && fpl > 0.3 && Number.isFinite(giri) && giri >= 3) {
    const want = Math.min(120, Math.ceil(fpl * giri * 1.05));
    if (Number.isFinite(litri) && Math.abs(want - litri) >= 1) {
      patches.fuel ??= {}; patches.fuel.liters = want;
      text.push(`Benzina: ${Math.round(litri)} → ${want} L — ${r1(fpl)} L/giro × ${giri} giri (+5% di riserva; controllare l'indicatore dopo CARICA: il cap serbatoio dipende dall'auto)`);
    }
  }

  /* 0. VALORI DI FABRICA (Mauro 21/10: «il meccanico non deve alterare le basi
     di casa»): se una base DEFAULT dell'auto è nota (data/setup-defaults.json),
     una ruota che si discosta oltre soglia TORNA al valore di fabbrica — non al
     «più morbido». NOTA: alcune basi di fabbrica sono Assimmetriche volute
     (molle ant della 296: 260k sx / 340k dx) — si rispettano come sono. */
  const base = (defaults && (Array.isArray(defaults.molle) || Array.isArray(defaults.bumpRig))) ? defaults : null;
  const RUOTE_F = ['ant sx', 'ant dx', 'post sx', 'post dx'];
  const trio = (a, b, eps) =>
    Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > eps;
  if (base && Array.isArray(base.molle)) {
    for (let i = 0; i < 4; i++) {
      const now = Number(cur.springs?.[i]?.spring), fab = Number(base.molle[i]);
      if (!Number.isFinite(now) || !Number.isFinite(fab)) continue;
      if (Math.abs(now - fab) <= Math.max(5000, Math.abs(fab) * 0.2)) continue;
      patches.springs ??= [null, null, null, null];
      patches.springs[i] = { ...(patches.springs[i] ?? {}), spring: fab };
      text.push(`Molla ${RUOTE_F[i]}: ${new Intl.NumberFormat('it-IT').format(now)} → ${new Intl.NumberFormat('it-IT').format(fab)} N/m — valore di fabbrica della casa (scarto ${(Math.round((now - fab) / Math.abs(fab) * 100))}%)`);
    }
  }
  if (base && Array.isArray(base.bumpRig)) {
    for (let i = 0; i < 4; i++) {
      const now = Number(cur.springs?.[i]?.bumpRig), fab = Number(base.bumpRig[i]);
      if (!Number.isFinite(now) || !Number.isFinite(fab)) continue;
      if (Math.abs(now - fab) <= Math.max(100, Math.abs(fab) * 0.25)) continue;
      patches.springs ??= [null, null, null, null];
      patches.springs[i] = { ...(patches.springs[i] ?? {}), bumpRig: fab };
      text.push(`Bumpstop ${RUOTE_F[i]}: ${Math.round(now)} → ${Math.round(fab)} N — riparto dai valori di fabbrica (scarto ${Math.round((now - fab) / fab * 100)}%)`);
    }
  }

  /* (le regole a seguire: come dichiarato sopra in header) */

  /* 7. RADDRIZZO l'ASIMMETRIA sx/dx: le due ruote di uno stesso asse devono
     combaciare. Al lato PIÙ NEUTRO: molla più morbida, smorzamento più basso,
     convergenza più vicina allo zero. Soglia: differenza «macroscopica»,
     non un pelo dovuto a rumore. ECCEZIONE: se la coppia sappilo dei valori di
     FABRICA (basI volute asimmetriche), non si tocca. */

  /* --- molle --- */
  const aFabbrica = (baseArr, i1, i2, v1, v2, eps = 0.02) =>
    Array.isArray(baseArr) && Math.abs((Number(v1) ?? 0) - (Number(baseArr[i1]) || 0)) <= Math.abs(Number(baseArr[i1]) || 1) * eps
      && Math.abs((Number(v2) ?? 0) - (Number(baseArr[i2]) || 0)) <= Math.abs(Number(baseArr[i2]) || 1) * eps;
  const factorySpringPair = (l, r) => base ? aFabbrica(base.molle, l, r, cur.springs?.[l]?.spring, cur.springs?.[r]?.spring) : false;
  for (const [l, r, assName] of [[0, 1, 'anteriore'], [2, 3, 'posteriore']]) {
    const sl = Number(cur.springs?.[l]?.spring), sr = Number(cur.springs?.[r]?.spring);
    if (factorySpringPair(l, r)) continue;
    if (!trio(sl, sr, Math.max(5000, Math.abs(sl ?? 0) * 0.05))) continue;
    const want = Math.round((sl + sr) / 2);
    patches.springs ??= [null, null, null, null];
    patches.springs[l] = { ...(patches.springs[l] ?? {}), spring: want }; patches.springs[r] = { ...(patches.springs[r] ?? {}), spring: want };
    text.push(`Asimmetria molle ${assName}: ${Math.round(sl / 1000)}k vs ${Math.round(sr / 1000)}k N/m — allineo entrambe a ${new Intl.NumberFormat('it-IT').format(want)} (media dell'asse)`);
  }

  /* --- ammortizzatori: allineo alla MEDIA dell'asse (rispetta il bilanciamento
     complessivo scelto in pista, non «spegne» tutto al minimo) --- */
  const DAMPNOMI = { slowBump: 'lento compr', fastBump: 'veloce compr', slowReb: 'lento estr', fastReb: 'veloce estr' };
  for (const [l, r, assName] of [[0, 1, 'anteriore'], [2, 3, 'posteriore']]) {
    const dl = cur.dampers?.[l] ?? {}, dr = cur.dampers?.[r] ?? {};
    const damperPatchL = {}, damperPatchR = {};
    for (const campo of ['slowBump', 'fastBump', 'slowReb', 'fastReb']) {
      const vl = Number(dl[campo]), vr = Number(dr[campo]);
      if (!trio(vl, vr, 5)) continue;
      const want = Math.round((vl + vr) / 2);
      damperPatchL[campo] = want; damperPatchR[campo] = want;
      text.push(`Asimmetria ammortiz. ${assName} · ${DAMPNOMI[campo]}: ${Math.round(vl)} vs ${Math.round(vr)} — allineo entrambi a ${Math.round(want)} (media)`);
    }
    if (Object.keys(damperPatchL).length) {
      patches.dampers ??= [null, null, null, null];
      patches.dampers[l] = { ...(patches.dampers[l] ?? {}), ...damperPatchL };
      patches.dampers[r] = { ...(patches.dampers[r] ?? {}), ...damperPatchR };
    }
  }

  /* --- bumpstop: la rigidità sx e dx dello stesso asse deve combaciare.
     Valori EFFETTIVI (dopo la regola di fabbrica: nessun conflitto) --- */
  const effB = (i) => {
    const p = Number(patches.springs?.[i]?.bumpRig);
    return Number.isFinite(p) ? p : Number(cur.springs?.[i]?.bumpRig);
  };
  for (const [l, r, assName] of [[0, 1, 'anteriore'], [2, 3, 'posteriore']]) {
    const bl = effB(l), br = effB(r);
    if (!trio(bl, br, Math.max(50, Math.abs(bl ?? 0) * 0.2))) continue;
    const want = Math.round((bl + br) / 2);
    patches.springs ??= [null, null, null, null];
    patches.springs[l] = { ...(patches.springs[l] ?? {}), bumpRig: want };
    patches.springs[r] = { ...(patches.springs[r] ?? {}), bumpRig: want };
    text.push(`Asimmetria bumpstop ${assName}: ${Math.round(bl)} N vs ${Math.round(br)} N — allineo entrambi a ${want} (media)`);
  }

  /* --- campanature: la coppia sx/dx di un asse va geometricamente allineata.
     Segno SEMPRE la media dei due valori EFFETTIVI (se il proxy termico ha
     già chiesto una correzione, quella sta dentro la media: niente conflitti). --- */
  const eff = (i) => {
    const e = tiresExtra.find((x) => x.i === i);
    const v = e && Number.isFinite(Number(e.camber)) ? Number(e.camber) : Number(cur.tires?.[i]?.camber);
    return Number.isFinite(v) ? v : null;
  };
  for (const [l, r, assName] of [[0, 1, 'anteriore'], [2, 3, 'posteriore']]) {
    const vl = eff(l), vr = eff(r);
    if (!trio(vl, vr, 0.15)) continue;
    const want = r1((vl + vr) / 2);
    for (const i of [l, r]) {
      const at = tiresExtra.findIndex((x) => x.i === i);
      const entry = { i, camber: want };
      if (at >= 0) tiresExtra[at] = entry; else tiresExtra.push(entry);
    }
    text.push(`Asimmetria campanature ${assName}: ${r1(vl)}° vs ${r1(vr)}° — allineo entrambe a ${r1(want)}° (media dell'asse)`);
  }

  return { patches, tiresExtra, text };
}

/** Tabella setup per le auto della serie corrente: classe, target, nota salvata. */
export function setupBoard(ladder, state, { car = null, track = null } = {}) {
  const node = ladder.nodes.find((n) => n.nodeId === state.node);
  const roundTrack = track ?? node?.calendar?.[Math.min(state.round, (node?.calendar?.length ?? 1) - 1)]?.track ?? null;
  const trackDisplay = roundTrack ? (ladder.contentNames?.tracks?.[roundTrack] ?? roundTrack) : null;
  const cars = [...new Set([...(node?.cars ?? []), ...(car ? [car] : [])])];
  const rows = cars.map((id) => {
    const name = ladder.contentNames?.cars?.[id] ?? id;
    const cls = tyreClassOf(name);
    const note = setupNote(id, roundTrack);
    return { car: id, carName: name, classId: cls.id, classLabel: cls.label, target: cls.target, note: note?.text ?? null, noteAt: note?.at ?? null };
  });
  return { track: roundTrack, trackDisplay, rows, classes: TYRE_CLASSES };
}
