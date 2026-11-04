// ronda-ladder.mjs — DALLA LADDER ALLA RONDA NATIVA (2/11, richiesta Mauro).
// IL CERCHIO CHIUSO (2/11): la ronda da preparare NON è più soltanto quella
// della ladder — quando la serie del pd-calendar dell'app Paddock combacia col
// nodo attivo, la ronda è QUELLA CHE IL GIOCO HA SEMINATO: pista, layout, giri,
// ora e meteo letti dal journal pd-*.json (le ronde scritte dal gioco quando
// si accetta la serie), e tag/layout/pitSlots/lunghezza derivati per-layout
// dal catalogo del server dedicato. La ladder resta il fallback.
// Un punto solo che porta la RONDA ATTIVA dentro il weekend del gioco col STESSO sistema che ha sempre funzionato in
// Paddock: pista, griglia (monomarca → AUTOMATIC, multiclassi → CUSTOM N),
// auto+livrea nel garage, meteo, orari/durata, giri gara, banda AI. Ogni passo
// gira le PRIMITIVE CANONICHE già blindate dai tool:
//   set-track.mjs      → pista (changeWeekendTrack), AI (setWeekendAi),
//                        griglia (setWeekendGridMode/Auto/Custom)
//   set-weekend.mjs    → orari/durata (setWeekend, round-trip dentro)
//   weekend-laps.mjs   → giri gara (setWeekendLaps: round-trip + backup)
//   set-driver-car.mjs → auto+livrea nel garage (setDriverCar)
//   weather.mjs        → meteo (setWeatherPreset) — come sempre a gioco APERTO
// e ognuno verifica da sé rileggendo il file: qui si coordina e si pubblica il
// report passo passi. SEMPLICE e AFFIDABILE: nessuna scrittura nuova a mano.
//
// uso:
//   node tools/ronda-ladder.mjs                  → prepara la ronda attiva
//       (pd-calendar quando la serie combacia; altrimenti ladder)
//   node tools/ronda-ladder.mjs --dry            → solo il piano, niente scritta
//   node tools/ronda-ladder.mjs --node <id> --round N
//       --track <pista> --car "<auto o livrea>" --laps N --hour H
//       (pista/round a mano: si lascia il pd-calendar e con esso il layout)
//       --weather <indice meteo nella scala LADDER 0..5>
//       (l'indice di round.weather/weatherNames — il meteo del pd-calendar
//       arriva già tradotto a quell'indice) --singlemake on|off
//       --skip pista,griglia,auto,meteo,orari,giri,ai
//   node tools/ronda-ladder.mjs --show           → com'è messo il weekend ora
//
// Nota sui file: garage (auto/livrea) e meteo si scrivono A GIOCO APERTO (come
// in Paddock, e il meteo resta protetto amikor il gioco tiene aperto il file);
// i gamemodesave (pista, griglia, orari, giri, ai) sono tenuti dal menu: a
// gioco APERTO quei passi saltano salvo --force.
import { readFileSync, copyFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gameRunning, pruneBackups, encodeMsg } from './evo-grid.mjs';
import {
  WEEKEND_FILE, changeWeekendTrack, setWeekendAi, setWeekendGridAuto, setWeekendGridCustom,
  currentWeekendTrack, weekendAi, celleGrigliaCampionato,
} from './set-track.mjs';
// IL RONDA UNICO (2/11): la parte del cerchio (il pd-calendar che decide la
// ronda, i suoi match di serie/pista e il meteo a PAROLE del gioco) vive in
// src/app-carriera.mjs e QUI si riusa — niente copieSecond: una sorgente, i
// test del CLI e quelli del webui la verificano la stessa.
import {
  rondaDelCalendario, stessaSerie, meteoPdIndex, trackIdDaNome,
} from '../src/app-carriera.mjs';
import {
  setWeekend,
} from './set-weekend.mjs';
import { setWeekendLaps, sessionsOf } from './weekend-laps.mjs';
import { setDriverCar, GARAGE_FILE } from './set-driver-car.mjs';
import { setWeatherPreset, PRESETS } from '../src/weather.mjs';
import { SAVE_FILE } from '../src/webui-env.mjs';
import { loadState } from '../src/state.mjs';

const LADDER_FILE = fileURLToPath(new URL('../config/career.evo.ladder.json', import.meta.url));

/* ---------- IL PD-CALENDAR COME FONTE DELLA RONDA ---------- */

/* Il meteo e i match (serie, pista) del pd-calendar NON si copiano: vive in
 * src/app-carriera.mjs (meteoPdIndex a DUE scale: id LADDER per round.weather,
 * idPreset per setWeatherPreset; stessaSerie col match per AUTO; trackIdDaNome
 * su TRACK_INFO). Qui li RI-ESPORTO: il CLI di questo file e i suoi test
 * continuano a importarli dallo stesso nome senza(file separato). */
export {
  stessaSerie,
  meteoPdIndex,
  trackIdDaNome,
};

/**
 * Il catalogo del SERVER DEDICATO distillato per-layout (events_race_weekend.json
 * dell'install Steam «Assetto Corsa EVO Dedicated Server», App ID 4564210,
 * 31/10 e confermato oggi): la regola alla LETTERA è event_name = layout +
 * " Race", e pit slot e lunghezza cambiano PER LAYOUT (Donington National 3149 m
 * slot 19; Oulton Fosters 2662 m — il grado del libro TRACK_INFO è un altro).
 * Valori assoluti incorporati, come la tavola PIT_SLOTS: chi non ha il server
 * dedicato installato prepara ugualmente la ronda. Chiave = id libro | layout
 * minuscolo; «GP» e «GP Short» restano se stessi. */
export const LAYOUT_SPEC = {
  'donington_park|national': { tag: 'National', lengthM: 3149, pitSlots: 19 },
  'brands_hatch|indy': { tag: 'Indy', lengthM: 1944, pitSlots: 32 },
  'laguna_seca|gp': { tag: 'GP', lengthM: 3602, pitSlots: 24 },
  'oulton_park|fosters': { tag: 'Fosters', lengthM: 2662, pitSlots: 16 },
  'oulton_park|international': { tag: 'International', lengthM: 4333, pitSlots: 16 },
  'circuit_of_the_americas|national': { tag: 'National', lengthM: 3702, pitSlots: 34 },
  'fuji_speedway|gp': { tag: 'GP', lengthM: 4549, pitSlots: 34 },
  'fuji_speedway|gp short': { tag: 'GP Short', lengthM: 4526, pitSlots: 34 },
};

/** L'override specFor della ronda: il layout del pd-calendar → tag + layout
 *  («National» → tag National, layout «National Race») e, quando il catalogo
 *  lo conosce, lunghezza e pit slot VERI del layout. Layout non catalogato o
 *  assente: {} — la pista resta ai default della specFor (GP / GP Race). */
export function specOverridePerRonda(entry) {
  if (!entry.layout) return {};
  const id = trackIdDaNome(entry.track) ?? entry.track;
  const riga = LAYOUT_SPEC[`${id}|${String(entry.layout).toLowerCase().trim()}`];
  return {
    tag: String(entry.layout),
    layout: `${entry.layout} Race`,
    ...(riga?.lengthM ? { lengthM: riga.lengthM } : {}),
    ...(riga?.pitSlots ? { pitSlots: riga.pitSlots } : {}),
  };
}

/* ---------- il piano, dalla ladder ---------- */

/** La ronda da preparare: { node, entry, ronda } dalla ladder + state.save.
 *  overrides: { nodeId, round, track, laps, hour, weather } — l'override
 *  corregge la voce del calendario al volo, il resto resta della ladder.
 *  opts: { nostro } (3/11, IL GENERATORE DEL «PADDOCK NOSTRO»): la ronda
 *  arriva SOLO dalla ladder — il cerchio del pd-calendar dell'app si salta
 *  ANCHE se la serie combacerebbe: chi genera il round nativo non LEGGE i
 *  journal dell'exe, neanche per prenderne la pista portata a parole. */
export function trovaRonda(overrides = {}, { nostro = false } = {}) {
  const ladder = JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
  const st = loadState(SAVE_FILE);
  const nodeId = overrides.nodeId ?? st.node;
  const ronda = overrides.round ?? st.round ?? 0;
  const node = ladder.nodes.find((n) => n.nodeId === nodeId);
  if (!node) throw Object.assign(new Error(`nodo ladder "${nodeId}" non trovato in config/career.evo.ladder.json`), { code: 'NO_NODE' });
  // la chain pd-calendar può RISCRIVERE l'entry: qui serve let (lezione del
  // test del 2/11: l'assegnazione al const è uscita al primo giro)
  let entry = { ...((node.calendar ?? [])[ronda] ?? {}) };
  if (!entry.track) throw Object.assign(new Error(`ronda ${ronda} fuori calendario del nodo "${nodeId}" (${(node.calendar ?? []).length} ronde)`), { code: 'NO_ROUND' });
  // IL CERCHIO (2/11, proposta Mauro chiusa oggi): il preparatutto porta in
  // gara LA RONDA CHE IL GIOCO HA SEMINATO, non quella della ladder: se la
  // serie del pd-calendar dell'app Paddock è quella attiva del nodo E
  // l'operatore non ha già riorientato pista/round a mano, la ronda attiva è
  // quella che il GIOCO segna «next» — con layout, giri, ora e meteo scritti
  // dal gioco (il pd-calendar li porta a PAROLE: «Pioggerella», «Coperto»...).
  // La ladder resta il fallback: gioco chiuso, app non installata, serie
  // diversa. Gli override CLI vincono SEMPRE su entrambe.
  let rondaVera = ronda;
  const manuali = overrides.track != null || overrides.round != null;
  if (!manuali && !nostro) {
    const pd = rondaDelCalendario(node);
    if (pd) {
      entry = {
        track: pd.trackId,
        layout: pd.layout,
        laps: pd.laps ?? entry.laps,
        hour: pd.hour,
        minute: pd.minute,
        weather: pd.weather,
        name: `${pd.pistaParola}${pd.layout ? ' ' + pd.layout : ''} · ronda ${pd.n}`,
        pd: {
          n: pd.n, state: pd.statoRonda, weather: pd.meteoParola,
          time: `${String(pd.hour).padStart(2, '0')}:${String(pd.minute).padStart(2, '0')}`,
          spia_meteo: pd.spia ? pd.meteoParola : null,
          serie: pd.serie, stagione: pd.stagione,
        },
      };
      rondaVera = pd.n > 0 ? pd.n - 1 : 0;
    }
  }
  if (overrides.track != null) { entry.track = overrides.track; entry.layout = null; delete entry.pd; }   // pista a mano: il layout non è più quello della ronda letta
  if (overrides.laps != null) entry.laps = Number(overrides.laps);
  if (overrides.hour != null) entry.hour = Number(overrides.hour);
  if (overrides.weather != null) entry.weather = Number(overrides.weather);
  return { node, entry, ronda: rondaVera, nodeId, ronda_nome: entry.name ?? `${entry.track} - ronda ${rondaVera + 1}` };
}

/** Modalità griglia della ronda: le monomarca (una sola auto nel nodo, come la
 *  Coppa Abarth di Paddock) vanno in AUTOMATIC — il modo di fabbrica della
 *  carriera; le multiclassi in CUSTOM con gridSize − 1 avversari (lezione
 *  26/10: «tutti alla pari, zavorre e penalità non servono»). */
export function pianoGriglia(node, overrideSingleMake = null) {
  const mono = (node.cars ?? []).length === 1;
  // REGOLA CAMPIONATO (4/11/2026): ogni serie porta IL SUO numero di auto
  // (12, 14, 16, 18, 20… dal gridSize del nodo, tetto 22) → gli avversari
  // sono una in meno. Niente tetto unico: la griglia varia col campionato.
  const avversari = () => Math.max(1, celleGrigliaCampionato(node) - 1);
  if (overrideSingleMake === 'on') return { mode: 'automatic', count: null, mono: true };
  if (overrideSingleMake === 'off') return { mode: 'custom', count: avversari(), mono };
  return mono
    ? { mode: 'automatic', count: null, mono: true }
    : { mode: 'custom', count: avversari(), mono: false };
}

/** L'auto della ronda: la prima del nodo (il Paddock punta l'auto intera della
 *  serie); l'operatore corregge con --car (nome dizionario del garage ad es.
 *  livrea, che sarà l'auto+livery dentro la coppia). L'engine-id ladder
 *  (ks_alfa_romeo_75_turbo_evo) si spoglia delle underscore per cercare nel
 *  dizionario a parole: il token-matching di set-driver-car chiude il resto. */
export function autoRonda(node, { car = null } = {}) {
  const cars = node.cars ?? [];
  if (!cars.length) return null;
  const id = String(car ?? cars[0]);
  return id.replace(/^ks_/, '').replace(/_/g, ' ').trim();
}

/** Il meteo della ronda: l'indice dell'entry è nella scala LADDER
 *  (weatherNames 0 Clear…5 Heavy rain) e qui lo riporta alla scala PRESETS di
 *  weather.mjs. LE DUE SCALE NON COINCIDONO da 3 in su (lezione weather.mjs,
 *  audit del 1/11): ladder 3 = "Light rain", ma Light rain è il preset 4;
 *  ladder 5 = "Heavy rain", ma heavy è il preset 6. Prima si credeva
 *  «l'indice ladder È l'id dei PRESETS»: una ronda bagnata leggera della
 *  ladder il meteo l'impostava «Coperto» (preset 3) — bug reale del CLI.
 *  fuori scala → Sereno + spia: niente numeri silenziosamente sbagliati. */
const LADDER_2_PRESET = [0, 1, 2, 4, 5, 6];
export function meteoRonda(entry) {
  const idx = Number(entry.weather);
  if (!Number.isInteger(idx) || idx < 0 || idx >= LADDER_2_PRESET.length) return { label: PRESETS[0].label, id: 0, spia: true };
  const id = LADDER_2_PRESET[idx];
  return { label: PRESETS[id].label, id, spia: false };
}

/** Orari delle sessioni (default di Paddock): la GARA all'ora del calendario
 *  (H:00), Warmup 5 min a H−5, Qualifying 10 min a H−50, Practice 15 min
 *  a H−1. Le durate si smervano con { practiceMin, qualifyMin, warmupMin }. */
export function pianoOrari(entry, { practiceMin = 15, qualifyMin = 10, warmupMin = 5 } = {}) {
  // Le sessioni PRECEDENTI stanno a MINUTI FISSI nell'ora della partenza
  // (Practice all'ora pià bella H−1, Qualifying al :50, Warmup al :55 —
  // così li tieni Paddock); solo la GARA prende i MINUTI VERI del calendario
  // (il pd-calendar porta «13:30»): con H:00 il piano resta com'era prima.
  const H = Number.isFinite(Number(entry.hour)) ? Number(entry.hour) : 14;
  const M = Number.isFinite(Number(entry.minute)) ? Number(entry.minute) : 0;
  const ifSec = (min) => Math.round(min * 60);
  return {
    sessions: {
      Practice:   { durationSec: ifSec(practiceMin), hour: Math.max(0, H - 1), minute: 0 },
      Qualifying: { durationSec: ifSec(qualifyMin), hour: Math.max(0, Math.floor(H - 50 / 60)), minute: 50 },
      Warmup:     { durationSec: ifSec(warmupMin), hour: Math.max(0, Math.floor(H - 5 / 60)), minute: 55 },
      Race:       { hour: H, minute: M },
    },
    date: null,   // la data la lasciamo al gioco (già oggi); non la cambiamo senza chiedere
  };
}

/* ---------- i passi, in ordine, ognuno verifica da sé ---------- */

/** Scrittura del blocco orari/durata: stessa rete di prepareWeekend in
 *  set-weekend.mjs (backup + rotazione + atomica). Idempotente: se il buffer
 *  combacia col file, niente backup nuovo. dry: calcola ma non tocca il file. */
function scriviWeekendOps(ops, { file = WEEKEND_FILE, dry = false } = {}) {
  const buf = readFileSync(file);
  const res = setWeekend(buf, ops);
  const out = encodeMsg(res.fields);
  // out è Uint8Array (encodeMsg): NON ha .equals (metodo di Buffer) — il
  // confronto è per byte (lezione del dry-run 2/11: il passo orari moriva qui)
  const giaUguale = out.length === buf.length && out.every((b, i) => b === buf[i]);
  if (dry || giaUguale || res.changed === 0) return { changed: res.changed, giaUguale, written: false };
  const backup = `${file}.bak-weekend-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  pruneBackups(file);
  writeFileSync(`${file}.tmp`, out);
  renameSync(`${file}.tmp`, file);
  return { changed: res.changed, written: true, backup };
}

/** La preparazione della ronda, un passo alla volta, con report. opts:
 *  { dry, force, skip: [..], singleMake, car, nostro, trovaRonda: { overrides } }
 *  — nostro passa a trovaRonda: la ronda solo ladder (ronda-nostro.mjs). */
export async function rondaPaddock(opts = {}) {
  const { dry = false, force = false } = opts;
  const skip = new Set((opts.skip ?? []).map((s) => String(s).toLowerCase()));
  const passi = [];
  const gira = (nome, fn) => {
    if (skip.has(nome)) { passi.push({ nome, skip: true }); return; }
    try {
      const r = fn();
      passi.push({ nome, skip: false, ok: r.ok ?? true, note: r.note ?? null, dati: r.dati ?? null });
    } catch (e) {
      passi.push({ nome, skip: false, ok: false, error: e.code ? `${e.code}: ${e.message}` : e.message });
    }
  };

  const { node, entry, ronda, nodeId, ronda_nome } = trovaRonda(opts.trovaRonda ?? {}, { nostro: opts.nostro === true });
  const evoAperto = gameRunning();
  const salva = (nome) => !force && evoAperto && ['pista', 'orari', 'giri', 'ai', 'griglia'].includes(nome);
  if (evoAperto && !force) passi.push({ nome: 'avviso', skip: false, ok: true, note: `EVO APERTO: i passi su gamemodesave (pista/griglia/orari/giri/ai) saltano (solo garage e meteo procedono). --force per forzarli.` });

  // 1) PISTA
  gira('pista', () => {
    if (salva('pista')) return { ok: true, note: 'salto: EVO aperto e non --force' };
    const over = specOverridePerRonda(entry);
    const r = changeWeekendTrack(entry.track, { file: WEEKEND_FILE, dry, over });
    return { dati: r, note: `${r.spec ? (r.spec.name ?? entry.track) : entry.track}${entry.layout ? ' · layout ' + entry.layout : ''}`, ok: true };
  });

  // 2) METEO (a gioco aperto va bene, come Paddock)
  gira('meteo', () => {
    const wx = meteoRonda(entry);
    const r = setWeatherPreset(wx.label, { dry, previsto: true });
    return { dati: r, note: `${wx.label}${wx.spia ? ' (indice fuori scala: Sereno di ripiego)' : ''}`, ok: true };
  });

  // 3) ORARI/DURATA
  gira('orari', () => {
    if (salva('orari')) return { ok: true, note: 'salto: EVO aperto e non --force' };
    const ops = pianoOrari(entry, opts.orari ?? {});
    const r = scriviWeekendOps(ops, { file: WEEKEND_FILE, dry });
    const go = ops.sessions.Race;
    return { dati: { ...r, ops }, ok: true, note: `gara alle ${go.hour}:${String(go.minute ?? 0).padStart(2, '0')}` };
  });

  // 4) GIRI GARA — setWeekendLaps NON ha dry: a dry si salta la scrittura e si
  //    dice solo cosa si farebbe (round-trip e backup li fa il passo vero).
  gira('giri', () => {
    const laps = Number(entry.laps);
    if (!Number.isInteger(laps) || laps <= 0) throw Object.assign(new Error(`giri richiesti dal calendario: "${entry.laps}"`), { code: 'BAD_LAPS' });
    if (dry) return { dati: { dry: true, laps }, note: `${laps} giri (dry: niente scrittura)`, ok: true };
    if (salva('giri')) return { ok: true, note: 'salto: EVO aperto e non --force' };
    const r = setWeekendLaps(laps, { file: WEEKEND_FILE, previsto: true });
    return { dati: r, note: `${laps} giri`, ok: true };
  });

  // 5) BANDA AI
  gira('ai', () => {
    if (salva('ai')) return { ok: true, note: 'salto: EVO aperto e non --force' };
    const [min, max] = node.ai ?? [80, 90];
    const r = setWeekendAi(min, max, { file: WEEKEND_FILE, dry });
    return { dati: r, note: `AI ${min}–${max}`, ok: true };
  });

  // 6) GRIGLIA (il single-make di Paddock)
  gira('griglia', () => {
    if (salva('griglia')) return { ok: true, note: 'salto: EVO aperto e non --force' };
    const piano = pianoGriglia(node, opts.singleMake);
    const r = piano.mode === 'automatic'
      ? setWeekendGridAuto({ file: WEEKEND_FILE, dry })
      : setWeekendGridCustom(piano.count, { file: WEEKEND_FILE, dry });
    return { dati: r, note: `${piano.mode}${piano.count ? ' · avversari ' + piano.count : ''}${piano.mono ? ' · monomarca' : ''}`, ok: true };
  });

  // 7) AUTO + LIVREA (a gioco aperto va bene, come Paddock)
  gira('auto', () => {
    const nome = autoRonda(node, { car: opts.car });
    if (!nome) return { ok: false, note: 'il nodo ladder non elenca auto' };
    const r = setDriverCar(nome, { file: GARAGE_FILE, dry });
    return { dati: r, note: r.name ?? nome, ok: true };
  });

  const stat = (() => { try { return statSync(WEEKEND_FILE); } catch { return null; } })();
  return { node: nodeId, ronda, ronda_nome, entry, passi, evoAperto, mtimeFile: stat ? new Date(stat.mtimeMs).toISOString() : null };
}

/* ---------- CLI (solo quando eseguito direttamente) ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;

if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
  const has = (k) => args.includes('--' + k);

  if (has('--show')) {
    for (const s of sessionsOf(readFileSync(WEEKEND_FILE))) console.log(JSON.stringify(s));
    process.exit(0);
  }

  const dry = has('--dry');
  const singleMake = (getArg('singlemake') ?? '').toLowerCase() || null;
  const res = await rondaPaddock({
    trovaRonda: {
      nodeId: getArg('node'),
      round: getArg('round') != null ? Number(getArg('round')) : null,
      track: getArg('track'),
      laps: getArg('laps'),
      hour: getArg('hour'),
      weather: getArg('weather'),
    },
    car: getArg('car'),        // --car: nome (o livrea) nel dizionario del garage
    dry,
    force: has('--force'),
    singleMake: singleMake && ['on', 'off'].includes(singleMake) ? singleMake : null,
    skip: (getArg('skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  });

  console.log(`— ronda ${res.ronda + 1} del nodo ${res.node} (${res.ronda_nome}) —`);
  const pdMeta = res.entry.pd;
  console.log(`  calendario: ${res.entry.track}${res.entry.layout ? ` · layout ${res.entry.layout}` : ''} · giri ${res.entry.laps} · ore ${res.entry.hour}:${String(res.entry.minute ?? 0).padStart(2, '0')} · meteo idx ${res.entry.weather}${pdMeta ? ` · pd-calendar ronda ${pdMeta.n}${pdMeta.serie ? ` (${pdMeta.serie})` : ''}` : ''}`);
  for (const p of res.passi) {
    const segno = p.skip ? '↷' : p.ok ? '✔' : '×';
    const testo = p.skip ? 'salto (skip)' : p.note || p.error || '';
    console.log(`  ${segno} ${p.nome}${p.skip ? '' : p.ok ? '' : ' (ERRORE)'}: ${testo}`);
  }
  if (!dry && res.passi.some((p) => p.ok && p.dati)) {
    try {
      const traccia = currentWeekendTrack();
      const aiLinea = weekendAi();
      console.log(`\nverifica: ${traccia ? 'pista=' + (traccia.name ?? traccia) : 'pista ?'}${aiLinea ? ' · ai=' + aiLinea.min + '-' + aiLinea.max : ''}`);
      for (const s of sessionsOf(readFileSync(WEEKEND_FILE))) console.log(`  ${s.nome}: ${s.aTempo ? s.durataSec + 's a tempo' : s.giri + ' giri'} · griglia=${s.singleMake === null ? '?' : s.singleMake ? 'mono' : 'custom'}`);
    } catch { /* file letto da un altro lato: la verifica rapida salta */ }
  } else if (dry) {
    console.log('\nDRY: niente scritta, solo il piano.');
  }
  const morti = res.passi.filter((p) => !p.ok && !p.skip).length;
  process.exit(morti ? 1 : 0);
}
