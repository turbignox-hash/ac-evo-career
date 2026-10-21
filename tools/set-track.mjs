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
import { decodeMsg, encodeMsg, gameRunning } from './evo-grid.mjs';
import { TRACK_INFO } from '../src/tracks.mjs';
import { sameTrack } from '../src/tracknames.mjs';

export const WEEKEND_FILE = 'C:/Users/Mauro/Saved Games/ACE/GameModes/GameModeType_RACE_WEEKEND.gamemodesave';

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
