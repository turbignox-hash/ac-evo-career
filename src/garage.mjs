// garage.mjs — il garage personale: le auto che hai comprato o vinto.
//
//  - le auto VINTE arrivano da sole: la vetrina degli eventi speciali
//    (state.events.showCase, scritta da finishEvent in events.mjs) viene
//    importata qui una volta sola, senza duplicati;
//  - le auto COMPRATE le aggiungi tu dalla scheda, scegliendo dal catalogo
//    ufficiale del server dedicato (quello con l'indice di prestazione);
//  - per ogni auto il garage accumula le statistiche delle gare registrate in
//    carriera (risultati, podi, vittorie, miglior giro) leggendo state.results.
//
// Tutto vive in state.garage = { cars: [{ carId, carName, how, since, note }],
// importedFromShowcase: [carId...] } e viene salvato col save normale.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataDirCandidates } from './paths.mjs';
import { loadCatalog } from './catalog.mjs';
import { carImageOf, carPriceOf } from './cars.mjs';
import { pushMessage } from './state.mjs';
import { tr } from './lang.mjs';
import { recordFlows } from './flows.mjs';
import { TRACK_INFO } from './tracks.mjs';
import { normTrack } from './tracknames.mjs';

/**
 * VALUTAZIONE per chilometraggio: il prezzo di partenza è quello reale
 * (data/car-prices.json via carPriceOf), svalutato dai km percorsi con noi:
 *   - fino a 500 km:      85% del prezzo (usata ma tenuta bene)
 *   - 500–2.000 km:       70%
 *   - 2.000–5.000 km:     55%
 *   - oltre 5.000 km:     40%, minimo 4.000 € (un'auto resta comunque un'auto)
 * Con prezzo reale ignoto si parte da 30.000 € (valore medio di un'auto EVO).
 * La vendita porta il 70% della valutazione: rivendere non fa diventare ricchi.
 */
export function carValueKm(price, km) {
  const base = Number.isFinite(Number(price)) && Number(price) > 0 ? Number(price) : 30000;
  const k = Math.max(0, Number(km) || 0);
  let factor = 0.40;
  if (k < 500) factor = 0.85;
  else if (k < 2000) factor = 0.70;
  else if (k < 5000) factor = 0.55;
  const value = Math.round(base * factor);
  return { value: Math.max(value, 4000), factor };
}

/** Ricavo della vendita: 70% della valutazione. */
export function salePrice(value) {
  return Math.max(2000, Math.round(Number(value) * 0.70));
}

/* ------------------------------------------------------------------ */
/* stato                                                               */
/* ------------------------------------------------------------------ */

export function ensureGarage(state) {
  state.garage ??= { cars: [], importedFromShowcase: [] };
  state.garage.cars ??= [];
  state.garage.importedFromShowcase ??= [];
  return state.garage;
}

/* ------------------------------------------------------------------ */
/* garage REALE del gioco: le auto che EVO possiede davvero            */
/* ------------------------------------------------------------------ */

// richieste Mauro 26/10: la F40 vinta in gioco non è nota al garage del tool
// (che legge solo save.json) e il premio eventi poteva riproporla. Il gioco però
// lascia una traccia leggibile: per ogni auto "istituzionalizzata" (posseduta,
// con livery/preset salvati) una cartella OpenData/SavedCars contiene un file
// .carfinalstatewithconsumable col nome che inizia con l'ID DEL CONTENUTO:
//   ks_abarth_695_biposto_43502bc3-1ccd-ad8d-d2f7-33ca8d009983.carfinalstate...
// Quell'id è ESATTAMENTE una chiave di ladder.contentNames.cars → il tool può
// riconoscere il parco reale SOLO LEGGENDO (nessun file di gioco toccato).
// Limiti dichiarati: un'auto posseduta MAI aperta in garage del gioco può non
// avere ancora il file — è un segnale aggiuntivo, non un censimento garantito.

const CAR_FILE_RE = /^(.+)_?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.carfinalstatewithconsumable$/i;

/** Unifica gli id: il ladder (contenuto) usa i prefissi ks_*, i temi evento no. */
export const normOwnedId = (s) => String(s ?? '').toLowerCase().trim().replace(/^ks_/, '');

/**
 * Auto possedute nel GIOCO, lette da ProfileData/<guid>/OpenData/SavedCars.
 * Restituisce gli id del ladder (con prefisso ks_ anche se il nome file lo ha
 * già: nessuna trasformazione dolosa), filtrati sulle auto NOTE al ladder
 * (contentNames.cars) così spazzatura o mod locali sconosciute non entrano.
 * Mai lanciato: { } — profili assenti o non avviati → lista vuota.
 */
export function gameOwnedCarIds({ env = process.env, ladder = null } = {}) {
  const known = ladder?.contentNames?.cars
    ? new Set(Object.keys(ladder.contentNames.cars).map((k) => k.toLowerCase()))
    : null;
  const found = [];
  for (const ace of dataDirCandidates(env)) {
    let profiles;
    try { profiles = readdirSync(join(ace, 'ProfileData'), { withFileTypes: true }); } catch { continue; }
    for (const p of profiles) {
      if (!p.isDirectory()) continue;
      const dir = join(ace, 'ProfileData', p.name, 'OpenData', 'SavedCars');
      if (!existsSync(dir)) continue;
      let files;
      try { files = readdirSync(dir); } catch { continue; }
      for (const f of files) {
        const m = CAR_FILE_RE.exec(f);
        if (!m) continue;
        const id = m[1].replace(/_+$/, '');
        if (known && !known.has(id.toLowerCase())) continue;
        if (!found.includes(id)) found.push(id);
      }
    }
  }
  return found;
}

/** Porta in garage le auto vinte negli eventi speciali e non ancora importate. */
export function importShowcase(state) {
  const g = ensureGarage(state);
  const showcase = state.events?.showCase ?? [];
  const added = [];
  for (const s of showcase) {
    if (!s?.carId || g.importedFromShowcase.includes(s.carId)) continue;
    if (g.cars.some((c) => c.carId === s.carId)) {
      // già in garage per altra via: segna solo l'import come fatto
      g.importedFromShowcase.push(s.carId);
      continue;
    }
    g.cars.push({
      carId: s.carId,
      carName: s.carName ?? s.carId,
      how: 'won',
      since: s.at ?? new Date().toISOString(),
      note: s.theme ? tr({ it: `vinta in ${s.theme} (stagione ${s.season ?? '?'})`, en: `won in ${s.themeEn ?? s.theme} (season ${s.season ?? '?'})` }) : null,
    });
    g.importedFromShowcase.push(s.carId);
    added.push(s.carName ?? s.carId);
  }
  return added;
}

/** Aggiunge (o riusa) un'auto dal catalogo. how: 'bought' | 'won'.
 *  BUG 23/10: le COMPRATE prima non costavano nulla — si aggiungeva gratis e
 *  poi si rivendeva (70% della valutazione): soldi dal nulla. Ora l'acquisto
 *  porta il prezzo di listino (carPriceOf) e lo scrive nel registro flussi.
 *  Le auto VINTE restano gratis (arrivano dall'evento). */
export function addCar(state, { carId, carName, how = 'bought', note = null }) {
  const g = ensureGarage(state);
  const id = String(carId ?? '').trim();
  if (!id) throw new Error('Serve il codice auto (carId).');
  const nome = String(carName ?? id);
  const existing = g.cars.find((c) => c.carId === id);
  if (existing) return { car: existing, reused: true, price: null };
  let price = null;
  if (how !== 'won') {
    price = carPriceOf(nome) ?? carPriceOf(id);
    if (price == null) {
      throw new Error(tr({ it: `Prezzo non noto per ${nome}: non si può comprare a prezzo inventato. Aggiungila come «vinta».`, en: `No catalogue price for ${nome}: cannot buy it at a made-up price. Add it as "won" instead.` }));
    }
    if (state.money < price) {
      throw new Error(tr({ it: `Soldi insufficienti: ${nome} costa ${price.toLocaleString('it-IT')} € ma in banca restano ${Math.round(state.money).toLocaleString('it-IT')} €.`, en: `Not enough money: ${nome} costs ${price.toLocaleString('it-IT')} € but the bank holds ${Math.round(state.money).toLocaleString('it-IT')} €.` }));
    }
    state.money -= price;
    recordFlows(state, [{ kind: 'buy', money: -price, reason: tr({ it: `acquisto ${nome} (prezzo di listino)`, en: `bought ${nome} (list price)` }) }]);
  }
  const car = {
    carId: id,
    carName: nome,
    how: how === 'won' ? 'won' : 'bought',
    since: new Date().toISOString(),
    note: note ?? null,
  };
  g.cars.push(car);
  return { car, reused: false, price };
}

export function removeCar(state, carId) {
  const g = ensureGarage(state);
  const before = g.cars.length;
  g.cars = g.cars.filter((c) => c.carId !== String(carId ?? ''));
  return before - g.cars.length;
}

export function setNote(state, carId, note) {
  const g = ensureGarage(state);
  const car = g.cars.find((c) => c.carId === String(carId ?? ''));
  if (!car) throw new Error('Auto non in garage: ' + carId);
  car.note = note ? String(note) : null;
  return car;
}

/* ------------------------------------------------------------------ */
/* statistiche per auto (dai risultati di carriera)                    */
/* ------------------------------------------------------------------ */

function statsFor(state, carName, { ownedSince = null } = {}) {
  const want = String(carName ?? '').toLowerCase().trim();
  let races = 0, wins = 0, podiums = 0, bestLap = null, km = 0;
  const since = ownedSince ? Date.parse(ownedSince) : null;
  for (const rows of Object.values(state.results ?? {})) {
    for (const r of rows ?? []) {
      const car = String(r.car ?? '').toLowerCase().trim();
      // il risultato cita marca+modello ("Mazda MX-5 ND Cup"): match per inclusione,
      // perché il garage può avere il nome corto o variante diversa
      if (!want || !(car === want || car.includes(want) || want.includes(car))) continue;
      races += 1;
      if (r.position === 1) wins += 1;
      if (r.position != null && r.position <= 3) podiums += 1;
      if (r.bestLap && (!bestLap || lapMs(r.bestLap) < lapMs(bestLap))) bestLap = r.bestLap;
      // odometro del tool: SOLO le gare fatte MENTRE l'auto era nel garage (dal campo
      // `since` del possesso): le gare precedenti contano per statistiche e record,
      // ma non per l'usura della tua auto. Giri completi × lunghezza pista.
      // BUG 21/10: r.track porta il DISPLAY name ("Suzuka", "Circuit Of The Americas")
      // mentre le chiavi di TRACK_INFO sono gli id snake ("suzuka",
      // "circuit_of_the_americas") — il lookup per帕 nome esatto falliva e i km
      // restavano 0 anche con gare e giri in registro. Match col normalizzatore
      // standard di tracknames (come fa il resto dell'app).
      let len = TRACK_INFO[r.track]?.lengthKm ?? null;
      if (len == null) {
        const nt = normTrack(r.track);
        const hit = Object.entries(TRACK_INFO).find(([k]) => normTrack(k) === nt || normTrack(TRACK_INFO[k].name ?? '') === nt);
        len = hit?.[1]?.lengthKm ?? null;
      }
      const lapsRun = Math.max(Number(r.winnerLaps ?? r.laps ?? 0), 0);
      const when = r.at ? Date.parse(r.at) : null;
      if (len && lapsRun && (since == null || (when != null && when >= since))) km += lapsRun * len;
    }
  }
  return { races, wins, podiums, bestLap, km: Math.round(km) };
}

function lapMs(t) {
  const m = String(t ?? '').match(/^(?:(\d+):)?(\d+):(\d+\.\d+)$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60000 + Math.round(Number(m[3]) * 1000);
}

/* ------------------------------------------------------------------ */
/* vista per la GUI                                                    */
/* ------------------------------------------------------------------ */

export function garageOverview(_ladder, state, { paths = null, env = process.env } = {}) {
  const g = ensureGarage(state);
  // ogni nuova vittoria in vetrina entra da sola
  const added = importShowcase(state);

  // catalogo server dedicato: PI e varianti (se il server è installato)
  let catalog = null;
  try { catalog = loadCatalog(paths, env); } catch { catalog = null; }
  const byNorm = new Map((catalog?.cars ?? []).map((c) => [String(c.name).toLowerCase().replace(/[^a-z0-9]/g, ''), c]));

  const cars = g.cars.map((c) => {
    const norm = String(c.carName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cat = byNorm.get(norm) ?? [...byNorm.entries()].find(([k]) => k.startsWith(norm.slice(0, 8)))?.[1] ?? null;
    const stats = statsFor(state, c.carName, { ownedSince: c.since });
    const realPrice = carPriceOf(c.carName) ?? carPriceOf(c.carId);
    const val = carValueKm(realPrice, stats.km);
    return {
      ...c,
      image: carImageOf(c.carName) ?? carImageOf(c.carId),
      pi: cat?.pi ?? null,
      variants: cat?.variants ?? null,
      realPrice,
      stats,
      value: val.value,
      valueFactor: val.factor,
      sale: salePrice(val.value),
    };
  }).sort((a, b) => (a.how === b.how ? a.carName.localeCompare(b.carName) : a.how === 'won' ? -1 : 1));

  return {
    cars,
    total: cars.length,
    won: cars.filter((c) => c.how === 'won').length,
    bought: cars.filter((c) => c.how === 'bought').length,
    totalWins: cars.reduce((a, c) => a + c.stats.wins, 0),
    totalKm: cars.reduce((a, c) => a + c.stats.km, 0),
    patrimony: cars.reduce((a, c) => a + c.value, 0),
    justImported: added,
  };
}

/** Vende un'auto del garage: ricava il 70% della valutazione chilometrica,
 *  accredita i soldi e scrive il flusso. Ritorna il dettaglio per la GUI. */
export function sellCar(_ladder, state, carId) {
  const g = ensureGarage(state);
  const car = g.cars.find((c) => c.carId === String(carId ?? ''));
  if (!car) throw new Error('Auto non in garage: ' + carId);
  const stats = statsFor(state, car.carName, { ownedSince: car.since });
  const realPrice = carPriceOf(car.carName) ?? carPriceOf(car.carId);
  const val = carValueKm(realPrice, stats.km);
  const gain = salePrice(val.value);
  // esce dal garage (e dalla vetrina eventi: l'auto venduta non è più in mostra)
  g.cars = g.cars.filter((c) => c.carId !== car.carId);
  if (state.events?.showCase) {
    state.events.showCase = state.events.showCase.filter((s) => s.carId !== car.carId);
  }
  state.money += gain;
  recordFlows(state, [{ kind: 'income', money: gain, reason: `vendita ${car.carName} (${stats.km} km, valutata ${val.value} €)` }]);
  pushMessage(state, `Venduta ${car.carName}: +${gain.toLocaleString('it-IT')} € (${stats.km} km, valutata ${val.value.toLocaleString('it-IT')} €).`, 'money');
  return { carId: car.carId, carName: car.carName, km: stats.km, value: val.value, gain };
}

/** Catalogo ridotto per il menu "aggiungi auto": nome, id e PI. */
export function catalogPicker(_ladder, { env = process.env, paths = null } = {}) {
  let catalog = null;
  try { catalog = loadCatalog(paths, env); } catch { catalog = null; }
  return (catalog?.cars ?? []).map((c) => ({ id: c.id, name: c.name, pi: c.pi, price: carPriceOf(c.name) ?? carPriceOf(c.id) })).sort((a, b) => a.name.localeCompare(b.name));
}

