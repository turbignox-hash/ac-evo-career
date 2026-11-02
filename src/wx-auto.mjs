// wx-auto.mjs — IL BOLLETTINO SI SISTEMA DA SOLO (3/11, richiesta Mauro:
// «automatico senza l'intervento Metti»). NON il menu, NON il mtime del
// gamemodesave: il trigger è il file Risultati che EVO chiude a fine di
// OGNI sessione del weekend vero
//     <aaaammgg-hhmmss>_SP_<Sessione>.sessionresults.json
// Sessione appena finita → si scrive il meteo della PROSSIMA sessione del
// piano. EVO legge il preset del selettore a ogni avvio sessione, così il
// file è già a posto quando l'utente clicca «entra» sulla sessione dopo —
// lo stesso gesto del tasto «Metti», senza quel tasto.
//
// Garanzie (tutte verificate nei test wx-auto.test.mjs):
//   • si scrive SOLO meteo DEL PIANO: il numero arriva dalla card
//     (viewCard → weatherPlan, race.mjs weatherPlanFor) — la GUI e qui NON
//     scelgono mai un preset. Il cancello del meteo (weather.mjs) resta
//     teso: si passa sempre previsto:true, semantica già prevista dalla
//     guardia stessa (il chiamante ha verificato che il preset combaci col
//     calendario).
//   • PRIMA SESSIONE COMPRESA (4/11, richiesta Mauro: «il meteo delle prove
//     senza l'unico Metti manuale»): il file Risultati per la prima sessione
//     NON esiste ancora, l'innesco è il CAMBIO RONDA — wxAutoPrima (stesso
//     file, STESSO cancello). Da mai il Metti è il ripiego, non il rito.
//   • si scrive SOLO se il file Results è QUESTA ronda: pista combaciante
//     coi nomi attesi (results.mjs trackMatches, STESSA regola del ponte
//     qualifica→gara). Gare veloci / test day / hotlap su altre piste non
//     toccano nulla; hotlap sullo STESSO tracciato fuori dal piano (session
//     non è Practice/Qualifying/Warmup/Race) non tocca nulla.
//   • un file = UNA scrittura (impronta mtime in memoria: il riciclo del
//     watcher non la riscrive) e la scrittura parte solo se il preset
//     attuale ≠ quello del piano (idempotente: già a posto → niente su disco).
//   • dopo la Gara non esiste una «prossima»: si tace.
//
// chiamata: wxAutoTick(paths, costruisciPiano) dal battito del watcher.
// costruisciPiano() viene eseguito SOLO se sul disco c'è un Risultati
// fresco (niente viewCard a ogni tick): torna { piano, pistaNomi, push,
// lgmFile } — lgmFile serve SOLO ai test (il default è il file vero).

import { listResultFiles, readSessionResult, trackMatches } from './results.mjs';
import { currentWeatherPreset, setWeatherPreset } from './weather.mjs';
import { recordWarning } from './warnings.mjs';
import { registra } from './wx-registro.mjs';   // diario delle scritture riuscite (per la GUI)

/** Una scrittura RIUSCITA → una riga del registro: quando, perché, che cosa. */
const attizza = (via, esito) => registra({
  at: new Date().toISOString(), via,
  sessione: esito.session, preset: esito.weather, label: esito.label ?? null,
  from: esito.from ?? null, file: esito.file ?? null,
});

/** dal campo `session` del file Results alle righe del piano (race.mjs). */
const DA_SESSIONE = { practice: 'Practice', qualifying: 'Qualifying', warmup: 'Warmup', race: 'Race' };

// BASE TEMPORALE (modulo = boot del server): un Risultati nato PRIMA del
// boot non innesca niente — le sessioni del weekend passato restano storie.
const AVVIO = Date.now();

// le scritture già fatte: mtime del file → grado. Chiave stabile perché il
// mtime di un Risultati è immutato a fine sessione (il gioco non lo ritocca).
const visti = new Map();
let ultimaVista = 0;

export function wxAutoTick(paths, costruisciPiano) {
  const files = listResultFiles(paths ?? null);
  const soglia = Math.max(AVVIO, ultimaVista);
  const nuovissimi = files.filter((f) => f.mtime > soglia && !visti.has(f.mtime));
  if (!nuovissimi.length) return null;
  ultimaVista = files.reduce((m, f) => Math.max(m, f.mtime), ultimaVista);
  // dal più nuovo al più vecchio: reagisce all'ULTIMO evento della pista
  const ctx = (typeof costruisciPiano === 'function') ? (costruisciPiano() ?? {}) : {};
  const piano = Array.isArray(ctx.piano) ? ctx.piano : [];
  const pistaNomi = Array.isArray(ctx.pistaNomi) ? ctx.pistaNomi : [];
  let esito = null;
  for (const f of nuovissimi) {
    if (visti.has(f.mtime)) continue;
    visti.set(f.mtime, true);
    let result = null;
    try { result = readSessionResult(f.file); } catch (e) {
      recordWarning('wx-auto', `risultato non leggibile: ${f.name}`, e.message);
      continue;   // file mezzo scritto dal gioco: il prossimo giro non lo rivede più (visto)
    }
    const sess = DA_SESSIONE[String(result?.session ?? '').toLowerCase()] ?? null;
    if (!sess) continue;                                  // hotlap / drag / sessione esotica
    const idx = piano.findIndex((x) => x.session === sess);
    if (idx < 0) continue;                                // fuori dal piano di QUESTA ronda
    const next = piano[idx + 1] ?? null;
    if (!next) {                                          // la gara era l'ultima: fine piano
      esito = { scritto: false, finePiano: true, session: sess, file: f.name };
      continue;
    }
    // la pista DEVE combaciare: è la salvaguardia che reagisce solo alle
    // sessioni della ronda in corso, non ad altri giochi sulla stessa pista
    if (!trackMatches(pistaNomi, result?.track)) continue;
    const cur = currentWeatherPreset(ctx.lgmFile);
    if (cur === next.weather) {                           // già a posto: niente su disco
      esito = { scritto: false, giaOk: true, session: next.session, weather: next.weather };
      continue;
    }
    let w = null;
    try { w = setWeatherPreset(next.weather, { previsto: true, lgmFile: ctx.lgmFile }); } catch (e) {
      recordWarning('wx-auto', `scrittura meteo fallita (${next.session})`, e.message);
      continue;
    }
    esito = { scritto: true, da: sess, session: next.session, label: next.label, weather: next.weather, from: w.from, file: f.name };
    attizza('fine-sessione', esito);
    if (typeof ctx.push === 'function') {
      ctx.push(`Bollettino in automatico: finita ${sess} → meteo di ${next.session} (${next.label}).`, 'info');
    }
  }
  return esito;
}

/* PRIMA SESSIONE IN AUTOMATICO (4/11, richiesta Mauro: «il meteo delle prove
   senza l'unico Metti manuale»). wxAutoTick vive del file Risultati: per la
   PRIMA sessione di una ronda quel file NON esiste ancora — l'altro innesco
   naturale è il CAMBIO RONDA (node#round della carriera). Regole:
   • CHIAVE RONDA = UNA decisione sola: al cambio di chiave (o al primo battito
      dopo il riavvio del server) si valuta UNA volta; i tick dopo con la
      STESSA chiave escono subito — zero riscritture, zero seccature.
   • «qualcuno ha già girato su questa pista»: se un Risultati con sessione
     VALIDA del piano (Practice/Qualifying/Warmup/Race) c'è,
     - a cambio ronda DA VIVO contano solo i file APARSI col cambio (mtime
       >= momento): la Gara appena finita della ronda vecchia conta E CHIUDE
       (due ronde di fila sulla stessa pista restano a mano: raro);
     - al PRIMO BATTITO dopo il riavvio tutto ciò che è sul disco è storia
       (i mtime non distinguono le ronde): basta che il file della pista
       esista per tacere — il Metti resta il ripiego di quei casi.
   • STESSO cancello, STESSA fonte: currentWeatherPreset + setWeatherPreset
     con previsto:true e lgmFile esplicito, come wxAutoTick. */
const rondaVista = { chiave: null, momento: 0 };

export function wxAutoPrima(paths, costruisciPiano, chiaveRonda) {
  const chiave = String(chiaveRonda ?? '');
  if (!chiave) return null;
  let files = [];
  try { files = listResultFiles(paths ?? null); } catch { return null; }
  if (rondaVista.chiave === chiave) return null;   // già deciso per questa ronda
  const primoBattito = rondaVista.chiave === null; // boot: tutto ciò che esiste è storia
  rondaVista.chiave = chiave;
  rondaVista.momento = files.reduce((m, f) => Math.max(m, f.mtime), 0);
  const ctx = (typeof costruisciPiano === 'function') ? (costruisciPiano() ?? {}) : {};
  const piano = Array.isArray(ctx.piano) ? ctx.piano : [];
  const pistaNomi = Array.isArray(ctx.pistaNomi) ? ctx.pistaNomi : [];
  const target = piano.find((x) => x.session === 'Practice') ?? null;
  if (!target) return { scritto: false, nessunPiano: true };
  // «già girata»: il file è di QUESTA pista, si chiama come il piano e —
  //   a cambio ronda da vivo — è apparso col cambio (mtime >= momento);
  //   al boot basta che esista.
  let giaCorsa = false;
  for (const f of files) {
    if (!primoBattito && f.mtime < rondaVista.momento) continue;
    let result = null;
    try { result = readSessionResult(f.file); } catch { continue; }   // file mezzo scritto: non decide
    if (!DA_SESSIONE[String(result?.session ?? '').toLowerCase()]) continue;   // hotlap / esotiche: non conta
    if (!trackMatches(pistaNomi, result?.track)) continue;            // altra pista: non conta
    giaCorsa = true; break;
  }
  if (giaCorsa) return { scritto: false, giaCorsa: true, session: 'Practice' };
  const cur = currentWeatherPreset(ctx.lgmFile);
  if (cur === target.weather) return { scritto: false, giaOk: true, session: 'Practice', weather: target.weather };
  let w = null;
  try { w = setWeatherPreset(target.weather, { previsto: true, lgmFile: ctx.lgmFile }); } catch (e) {
    recordWarning('wx-auto', 'scrittura meteo fallita (Practice, cambio ronda)', e.message);
    return { scritto: false, errore: String(e?.message ?? e) };
  }
  const esito = { scritto: true, session: 'Practice', label: target.label, weather: target.weather, from: w.from };
  attizza('cambio-ronda', esito);
  if (typeof ctx.push === 'function') {
    ctx.push(`Bollettino in automatico: nuova ronda → meteo delle Prove libere (${target.label}).`, 'info');
  }
  return esito;
}
