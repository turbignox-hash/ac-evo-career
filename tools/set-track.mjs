// set-track.mjs — CAMBIO PISTA sul weekend a gioco APERTO.
//
// Verificato col test reale (20/10/2026, Suzuka ↔ Red Bull Ring, 3 cicli):
// cambiando pista dal menu, il gioco riscrive GameModeType_RACE_WEEKEND.gamemodesave
// (una riscrittura identica per i 4 blocchi sessione del weekend). La pista vive
// nel campo ripetuto 3.5 di ogni blocco (3):
//   3.5.1 nazione ("AUT")  3.5.2 nome ("Red Bull Ring")  3.5.3 tag layout ("GP")
//   3.5.6 layout lungo ("GP Race")  3.5.8 continente ("Europe")  3.5.9 lunghezza m
// La scrittura esterna a gioco aperto è ACCETTATA dal menu (confermato a schermo
// 3 dietras) e la griglia bilanciata non si perde al cambio.
//
// libreria (usata da webui):
//   import { changeWeekendTrack, currentWeekendTrack, specFor } from './set-track.mjs';
// CLI:
//   node tools/set-track.mjs --track "Red Bull Ring" [--dry] [--file <path>]
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { decodeMsg, encodeMsg, gameRunning, GAME_MODES_DIR } from './evo-grid.mjs';
import { join } from 'node:path';
import { TRACK_INFO } from '../src/tracks.mjs';
import { sameTrack } from '../src/tracknames.mjs';

export const WEEKEND_FILE = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');

/* ---------- lettura robusta del gamemodesave (27/10, Mauro) ----------
   A EVO APERTO il gioco riscrive il file da solo (weekend avviato, menu in
   attività): una lettura unica può cadere su file OCCUPATO (EBUSY/EPERM) o
   scritto a METÀ (forma non decodificabile). Il Prepara allora chiedeva a
   mano «muovi Grid Type su CUSTOM» per un problema che mezzo secondo dopo
   non esisteva più — lo stato sul disco era già a posto («controlla
   paddock»: il selettore c'era già). Si riprova 3× con pausa di 400 ms:
   la riscrittura del gioco dura pochissimo. */
const GM_TENTATIVI = 5;   // 31/10: 3 non bastavano col gioco che riscrive in corsa («oltrefine» ripetuto)
const GM_PAUSA_MS = 400;
const pausaMs = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* pazienza: senza Atomics si va senza pausa */ } };

/** Lettura + decodifica del gamemodesave con tentativi. L'ultimo errore
 *  arriva al chiamante solo dopo l'ultimo fallito. */
export function leggiGmFields(file = WEEKEND_FILE) {
  let ultimo;
  for (let i = 0; i < GM_TENTATIVI; i++) {
    if (i > 0) pausaMs(GM_PAUSA_MS);
    try {
      const buf = readFileSync(file);
      return decodeMsg(buf);
    } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

// nazione ISO a 3 lettere (campo 3.5.1): TRACK_INFO porta il nome in italiano
export const ISO = {
  Italia: 'ITA', Giappone: 'JPN', Austria: 'AUT', Germania: 'DEU', Francia: 'FRA',
  'Regno Unito': 'GBR', 'Stati Uniti': 'USA', Australia: 'AUS', Brasile: 'BRA',
  Belgio: 'BEL', Spagna: 'ESP', Portogallo: 'PRT', Olanda: 'NLD', 'Paesi Bassi': 'NLD',
  Dubai: 'ARE', 'Emirati Arabi': 'ARE', Cina: 'CHN', Canada: 'CAN', Messico: 'MEX',
  Ungheria: 'HUN', Scozia: 'GBR', Galles: 'GBR', Irlanda: 'IRL', Svizzera: 'CHE',
  Svezia: 'SWE', Finlandia: 'FIN', Polonia: 'POL',
};

/**
 * Piste con nome asset ≠ nome display e/o tag/layout dedicati (lezione del
 * 21/10, Nürburgring: i campi f5.2/f5.3/f5.6 sbagliati spiano la texture e
 * crashano il load con "empty path"). Chiave = nome libero riconosciuto da
 * sameTrack. I valori sono quelli che EVO SCRIVE DA SOLO al pick dal menu
 * (gamemodesave healthy diff 21/10, il campo fantasma non c'era).
 *
 * LEZIONE 22/10 notte (schermata piste VUOTA a Laguna Seca): i campi NON
 * special NON DEVONO ereditare tag/layout/continente dal file precedente —
 * dopo il Nürburgring Laguna Seca si è ritrovata col kit completo del ring
 * ("Gp Strecke"/"Gp Strecke Race"/"Europe") e la lista piste si svuota.
 * Da qui specFor scrive GASOLIO valori assoluti (GP / GP Race / continente
 * dal paese) per ogni pista del libro: SPECIALS solo per le piste con layout
 * propri.
 */
export const TRACK_SPECIALS = {
  nurburgring: { name: 'Nurburgring', tag: 'Gp Strecke', layout: 'Gp Strecke Race', continent: 'Europe' },
  // Paul Ricard: 4 layout propri ( Nicola opzione 21/10 ore 15:53 — window
  // ROUND 1 senza layout in ladder, partita con la pista VUOTA e crash
  // "No starting position!"; layout scelto a mano → gara partita). Il catalogo
  // ufficiale del server dedicato lista ESATTAMENTE questi nomi:
  // "Layout 1A-V2" / "Layout 1C-V2" / "Layout 3A" / "Layout 3C".
  // LEZIONE 21/10 pomeriggio (tessera SEMPRE scura anche col file riscritto da
  // EVO): il tag f5.3 = "GP" chiede "paul_ricard-gp.texture", che NON esiste —
  // Paul Ricard NON ha un layout GP. I valori VERI venuti da una sessione
  // riuscita (Results 17/10 22:19 e 19/10 23:40: layout "Layout 1C-V2 Race";
  // cartella MoTec "Paul RicardLayout 1C-V2", come "NurburgringGp Strecke"):
  // tag = il nome del layout, layout lungo = il nome + " Race".
  paul_ricard: { name: 'Paul Ricard', tag: 'Layout 1C-V2', layout: 'Layout 1C-V2 Race', continent: 'Europe' },
  // Sebring (guardo 22/10 sera, riquadro pista VUOTO preparando la gara): il
  // book dice name "Sebring" / 6.019 km ma il leaderboard che EVO SCRIVE DA
  // SOLO al pick dal menù (osservato con watch-gamemode.tmp.mjs su un giro di
  // click USA: Road Atlanta, Laguna Seca, COTA, Watkins Glen, Sebring) porta
  // name "Sebring International Raceway" e 5954 m, con tag "GP" e layout
  // "GP Race" (i default). Con name "Sebring" il percorso risorsa esce
  // sbagliato e il tess va vuoto/crasha al load: UNICA lezione del giro —
  // la pista è mono-layout e NON ha ovaldal/short (Watkins sì: "Short Inner
  // Loop Race", attr "Short Inner Loop"). Solo nome e lunghezza differiscono
  // dal book: sebring è l'unico tracciato USA il cui name EVO NON è il name
  // del book.
  sebring: { name: 'Sebring International Raceway', lengthM: 5954, tag: 'GP', layout: 'GP Race', continent: 'North America' },
};

// continente (campo 3.5.8) per paese: usato per NON ereditare il continente
// del file precedente (lezione 22/10 notte, Laguna Seca col continente
// "Europe" del Nürburgring). I paesi già coperti da ISO qui sotto.
export const CONTINENTI = {
  Italia: 'Europe', Germania: 'Europe', Austria: 'Europe', Francia: 'Europe',
  'Regno Unito': 'Europe', Scozia: 'Europe', Galles: 'Europe', Spagna: 'Europe',
  Portogallo: 'Europe', Olanda: 'Europe', 'Paesi Bassi': 'Europe', Belgio: 'Europe',
  Ungheria: 'Europe', Svizzera: 'Europe', Svezia: 'Europe', Finlandia: 'Europe',
  Polonia: 'Europe', Irlanda: 'Europe',
  Giappone: 'Asia', Cina: 'Asia',
  'Stati Uniti': 'North America', Canada: 'North America', Messico: 'North America',
  Brasile: 'South America',
  Australia: 'Oceania',
  Dubai: 'Asia', 'Emirati Arabi': 'Asia',
};

/** Ricerca pista nel libro: match esatto/normale sul nome o fullName. */
export function findTrackInfo(name) {
  for (const t of Object.values(TRACK_INFO)) if (sameTrack(t.name, name) || sameTrack(t.fullName ?? '', name)) return t;
  return null;
}

function specialKeyFor(trackName, info) {
  for (const k of Object.keys(TRACK_SPECIALS)) {
    if (sameTrack(k, trackName) || sameTrack(info.name, k) || String(info.fullName ?? '').toLowerCase().includes(k)) return k;
  }
  return null;
}

/**
 * La spec dei campi pista per una pista nominata: nome + nazione ISO + lunghezza
 * da TRACK_INFO. I campi non noti (tag/layout/continente) restano quelli del
 * file: per la convenzione stessa tra le piste viste (Monza/Sebring/Red Bull/
 * Suzuka) è la scelta giusta. Null se la pista non è nel libro.
 */
export function specFor(trackName, over = {}) {
  const info = findTrackInfo(trackName);
  if (!info) return null;
  const spec = {
    nation: over.nation ?? ISO[info.country],
    name: info.name,
    lengthM: over.lengthM ?? (info.lengthKm != null ? Math.round(info.lengthKm * 1000) : undefined),
    // VALORI ASSOLUTI, non ereditati dal file (lezione 22/10 notte: Laguna Seca
    // ereditata col kit COMPLETO del Nürburgring — tag "Gp Strecke", layout
    // "Gp Strecke Race", continente Europe — e la schermata piste si svuota):
    // - tag/layout: il catalogo del server dedicato dice che TUTTE le piste
    //   mono-layout si chiamano "GP"/"GP Race" (Monza/Sebring/RBR/Suzuka/
    //   Donington visti sani nei backup: sempre GP + "GP Race"); le piste con
    //   layout propri (Nürburgring) restano nel TRACK_SPECIALS qui sotto.
    // - continente: dal paese del libro, mai dal file.
    tag: over.tag ?? 'GP',
    layout: over.layout ?? 'GP Race',
    continent: over.continent ?? CONTINENTI[info.country] ?? null,
  };
  if (spec.nation == null) delete spec.nation;   // senza ISO noto: lascia quello del file
  if (spec.continent == null) delete spec.continent;
  // piste con nome asset/tag/layout propri: i valori SPECIALS sostituiscono
  // i default qui sopra
  const key = specialKeyFor(trackName, info);
  if (key) Object.assign(spec, TRACK_SPECIALS[key]);
  return spec;
}

/** Il nome pista attualmente scritto nel file (dal primo blocco sessione). */
export function currentWeekendTrack(file = WEEKEND_FILE) {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }
  const fields = decodeMsg(buf);
  const f3 = fields.find((f) => f.field === 3 && f.wire === 2);
  if (!f3) return null;
  const session = decodeMsg(f3.bytes);
  const trk = session.find((s) => s.field === 5 && s.wire === 2);
  if (!trk) return null;
  const sub = decodeMsg(trk.bytes);
  const name = sub.find((x) => x.field === 2);
  return name ? Buffer.from(name.bytes).toString('utf8') : null;
}

/**
 * Quante VETTURE si aspetta la carriera EVO per la ronda corrente: nel blocco
 * 3 del gamemodesave i campi 3.10 ripetuti (w2) sono UNA auto ciascuno e il
 * 3.7 (w0) dichiara il conteggio. Lezione 24/10 15:50 (Coppa 500, crash
 * 0xC0000005 subito dopo «Opponent [12] found!»): se il customgrid viene
 * scritto con un numero di celle DIVERSO da questo, il gioco cerca l'ai
 * mancante e crasha. Il contatore NATIVO (gamemodesave) vince sempre sulla
 * gridSize del ladder, che era una stima nostra mai confermata da EVO.
 * Ritorna { cars, declared, track } (cars = voci 3.10 reali del primo blocco
 * 3, declared = il 3.7 dichiarato, track = pista correntemente impostata),
 * oppure null se il gamemodesave non c'è / non si legge (PC vergine, EVO mai
 * avviato: comportamento come prima, nessuna override).
 */
export function weekendCarCount(file = WEEKEND_FILE) {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }
  let fields;
  try { fields = decodeMsg(buf); } catch { return null; }
  // LEZIONE 27/10 (DTM Legends «Prepara tutto» → griglia a 1 cella): il PRIMO
  // blocco 3 (Practice) può portare il RESIDUO di una vecchia ronda rotta
  // (cars=1, dichiarato=1) mentre gli ALTRI blocchi (Quali/Gara) conservano la
  // dichiarazione VERA della ronda (3.7=15 → 16 celle). Letto solo il primo
  // blocco, il gate del conteggio restringeva la serie al residuo.
  // Ora si scandiscono TUTTI i blocchi: cars = massino delle voci 3.10,
  // declared = massimo dei 3.7 presenti (la dichiarazione più alta è quella
  // che il gioco dovrebbe soddisfare: scrivere SOPRA di lei è ciò che crasha).
  let cars = 0, declared = null;
  const blocchi = fields.filter((f) => f.field === 3 && f.wire === 2);
  if (!blocchi.length) return null;
  for (const f3 of blocchi) {
    let session;
    try { session = decodeMsg(f3.bytes); } catch { continue; }
    const n = session.filter((s) => s.field === 10 && s.wire === 2).length;
    if (n > cars) cars = n;
    const dec = session.find((s) => s.field === 7 && s.wire === 0);
    if (dec) { const v = Number(dec.varint); if (declared == null || v > declared) declared = v; }
  }
  return { cars, declared, track: currentWeekendTrack(file) };
}

/**
 * Riscrive i campi pista in TUTTI i blocchi 3.5 del gamemodesave.
 * spec = { nation, name, tag, layout, continent, lengthM } — i campi non dati
 * restano quelli originali di ogni blocco. Ritorna { fields, blocchi, changed }.
 */
export function setTrack(buf, spec) {
  const fields = decodeMsg(buf);
  const f3 = fields.filter((f) => f.field === 3 && f.wire === 2);
  let blocchi = 0, changed = 0;
  for (const f of f3) {
    const session = decodeMsg(f.bytes);
    const trkField = session.find((s) => s.field === 5 && s.wire === 2);
    if (!trkField) continue;
    blocchi++;
    const sub = decodeMsg(trkField.bytes);
    const orig = {
      nation: sub.find((x) => x.field === 1)?.bytes, name: sub.find((x) => x.field === 2)?.bytes,
      tag: sub.find((x) => x.field === 3)?.bytes, layout: sub.find((x) => x.field === 6)?.bytes,
      continent: sub.find((x) => x.field === 8)?.bytes, lengthM: sub.find((x) => x.field === 9)?.varint,
    };
    const str = (v) => v != null ? Buffer.from(v).toString('utf8') : null;
    const want = {
      nation: spec.nation ?? str(orig.nation), name: spec.name ?? str(orig.name),
      tag: spec.tag ?? str(orig.tag), layout: spec.layout ?? str(orig.layout),
      continent: spec.continent ?? str(orig.continent),
      lengthM: spec.lengthM ?? (orig.lengthM != null ? Number(orig.lengthM) : undefined),
    };
    let touched = false;
    for (const s of sub) {
      const u = (val) => { s.bytes = Buffer.from(val, 'utf8'); touched = true; };
      if (s.field === 1 && want.nation !== str(orig.nation)) u(want.nation);
      else if (s.field === 2 && want.name !== str(orig.name)) u(want.name);
      else if (s.field === 3 && want.tag !== str(orig.tag)) u(want.tag);
      else if (s.field === 6 && want.layout !== str(orig.layout)) u(want.layout);
      else if (s.field === 8 && want.continent !== str(orig.continent)) u(want.continent);
      else if (s.field === 9 && want.lengthM != null && Number(s.varint) !== want.lengthM) { s.varint = BigInt(want.lengthM); touched = true; }
    }
    if (touched) changed++;
    trkField.bytes = encodeMsg(sub);
    f.bytes = encodeMsg(session);
  }
  return { fields, blocchi, changed };
}

/**
 * Il gesto completo per la GUI e per chi scrive codice: cambia la pista del
 * weekend per NOME (dal libro TRACK_INFO), con backup automatico. A differenza
 * delle scritture griglia NON serve EVO chiuso: provato ripetutamente, il menu
 * adopera il file riscritto.
 * opts: { file, dry } — dry: solo report, niente scrittura.
 */
export function changeWeekendTrack(trackName, { file = WEEKEND_FILE, dry = false } = {}) {
  const spec = specFor(trackName);
  if (!spec) throw Object.assign(new Error(`pista "${trackName}" non nel libro TRACK_INFO`), { code: 'UNKNOWN_TRACK' });
  const buf = readFileSync(file);
  const res = setTrack(buf, spec);
  if (dry || res.changed === 0) return { spec, blocchi: res.blocchi, changed: res.changed, written: false };
  const backup = `${file}.bak-track-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  const out = encodeMsg(res.fields);
  writeFileSync(`${file}.tmp`, out);
  renameSync(`${file}.tmp`, file);
  return { spec, blocchi: res.blocchi, changed: res.changed, written: true, backup };
}

/* ---------- difficoltà AI del weekend (campi 30/31 del blocco 3) ---------- */

/**
 * La banda AI realmente scritta nel gamemodesave: è questa che il gioco
 * mostra sullo screen di caricamento (88–93 osservati il 23/10). Reader:
 * ritorna { min, max } dai campi 30/31 del primo blocco sessione, o null.
 */
export function weekendAi(file = WEEKEND_FILE) {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }
  const f3 = decodeMsg(buf).find((f) => f.field === 3 && f.wire === 2);
  if (!f3) return null;
  const session = decodeMsg(f3.bytes);
  const lo = session.find((s) => s.field === 30)?.varint;
  const hi = session.find((s) => s.field === 31)?.varint;
  return lo != null && hi != null ? { min: Number(lo), max: Number(hi) } : null;
}

/**
 * Riscrive l'intervallo AI del weekend (campi 30/31), come i due cursori
 * nella barra difficoltà del gioco — UNA SEMPLICE CORSIA: min e max. A
 * differenza delle scritture griglia NON serve EVO chiuso (come la pista:
 * provato sul gamemodesave reale); vale alla prossima apertura del weekend,
 * e sullo screen di caricamento si vede la banda scritta qui.
 * opts: { file, dry } — dry: solo report, niente scrittura.
 */
export function setWeekendAi(min, max, { file = WEEKEND_FILE, dry = false } = {}) {
  const lo = Math.max(0, Math.min(100, Math.round(Number(min))));
  const hi = Math.max(lo, Math.min(100, Math.round(Number(max))));
  const buf = readFileSync(file);
  const fields = decodeMsg(buf);
  const f3 = fields.find((f) => f.field === 3 && f.wire === 2);
  if (!f3) throw Object.assign(new Error('blocco sessione (campo 3) non trovato nel gamemodesave'), { code: 'NO_SESSION' });
  const session = decodeMsg(f3.bytes);
  let touched = false;
  for (const [n, v] of [[30, lo], [31, hi]]) {
    const i = session.findIndex((s) => s.field === n);
    if (i >= 0) {
      if (Number(session[i].varint) !== v) { session[i].varint = BigInt(Math.max(0, v)); touched = true; }
    } else { session.push({ field: n, wire: 0, varint: BigInt(Math.max(0, v)) }); touched = true; }
  }
  f3.bytes = encodeMsg(session);
  if (dry || !touched) return { ai: [lo, hi], changed: touched, written: false };
  const backup = `${file}.bak-ai-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  writeFileSync(`${file}.tmp`, encodeMsg(fields));
  renameSync(`${file}.tmp`, file);
  return { ai: [lo, hi], changed: true, written: true, backup };
}

/* ---------- tipo griglia del menu EVO (campi 3.6/3.7 del primo blocco) ---------- */

/**
 * La MODALITA' GRIGLIA come il menu Race Weekend la tiene sul disco.
 * MAPPATURA CANONICA (26/10 19:39, toggle LIVE fotografato a EVO APERTO:
 * data/samples/gridtype/gt-193557-223 = AUTOMATIC in memoria del gioco,
 * data/samples/gridtype/gt-193953-110 = CUSTOM scritto dal menu; il diff
 * a campo è l'unico cambiamento nei campi bassi = 7 = 14 AGGIUNTO, col
 * 6 = 1 che RESTA). Confermata anche a riavvio: al reopen con il disco
 * in forma 6=1 + 7=N il menu nasce CUSTOM. Le prime mappe «6 e 7 si
 * escludono» venivano dai MIEI write a freddo, che strappavano il 6: il
 * gioco le scartava e ripartiva AUTOMATIC (sessione 19:09/19:25).
 *   AUTOMATIC → il primo blocco sessione porta il campo 6 (w0) = 1 e NON il 7;
 *   CUSTOM    → il primo blocco porta il campo 6 (w0) = 1 E il campo
 *               7 (w0) = N (il valore dello slider «Number of Opponents»:
 *               11 e 7 e 14 osservati muovendo lo slider e i toggle).
 * Gli ALTRI blocchi sessione (qualifica/warm-up/gara) portano sempre
 * campo 7 = 1 in ENTRAMBE le modalità: il branch vive solo nel primo blocco.
 * Le file-piloti (campi 11 ripetuti: 14) NON cambiano col toggle: le celle
 * vere le fissa il customgrid — questo campo è solo lo SBLOCCO del menu,
 * e le zavorre/penalità di classe esistono solo con CUSTOM (lezione del
 * 25/10: la Berline Moderne uscita monoclasse, menu su AUTOMATIC).
 * Reader: ritorna { mode: 'automatic'|'custom'|null, count }, null se il
 * gamemodesave non c'è / non si legge (PC vergine, EVO mai sul weekend).
 */
export function weekendGridMode(file = WEEKEND_FILE) {
  let fields;
  try { fields = leggiGmFields(file); } catch { return null; }
  const f3 = fields.find((f) => f.field === 3 && f.wire === 2);
  if (!f3) return null;
  let session;
  try { session = decodeMsg(f3.bytes); } catch { return null; }
  const f6 = session.find((s) => s.field === 6 && s.wire === 0);
  const f7 = session.find((s) => s.field === 7 && s.wire === 0);
  if (f7) return { mode: 'custom', count: Number(f7.varint) };
  if (f6) return { mode: 'automatic', count: Number(f6.varint) };
  return { mode: null, count: null };
}

/**
 * Imposta la MODALITA' GRIGLIA del menu Race Weekend scrivendo la FORMA
 * CANONICA del 26/10 (dietro la mappa del reader):
 *   'custom'    → il 6 = 1 è TENUTO (o riscritto: forma strana) e il 7 = N
 *                 aggiunto/modificato SUBITO DOPO il 6 — esattamente la
 *                 serializzazione del toggle vivo del menu, quella che a
 *                 riavvio il gioco ADOPTA (verificato: reopen su CUSTOM).
 *   'automatic' → 6 = 1 in piedi e 7 RIMOSSO (la forma scritta dal gioco
 *                 stesso a ogni toggle su AUTOMATIC).
 * Con 'custom' serve ANCHE per lo sblocco del PC vergine (menu di fabbrica
 * nasce AUTOMATIC): il Prepara lo scrive da solo per le serie MULTICLASSE —
 * così le zavorre/penalità di classe arrivano al round senza gesti manuali
 * (lezione del 25/10, Berline Moderne uscita monoclasse). Le MONOMARCA
 * invece restano AUTOMATIC (Mauro 26/10 sera: "tutti alla pari, zavorre
 * e penalità non servono"): EVO in AUTOMATIC porta già il suo conteggio
 * fisso di carriera per la ronda, e il conteggio contabile lo allinea
 * weekendCarCount in grid-apply (rebuildGridApply).
 * Cosa scritta da fuori COME la pista (changeWeekendTrack): vale alla
 * prossima apertura del menu/weekend. Idempotente: già nel modo richiesto
 * (custom con quel N / automatic senza 7) → nessuna scrittura.
 * opts: { file, dry } — dry: solo report, niente scrittura.
 */
export function setWeekendGridMode(mode, count, { file = WEEKEND_FILE, dry = false } = {}) {
  const custom = mode === 'custom';
  const n = Math.max(1, Math.min(127, Math.round(Number(count))));
  // TENTATIVI (26/10 notte, Mauro «il log dice di spostare il selettore, perché?»):
  // a EVO aperto ciò che si legge può essere occupato o scritto a metà, e anche
  // la scrittura (backup + tmp + rename) può cadere su file tenuto dal gioco.
  // Si riprova finché il transiente non passa; il gesto a mano resta per il
  // fallimento VERO (file assente o forma irreparabile), non per il transiente.
  let ultimo;
  const tentativi = dry ? 1 : GM_TENTATIVI;
  for (let tent = 0; tent < tentativi; tent++) {
    if (tent > 0) pausaMs(GM_PAUSA_MS);
    try {
      const buf = readFileSync(file);
      const fields = decodeMsg(buf);
      const f3 = fields.find((f) => f.field === 3 && f.wire === 2);
      if (!f3) throw Object.assign(new Error('blocco sessione (campo 3) non trovato nel gamemodesave'), { code: 'NO_SESSION' });
      const session = decodeMsg(f3.bytes);
      let i6 = session.findIndex((s) => s.field === 6 && s.wire === 0);
      const i7 = session.findIndex((s) => s.field === 7 && s.wire === 0);
      let touched = false;
      // il 6 = 1 è presente in ENTRAMBE le forme canoniche: se manca (save
      // strano), lo scrivo in prima posizione tra i campi alti, dopo il 5.
      if (i6 < 0) {
        let i = session.findIndex((s) => s.field > 6);
        session.splice(i >= 0 ? i : session.length, 0, { field: 6, wire: 0, varint: BigInt(1) });
        i6 = i >= 0 ? i : session.length - 1;
        touched = true;
      }
      const out = { mode: custom ? 'custom' : 'automatic', count: custom ? n : null };
      if (custom) {
        if (i7 >= 0) {
          if (Number(session[i7].varint) !== n) { session[i7].varint = BigInt(n); touched = true; }
        } else {
          // la forma canonica porta il 7 SUBITO DOPO il 6 (ordine del file
          // scritto dal menu 19:39: 6 poi 7).
          session.splice(i6 + 1, 0, { field: 7, wire: 0, varint: BigInt(n) });
          touched = true;
        }
      } else if (i7 >= 0) {
        session.splice(i7, 1);   // torna la forma automatic: 6 solo, 7 via
        touched = true;
      }
      f3.bytes = encodeMsg(session);
      if (dry || !touched) return { ...out, changed: touched, written: false };
      const backup = `${file}.bak-gridmode-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
      copyFileSync(file, backup);
      writeFileSync(`${file}.tmp`, encodeMsg(fields));
      renameSync(`${file}.tmp`, file);
      return { ...out, changed: true, written: true, backup };
    } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

/**
 * Sblocca la modalità GRIGLIA CUSTOM (forma canonica 6=1 + 7=N, sopra). Wrapper
 * pensato per il Prepara delle serie MULTICLASSE: lo stesso gesto che il
 * 25/10 Mauro faceva A MANO nel menu («Grid Type da AUTOMATIC a CUSTOM»). */
export function setWeekendGridCustom(count, opts = {}) {
  return setWeekendGridMode('custom', count, opts);
}

/**
 * RIPOSA la modalità AUTOMATIC (forma canonica: 6 = 1, 7 via). Per le
 * MONOMARCA nel Prepara: se una gara multiclasse prima ha lasciato il
 * custom in piedi, il modo del menu torna quello di fabbrica, dove EVO
 * porta già da sé il conteggio fisso di carriera (e zavorre non le
 * servono: auto tutta alla pari, richiesta Mauro 26/10 sera). */
export function setWeekendGridAuto(opts = {}) {
  return setWeekendGridMode('automatic', null, opts);
}

/* ---------- CLI (solo quando eseguito direttamente) ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const has = (k) => args.includes(k);
  const FILE = getArg('--file') ?? WEEKEND_FILE;
  const trackName = getArg('--track');
  if (!trackName) { console.error('serve --track "<nome pista>"'); process.exit(1); }

  try {
    const r = changeWeekendTrack(trackName, { file: FILE, dry: has('--dry') });
    console.log(`blocchi sessione con pista: ${r.blocchi} · da riscrivere: ${r.changed}`);
    console.log(`spec: nazione=${r.spec.nation} nome=${r.spec.name} lunghezza=${r.spec.lengthM}`);
    if (!r.written) console.log(has('--dry') ? 'DRY: niente scritta.' : 'già in piedi: niente da scrivere.');
    else {
      console.log(`scritto ${FILE} · backup ${r.backup}`);
      const check = setTrack(readFileSync(FILE), r.spec);
      console.log(`rilettura: ${check.changed} campi ancora da cambiare (0 = in piedi)`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
