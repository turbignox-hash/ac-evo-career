// _gara-veloce.mjs (3/11) — LA GARA PERSONALIZZATA AL VOLO («se ti dicessi
// «preparami al volo una gara endurance da 5 giri», saresti in grado?»).
//
// 3/11 (prova pilota): la PISTA è DENTRO l'istantanea — campo 3.5 del blocco
// Race (stessa forma del weekend: nazione/nome/tag/layout/continente/lengthM,
// verificato a Monza GP sul file reale). Quindi con --pista la SCRIVIAMO ANCHE
// LEI (setTrack di set-track.mjs sul file INSTANT_RACE); resta a mano solo
// l'eventuale LAYOUT SOLO se la pista ne ha più di uno.
//
// Un gesto prepara TUTTO che l'app può scrivere byte a byte nella gara
// personalizzata di EVO (INSTANT_RACE + customgrid), restando fuori dal
// weekend di carriera (lezione 23/10: GameModeType_RACE_WEEKEND NON si tocca
// per gare fuori dal ladder — è della ronda, e mescolare i due mondi ha già
// dato il crash 0xC0000005 da pista mancante):
//
//   node tools/_gara-veloce.mjs --giri 5               # endurance, 5 giri
//   node tools/_gara-veloce.mjs --tempo 30             # a tempo (30 min)
//     [--pista "Monza"]      anche la PISTA dell'istantanea (dal libro TRACK_INFO)
//     [--banda 88-93]        banda AI della gara (default 88–93, endurance)
//     [--meteo pioggia]      METEO della sessione (sereno|sparse|nuvoloso|coperto|
//                            drizzle|rain|heavy — il preset di gamemode.lastgamemode)
//     [--ora 21]             ORA di gara (0–23) nel datetime dell'istantanea
//     [--rivali 18]          RIVALI in griglia (posti oltre al pilota): il gioco
//                            ripete i modelli del roster cambiando livrea
//     [--auto ks_ferrari_296_gt3]  arma il sedile nel Cruscotto (vetrina custom)
//     [--griglia-pool id1,id2,...] ROSTER della griglia: i modelli vanno al
//                            Cruscotto e la griglia la scrive il GIOCO (7/11 —
//                            niente più customgrid nostro, niente template)
//     [--preset nome]        ricetta SALVATA: i flag mancanti arrivano da lei
//     [--preset-salva nome]  salva la ricetta corrente con nome (sedile incluso)
//     [--dry] [--force]
//
// Il CRUSCOTTO oltre al CLI: src/webui.mjs chiama garaVeloce() con gli stessi
// argomenti (pannello «Gara al volo», via bridge le scritture passano a gioco
// aperto con force, come 'instantrace').
//
// Resta ALL'UTENTE (l'app non clicca l'interfaccia di EVO):
//   1) apri EVO → Gara personalizzata: scegli pista/layout/auto;
//   2) nel menu griglia premi GENERA/APPLICA (le celle scritte qui si montano);
//   3) parti. Durata e banda nel menu sono quelle scritte qui.
// A EVO APERTO le scritture dell'istantanea passano solo con --force; senza,
// il comando rifiuta (lezione: il menu può riscrivere il file nel frattempo).
//
// ---------- L'ULTIMA RICETTA «PARTI SUBITO» (30/10) ----------
// Ogni CHIAMATA VERA di garaVeloce registra TUTTI i parametri che l'hanno
// comandata (giri o tempo, banda, pista, sedile, pool): la funzione
// ultimaRicetta() la rilegge, e il webui espone il bottone «PARTI SUBITO»
// che la ri-esegue IDENTICA. Idempotente per costruzione: rilanciare la
// stessa ricetta riscrive solo ciò che il menu di EVO ha cambiato nel
// frattempo (e se tutto è già a posto non scrive un byte — lezione 30/10
// «stessa ricetta due volte, niente scritture»).

import { existsSync, appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

import { gameRunning } from '../src/evo-grid.mjs';
import { timedRace, setInstantAi, currentInstantRace, INSTANT_FILE } from '../src/set-instantrace.mjs';
import { specFor, changeWeekendTrack, currentWeekendTrack } from '../src/set-track.mjs';
import { setWeatherPreset, currentWeatherPreset, presetFor, PRESETS } from '../src/weather.mjs';
import { setRaceTime, currentRaceTime } from '../src/set-racetime.mjs';
import { fileURLToPath } from 'node:url';
import { loadState, saveState } from '../src/state.mjs';
import { loadLadder, SAVE_FILE } from '../src/webui-env.mjs';
import { writeJsonAtomic } from '../src/atomic.mjs';

// IL REGISTRO DELLA DURATA (1/11): ogni scrittura ARRIVA qui, un JSONL con
// una riga per tasto — la stessa rete dei registri voce (data/copilot-*.jsonl).
// Il posto è la sandbox dei flussi (EVO_FLOWS_DIR, test/_flows-sandbox.mjs):
// nei test e sul PC reale lo stesso env imposta la cartella, e le righe non
// sostituiscono i backup che già gli scrittori lasciano sui file veri.
const BASE_FLUSSI = process.env.EVO_FLOWS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const REGISTRO_FILE = join(BASE_FLUSSI, 'gara-veloce.jsonl');
// I PRESET with NOME (30/10, «preset con la mia auto»): la ricetta COMPLETA
// salvata A UTENT — giri o tempo, banda, pista, sedile (la MIA auto) e pool —
// in un file JSON ATOMICO accanto al registro. La stessa casa del registro:
// nei test la cartella è la sandbox dei flussi (EVO_FLOWS_DIR), sul PC
// reale quella di data/.
export const PRESET_FILE = join(BASE_FLUSSI, 'preset-gara-veloce.json');

/** La STESSA normalizzazione di garaVeloce, estratta per i PRESET: una
 *  ricetta salvata dev'essere GIUSTA come una eseguita (altrimenti il
 *  «carica e parti» fallisce su un preset che non sarebbe mai partito).
 *  RAISE con gli stessi codici di garaVeloce. */
export function ricettaNetta({ giri = null, tempo = null, aiMin = 88, aiMax = 93, auto = null, pista = null, pool = null, meteo = null, ora = null, rivali = null } = {}) {
  if (giri == null && tempo == null) throw Object.assign(new Error('la ricetta ha bisogno di UNA durata: giri o tempo'), { code: 'NO_RECIPE' });
  if (giri != null && tempo != null) throw Object.assign(new Error('o a giri o a tempo, non entrambi'), { code: 'NO_ENTRAMBI' });
  giri = giri != null ? Number(giri) : null;
  tempo = tempo != null ? Number(tempo) : null;
  if ((giri != null && (!Number.isFinite(giri) || giri <= 0)) || (tempo != null && (!Number.isFinite(tempo) || tempo <= 0))) {
    throw Object.assign(new Error('durata: intero > 0 richiesto'), { code: 'BAD_DURATA' });
  }
  if (giri != null) giri = Math.round(giri);
  if (tempo != null) tempo = Math.round(tempo);
  aiMin = Math.round(Number(aiMin ?? 88)); aiMax = Math.round(Number(aiMax ?? 93));
  if (!Number.isFinite(aiMin) || !Number.isFinite(aiMax) || aiMin < 0 || aiMax < 0 || aiMin > 100 || aiMax > 100) {
    throw Object.assign(new Error('banda AI: due interi fra 0 e 100'), { code: 'BAD_BANDA' });
  }
  auto = auto != null ? String(auto).trim() || null : null;
  pista = pista != null ? String(pista).trim() || null : null;
  const pl = typeof pool === 'string' ? pool.split(',').map((c) => c.trim()).filter(Boolean) : (Array.isArray(pool) ? pool.map((c) => String(c).trim()).filter(Boolean) : null);
  // METEO e ORARIO (7/11, «aggiungi anche il meteo selezionabile e orario»):
  // entrano nella ricetta — e quindi nei PRESET — con la stessa disciplina
  // della durata. Il meteo si accetta per nome o per indice (presetFor),
  // l'ora come intero 0-23 della sessione.
  const wx = meteo != null && String(meteo).trim() !== '' ? presetFor(String(meteo).trim()) : null;
  if (meteo != null && String(meteo).trim() !== '' && wx == null) {
    throw Object.assign(new Error(`meteo "${meteo}" non riconosciuto: usa ${PRESETS.map((p) => p.key).join('|')}`), { code: 'BAD_METEO' });
  }
  const ore = ora != null && String(ora).trim() !== '' ? Number(ora) : null;
  if (ore != null && (!Number.isFinite(ore) || ore < 0 || ore > 23)) {
    throw Object.assign(new Error('ora: intero fra 0 e 23'), { code: 'BAD_ORA' });
  }
  // RIVALI (7/11, «18 rivali»): posti in griglia OLTRE al pilota. Con un pool
  // di 8 modelli il gioco ripete i modelli cambiando livrea fino al numero
  // chiesto — quindi 18 rivali è una richiesta legittima, non un pool da 18.
  const rv = rivali != null && String(rivali).trim() !== '' ? Number(rivali) : null;
  if (rv != null && (!Number.isFinite(rv) || rv < 1 || rv > 63)) {
    throw Object.assign(new Error('rivali: intero fra 1 e 63'), { code: 'BAD_RIVALI' });
  }
  return { giri, tempo, aiMin, aiMax, auto, pista, pool: pl?.length ? pl : null, meteo: wx != null ? PRESETS[wx].key : null, ora: ore != null ? Math.round(ore) : null, rivali: rv != null ? Math.round(rv) : null };
}

function leggiPresetFile() {
  try { const b = JSON.parse(readFileSync(PRESET_FILE, 'utf8')); if (b && typeof b === 'object' && b.presets && typeof b.presets === 'object') return b.presets; }
  catch { /* primo avvio: nessun preset */ }
  return {};
}

/** Nome → per UN preset: la ricetta salvata (normalizzata) + quando. null se
 *  il nome manca (nessuna eccezione: il menu può chiedere un preset sparito). */
export function leggiPreset(nome) {
  const p = leggiPresetFile()[String(nome ?? '').trim()];
  return p ? { nome: String(nome).trim(), giri: p.giri ?? null, tempo: p.tempo ?? null, aiMin: p.aiMin ?? 88, aiMax: p.aiMax ?? 93, auto: p.auto ?? null, pista: p.pista ?? null, pool: Array.isArray(p.pool) ? p.pool : null, meteo: p.meteo ?? null, ora: p.ora ?? null, rivali: p.rivali ?? null, at: p.at ?? null } : null;
}

/** L'elenco per il menu della GUI: i preset col loro riepilogo (la STESSA
 *  riga di formattaRigaRegistro, senza riscrivere la formula). Sola lettura. */
export function elencoPreset() {
  return Object.entries(leggiPresetFile())
    .map(([nome, p]) => ({ nome, ...leggiPreset(nome), riga: formattaRigaRegistro({ at: p.at, giri: p.giri, tempo: p.tempo, aiMin: p.aiMin, aiMax: p.aiMax, pista: p.pista }) }))
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')) || a.nome.localeCompare(b.nome));
}

/** Salva CON NOME e sovrascrive in silenzio (ri-salvare un preset è la cura,
 *  non un errore): arriva il form della GUI O una ricetta smontata da
 *  ultimaRicetta(). L'auto del sedile entra COME TUTTO il resto: un preset
 *  «con la mia auto» è la ricetta con auto riempita. */
export function salvaPreset(nome, ricetta = {}) {
  const nom = String(nome ?? '').trim();
  if (!nom) throw Object.assign(new Error('nome del preset mancante'), { code: 'NO_NOME' });
  const preset = ricettaNetta(ricetta);
  const tutti = leggiPresetFile();
  tutti[nom] = { ...preset, at: new Date().toISOString() };
  writeJsonAtomic(PRESET_FILE, { presets: tutti });
  return { nome: nom, ...preset, at: tutti[nom].at };
}

/** Cancella per nome: true se c'era, false se già assente (idempotente). */
export function cancellaPreset(nome) {
  const nom = String(nome ?? '').trim();
  const tutti = leggiPresetFile();
  if (!(nom in tutti)) return false;
  delete tutti[nom];
  writeJsonAtomic(PRESET_FILE, { presets: tutti });
  return true;
}
function registra(voci) {
  try {
    mkdirSync(dirname(REGISTRO_FILE), { recursive: true });
    appendFileSync(REGISTRO_FILE, JSON.stringify({ at: new Date().toISOString(), ...voci }, null, 0) + '\n');
  } catch { /* registro pieno o read-only: la scrittura NON ha modo di fermarsi per lui */ }
}
export function leggiRegistro(limit = 20) {
  try {
    const righe = readFileSync(REGISTRO_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return righe.slice(-limit).reverse().map((r) => { try { return JSON.parse(r); } catch { return { raw: r }; } });
  } catch { return []; }
}

/** UNA riga del registro per UNA persona: «5 giri · AI 88–93 · Monza · 14:32».
 *  Giri e tempo a tempo si escludono (li scrive garaVeloce); l'ora è quella
 *  della scrittura (locale). Riga illeggibile → null: mai un'eccezione per
 *  un riepilogo (i rami che la mostrano stanno in GUI e in uiapp-pub). */
export function formattaRigaRegistro(r) {
  try {
    // ORA SEMPRE A 24 ORE (forma uguale su ogni PC): col locale di sistema il
    // registro usciva «02:35 PM» sui runner in inglese e «14:35» da noi —
    // la stessa riga in due lingue diverse. La riga è un dato, non una
    // traduzione: hour12 spento e locale italiano come il resto della GUI.
    const when = r?.at ? new Date(r.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
    const dur = r?.giri != null ? `${Number(r.giri)} giri`
      : (r?.tempo != null ? `${Number(r.tempo)} min a tempo` : null);
    const banda = r?.aiMin != null && r?.aiMax != null ? `AI ${Number(r.aiMin)}–${Number(r.aiMax)}` : null;
    const pista = r?.pista ? String(r.pista) : null;
    return [dur, banda, pista, when].filter(Boolean).join(' · ') || null;
  } catch { return null; }
}

/** L'ULTIMA RICETTA «PARTI SUBITO» (30/10): l'ultima riga con UNA durata
 *  (giri o tempo) nel registro delle scritture vere. Al volo (chi la chiama
 *  nel webui per il bottone): null se il registro è vuoto o manca, MAI
 *  un'eccezione per un riepilogo; una riga illeggibile si salta.
 *  L'idempotenza è della stessa garaVeloce: rilanciarla riscrive SOLO ciò
 *  che il menu EVO ha toccato nel frattempo. */
export function ultimaRicetta() {
  for (const r of leggiRegistro(50)) {
    if (r?.raw) continue;                        // riga non data: si salta
    if (r.giri == null && r.tempo == null) continue;  // senza durata NON è una gara
    return { giri: r.giri ?? null, tempo: r.tempo ?? null, aiMin: r.aiMin ?? 88, aiMax: r.aiMax ?? 93, auto: r.auto ?? null, pista: r.pista ?? null, pool: Array.isArray(r.pool) ? r.pool : (r.pool ? String(r.pool).split(',').filter(Boolean) : null), meteo: r.meteo ?? null, ora: r.ora ?? null, rivali: r.rivali ?? null };
  }
  return null;
}

/** La ricetta completa della gara al volo. RAISE per input sani (400:
 * NO_RECIPE / NO_ENTRAMBI / BANDA-formato), 409 se l'INSTANT_RACE non esiste.
 * Ogni passo si cava da solo: esito '' = riuscito, errore catturato in esito. */
export function garaVeloce({ giri = null, tempo = null, aiMin = 88, aiMax = 93, auto = null, pool = null, pista = null, meteo = null, ora = null, rivali = null, dry = false, force = false } = {}) {
  aiMin = aiMin != null ? aiMin : 88;  // esplicito nel default anche da API con null
  aiMax = aiMax != null ? aiMax : 93;
  if (giri == null && tempo == null) {
    throw Object.assign(new Error('ricetta mancante: servono giri O minuti a tempo'), { code: 'NO_RECIPE' });
  }
  if (giri != null && tempo != null) {
    throw Object.assign(new Error('o a giri o a tempo, non entrambi'), { code: 'NO_ENTRAMBI' });
  }
  giri = giri != null ? Number(giri) : null;
  tempo = tempo != null ? Number(tempo) : null;
  if ((giri != null && (!Number.isFinite(giri) || giri <= 0)) || (tempo != null && (!Number.isFinite(tempo) || tempo <= 0))) {
    throw Object.assign(new Error('durata: intero > 0 richiesto'), { code: 'BAD_DURATA' });
  }
  aiMin = Math.round(Number(aiMin)); aiMax = Math.round(Number(aiMax));
  if (!Number.isFinite(aiMin) || !Number.isFinite(aiMax) || aiMin < 0 || aiMax < 0 || aiMin > 100 || aiMax > 100) {
    throw Object.assign(new Error('banda AI: due interi fra 0 e 100'), { code: 'BAD_BANDA' });
  }
  if (!existsSync(INSTANT_FILE)) {
    throw Object.assign(new Error(`INSTANT_RACE non esiste ancora (${INSTANT_FILE}): apri UNA volta una gara personalizzata in EVO, poi riprova.`), { code: 'NO_INSTANT' });
  }
  if (auto != null) auto = String(auto).trim();
  if (pista != null) pista = String(pista).trim();
  if (typeof pool === 'string') pool = pool.split(',').map((c) => c.trim()).filter(Boolean);
  // METEO E ORARIO (7/11): stessa pulizia dei preset (ricettaNetta), codici
  // di rifiuto dedicati — un meteo scritto storto non deve diventare «sereno».
  if (meteo != null && String(meteo).trim() !== '') {
    const wx = presetFor(String(meteo).trim());
    if (wx == null) throw Object.assign(new Error(`meteo "${meteo}" non riconosciuto: usa ${PRESETS.map((p) => p.key).join('|')}`), { code: 'BAD_METEO' });
    meteo = PRESETS[wx].key;
  } else meteo = null;
  if (ora != null && String(ora).trim() !== '') {
    ora = Number(ora);
    if (!Number.isFinite(ora) || ora < 0 || ora > 23) throw Object.assign(new Error('ora: intero fra 0 e 23'), { code: 'BAD_ORA' });
    ora = Math.round(ora);
  } else ora = null;
  // RIVALI (7/11): posti OLTRE al pilota. Il gioco riempie la griglia coi
  // modelli del roster ripetendo le livree — 18 rivali con 8 modelli va bene.
  if (rivali != null && String(rivali).trim() !== '') {
    rivali = Number(rivali);
    if (!Number.isFinite(rivali) || rivali < 1 || rivali > 63) throw Object.assign(new Error('rivali: intero fra 1 e 63'), { code: 'BAD_RIVALI' });
    rivali = Math.round(rivali);
  } else rivali = null;
  // I RIVALI VIVONO NEL ROSTER (7/11): senza pool il gioco non sa CHI mettere
  // in griglia e il passo verrebbe semplicemente saltato — meglio dirlo che
  // far credere di aver preparato una griglia da 18.
  if (rivali != null && !(Array.isArray(pool) && pool.length)) {
    throw Object.assign(new Error('i rivali vanno col roster: scegli un pool di auto (o un preset di griglia) insieme al numero di rivali'), { code: 'RIVALI_SENZA_POOL' });
  }

  const passi = [];
  // Le scritture vere si DICHIARANO, non si indovinano dal testo del riepilogo:
  // prima il registro si comandava con una regex su «scritt» negli esiti —
  // un falso positivo nelle righe tipo «... niente scritto» contava una
  // scrittura che non c'era stata. Ora i passi che scrivono lo dichiarano.
  let scrittoQualcosa = false;
  const step = (nome, fn) => {
    try { passi.push({ nome, esito: fn(), ok: true }); }
    catch (e) { passi.push({ nome, esito: String(e?.message ?? e), ok: false }); }
  };

  const titolo = `GARA AL VOLO: ${giri != null ? `${giri} giri` : `${tempo} min`} · banda AI ${aiMin}–${aiMax}${pista ? ` · pista ${pista}` : ''}${meteo ? ` · meteo ${meteo}` : ''}${ora != null ? ` · ore ${String(ora).padStart(2, '0')}:00` : ''}${rivali != null ? ` · ${rivali} rivali` : ''}${auto ? ` · sedile ${auto}` : ''}${pool ? ' · roster al gioco' : ''}${dry ? ' · DRY-RUN' : ''}`;

  // 1) DURATA/MODALITÀ della gara (blocco Race dell'INSTANT_RACE)
  step('durata gara', () => {
    const r = timedRace({ laps: giri, minutes: tempo, dry, force });
    if (!dry && r.written) scrittoQualcosa = true;
    const descr = giri != null ? `${giri} giri` : `${dopoTempoDescr(r.durata)} a tempo`;
    if (r.written) return `${descr} scritti${r.backup ? ` (backup ${basename(r.backup)})` : ''}`;
    if (r.dry) return `dry: scriveresti ${descr}`;
    return r.nota ?? 'già a posto';
  });

  // 2) BANDA AI della gara (cursori che EVO mostra/applica al menu gara)
  step('banda AI', () => {
    const cur = currentInstantRace();
    if (!dry && cur && cur.aiMin === aiMin && cur.aiMax === aiMax) return `già ${aiMin}–${aiMax} (niente da scrivere)`;
    const r = setInstantAi(aiMin, aiMax, { dry, force });
    if (!dry && r.written) scrittoQualcosa = true;
    if (r.written) return `${aiMin}–${aiMax} scritta (era ${cur && cur.aiMin != null ? `${cur.aiMin}–${cur.aiMax}` : '—'})${r.backup ? ` (backup ${basename(r.backup)})` : ''}`;
    if (r.dry) return `dry: scriveresti ${aiMin}–${aiMax}`;
    return r.nota ?? `già ${aiMin}–${aiMax}`;
  });

  // 3) PISTA dell'istantanea (3/11, prova pilota): il blocco Race porta il
  //    sotto-campo 3.5 con la pista COMPLETA (nazione/nome/tag/layout/continente/
  //    lunghezza, stessa forma del weekend) — quindi la scriviamo anche lei.
  //    Partenza con gioco APERTO rifiuta senza --force: la scrittura pista
  //    nell'istantanea a gioco aperto non è mai stata collaudata (sul weekend il
  //    menu il file riscritto lo adotta, ma qui il menu gara può riscriverlo).
  if (pista) step('pista (istantanea)', () => {
    if (gameRunning() && !force) throw new Error('EVO è APERTO: la pista dell\'istantanea si scrive solo con --force sapendolo (o a gioco chiuso).');
    const spec = specFor(pista);
    if (!spec) throw Object.assign(new Error(`pista "${pista}" non nel libro TRACK_INFO: dimmi il nome com'è nel gioco`), { code: 'UNKNOWN_TRACK' });
    const prima = currentWeekendTrack(INSTANT_FILE);   // stesso reader del weekend: f3 → 3.5.2 (uz juris il nome)
    if (!prima) throw new Error('blocco pista (3.5) assente nell\'istantanea: apri una volta una gara custom in EVO, poi ripremi');
    const r = changeWeekendTrack(pista, { file: INSTANT_FILE, dry });
    if (!dry && r.written) scrittoQualcosa = true;
    const descr = `${spec.name} (tag ${spec.tag ?? '—'} · layout ${spec.layout ?? '—'} · ${spec.lengthM ?? '?'} m)`;
    if (dry) return `dry: scriveresti ${descr} (ora c'è "${prima}")`;
    if (!r.written) return r.changed === 0 ? `${descr}: già sotto (idempotente, niente scritto)` : `nessun blocco pista toccato`;
    const dopo = currentWeekendTrack(INSTANT_FILE);
    if (dopo !== spec.name) throw new Error(`verifica fallita: rileggo "${dopo ?? '?'}" invece di "${spec.name}"`);
    return `${descr} scritta${prima && prima !== spec.name ? ` (era "${prima}")` : ''}${r.backup ? ` · backup ${basename(r.backup)}` : ''} · ${r.blocchi} blocc${r.blocchi === 1 ? 'o' : 'i'}`;
  });

  // 3b) METEO della sessione (7/11, «aggiungi anche il meteo selezionabile»):
  //     il cielo di una sessione EVO non viene dal gamemodesave ma dal PRESET
  //     in gamemode.lastgamemode (campo 2 — see src/weather.mjs: la scelta nel
  //     menu non tocca nessun file). Si scrive lì, e lo stesso valore va al
  //     Cruscotto nel comando `volo` (meteo: codice), così la scelta si vede
  //     anche nella schermata di caricamento. `libera`: è una gara al volo,
  //     non una ronda — il meteo lo sceglie il pilota.
  if (meteo) step('meteo (sessione)', () => {
    const prima = currentWeatherPreset();
    const r = setWeatherPreset(meteo, { dry, libera: true });
    if (!dry && r.written) scrittoQualcosa = true;
    const descr = r.preset?.label ?? meteo;
    if (dry) return `dry: scriveresti ${descr} (ora c'è ${PRESETS[prima ?? 0]?.label ?? '?'})`;
    if (!r.written) return `${descr}: già a posto (idempotente, niente scritto)`;
    return `${descr} scritto${r.from !== r.to ? ` (era ${PRESETS[r.from]?.label ?? r.from})` : ''}${r.backup ? ` · backup ${basename(r.backup)}` : ''}`;
  });

  // 3c) ORARIO della gara (7/11, «e orario»): il datetime della sessione Race
  //     vive nel sottoblocco f4 (ora in f4.4) — la stessa scrittura che il
  //     Prepara fa sul weekend, qui sull'istantanea.
  if (ora != null) step('ora (istantanea)', () => {
    const cur = currentRaceTime(INSTANT_FILE);
    const r = setRaceTime({ hour: ora, file: INSTANT_FILE, dry, libera: true });
    if (!dry && r.written) scrittoQualcosa = true;
    const descr = `ore ${String(ora).padStart(2, '0')}:00`;
    if (dry) return `dry: scriveresti ${descr} (ora c'è ${cur?.hour != null ? `${String(cur.hour).padStart(2, '0')}:00` : '—'})`;
    // senza datetime non si può dire «già a posto»: sarebbe un falso positivo
    // (il blocco f4 manca e l'ora non è stata scritta affatto).
    if (cur?.hour == null) throw new Error('l\'istantanea non ha il blocco data/ora (f4): apri UNA volta una gara personalizzata in EVO, poi ripremi');
    if (!r.written) return `${descr}: già a posto (idempotente, niente scritto)`;
    return `${descr} scritto (era ${cur?.hour != null ? `${String(cur.hour).padStart(2, '0')}:00` : '—'})${r.backup ? ` · backup ${basename(r.backup)}` : ''}`;
  });

  // 4) SEDILE ARMATO (opzionale): l'auto che il Cruscotto comanda nel menu gara
  if (auto) step('sedile (vetrina custom)', () => {
    const ladder = loadLadder();
    const nome = ladder?.contentNames?.cars?.[auto] ?? null;
    if (!nome) throw new Error(`auto "${auto}" NON nel libro della ladder: sedile NON armato (controlla l'id nel catalogo)`);
    // DRY = PROVA SENZA SCRIVERE NIENTE (lezione 1/11, ore 00:07): il sedile
    // scriveva il SAVE anche a ricetta asciutta — e ogni suite di test che
    // esercitava garaVeloce con un'auto nel libro re-armava la vetrina custom
    // SUL SALVATAGGIO VERO: nuovo startedAt = nuovo comando non ancora ackato,
    // e la Ferrari 296 GT3 tornava nel menu del gioco «senza toccare nulla».
    if (dry) return `dry: armerei il sedile "${nome}" nel menu gara (vetrina custom)`;
    const state = loadState(SAVE_FILE);
    state.vetrinaCustom = { car: auto, startedAt: Date.now() };
    saveState(SAVE_FILE, state);
    return `armato: entro pochi secondi il Cruscotto imposta "${nome}" (a fine gara: vetrina-custom --off)`;
  });

  // 5) GRIGLIA: LA MONTA IL GIOCO, NON NOI (7/11, richiesta Mauro: «non puoi
  //    impostare semplicemente la gara tramite ack con il loader connesso al
  //    gioco, al posto di griglia magazzino e tutto il resto? lo facciamo già
  //    per il campionato»).
  //    Per la ronda di carriera il Cruscotto manda al gioco il ROSTER
  //    (weekend.gridCars) e i modelli/avversari: la griglia la scrive EVO, coi
  //    SUOI preset — quindi mai una cella assemblata, mai un template da
  //    pescare. La gara al volo usa ora lo stesso canale: qui si arma
  //    `state.volo` (roster + banda + posti) e il publisher lo spedisce al
  //    Cruscotto, che lo applica alla gara personalizzata.
  //    Nessuna scrittura di last_grid.customgrid: il file resta quello che il
  //    gioco ha scritto da solo.
  if (pool?.length) step('griglia (roster al gioco)', () => {
    const ladder = loadLadder();
    const nomi = pool.map((id) => ladder?.contentNames?.cars?.[id] ?? id);
    const posti = Math.max(2, Math.min(64, rivali != null ? rivali + 1 : pool.length + 1));
    const descr = `${pool.length} modelli (${nomi.slice(0, 3).join(', ')}${nomi.length > 3 ? '…' : ''}) · ${posti - 1} rivali (${posti} posti) · AI ${aiMin}-${aiMax}`;
    if (dry) return `dry: armerei ${descr} — il roster va al Cruscotto e la griglia la genera EVO coi suoi preset`;
    // IL COMANDO VIVE NEL SALVATAGGIO (è lì che il publisher lo rilegge):
    // senza carriera il roster non ha un posto dove stare — si dice, non si inventa.
    let state;
    try { state = loadState(SAVE_FILE); }
    catch { throw new Error('serve un salvataggio di carriera (i comandi per il Cruscotto vivono lì): crealo con ac-evo-career.mjs new, oppure monta la griglia a mano in EVO'); }
    state.volo = { startedAt: Date.now(), pool, opponents: posti - 1, aiMin, aiMax, car: auto ?? null, pista: pista ?? null, meteo: meteo ?? null, ora: ora ?? null };
    saveState(SAVE_FILE, state);
    scrittoQualcosa = true;
    return `armata: ${descr} — entro pochi secondi il Cruscotto la imposta nel menu e la griglia la scrive EVO (celle sue, non nostre)`;
  });

  // IL REGISTRO DELLA DURATA: in asciutto niente riga (la prova senza scrivere
  // non si scrive PURE) e idempotente = nulla scritto = niente riga: il
  // registro conta SOLE le scritture vere, con i parametri che le hanno
  // comandate — così la LETTURA del registro è la storia di ciò che è stato
  // scritto davvero, non un elenco di tentativi.
  // Le righe del REGISTRO sono da 30/10 anche la RICETTA «PARTI SUBITO»:
  // garaVeloce le tiene COMPLETE (giri o tempo, banda, pista, sedile, pool)
  // e ultimaRicetta() rilegge l'ultima. Uno step KO NON annulla il
  // registro: riscriversi è la cura, non un problema.
  if (!dry && scrittoQualcosa) {
    registra({ giri, tempo, aiMin, aiMax, pista: pista ?? null, auto: auto ?? null, pool: Array.isArray(pool) ? pool : null, meteo: meteo ?? null, ora: ora ?? null, rivali: rivali ?? null });
  }

  // il verdetto finale: lo stato dell'istantanea come lo vedrà EVO al menu
  let stato = null;
  try { stato = currentInstantRace(); } catch { stato = null; }

  // I PASSI MANUALI (3/11 revisione: la pista SI scrive con --pista, il sedile
  // con --auto; resta a mano solo ciò che l'app proprio non clicca per te: la
  // partenza — e la griglia SOLO se il Cruscotto non è in gioco).
  const restaAte = pista != null
    ? [
      `pista già scritta nell'istantanea (${pista}): nel menu gara controlla SOLO il LAYOUT se ne ha più di uno`,
      'parti. Durata, banda (e sedile col --auto) nel menu sono quelli scritti qui sopra.',
    ]
    : [
      'apri EVO → Gara personalizzata: scegli la PISTA (o ripassala in qua con --pista al prossimo giro)',
      'parti. Durata e banda nel menu sono quelle scritte qui sopra.',
    ];
  // stesso punto nelle DUE varianti (prima di «parti»): il ternario qui
  // sotto scriveva 1 in entrambi i rami — semplificato a 1 e basta.
  if (pool?.length) restaAte.splice(1, 0, 'la griglia la monta il Cruscotto col roster: se non è in gioco, nel menu griglia premi GENERA');

  return {
    titolo,
    passi,
    stato,
    dry,
    restaAte,
  };
}

function dopoTempoDescr(sec) { const m = Math.round((Number(sec) || 0) / 60); return `${Math.max(1, m)} min`; }

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (nome) => { const i = argv.indexOf('--' + nome); return i >= 0 ? argv[i + 1] : null; };
  // La banda si legge da argv SEMPRE con la stessa funzione: il preset (sotto)
  // la spinge in argv quando il flag non c'è, quindi una lettura sola all'inizio
  // non basta — si rilegge dopo l'innesto del preset (bug 7/11: un preset
  // 92–97 partiva con 88–93, la banda salvata veniva ignorata in silenzio).
  const bandaArg = val('banda');
  const leggiBanda = () => {
    const a = val('banda');
    if (a == null) return null;
    const m = String(a).match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) { console.error('banda: formato LO-HI (es. --banda 88-93)'); process.exit(2); }
    return [Number(m[1]), Number(m[2])];
  };
  let [aiMin, aiMax] = leggiBanda() ?? [88, 93];   // default: banda endurance degli eventi
  const giriArg = val('giri'), tempoArg = val('tempo');
  let giri = giriArg != null ? Number(giriArg) : null;
  let tempo = tempoArg != null ? Number(tempoArg) : null;
  const autoArg = val('auto'), pistaArg = val('pista'), poolArg = val('griglia-pool');
  const meteoArg = val('meteo'), oraArg = val('ora'), rivaliArg = val('rivali');
  // --preset nome: la ricetta SALVATA riempie i campi che il CLI non ha
  // battuto a mano — cambi un dettaglio, il resto resta il preset (i flag
  // espliciti vincono SEMPRE, di fila con l'eseguita). argv si spinge come
  // i flag veri: val() la rilegge sotto nel famoso «garaVeloce({...})».
  const presetNome = val('preset');
  if (presetNome) {
    const p = leggiPreset(presetNome);
    if (!p) { console.error(`preset "${presetNome}" non trovato: guardali in ${PRESET_FILE}`); process.exit(2); }
    if (giriArg == null && p.giri != null) argv.push('--giri', String(p.giri));
    if (tempoArg == null && p.tempo != null) argv.push('--tempo', String(p.tempo));
    if (bandaArg == null && (p.aiMin != null || p.aiMax != null)) argv.push('--banda', `${p.aiMin ?? aiMin}-${p.aiMax ?? aiMax}`);
    if (autoArg == null && p.auto != null) argv.push('--auto', p.auto);
    if (pistaArg == null && p.pista != null) argv.push('--pista', p.pista);
    if (poolArg == null && p.pool != null) argv.push('--griglia-pool', p.pool.join(','));
    if (meteoArg == null && p.meteo != null) argv.push('--meteo', String(p.meteo));
    if (oraArg == null && p.ora != null) argv.push('--ora', String(p.ora));
    if (rivaliArg == null && p.rivali != null) argv.push('--rivali', String(p.rivali));
    giri = val('giri') != null ? Number(val('giri')) : null;
    tempo = val('tempo') != null ? Number(val('tempo')) : null;
    // e la BANDA: auto/pista/pool si leggono già al momento della chiamata
    // (val() in fondo), giri/tempo si rileggono qui — la banda no, e restava
    // quella di default anche quando il preset ne portava una diversa.
    const b = leggiBanda();
    if (b) [aiMin, aiMax] = b;
  }
  // --preset-salva nome: la ricetta CORRENTE (flag battuti) con il nome dato
  // nel file JSON. Salva e basta: un collaudo a secco diventa ricetta futura.
  const salvaNome = val('preset-salva');
  if (salvaNome) {
    const r = salvaPreset(salvaNome, { giri, tempo, aiMin, aiMax, auto: autoArg, pista: pistaArg, pool: poolArg, meteo: meteoArg, ora: oraArg, rivali: rivaliArg });
    console.log(`preset "${r.nome}" salvato${giri != null ? ` · ${giri} giri` : ''}${tempo != null ? ` · ${tempo} min` : ''} · AI ${r.aiMin}–${r.aiMax}${r.auto ? ` · sedile ${r.auto}` : ''}${r.pista ? ` · pista ${r.pista}` : ''}${r.meteo ? ` · meteo ${r.meteo}` : ''}${r.ora != null ? ` · ore ${r.ora}:00` : ''}${r.rivali != null ? ` · ${r.rivali} rivali` : ''}${r.pool ? ` · pool: ${r.pool.length} auto` : ''}`);
    process.exit(0);
  }
  let out;
  try {
    out = garaVeloce({ giri, tempo, aiMin, aiMax, auto: val('auto'), pool: val('griglia-pool'), pista: val('pista'), meteo: val('meteo'), ora: val('ora'), rivali: val('rivali'), dry: argv.includes('--dry'), force: argv.includes('--force') });
  } catch (e) {
    console.error(String(e?.message ?? e)); process.exit(Number(e?.code) || /NO_RECIPE|NO_ENTRAMBI|BAD_DURATA|BAD_BANDA|BAD_METEO|BAD_ORA/.test(e?.code ?? '') ? 2 : 1);
  }
  console.log(`== ${out.titolo} ==\n`);
  for (const p of out.passi) console.log(`  ${p.ok ? '✓' : '✗'} ${p.nome}: ${p.esito}`);
  if (out.stato) console.log(`\nStato istantaneo: ${out.stato.modeTxt === 'a tempo' ? `${Math.round((out.stato.durata ?? 0) / 60)} min a tempo` : `${out.stato.durata ?? '?'} giri`} · AI ${out.stato.aiMin ?? '?'}–${out.stato.aiMax ?? '?'}`);
  try { const p = currentWeekendTrack(INSTANT_FILE); if (p) console.log(`   pista: ${p}`); } catch { /* resto: il blocco pista manca */ }
  if (out.dry) console.log('   (dry-run: nessun file toccato)');
  console.log('\n>> RESTA A TE (l\'app non clicca l\'interfaccia di EVO):');
  for (let i = 0; i < out.restaAte.length; i++) console.log(`   ${i + 1}) ${out.restaAte[i]}`);
}
