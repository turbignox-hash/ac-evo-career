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
