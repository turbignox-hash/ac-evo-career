// gridbuilder.mjs — prepara la griglia della GARA DEL GIORNO da carriera.
//
// Scrive last_grid.customgrid con:
//   • le auto della serie del giorno (node del ladder), fotocopiando le CELLE
//     REALI di un template customgrid (generate dal GENERA del gioco: zero
//     cella inventata = zero rischio crash) — ripetute/troncate fino a gridSize;
//   • i piloti del template (stesso trattamento: taglia/ripeti);
//   • config campo 3: count, finestra PI del pool, abilità AI della serie,
//     meteo/ora DAL CALENDARIO del round (i byte f5 raw del template se il
//     round non specifica — conservano gomme/ora scelte da Mauro);
//   • il bilanciamento: la classe in grid-classes.json (regole per preset o per
//     nome auto) se esiste; SENZA classe nota la griglia esce a 0 — la vecchia
//     «proposta da PI» (ΔPI×25% «calibrata il 19/10») NON ESISTE PIÙ nel codice:
//     da 24/10 il bilancio vero lo costruisce griglia-calib dai risultati reali;
//   • monomarca forzata se la serie ha un'unica auto nel ladder.
//
// Flusso di gara serale: chiuso EVO → `node ac-evo-career.mjs griglia [--dry]`
// → aperto EVO → menu griglia (senza GENERA) → APPLICA → via.
//
import { readFileSync, existsSync, statSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';
import { sameTrack } from './tracknames.mjs';
import { tr } from './lang.mjs';
import { matchPool, logMatch } from './car-match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);
const CARS_JSON = 'E:/SteamLibrary/steamapps/common/Assetto Corsa EVO Dedicated Server/cars.json';

const f32 = (b) => (b && b.length >= 4) ? Buffer.from(b.slice?.() ?? b).readFloatLE(0) : null;
const setF32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; };
const utf8 = (b) => Buffer.from(b).toString('utf8');
/* LA TINTA di una cella: campo 11 (preset visuale), stessa estrazione di
   evo-grid.gridFileOf (il preset visuale sta nel primo segmento del campo:
   "F40 LM Visual 4" dopo \x18 non va letto). Smecherata dal builder al
   livello superiore (31/10): il PRESTARE di tinte la usa identica. Assente
   = il gioco usa il default: per il conteggio le misuro come UNA livrea
   propria ('default'). */
const tintaDi = (b) => {
  for (const g of decodeMsg(b)) {
    if (g.field !== 11) continue;
    const t = Buffer.from(g.bytes).toString('utf8');
    const k = t.indexOf('\x12');
    const v = k >= 0 ? t.slice(k + 1).split('\x18')[0] : (t || null);
    return v || '(default)';
  }
  return '(default)';
};

/* ---------- TINTE PRESTATE (DA-10, secondo passo 31/10 — default SPENTO) ---------- */
/** CELLE REALI (byte interi, scritte dal gioco) degli ALTRI template sulla STESSA
 *  cartella (addirittura il dirname del template corrente: data/grid-templates/)
 *  per UN dato modello (carId): sono le TINTE (campo 11) che il pool corrent
 *  può NON avere — è la risposta al report «MONOCOLORE»: prima del gesto
 *  manuale «più LIVERIES + APPLICA» in EVO si prova la leva del parco verò.
 *  Zero celle inventate: ogni cella si fotocopia INTERA da un file template
 *  sul disco, byte per byte. Ordinamento deterministico: file per NOME, cap
 *  a 20 file: i più tardi NON si esplorano. Scarto i file corrotti, senza
 *  ripeterli: le celle byte-identiche tra template diversi si filtrano con
 *  l'HEX. Una cella SENZA tinta (niente campo 11) non c'entra: non presta.
 */
function prestaTinte(fileCorrente, carId) {
  const dir = dirname(fileCorrente);
  const già = new Set();   // HEX delle celle già viste (dedup inter-file)
  const fuori = [];
  let voci = [];
  try { voci = readdirSync(dir).filter((f) => f.endsWith('.customgrid') && f !== basename(fileCorrente)).sort(); } catch { return []; }
  for (const nome of voci.slice(0, 20)) {
    const path = join(dir, nome);
    try {
      const tpl = splitTemplate(readFileSync(path));
      for (const b of tpl.cells) {
        const bytes = Buffer.from(b).toString('hex');
        const id = carIdDi(b);
        if (id !== carId || già.has(bytes)) continue;
        già.add(bytes); fuori.push(b);
      }
    } catch { }   // file illeggibile: salto, il parco continua
  }
  return fuori;
}
/* l'ID-MODELLO di una cella: campo 3 (carId), stessa estrazione del carIdOf
   interno del builder (31/10: hoistato per servire anche prestaTinte). */
const carIdDi = (b) => { for (const g of decodeMsg(b)) if (g.field === 3) return utf8(g.bytes); return null; };

/* FAMIGLIA di un preset: il confronto che ha già morduto le esclusioni
   27/10 vale per TUTTO il match del bilancio — i preset del template
   vengono RINUMERATI a ogni variante mecca (mech_2, mech_3...), il
   confronto esatto smetteva di mordere e una regola col preset "mech_1"
   lasciava a 0 kg tutte le varianti successive della STESSA auto.
   'preset_jcs_mech_3' → 'preset_jcs'. Preset/carName assenti: null → null. */
const withoutMech = (p) => (p == null ? null : String(p).toLowerCase().replace(/_mech_\d+/g, ''));

// grid-classes.json è richiesto più volte per ogni import/analisi (grid-calib
// lo legge in analyzeRace E in recordEvent): si ri-parsa solo se il mtime cambia.
// REGOLA: chi muta le classi deve SOTTO scrivere il file (come già fanno
// appuntaConvalida e grid-balance): la scrittura cambia mtime e invalida il memo.
// EVO_CLASSES_FILE: solo per i test — punto la fixture congelata in test/fixtures/
// (il 24/10 i test grid-calib dipendevano da data/grid-classes.json, che nella
// cartella estratta del pacchetto amico non c'è: i test cadevano 13/173).
export function classesFile() {
  return process.env.EVO_CLASSES_FILE ?? join(PROJECT, 'data', 'grid-classes.json');
}
const FIXTURE_CLASSI = join(PROJECT, 'test', 'fixtures', 'grid-classes-sample.json');
let _classesMemo = null; // { percorso, mtime, dati }
export function loadClasses() {
  const F = classesFile();
  // BOOTSTRAP AMICO (2/11): data/ è lo stato per PC, MA un'installazione
  // vergine (zip estratta, primo avvio) non ha NESSUNA classe — zero zavorre,
  // zero miscugli, campionati procedurali vuoti. Al primo accesso copio la
  // fixture congelata in data/: l'amico parte con lo stesso parco classi e da
  // lì la calibrazione del SUO PC scrive il SUO file. EVO_CLASSES_FILE non
  // partecipa: nei test il percorso punta già esplicitamente dove serve.
  if (!existsSync(F) && existsSync(FIXTURE_CLASSI)) {
    try { mkdirSync(dirname(F), { recursive: true }); copyFileSync(FIXTURE_CLASSI, F); } catch { /* senza bootstrap la lettura sotto parte vuota */ }
  }
  const mtime = existsSync(F) ? statSync(F).mtimeMs : 0;
  // il memo PARLA anche del PERCORSO (test con EVO_CLASSES_FILE a cambio file:
  // due fixture scritte nello stesso tick hanno la stessa mtime ma non i dati).
  if (!_classesMemo || _classesMemo.percorso !== F || _classesMemo.mtime !== mtime) {
    _classesMemo = { percorso: F, mtime, dati: existsSync(F) ? JSON.parse(readFileSync(F, 'utf8')) : { classi: {} } };
  }
  return _classesMemo.dati;
}

/** classe combaciante SOLO per preset (per chi lavora sul file customgrid:
 *  grid-apply/GUI). Ritorna { id, cls, hits } o null. */
export function pickClassInfo(classes, presets) {
  let best = null;
  for (const [id, cls] of Object.entries(classes.classi ?? {})) {
    const hits = (cls.regole ?? []).filter((r) => r.preset && presets.includes(r.preset)).length;
    if (hits >= 2 && (!best || hits > best.hits)) best = { id, cls, hits };
  }
  return best;
}

/* ---------- preset PI del catalogo ---------- */
let _carsCache = null;
function carPiByPreset() {
  if (!_carsCache) {
    _carsCache = {};
    try {
      const j = JSON.parse(readFileSync(CARS_JSON, 'utf8'));
      for (const c of j.cars) _carsCache[c.name] = c.performance_indicator;
    } catch { /* server dedicato non installato: PI del pool non disponibile (la finestra PI esce dai fallback del ladder) */ }
  }
  return _carsCache;
}

/* ---------- supplementi per-traccia ---------- */
/**
 * La stessa classe non è bilanciata su TUTTE le piste: una calibrazione che
 * regge a Brands Hatch si spalanca su un tracciato con rettilinei lunghi
 * (COTA 19/10: stessa classe, stesso campo AI, spread ~10s contro ~1s).
 * cls.perTraccia = { "Nome pista": { restrictorPct: { preset|auto: valore },
 *                        aiStandard: [min,max], escludiAuto: [preset,...] } }
 * — chiavi di pista matched con sameTrack (id ladder "circuit_of_the_americas"
 * combacia con "Circuit Of The Americas"). I restrictorPct sostituiscono il
 * restrictorPct di rules (NON si sommano); aiStandard/escludiAuto sono
 * AGGIORNATI solo sulla pista combaciata; senza chiave combaciante zero patch.
 * Ritorna il nome della pista combaciata (per il report) o null.
 */
export function perTrackKey(cls, trackRef) {
  if (!cls?.perTraccia || !trackRef) return null;
  for (const trk of Object.keys(cls.perTraccia)) {
    if (!trk.startsWith('_') && sameTrack(trk, trackRef)) return trk;
  }
  return null;
}

export function patchPerTrack(rules, cls, trackRef) {
  const trk = perTrackKey(cls, trackRef);
  if (!trk) return null;
  const ov = cls.perTraccia?.[trk];
  const pct = ov?.restrictorPct ?? {};
  for (const r of rules) {
    const key = r.rule?.preset ?? r.rule?.carName;
    if (key != null && pct[key] != null) r.pct = Math.min(pct[key], 20);
  }
  return trk;
}

/* ---------- template: celle e piloti come BYTES pronti da fotocopiare ---------- */
function splitTemplate(buf) {
  const cells = [], drivers = [];
  let config = null, weather = null, other = [];
  for (const f of decodeMsg(buf)) {
    if (f.field === 1) cells.push(f.bytes);
    else if (f.field === 2) drivers.push(f.bytes);
    else if (f.field === 3) config = f;
    else if (f.field === 4) weather = f;
    else other.push(f);
  }
  if (!cells.length) throw new Error('template senza celle: afla prima una griglia col GENERA del gioco');
  if (!config) throw new Error('template senza config (campo 3): file anomalo');
  return { cells, drivers, config, weather, other };
}

/* ---------- CELLE SINTETICHE (1/11: auto mai state in griglia) ---------- */
// «Le auto le prendi anche se non sono state mai usate» (1/11, Mauro: paddock
// + loader collegati al gioco). In una cella protobuf di customgrid l'identità
// dell'auto è SOLO testo: carId (f3), nome di scheda (f4), preset (f10,
// sotto-messaggio con f1). Trapiantando quei tre su una CELLA DONATRICE reale
// del template (struttura, visual e float di tuning restano quelli del gioco:
// «zero cella inventata» regge) diventa POSSIBILE una griglia di un pool di
// auto mai state in NESSUNA griglia precedente — fino ad oggi il pool dava il
// rifiuto «rigenera in EVO una griglia con quelle auto una volta». OPT-IN
// (celleNuove:true nel buildGridMessage) e dichiarato nel report: la PRIMA
// APPLICA in gioco resta la verifica della sintesi (come per il builder
// tutto-fotocopia lo è stata il suo primo Applied 23/10).
function cellaSintetica(donore, carId) {
  const B = (s) => Buffer.from(s, 'utf8');
  const preset = encodeMsg([{ field: 1, wire: 2, bytes: B(`preset_${carId}`) }]);
  const out = decodeMsg(donore).map((g) => ({ ...g }));
  let conPreset = false;
  for (const g of out) {
    if (g.field === 3) g.bytes = B(carId);
    else if (g.field === 4) g.bytes = B(carId);
    else if (g.field === 10) { g.bytes = preset; conPreset = true; }
  }
  if (!conPreset) out.push({ field: 10, wire: 2, bytes: preset });   // donatore senza preset (file atipico): la cella sintetica NON nasce anonima
  return encodeMsg(out);
}

/* ---------- bilanciamento ---------- */
function pickClass(classes, serieId, presetList) {
  // match AUTOMATICO: prima per id serie, poi per OVERLAP dei preset (la classe
  // che copre più preset del pool vince) — così OGNI gara multiclasse con le auto
  // di una classe conosciuta si bilancia da sola, senza --serie.
  const CL = classes.classi ?? {};
  if (CL[serieId]) return { id: serieId, cls: CL[serieId] };
  let best = null, bestId = null, bestN = -1;
  for (const [id, c] of Object.entries(CL)) {
    const n = (c.regole ?? []).filter((r) => r.preset && presetList.includes(r.preset)).length;
    if (n > bestN) { best = c; bestId = id; bestN = n; }
  }
  return bestN >= 2 ? { id: bestId, cls: best } : { id: serieId, cls: null };   // ≥2 preset per fidarsi
}
function rulesFor(_classes, serieId, _presets, matchedCls, matchedId, trackRef) {
  const cls = matchedCls;
  if (cls?.regole) {
    // clamp ai LIMITI reali del gioco: l'UI (e la gara) cappano a 100kg / 20%;
    // valori oltre non producono nulla e tormentano la lettura dei risultati.
    const CLAMP_KG = cls.LIMITI_GIOCO?.ballastMaxKg ?? 100;
    const CLAMP_PCT = cls.LIMITI_GIOCO?.restrictorMaxPct ?? 20;
    const rules = cls.regole.map((r) => ({
      rule: r.preset ? { preset: r.preset } : { carName: r.auto },
      kg: Math.min(r.ballastKg ?? 0, CLAMP_KG),
      pct: Math.min(r.restrictorPct ?? 0, CLAMP_PCT),
      escluso: r.escluso === true,
    }));
    let origine = `classe "${matchedId ?? serieId}" in grid-classes.json (match automatico)`;
    const perTrack = patchPerTrack(rules, cls, trackRef);
    if (perTrack) origine += ` · supplementi per-traccia "${perTrack}"`;
    return { origine, rules, cls };
  }
  // DECISIONE MAURO 24/10 (collaudo GT3 Serie A: tutte le non-base al cap
  // 20%+100kg senza che UNA sola gara della serie sia mai girata): una serie
  // multiclasse NUOVA parte a 0 — nessuna penalità teorica dal PI catalogo.
  // Il bilancio vero nasce dai risultati: griglia-calib studia le gare e scrive
  // la classe in grid-classes.json; da quel giro in poi le regole qui sopra
  // amatriciano da sole. Il PI resta nella finestra (config 23/24), non nelle
  // celle. tools/grid-tune.mjs resta il distruttore manuale delle proposte PI
  // per chi vuole già un'avamaria da registrare a mano in una classe.
  return {
    origine: 'nessuna classe nota e nessuna gara di questa serie: griglia a 0 (il bilancio lo costruisce griglia-calib dai risultati)',
    rules: [],
  };
}

function applyRulesToCell(cellBytes, rules) {
  const inner = decodeMsg(cellBytes);
  const cell = { preset: null, carName: null };
  for (const g of inner) {
    if (g.field === 4) cell.carName = utf8(g.bytes);
    else if (g.field === 10) cell.preset = decodeMsg(g.bytes).filter((x) => x.field === 1).map((x) => utf8(x.bytes))[0] ?? null;
  }
  const rl = rules.find((r) => r.rule.preset != null && r.rule.preset === cell.preset)
    // FAMIGLIA (lezione 27/10 riusata 31/10): i preset del template vengono
    // RINUMERATI a ogni variante mech (mech_2, mech_3...) — il match esatto
    // perdeva le varianti successive: stessa auto, 0 kg a giro. La medesima
    // semantica: la regola del preset mech_1 pesa le SUE varianti mech_n.
    ?? rules.find((r) => r.rule.preset != null && cell.preset != null
      && withoutMech(r.rule.preset) === withoutMech(cell.preset))
    ?? rules.find((r) => r.rule.carName != null && r.rule.carName === cell.carName);
  const out = inner.filter((g) => g.field !== 24 && g.field !== 25);
  if (rl) {
    if (rl.kg > 0) out.push({ field: 24, wire: 0, varint: BigInt(Math.round(rl.kg)) });
    if (rl.pct > 0) out.push({ field: 25, wire: 5, bytes: setF32(rl.pct / 100) });
    return { bytes: encodeMsg(out), kg: rl.kg, pct: rl.pct, car: cell.preset ?? cell.carName ?? '?' };
  }
  return { bytes: encodeMsg(out), kg: 0, pct: 0, car: cell.preset ?? cell.carName ?? '?' };
}

/* ---------- ARMONICA ---------- */
const PASSO_ARMONICO = 0.0003;   // ±0,3‰·k (MENZOGNA riparata 28/10: il commento diceva ±2‰): invisibile in gara, unica la firma in byte
/** Il primo float DI PRIMO LIVELLO della cella è il bersaglio del ritocco:
 *  nella CSL è il f42 (valore 10.0xxxx), campo “di tuning” senza fisica attaccata.
 *  Ritorno { index, valore } o null (niente float utile → niente armonica). */
function bersaglioArmonico(cellBytes) {
  const inner = decodeMsg(cellBytes);
  const i = inner.findIndex((g) => g.wire === 5 && g.bytes?.length === 4);
  return i < 0 ? null : { index: i, valore: f32(inner[i].bytes) ?? 0 };
}
/** Ritorna true (eiene) se TUTTE le target uniche necessarie sono ottenibili. */
function armonizza(cellsUniche, _target) {
  return cellsUniche.every((b) => bersaglioArmonico(b) !== null);
}
/** Clone della cella di posizione i%len: stesso vettura, stesso preset, stesso
 *  visual — by byte diverso via il float bersaglio ×(1 + (k+1)·passo). K parte
 *  da 0 per i cloni; dentro band ±2% comunque non esce. */
function cloneArmonico(cellBytes, k) {
  const inner = decodeMsg(cellBytes);
  const bers = bersaglioArmonico(cellBytes);
  const m = 1 + (k + 1) * PASSO_ARMONICO;
  inner[bers.index].bytes = setF32(mantieniBanda(bers.valore, m));
  return Buffer.from(encodeMsg(inner));
}
function mantieniBanda(v, m) {
  const x = v * m;
  return Math.max(v * 0.98, Math.min(v * 1.02, x));
}

/* ---------- costruzione messaggio completo ---------- */
/**
 * opts = { ladder, nodeId, roundIndex, state, file }
 * Ritorna { buffer, report } con report leggibile per la CLI.
 */
export function buildGridMessage(opts) {
  const { ladder, nodeId, roundIndex, file } = opts;
  const node = ladder.nodes.find((n) => n.nodeId === nodeId);
  if (!node) throw new Error(`serie "${nodeId}" non trovata nel ladder`);
  const round = node.calendar[roundIndex ?? 0];
  if (!round) throw new Error(`round ${roundIndex} fuori dal calendario di ${node.display}`);

  const tpl = splitTemplate(readFileSync(file));
  const target = node.gridSize;
  const classes = loadClasses();

  // preset di TUTTO il template (per il match automatico della classe)
  const presetOf = (b) => {
    for (const g of decodeMsg(b)) if (g.field === 10) return decodeMsg(g.bytes).filter((x) => x.field === 1).map((x) => utf8(x.bytes))[0] ?? null;
    return null;
  };
  // LA TINTA di una cella: hoistata al livello superiore (31/10, tintaDi) per
  // servire identica anche il PRESTARE di tinte: niente doppia estrazione.
  const visualOf = tintaDi;

  // pool: se il ladder dice node.cars, prendo dal template SOLO quelle auto;
  // altrimenti tutto il pool (serie mista). Il MATCH della classe avviene sui
  // preset del POOL (non del template intero!): una monomarca non deve ereditare
  // la classe di una serie mista.
  const carIdOf = carIdDi;
  // poolMulti: una serie con UNA sola auto nel ladder PUÒ dichiarare in
  // grid-classes.json un pool MULTI-MARCA (richiesta Mauro 21/10 per la Coppa
  // RX-7 FD: la monomarca forzata dal builder era anti-storica). Le celle
  // restano FILTRATE dal template (lezione 20/10: zero-crash, il template è la
  // sorgente delle celle) ma al pool dichiarato, non all'unica auto: con meno
  // di 3 modelli diversi nel template si esce con errore pulito (serve
  // rigenerare in EVO griglia col pool, o ripristinare un .bak-apply che ce li
  // abbia — come il titolo d'epoca del 21/10 ore 12:34).
  let poolMultiInfo = null;
  const declared = classes.classi?.[nodeId];
  const poolMulti = Array.isArray(declared?.poolAuto) && declared.poolAuto.length >= 2 ? new Set(declared.poolAuto) : null;
  const wantCars = Array.isArray(node.cars) && node.cars.length ? new Set(node.cars) : null;
  let poolCells = tpl.cells;
  const reportSintesi = [];   // auto mai in griglia, montate con celle sintetiche (1/11)
  if (poolMulti) {
    const sel = tpl.cells.filter((b) => poolMulti.has(carIdOf(b)));
    const distinte = [...new Set(sel.map(carIdOf).filter(Boolean))];
    // IL POOL INTERO (1/11, Campionato Corsa): la soglia dei 3 modelli è
    // giusta per i pool lti (l'invenzione di una terza vettura oltre quelle
    // dichiarate); ma un pool dichiarato con DUE sole vetture (il pescaggio a
    // sorte del Corsa) non può fornirne tre, per costruzione — quando le
    // distinte coprono TUTTO il pool dichiarato vale la griglia anche con 2.
    if (sel.length >= 3 && (distinte.length >= 3 || distinte.length === poolMulti.size)) {
      poolCells = sel;
      poolMultiInfo = { auto: distinte.length, celle: sel.length };
    } else {
      throw new Error(tr({
        it: `il template non contiene la griglia MULTI-MARCA della serie (${distinte.length} auto del pool presenti su ${poolMulti.size} dichiarate, servono ≥3 modelli o il pool intero): ripristina un template d'epoca col pool dichiarato in grid-classes.json (es. un .bak-apply che ce le abbia) o rigenera in EVO una griglia personalizzata con le auto del pool`,
        en: `the template does not contain the series' MULTI-MAKE grid (${distinte.length} pool cars present out of ${poolMulti.size} declared, ≥3 models or the whole pool needed): restore a vintage template carrying the pool declared in grid-classes.json (e.g. a .bak-apply that has them) or regenerate a custom grid in EVO with the pool cars`,
      }));
    }
  } else if (wantCars) {
    // MATCH GRADUALE (26/10, dal Gufo Paddock findModel): il vecchio filtro
    // esatto (wantCars.has(carIdOf(cell))) si srotolava su un preset rinominato
    // o su un nome con un accento di troppo. La catena esatta → contiene →
    // tutte le parole → alias trova l'auto comunque, e se davvero manca il
    // log porta i nomi VERI che il template ha su disco (data/match-auto.log):
    // la fonte dati si sistema in un colpo, senza indovinare.
    const labelsOf = (b) => {
      let carId = null, carName = null;
      for (const g of decodeMsg(b)) {
        if (g.field === 3) carId = utf8(g.bytes);
        else if (g.field === 4) carName = utf8(g.bytes);
      }
      return [carId, carName].filter(Boolean);
    };
    const aliases = classes.aliases?.cars ?? {};
    const m = matchPool([...wantCars], tpl.cells, labelsOf, aliases);
    if (m.mancanti.length) {
      logMatch(join(PROJECT, 'data'), [
        `serie "${nodeId}": auto del ladder non trovate nel template: ${m.mancanti.join(', ')} · auto veri del gioco nel template: ${m.reali.join(' | ')}`,
      ]);
    }
    if (m.mancanti.length && opts.celleNuove) {
      // SINTESI (opt-in opts.celleNuove, gara al volo): le auto del pool NON
      // nel template NON bloccano più — le celle si fabbricano dal donatore
      // (la prima cella matched, o comunque la prima reale del template).
      // Le presenti restano fotocopiate e il report dichiara le sintetiche.
      const selected = [...m.sel];
      const donore = selected.length ? selected[0] : tpl.cells[0];
      for (const id of m.mancanti) { selected.push(cellaSintetica(donore, id)); reportSintesi.push(id); }
      poolCells = selected;
      poolMultiInfo = { auto: [...new Set(selected.map(carIdOf))].length, celle: selected.length };
    } else if (m.sel.length) {
      poolCells = m.sel;
      poolMultiInfo = m.mancanti.length ? { auto: [...new Set(m.sel.map(carIdOf))].length, celle: m.sel.length } : null;
    } else {
      // lezione del 20/10 (Donington R3): con il template sbagliato in piedi (es. la
      // calibrazione hyper di sera) il fall-through silenzioso scriveva 12 GT3 RS
      // con il bilancio di un'altra classe. Meglio fermarsi: serve un template con
      // le auto della serie — quello di un'apply/gara precedente combaciante va bene.
      throw new Error(`il template (last_grid.customgrid) non contiene le auto della serie (${[...wantCars].join(', ')}): auto veri presenti nel template: ${m.reali.join(' | ')}`);
    }
  }
  // TINTE PRESTATE (DA-10, secondo passo 31/10 — default SPENTO): se il
  // pool ha un modello con UNA SOLA tinta, le altre si possono PRESTARE
  // dagli ALTRI template sul disco (stessa cartella, data/grid-templates/):
  // si ragiona sul REPORT «MONOCOLORE» — prima del gesto manuale «più
  // LIVERIES + APPLICA» si prova il parco dei template VERI. Le celle
  // NON si inventano: si fotocopiano INTERE da un altro template del
  // PARCO, e restano vere (la classe non è ITA+fotocopia). Con tinte
  // per serie in grid-classes.json (classi."<serie>".tintePrestate = true).
  // il match è CAR-ID e le ESCLUSIONI per preset le filtrano da sole perché
  // esegono DOPO l'innesto.
  let tintePrestate = 0;
  const tintePrestateOn = declared?.tintePrestate === true;
  if (tintePrestateOn && file) {
    const giàTinte = new Map();   // carId → set tinte già nel pool
    for (const b of poolCells) {
      const id = carIdOf(b); if (!id) continue;
      const s = giàTinte.get(id) ?? new Set(); s.add(tintaDi(b)); giàTinte.set(id, s);
    }
    for (const id of [...giàTinte.keys()]) {
      for (const c of prestaTinte(file, id)) {
        if (giàTinte.get(id).has(tintaDi(c))) continue;   // tinta già in casa
        giàTinte.get(id).add(tintaDi(c)); poolCells.push(c); tintePrestate++;
      }
    }
  }

  const poolPresets = [...new Set(poolCells.map(presetOf).filter(Boolean))];
  // riscala l'ABILITÀ dei piloti: priorità al campo AI PER-TRACCIA della classe
  // matchata (es. Sebring 97-98), poi all'aiStandard della classe, poi alla serie
  // sul ladder, poi nessuna riscala (restano le skill del template).
  // opts.aiBand: banda RICHIESTA (eventi speciali, tasto Prepara): la griglia
  // dell'evento deve fare la banda fissa dell'invito (88-93), NON quella di una
  // classe di campionato combaciata per caso con le auto ospiti.
  const matched = pickClass(classes, nodeId, poolPresets);
  const trkKey = matched.cls ? perTrackKey(matched.cls, round.track) : null;
  const clsAi = matched.cls?.perTraccia?.[trkKey]?.aiStandard ?? matched.cls?.aiStandard ?? null;
  const bandaVoluta = Array.isArray(opts.aiBand) && opts.aiBand.length === 2;
  const aiEff = bandaVoluta ? opts.aiBand : (clsAi ?? (node.ai?.length === 2 ? node.ai : null));
  const aiFrom = bandaVoluta ? 'banda richiesta (evento)' : (clsAi == null ? 'dal ladder' : (trkKey && matched.cls?.perTraccia?.[trkKey]?.aiStandard ? 'per-traccia' : 'standard della classe'));
  // auto ESCLUSE dalla classe matchata: rimosse dal pool — la griglia non le
  // include affatto. Possono essere di classe (escludiAuto: vale ovunque, come
  // il Golf 8 R nella 9-10) o PER-TRACCIA (escludiAuto dentro la variante
  // perTraccia: solo su quella pista).
  const excludedPresets = new Set([
    ...(matched.cls?.escludiAuto ?? []),
    ...((trkKey ? matched.cls?.perTraccia?.[trkKey]?.escludiAuto ?? [] : [])),
  ]);
  // ESCLUSIONI PER FAMIGLIA (27/10, col gap di R7 Kyalami servito in dry):
  // in grid-classes.json l'ESCLUSA è dichiarata col preset CHE AVEVA la serie
  // quel giorno (preset_jcs_mech_1) ma i preset del template vengono
  // RINUMERATI a ogni rilatto (mech_2, mech_3…): il confronto esatto smetteva
  // di mordere e il Mini/MX-5 (esclusi da Mauro 23/10: +19/+20 s/lap) rientra
  // in griglia con regole 0kg. Il match retto per famiglia auto — come fa
  // car-pool.mjs coi token — vale per ogni meccanico della stessa auticella.
  const senzaMech = (p) => String(p ?? '').toLowerCase().replace(/_mech_\d+/g, '');
  const listaEscluse = [...excludedPresets].map(senzaMech).filter(Boolean);
  const escluCella = (p) => {
    if (p == null || !listaEscluse.length) return false;
    const q = senzaMech(p);
    return listaEscluse.some((e) => e === q || q.includes(e) || e.includes(q));
  };
  const poolEscluse = [...excludedPresets].filter((e) => poolPresets.some((p) => escluCella(p) && senzaMech(e) === senzaMech(p)));
  if (excludedPresets.size) {
    const kept = poolCells.filter((b) => !escluCella(presetOf(b)));
    if (kept.length) poolCells = kept;
  }

  const newCells = [];
  // LEZIONE 20/10 (7-8 crash a Suzuka) + 23/10 (crash 19:32 sulla griglia F40 del
  // Gran Finale): griglie scritte con CELLE IDENTICHE ripetute (loop su un pool
  // con troppe poche varianti: la monomarca 14×205 o 5×F40 con solo 3 liveries)
  // crashano EVO 0.9.1 (0xC0000005 all'istanziazione degli avversari). L'alternanza
  // visual_1↔2 era morta sul nascere: il visual preset sta nel PRIMO segmento del
  // campo 11 (es. preset_f40lm_visual_5), non nel nome dopo '\x12' ("F40 LM Visual
  // 5", senza underscores). E le 5 F40 scritte ieri (visual 5/4/6 a giro) erano
  // 3 uniche su 5: due PAIA identiche, crashato alla prima prova in gioco.
  // La regola vera: ogni cella scritta deve essere BYTE-UNICA. Se il pool ha
  // meno varianti uniche delle vetture richieste NON si scrive niente: si chiede
  // o una griglia più piccola o un template più ricco (più liveries della stessa
  // auto, generate in EVO e APPLICA — il gesto dei backup .bak-*).
  const cellsUniche = [];
  const vistiCella = new Set();
  for (const b of poolCells) {
    const k = Buffer.from(b).toString('hex');
    if (!vistiCella.has(k)) { vistiCella.add(k); cellsUniche.push(b); }
  }  let cloniArmonici = 0;
  // ROUND-ROBIN PER MODELLO (1/11, con le celle sintetiche): il ciclo i%len
  // con un pool disomogeneo (es. 4 varianti della stessa auto + la cella
  // sintetica di un'altra) può TAGLIARE interi modelli fuori dalla griglia:
  // il ciclo scava solo le prime N celle. Ordinando le uniche una-per-modello
  // prima delle varianti extra, OGNI auto del pool compare ALMENO una volta
  // quando target ≥ numero di modelli (monomarca resta identica: un solo
  // modello, ordine invariato). Già falsificato dal test della RS 3.
  const perModello = new Map();
  for (const b of cellsUniche) {
    const k = carIdOf(b) ?? Buffer.from(b).toString('hex');
    if (!perModello.has(k)) perModello.set(k, []);
    perModello.get(k).push(b);
  }
  const ordinate = [];
  const lista = [...perModello.values()];
  while (lista.some((a) => a.length)) for (const a of lista) { if (a.length) ordinate.push(a.shift()); }
  if (ordinate.length !== cellsUniche.length) throw new Error('riordinamento per modello: ho perso celle, copertura della griglia non garantita');
  cellsUniche.length = 0;
  cellsUniche.push(...ordinate);

  if (cellsUniche.length < target) {
    // ARMONICA (24/10, doppio passo Mauro «Test harmonic CSL»): le varianti
    // REALI della CSL sul disco sono 3-5, ma la ronda nativa chiede 14 — e il
    // gesto "14 liveries + APPLICA" non è sempre fattibile (il gioco non
    // offre hi-differenti varianti per ogni auto). 24/10 sera, Mauro
    // «applica dappertutto»: armonica DI DEFAULT per tutte le serie (così
    // gira anche sui campionati nuovi di un amico), si spegne PER SERIE con
    // grid-classes.json → classi[node].armonica = false. Si completano i
    // posti mancanti con cloni delle celle reali resi byte-DISTINTI ritoccando
    // SOLO un campo float di tetto (±2‰·k) — si evita la sola cosa che ha
    // davvero crashato (lezione 20/10 + F40 23/10: due paia BYTE-IDENTICHE); la
    // griglia scritta da EVO ha liveries ripetute (Delta Evo II: 7 visual ×2)
    // e gira. Rimane un ESATTO fallback: se il template non offre un valore
    // float utile, si cade nel vecchio rifiuto, ché l'altra via è il crash.
    const cls = loadClasses().classi?.[nodeId];
    if (cls?.armonica !== false && armonizza(cellsUniche, target)) {
      cloniArmonici = target - cellsUniche.length;
    } else {
      throw new Error(tr({
        it: `griglia rifiutata: il template ha solo ${cellsUniche.length} celle uniche (servono ${target}) — con celle ripetute EVO 0.9.1 crasha (lezione 20/10 + crash 23/10 sull'F40). O si fissa la griglia a ${cellsUniche.length} vetture, o si genera in EVO una griglia personalizzata con più LIVERIES della stessa auto (${target} varianti) e si preme APPLICA, oppure si spegne l'armonica per ${nodeId} (se l'hai disattiva con "armonica": false riattivala togliendo la voce).`,
        en: `grid rejected: the template has only ${cellsUniche.length} unique cells (need ${target}) — repeated cells crash EVO 0.9.1 (lesson 20/10 + 23/10 F40 crash). Either fix the grid to ${cellsUniche.length} cars, or generate a custom grid in EVO with more LIVERIES of the same car (${target} variants) and press APPLY, or re-enable harmonics for ${nodeId} (if you turned it off with "armonica": false, remove that entry).`,
      }));
    }
  }
  // tiling con VERIFY finale: due cloni di basi diverse potrebbero capitare sul
  // STESSO valore float (10.000019·1.0003 == 10.003·(1)): doppioni byte → crash.
  // Risolvo rialzando il passo (+50.0003 fresche) finché l'elenco è tutto distinto.
  const vistiFinale = new Set();
  for (let i = 0; i < target; i++) {
    const base = cellsUniche[i % cellsUniche.length];
    let b = i < cellsUniche.length ? Buffer.from(base) : cloneArmonico(base, i - cellsUniche.length);
    let kClone = i - cellsUniche.length, tentativi = 0;
    let firma = Buffer.from(b).toString('hex');
    while (vistiFinale.has(firma) && tentativi < 50) {
      b = cloneArmonico(base, kClone + 50 + tentativi);
      firma = Buffer.from(b).toString('hex');
      tentativi++;
    }
    if (vistiFinale.has(firma)) {
      throw new Error(tr({
        it: `griglia rifiutata: anche con la modalità armonica non riesco a rendere ${target} celle byte-distinte da ${cellsUniche.length} reali (nessun float utile nel template). In EVO: griglia personalizzata con più LIVERIES della stessa auto (${target} varianti) e APPLICA.`,
        en: `grid rejected: even in harmonic mode I cannot make ${target} byte-distinct cells from ${cellsUniche.length} real ones (no usable float in the template). In EVO: custom grid with more LIVERIES of the same car (${target} variants) and APPLY.`,
      }));
    }
    vistiFinale.add(firma);
    newCells.push(b);
  }
  const newDrivers = [];
  for (let i = 0; i < target; i++) newDrivers.push(tpl.drivers[i % tpl.drivers.length]);

  if (aiEff?.length === 2) {
    const fMin = aiEff[0] / 100, fMax = aiEff[1] / 100;
    // quota di ogni driver dentro il range del template (attraverso i campi f4 visti finora)
    const tplSkills = tpl.drivers.map((b) => {
      for (const g of decodeMsg(b)) if (g.field === 4 && g.wire === 5) return f32(g.bytes) ?? 0;
      return 0;
    });
    const lo = Math.min(...tplSkills), hi = Math.max(...tplSkills), span = (hi - lo) || 1;
    newDrivers.length = 0;
    for (let i = 0; i < target; i++) {
      const raw = tpl.drivers[i % tpl.drivers.length];
      const inner = decodeMsg(raw);
      const skill = tplSkills[i % tpl.drivers.length];
      const scaled = fMin + (skill - lo) / span * (fMax - fMin);
      const out2 = inner.map((g) => (g.field === 4 && g.wire === 5) ? { ...g, bytes: setF32(scaled) } : g);
      newDrivers.push(encodeMsg(out2));
    }
  }

  // STESSA REGOLA DELLE CELLE per i driver: due driver byte-identici (nome uguale,
  // skill uguale) possono instanziare lo stesso problema che crasha. Con il pool
  // corto, i driver tiled si ripetono: si spacchetta il campo skill (f4, float)
  // finché l'elenco è tutto distinto, restando nella banda (88-93) o in 0..1.
  const limitiDriver = aiEff?.length === 2 ? [aiEff[0] / 100, aiEff[1] / 100] : [0.01, 1];
  const passoSkill = (limitiDriver[1] - limitiDriver[0]) / (target + 1);
  const nudgeSkill = (b) => {
    const inner = decodeMsg(b);
    const i4 = inner.findIndex((x) => x.field === 4 && x.wire === 5);
    if (i4 < 0) return b;
    const v = Math.min(limitiDriver[1], Math.max(limitiDriver[0], (f32(inner[i4].bytes) ?? 0) + passoSkill));
    inner[i4].bytes = setF32(v);
    return encodeMsg(inner);
  };
  const vistiDriver = new Set();
  for (let i = 0; i < target; i++) {
    let b = newDrivers[i];
    if (!b) continue;
    let k = Buffer.from(b).toString('hex');
    for (let tries = 0; vistiDriver.has(k) && tries < target + 2; tries++) { b = nudgeSkill(b); k = Buffer.from(b).toString('hex'); }
    vistiDriver.add(k);
    newDrivers[i] = b;
  }

  // preset presentein celle (per il bilanciamento per preset; dedup)
  const presets = [...new Set(newCells.map((b) => {
    for (const g of decodeMsg(b)) if (g.field === 10) return decodeMsg(g.bytes).filter((x) => x.field === 1).map((x) => utf8(x.bytes))[0] ?? null;
    return null;
  }).filter(Boolean))];
  // NOTE: se la serie ha auto proprie (node.cars) NON presenti nel template
  // pool, segnalo il conflitto nel report: il template è la sorgente delle celle
  // (zero rischio crash), il ladder descrive la serie — nel dubbio vince il pool.
  // opts.noBalance: la griglia di UN EVENTO SPECIALE non bilancia niente (gli
  // ospiti sono auto diverse fra loro per scelta del tema; zavorre di una classe
  // di campionato combaciata per caso sarebbero capricciose).
  const { origine, rules } = opts.noBalance
    ? { origine: 'evento speciale: nessun bilanciamento (auto ospiti libere)', rules: [] }
    : rulesFor(classes, nodeId, presets, matched.cls, matched.id, round.track);
  const bilanciate = newCells.map((b) => applyRulesToCell(b, rules));

  // TINTE RIVALI (DA-10, «avversari monocolore»): quante LIVERIE DISTINTE
  // per modello finiscono nella griglia scritta. Il template è la sorgente
  // delle celle (zero rischio crash): se un modello esce con più vetture e
  // UNA sola tinta, il report lo dice — la varietà è il gesto «più LIVERIES
  // + APPLICA» in EVO, non un'invenzione del builder.
  const perAutoTinta = new Map();
  for (const b of bilanciate) {
    const raw = b.bytes;   // applyRulesToCell torna un oggetto { bytes, kg, pct, car }
    const id = carIdOf(raw) ?? '?';
    const e = perAutoTinta.get(id) ?? { istanze: 0, tinte: new Set() };
    e.istanze++; e.tinte.add(visualOf(raw));
    perAutoTinta.set(id, e);
  }
  const tinte = [...perAutoTinta.entries()].map(([id, e]) => {
    const mono = e.istanze > 1 && e.tinte.size === 1;
    return `${id} ×${e.istanze} · ${e.tinte.size} ${e.tinte.size === 1 ? 'tinta' : 'tinte'}${mono ? ' (MONOCOLORE: più liveries in EVO + APPLICA per le varianti)' : ''}`;
  });

  // config campo 3: partiamo dai raw del template e patchiamo ciò che cambia
  const cfgInner = decodeMsg(tpl.config.bytes);
  const cfgNew = cfgInner.map((g) => ({ ...g }));
  const setCfg = (field, value) => {
    const i = cfgNew.findIndex((g) => g.field === field);
    if (i >= 0) cfgNew[i] = { ...cfgNew[i], ...value };
    else cfgNew.push(value);       // ordine non garantito alla coda, i protobuf lo tollerano
  };
  setCfg(1, { field: 1, wire: 0, varint: BigInt(target) });
  // 23/10: il builder ora incolona il campo `2 = 1` nella config, come fa
  // EVO (la nativa lo scrive sempre). VERDETTO rev. 4 (NOTE AUTOMAZIONE): quel
  // campo NON è la causa dei crash all'avvio sessione (flaky, nella UI del
  // menu) — resta scritto per uniformità con EVO, non come difesa.
  setCfg(2, { field: 2, wire: 0, varint: 1n });
  if (aiEff?.length === 2) { setCfg(21, { field: 21, wire: 0, varint: BigInt(aiEff[0]) }); setCfg(22, { field: 22, wire: 0, varint: BigInt(aiEff[1]) }); }
  // finestra PI: dal pool reale del template (min/max dei PI dei preset, arrotondate)
  const pi = carPiByPreset();
  const pis = presets.map((p) => pi[p]).filter((v) => v != null);
  if (pis.length) { setCfg(23, { field: 23, wire: 5, bytes: setF32(Math.floor(Math.min(...pis))) }); setCfg(24, { field: 24, wire: 5, bytes: setF32(Math.ceil(Math.max(...pis))) }); }
  else { setCfg(23, { field: 23, wire: 5, bytes: setF32(node.piMin ?? 0) }); setCfg(24, { field: 24, wire: 5, bytes: setF32(node.piMax ?? 0) }); }

  const configBytes = encodeMsg(cfgNew);

  // meteo: campo 4 VARINT DIRETTO al top-level (è così che lo scrive EVO: normalmente
  // un wire 0), dal calendario del round. Non incapsularlo in un sottomessaggio!
  const weatherField = (tpl.weather && round.weather != null) ? { field: 4, wire: 0, varint: BigInt(round.weather) } : null;

  const fields = [];
  for (const b of bilanciate) fields.push({ field: 1, wire: 2, bytes: b.bytes });
  for (const b of newDrivers) fields.push({ field: 2, wire: 2, bytes: b });
  fields.push({ field: 3, wire: 2, bytes: configBytes });
  if (weatherField) fields.push(weatherField);

  const report = {
    serie: `${node.display} · ${round.name ?? round.track} (round ${roundIndex + 1}/${node.calendar.length})`,
    armonica: cloniArmonici || null,
    gridSize: target,
    source: file,
    poolMulti: poolMultiInfo ? `multi-marca: ${poolMultiInfo.auto} auto diverse (${poolMultiInfo.celle} celle nel template)` : null,
    origine,
    ai: aiEff?.length === 2 ? `${aiEff[0]}-${aiEff[1]} (${aiFrom})` : null,
    tinte,
    escluse: poolEscluse,
    sintesi: reportSintesi.length ? reportSintesi : null,
    tintePrestate: tintePrestate || null,   // celle fotocopiate da ALTRI template (DA-10 secondo passo)
    celle: bilanciate.map((b) => `${b.car} → ${b.kg}kg/${b.pct}%`),
  };
  return { buffer: encodeMsg(fields), report };
}

