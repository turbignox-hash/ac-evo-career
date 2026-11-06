// prova-setup.mjs — la PROVA A/B dei setup che il meccanico scrive.
//
// Perché esiste (6/11/2026): il meccanico sa proporre e sa ricordare i suoi
// consigli a parole (allievo.mjs), ma quando SCRIVE un setup sul disco non
// verificava mai se quel setup aveva davvero fatto guadagnare tempo. Il
// Godfather of EVO lo fa da sempre («dopo 3 giri confronto i tempi, più veloce
// → tengo, più lento → torno indietro»), ed è la ragione per cui i suoi setup
// migliorano. Qui la stessa regola, con una differenza: la prova è UNA sola
// leva per volta, con soglia anti-rumore, e senza mai sovrascrivere il file
// base del pilota.
//
// Ciclo:
//   1. quando il meccanico scrive una copia («… — EVO-consigliato» o un nome
//      vero come «Qualifica»), si apre una PROVA con: quali campi ha toccato,
//      il giro migliore della telemetria di partenza, la sessione di partenza;
//   2. alla prima sessione NUOVA (file .ld diverso) della stessa auto+pista la
//      prova si chiude col giro migliore di quella sessione;
//   3. l'esito è «migliorato» / «peggiorato» / «neutro» solo se lo scarto
//      supera la soglia (0,15 s, mai meno del rumore dichiarato): sotto
//      soglia il tempo non dice niente e la prova resta «non conclusiva»;
//   4. il riepilogo per campo (pressioni, camber, altezza, ala, bias, TC,
//      molle, ammortizzatori…) dice al meccanico quali leve hanno pagato su
//      quella pista, così la generazione successiva parte da lì.
//
// ONESTÀ: nessun dato inventato. Senza un giro migliore di partenza non si
// apre nulla; senza una sessione nuova non si chiude nulla e la prova resta
// «in attesa» — la stessa disciplina di allievo.mjs.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FILE = join(HERE, '..', 'data', 'prove-setup.json');

/** Miglioramento minimo perché una prova dica qualcosa (secondi). */
export const SOGLIA_S = 0.15;
/** Oltre questo scarto la leva si considera chiaramente da buttare. */
export const SOGLIA_FORTE_S = 0.35;
/** Massimo di prove tenute in memoria (le più vecchie escono). */
const MAX_PROVE = 40;

const r3 = (v) => Math.round(v * 1000) / 1000;
const keyOf = (car, track) =>
  `${String(car ?? '').trim()}|${String(track ?? '').trim()}`.toLowerCase();
const nowIso = () => new Date().toISOString();

function load() {
  try {
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    if (j && typeof j === 'object' && Array.isArray(j.prove)) return j;
    if (j && typeof j === 'object' && j.memo) return { prove: [] };
  } catch { /* primo avvio */ }
  return { prove: [] };
}

/**
 * Il CAMPO di setup toccato da una riga di modifica ("Pressione LF: 27→27.4 PSI",
 * "Altezza post: 60→62 mm", "Camber ant sx: -2.1°→-2.4°"). Il campo è la chiave
 * del riepilogo: serve per dire «su questa pista il camber ha pagato due volte
 * su tre», non per ripetere la riga.
 */
export function campoDi(riga) {
  const t = String(riga ?? '').toLowerCase();
  if (/pressione|psi|gomma/.test(t)) return 'pressioni';
  if (/campanatura|camber/.test(t)) return 'camber';
  if (/convergenza|toe/.test(t)) return 'convergenza';
  if (/altezza|height/.test(t)) return 'altezza';
  if (/ala|wing|aero/.test(t)) return 'aero';
  if (/bias|fren/.test(t)) return 'freni';
  if (/tc|traction/.test(t)) return 'elettronica';
  if (/molla|spring/.test(t)) return 'molle';
  if (/ammortiz|damper/.test(t)) return 'ammortizzatori';
  if (/bumpstop|bump/.test(t)) return 'bumpstop';
  if (/benzina|fuel/.test(t)) return 'benzina';
  if (/barre?|arb/.test(t)) return 'barre';
  if (/diff/.test(t)) return 'differenziale';
  return 'altro';
}

/** I campi distinti di una lista di righe di modifica. */
export function campiDi(changes) {
  const out = [];
  for (const c of changes ?? []) {
    const k = campoDi(c);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Apre una prova dopo una scrittura del meccanico.
 * Ritorna { ok: false, motivo } se manca la base per giudicare.
 */
export function apriProva({
  car = null, track = null,
  baseFile = null, baseName = null,
  setupFile = null, setupName = null,
  changes = [], bestPrima = null, sessFile = null,
  quando = null,
} = {}) {
  const carName = String(car ?? '').trim();
  const trackName = String(track ?? '').trim();
  if (!carName || !trackName) return { ok: false, motivo: 'auto o pista mancanti' };
  const base = Number(bestPrima);
  if (!Number.isFinite(base) || base <= 0) {
    return { ok: false, motivo: 'senza giro di riferimento non si può giudicare: fai un giro valido e riprova' };
  }
  const campi = campiDi(changes);
  if (!campi.length) return { ok: false, motivo: 'nessun campo toccato: niente da provare' };
  const j = load();
  const prova = {
    id: `${nowIso()}-${Math.random().toString(36).slice(2, 8)}`,
    at: quando ?? nowIso(),
    car: carName, track: trackName,
    baseFile, baseName, setupFile, setupName,
    campi, righe: (changes ?? []).slice(0, 20).map(String),
    bestPrima: r3(base),
    sessFile: sessFile ?? null,
    bestDopo: null, delta: null, esito: null, chiusoAt: null,
  };
  j.prove.push(prova);
  if (j.prove.length > MAX_PROVE) j.prove = j.prove.slice(-MAX_PROVE);
  writeJsonAtomic(FILE, j);
  return { ok: true, prova };
}

/**
 * Chiude la prova di auto+pista con il giro migliore di una sessione NUOVA.
 * - stessa sessione di partenza → resta aperta (i giri sono ancora quelli di prima);
 * - scarto dentro la soglia → «neutro»: il tempo non distingue le due carte;
 * - scarto oltre soglia → «migliorato» / «peggiorato» col delta in secondi.
 * Ritorna { chiuse: [...], aperte: [...] } senza toccare il disco.
 */
export function chiudiConSessione(prove, { car, track, bestDopo, sessFile = null } = {}) {
  const dopo = Number(bestDopo);
  const chiuse = [];
  if (!Array.isArray(prove) || !Number.isFinite(dopo) || dopo <= 0) return { chiuse, prove: prove ?? [] };
  const k = keyOf(car, track);
  const out = prove.map((p) => {
    if (!p || p.esito) return p;
    if (keyOf(p.car, p.track) !== k) return p;
    if (sessFile && p.sessFile && sessFile === p.sessFile) return p;   // stessa uscita: non giudica
    const delta = r3(dopo - p.bestPrima);
    const esito = Math.abs(delta) <= SOGLIA_S
      ? 'neutro'
      : (delta < 0 ? 'migliorato' : 'peggiorato');
    const chiusa = { ...p, bestDopo: r3(dopo), delta, esito, chiusoAt: nowIso() };
    chiuse.push(chiusa);
    return chiusa;
  });
  return { chiuse, prove: out };
}

/** Chiude sul disco la prova pendente di auto+pista (se c'è) e la ritorna. */
export function chiudiProva({ car, track, bestDopo, sessFile = null } = {}) {
  const j = load();
  const { chiuse, prove } = chiudiConSessione(j.prove, { car, track, bestDopo, sessFile });
  if (chiuse.length) {
    j.prove = prove;
    writeJsonAtomic(FILE, j);
  }
  return chiuse;
}

/** La prova ancora aperta di auto+pista (la più recente), o null. */
export function provaAperta(prove, { car, track } = {}) {
  const k = keyOf(car, track);
  const aperte = (prove ?? []).filter((p) => p && !p.esito && keyOf(p.car, p.track) === k);
  return aperte.length ? aperte[aperte.length - 1] : null;
}

/**
 * Riepilogo per campo: quante volte quella leva è stata provata, quante ha
 * guadagnato e quante ha perso. È il numero che il meccanico usa per non
 * riproporre una leva già bruciata su quella pista.
 */
export function riepilogoPerCampo(prove) {
  const m = {};
  for (const p of prove ?? []) {
    if (!p || !p.esito || p.esito === 'neutro') continue;
    for (const c of p.campi ?? []) {
      const e = (m[c] ??= { provate: 0, vinte: 0, perse: 0, ultimoDelta: null });
      e.provate += 1;
      if (p.esito === 'migliorato') e.vinte += 1;
      if (p.esito === 'peggiorato') e.perse += 1;
      e.ultimoDelta = p.delta;
    }
  }
  return m;
}

/**
 * Una leva è «bruciata» quando ha perso almeno due volte e non ha mai vinto:
 * il consiglio che la propone va segnalato (non nascosto: l'utente decide).
 */
export function leveBruciate(prove) {
  const out = [];
  for (const [campo, s] of Object.entries(riepilogoPerCampo(prove))) {
    if (s.perse >= 2 && s.vinte === 0) out.push(campo);
  }
  return out;
}

/** Le prove (le più recenti in fondo), per il pannello. */
export function leggiProve() {
  return load().prove;
}
