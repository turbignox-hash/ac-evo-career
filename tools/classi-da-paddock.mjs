// classi-da-paddock.mjs — i BUCHI delle classi note, riempiti con i dati VERI.
//
// Ripartito confermato da Mauro il 27/10: Paddock diventa fonte primaria per le
// CLASSI. Le regole nate dalle gare vere (grid-classes.json) restano SOPRA e non
// si toccano; il tool riempie solo i buchi (auto dentro la finestra PI della
// classe e però senza regola), marcando la fonte, così il pacchetto amico nasce
// bilanciato dal giorno uno e griglia-calib resta il VERIFICATORE: le gare vere
// convalidano (o correggono), non costruiscono.
//
// COSA USA (regola di casa: niente dati fittizi — tutto scritto dal gioco o da
// ciò che il gioco/Paddock pubblicano):
//   • PI            → cars.json del server dedicato (performance_indicator).
//                     Senza il file il tool si spegne: non inventa finestre.
//   • Δkw/teso      → journal pd-catalog di Paddock (kw_per_t). Sui dati veri
//                     del 27/10 predice il restrittore MISURATO meglio del ΔPI
//                     puro (che contraddice: Mini −0.68→1.5% in una classe e
//                     −0.29→10% nell'altra) — vedi calibraturaClasse.
//   • zavorra       → convenzione della classe (ballast>0 più frequente, il
//                     100kg delle gare) scalata per MASSEA reale dal catalogo:
//                     le gare del 19/10 hanno insegnato che «100kg su auto
//                     leggere pesa troppo» (Mini/MX-5 giù a 50kg in pista).
//   • pendenza k    → regressione all'origine dei SOLI punti misurati della
//                     classe (restrittore>0, Δkw/t>0); se un punto scarta oltre
//                     TOL dal modello, la classe è NON derivabile: niente
//                     numeri. Tolleranza scelta sui dati reali del 27/10
//                     (scarti max osservati: 1.9 / 1.2 / 2.4 punti).
//   • ramo negativo → auto più POVERE di potenza della base (Δkw/t<0): PI ≤
//                     base → 0/0 (parità, nessuna leva); PI sopra base → vince
//                     in presa/grip, NON si deriva da questi dati (lezione
//                     Mini/Delta), niente regola scritta.
//
// uso:
//   node tools/classi-da-paddock.mjs                    → dry-run (default)
//   node tools/classi-da-paddock.mjs --apply            → scrive (backup prima)
//   node tools/classi-da-paddock.mjs --serie pi-10-11-moderna
//   node tools/classi-da-paddock.mjs --json             → output per test/GUI
//
// Override di test: EVO_CLASSES_FILE, EVO_CARS_JSON, PADDOCK_JOURNAL_DIR.
// Il modulo è import-safe: la CLI gira solo quando eseguito direttamente
// (lezione del 19/10 in grid-balance).

import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeJsonAtomic } from '../src/atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);

const classesFile = () => process.env.EVO_CLASSES_FILE ?? join(PROJECT, 'data', 'grid-classes.json');

export const MIN_PUNTI = 2;     // punti misurati minimi per calibrare una pendenza
export const TOL_PCT = 2.5;     // punto misurato vs modello: scarto massimo ammesso
export const K_MIN = 0.02;      // sotto: il kw/teso non spiega la classe (rumore)
export const K_MAX = 0.30;      // sopra: fisica che non esiste (1% ogni 3 punti kw/t)

/* ---------- nomi: match tollerante come grid-calib.mjs ---------- */
const strip = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '')
  .toLowerCase();

const matchSuff = (a, b) => {
  const sa = strip(a), sb = strip(b);
  return sa && sb && (sa === sb || sb.startsWith(sa) || sa.startsWith(sb));
};

/** l'autoBase può portare annotazioni («(base della calibrazione: …)», «(dal campo …)»): idem grid-calib. */
export function baseLabelOf(cls) {
  const raw = String(cls?.autoBase ?? '');
  return raw.replace(/\s*\([^)]*\)\s*$/i, '').trim() || null;
}

/** Il nome MODELLO da un display di cars.json: ciò che sta prima del " - ". */
const modelNameOf = (full) => String(full ?? '').split(' - ')[0].trim();
const round2 = (v) => Math.round(v * 100) / 100;

/* ---------- indici dai dati veri (tutti read-only) ---------- */
/** cars.json: strip(modello) → { display, variants: [{ preset, variant, pi }] } */
export function carIndexFromRaw(raw) {
  const idx = new Map();
  for (const c of raw?.cars ?? []) {
    const full = String(c.display_name ?? c.name ?? '');
    if (!full) continue;
    const key = strip(modelNameOf(full));
    if (!key) continue;
    let e = idx.get(key);
    if (!e) { e = { display: modelNameOf(full), variants: [] }; idx.set(key, e); }
    e.variants.push({
      preset: c.name ?? null,
      variant: full.split(' - ')[1]?.trim() ?? null,
      pi: Number(c.performance_indicator ?? 0),
    });
  }
  return idx;
}

/** journal pd-catalog: strip(nome)+strip(slug) → riga (kw_per_t, mass…). */
export function paddockIndexFromCat(cat) {
  const idx = new Map();
  for (const c of cat ?? []) {
    if (!c?.name) continue;
    idx.set(strip(c.name), c);
    if (c.slug) idx.set(strip(c.slug), c);
  }
  return idx;
}

/** cars.json: prima il test/env, poi le librerie Steam (E: prima — lezione catalog.mjs: prima l'installazione vera). */
export function carsJsonPath(env = process.env) {
  if (env.EVO_CARS_JSON && existsSync(env.EVO_CARS_JSON)) return env.EVO_CARS_JSON;
  const folder = 'Assetto Corsa EVO Dedicated Server';
  if (env.ACE_SERVER && existsSync(join(env.ACE_SERVER, 'cars.json'))) return join(env.ACE_SERVER, 'cars.json');
  for (const drive of ['E', 'C', 'D', 'F', 'G', 'H']) {
    const p = join(`${drive}:`, 'SteamLibrary', 'steamapps', 'common', folder, 'cars.json');
    if (existsSync(p)) return p;
  }
  return null;
}

/* ---------- pendenza calibrata SUI punti misurati della classe ---------- */
/**
 * Punti = regole della classe (non-base) con restrittore>0 o zavorra>0 e kw/t
 * dal catalogo. Fit lineare all'origine su (Δkw/t → pct) sui SOLI punti col
 * ramo positivo; se un punto scarta oltre TOL_PCT → la classe non si spiega
 * con questi dati e il tool non apre bocca.
 * Ritorna { k, punti, scartoMax } o { k: null, motivo }.
 */
export function calibraturaClasse(cls, catIdx) {
  const base = baseLabelOf(cls);
  const kwBase = catIdx.get(strip(base))?.kw_per_t ?? null;
  if (kwBase == null) return { k: null, motivo: `la base "${base ?? '?'}" non sta nel catalogo Paddock: niente Δkw/t` };
  const utilizzabili = [];
  for (const r of cls.regole ?? []) {
    if (matchSuff(r.auto, base)) continue;
    if (!(r.restrictorPct ?? 0) && !(r.ballastKg ?? 0)) continue;
    const row = catIdx.get(strip(r.auto));
    if (!row || row.kw_per_t == null) continue;
    const p = { auto: r.auto, dg: row.kw_per_t - kwBase, pct: Number(r.restrictorPct ?? 0) };
    if (p.dg > 0 && p.pct > 0) utilizzabili.push(p);
  }
  if (utilizzabili.length < MIN_PUNTI) {
    const nP = utilizzabili.length;
    return { k: null, motivo: `${nP} punt${nP === 1 ? 'o' : 'i'} misurat${nP === 1 ? 'o' : 'i'} (Δkw/t>0 e restrittore>0): con meno di ${MIN_PUNTI} non si calibra — servono le gare vere di grid-calib` };
  }
  let sx2 = 0, sxy = 0;
  for (const p of utilizzabili) { sx2 += p.dg * p.dg; sxy += p.dg * p.pct; }
  const k = sxy / sx2;
  if (!(k >= K_MIN && k <= K_MAX)) {
    return { k: null, motivo: `pendenza fuori fisica (k=${k.toFixed(4)} % per kw/t): i valori misurati non si spiegano col kw/t` };
  }
  let scarto = 0;
  for (const p of utilizzabili) scarto = Math.max(scarto, Math.abs(p.pct - k * p.dg));
  if (scarto > TOL_PCT) {
    return { k: null, motivo: `un punto misurato scarta ${scarto.toFixed(1)} punti dal modello (tolleranza ${TOL_PCT}): classe NON derivabile — le sue gare restano l'unica fonte` };
  }
  return { k, punti: utilizzabili, scartoMax: Math.round(scarto * 10) / 10 };
}

/** Il PI di un nome base dentro l'indice di cars.json (null se non trovato). */
function piBaseOf(carIdx, base) {
  const e = carIdx.get(strip(base ?? ''));
  return e?.variants?.[0]?.pi ?? null;
}

/* ---------- proposte per classe (puro: senza IO) ---------- */
/**
 * classes = grid-classes.json già parse; carRaw = cars.json già parse;
 * catCars = l'array `cars` del journal pd-catalog. onlyId filtra la CLI.
 * Ritorna { classi: [ { id, stato, k?, motivo?, pendenzaMotivo?, proposte,
 *          senzaNumero, escluse } ] }. Stati:
 *   proposta → buchi riempiti con nome+numero (pendenza calibrata sui dati)
 *   senza-numero → buchi trovati ma la classe NON ha pendenza derivabile:
 *                  si DICE, non si inventa (zavorra/massa non senza restrittore)
 *   non-derivabile → fuori perimetro (senza PI window, base o kw/t mancanti)
 *   pulita → nessun buco: la finestra PI è tutta coperta
 * Le proposte portano fonte:'paddock'; le regole di Mauro restano intatte.
 */
export function proposteDaPaddock(classes, { carRaw = null, catCars = null, onlyId = null } = {}) {
  const carIdx = carIndexFromRaw(carRaw);
  const catIdx = paddockIndexFromCat(catCars);
  const out = [];
  for (const [id, cls] of Object.entries(classes?.classi ?? {})) {
    if (onlyId && id !== onlyId) continue;
    const push = (stato, extra = {}) => out.push({ id, stato, proposte: [], senzaNumero: [], escluse: [], ...extra });

    const piMin = Number(cls?.piMin), piMax = Number(cls?.piMax);
    if (!Number.isFinite(piMin) || !Number.isFinite(piMax)) {
      push('non-derivabile', { motivo: 'senza finestra PI (piMin/piMax) i buchi non si definiscono: fuori dal perimetro (monomarca, armonica, ricette a mano)' });
      continue;
    }

    // convenzione di zavorra della classe: il ballast>0 più frequente
    const kgCount = new Map();
    for (const r of cls.regole ?? []) if ((r.ballastKg ?? 0) > 0) kgCount.set(r.ballastKg, (kgCount.get(r.ballastKg) ?? 0) + 1);
    let convKg = 0;
    for (const [kg, n] of kgCount.entries()) if (n > (kgCount.get(convKg) ?? 0)) convKg = kg;
    if (!convKg) {
      push('non-derivabile', { motivo: 'nessuna regola con zavorra>0: la classe non usa la leva peso, non c\'è da proporre' });
      continue;
    }

    if (!carRaw || !carRaw.cars?.length) {
      push('non-derivabile', { motivo: 'senza cars.json del server dedicato il PI del gioco non c\'è: il tool non inventa finestre né coperture' });
      continue;
    }
    const base = baseLabelOf(cls);
    const baseCat = catIdx.get(strip(base));
    if (!baseCat || baseCat.kw_per_t == null) {
      push('non-derivabile', { motivo: `la base "${base ?? '?'}" non sta nel catalogo Paddock: niente Δkw/t per la classe` });
      continue;
    }
    const piBase = piBaseOf(carIdx, base);
    if (piBase == null) {
      push('non-derivabile', { motivo: `la base "${base}" non sta in cars.json del dedicato: niente PI di riferimento` });
      continue;
    }
    const cal = calibraturaClasse(cls, catIdx);

    const covered = new Set();
    for (const r of cls.regole ?? []) {
      if (r.preset) covered.add(r.preset);
      for (const model of carIdx.values()) {
        if (!matchSuff(r.auto, model.display)) continue;
        for (const v of model.variants) if (v.preset) covered.add(v.preset);
      }
    }
    const esclusePresets = new Set((cls.escludiAuto ?? []).filter(Boolean));
    const capKg = cls.LIMITI_GIOCO?.ballastMaxKg ?? 100;
    const capPct = cls.LIMITI_GIOCO?.restrictorMaxPct ?? 20;
    const oggi = new Date().toISOString().slice(0, 10);

    const proposte = [], senzaNumero = [], escluse = [];
    for (const model of carIdx.values()) {
      const cat = catIdx.get(strip(model.display));
      for (const v of model.variants) {
        if (covered.has(v.preset)) continue;                       // già coperta (regola di Mauro o paddock scritta)
        if (!(v.pi >= piMin && v.pi <= piMax)) continue;           // auto fuori dalla finestra della classe
        if (esclusePresets.has(v.preset)) {
          escluse.push({ preset: v.preset, auto: model.display, pi: round2(v.pi), nota: 'in escludiAuto: decisione di Mauro in pista, la proposta non ci pesca sopra' });
          continue;
        }
        const label = `${model.display}${v.variant ? ` (${v.variant})` : ''}`;
        const dKw = cat?.kw_per_t != null ? cat.kw_per_t - baseCat.kw_per_t : null;
        const dati = `PI ${round2(v.pi)} · Δkw/t ${dKw == null ? '?' : round2(dKw)} · massa ${cat?.mass ?? '?'}kg vs base ${baseCat.mass ?? '?'}kg`;
        // zavorra: convenzione della classe scalata per massa reale (le gare del
        // 19/10: le 100kg schiacciano le leggere); senza masse resta la convenzione.
        const kg = (cat?.mass != null && baseCat.mass != null && baseCat.mass > 0)
          ? Math.min(capKg, Math.max(0, Math.round(convKg * (cat.mass / baseCat.mass) / 10) * 10))
          : Math.min(convKg, capKg);

        if (dKw == null) {
          senzaNumero.push({ preset: v.preset, auto: label, pi: round2(v.pi), motivo: `fuori dal catalogo Paddock: niente Δkw/t${cal.k ? ' e la pendenza c\'è ma non può applicarsi' : ''}` });
          continue;
        }
        if (dKw < 0) {
          if (piBase != null && v.pi > piBase) {
            senzaNumero.push({ preset: v.preset, auto: label, pi: round2(v.pi), motivo: `PI sopra la base ma Δkw/t negativo (${round2(dKw)}): vince in presa/grip, non in potenza — non derivabile (lezione Mini/Delta 21/10), serve una gara reale` });
            continue;
          }
          proposte.push({
            preset: v.preset, auto: label, ballastKg: 0, restrictorPct: 0, fonte: 'paddock',
            note: `${oggi} · PI ≤ base e potenza inferiore (Δkw/t ${round2(dKw)}): 0/0, nessuna leva da dare. ${dati}. Da verificare in pista (griglia-calib)`,
          });
          continue;
        }
        if (!cal.k) {
          senzaNumero.push({ preset: v.preset, auto: label, pi: round2(v.pi), motivo: `pendenza della classe non calibrabile (${cal.motivo}) — nessun numero inventato` });
          continue;
        }
        const pct = Math.min(capPct, Math.max(0, Math.round(cal.k * dKw * 2) / 2));
        if (pct < 0.5) {
          if (v.pi <= piBase) continue;                              // potenza pari e PI ≤ base: 0/0 di fatto
          proposte.push({
            preset: v.preset, auto: label, ballastKg: kg, restrictorPct: 0, fonte: 'paddock',
            note: `${oggi} · la pendenza calibrata dà ${pct}% (<0.5: sotto la soglia sensata del selettore) → restrittore 0, zavorra da differenza di potenza: Δkw/t ${round2(dKw)}. ${dati}. Da verificare in pista`,
          });
          continue;
        }
        proposte.push({
          preset: v.preset, auto: label, ballastKg: kg, restrictorPct: pct, fonte: 'paddock',
          note: `${oggi} · Δkw/t ${round2(dKw)} (${cat.kw_per_t} vs base ${baseCat.kw_per_t}) × pendenza classe ${cal.k.toFixed(3)} %/kw·t (calibrata sui ${cal.punti.length} valori misurati in pista da Mauro, max scarto ${cal.scartoMax} punti) · zavorra ${kg}kg da convenzione ${convKg}kg×massa${cat?.mass != null && baseCat.mass ? ` (${cat.mass}/${baseCat.mass})` : ' (masse non disponibili: convenzione piena)'} · PUNTO DI PARTENZA: la prima gara con griglia-calib decide se regge. ${dati}`,
        });
      }
    }
    if (proposte.length || senzaNumero.length || escluse.length) {
      proposte.sort((a, b) => b.restrictorPct - a.restrictorPct || a.auto.localeCompare(b.auto));
      push(cal.k ? 'proposta' : 'senza-numero', { k: cal.k ?? null, scartoMax: cal.scartoMax ?? null, pendenzaMotivo: cal.motivo ?? null, proposte, senzaNumero, escluse });
    } else {
      push('pulita', { motivo: 'nessun buco: la finestra PI della classe è tutta coperta da regole' });
    }
  }
  return { classi: out };
}

/* ---------- scrittura (l'UNICO punto che tocca grid-classes.json) ---------- */
/**
 * Sostituisce SOLE le regole con fonte 'paddock' nelle classi toccate
 * (idempotente: al secondo giro si riscrivono le stesse). Le regole di Mauro
 * (senza fonte / fonte assente) NON si toccano mai. Backup prima di scrivere.
 */
export function scriviProposte(classes, esito, { file = classesFile() } = {}) {
  const tocche = (esito?.classi ?? []).filter((c) => c.stato === 'proposta' && c.proposte?.length);
  if (!tocche.length) return null;
  let backup = null;
  try {
    const bdir = join(dirname(file), 'backups');
    mkdirSync(bdir, { recursive: true });
    backup = join(bdir, `grid-classes.bak-classi-paddock-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    copyFileSync(file, backup);
  } catch { /* il backup non è vincolante: la scrittura è già atomica */ }
  for (const c of tocche) {
    const cls = classes.classi[c.id];
    const nuove = c.proposte;
    cls.regole = [
      ...(cls.regole ?? []).filter((r) => r.fonte !== 'paddock'),
      ...nuove,
    ];
  }
  writeJsonAtomic(file, classes);
  return { backup, scritte: tocche.flatMap((c) => c.proposte.map((p) => ({ classe: c.id, auto: p.auto, preset: p.preset, kg: p.ballastKg, pct: p.restrictorPct }))) };
}

/* ---------- CLI ---------- */
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const giallo = (s) => `\x1b[33m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rosso = (s) => `\x1b[31m${s}\x1b[0m`;

const FUNTITOLI = { proposta: 'buco con pendenza calibrata', 'senza-numero': 'buco SENZA numero (pendenza non derivabile)', pulita: 'nessun buco', 'non-derivabile': 'fuori dal perimetro del tool' };

export async function main(argv = []) {
  const apply = argv.includes('--apply');
  const jsonOut = argv.includes('--json');
  const only = argv.includes('--serie') ? (argv[argv.indexOf('--serie') + 1] ?? null) : null;

  const esito = { file: classesFile(), carsJson: carsJsonPath(), errore: null, classi: [] };
  try {
    const classes = JSON.parse(readFileSync(esito.file, 'utf8'));
    if (!esito.carsJson) {
      esito.errore = 'cars.json del server dedicato non trovato (env EVO_CARS_JSON per un percorso alternativo): senza PI del gioco non si definisce niente e il tool non inventa.';
    }
    let catCars = null;
    if (!esito.errore) {
      try {
        const { paddockCatalog } = await import('../src/paddock.mjs');
        const cat = paddockCatalog();
        if (cat?.ok) catCars = cat.cars;
      } catch { /* journal assente: si dichiara sotto */ }
      if (!catCars) {
        esito.errore = 'catalogo Paddock non trovato (giornale pd-catalog): Δkw/t indisponibile e la pendenza si calibrerebbe sul vuoto.';
      }
    }
    if (!esito.errore) {
      const carRaw = JSON.parse(readFileSync(esito.carsJson, 'utf8'));
      Object.assign(esito, proposteDaPaddock(classes, { carRaw, catCars, onlyId: only }));
      if (apply) esito.scritture = scriviProposte(classes, esito, { file: esito.file });
    }
  } catch (e) {
    esito.errore = `lettura fallita: ${e.message}`;
  }

  if (jsonOut) {
    console.log(JSON.stringify(esito, null, 2));
    return esito;
  }
  if (esito.errore) {
    console.error(`${rosso('⛔')} ${esito.errore}`);
    return esito;
  }
  let tot = 0;
  for (const c of esito.classi) {
    console.log(`\n${bold(c.id)}  ${dim(`[${FUNTITOLI[c.stato] ?? c.stato}]`)}${c.k != null ? dim(` k=${c.k.toFixed(3)}%/kw·t · max scarto dati ${c.scartoMax} punti`) : ''}`);
    if (c.motivo) console.log(`   ${dim(c.motivo)}`);
    if (c.pendenzaMotivo) console.log(`   ${dim(`pendenza: ${c.pendenzaMotivo}`)}`);
    for (const p of c.proposte) {
      tot++;
      console.log(`   ${c.k ? verde('+') : giallo('+')} ${bold(p.auto)} → ${p.ballastKg}kg / ${p.restrictorPct}%`);
      console.log(`${dim(`      ${p.note}`)}`);
    }
    for (const s of c.senzaNumero) console.log(`   ${giallo('·')} ${s.auto}  ${dim(s.motivo)}`);
    for (const s of c.escluse) console.log(`   ${dim(`— ${s.auto}: esclusa (escludiAuto di Mauro)`)}`);
  }
  const nScritte = esito.scritture?.scritte?.length ?? 0;
  if (nScritte) {
    console.log(`\n${verde(`✓ ${nScritte} regole scritte in ${esito.file}`)}${esito.scritture.backup ? dim(` (backup: ${esito.scritture.backup})`) : ''}`);
  } else if (apply) {
    console.log(`\n${dim('niente da scrivere: le regole reali coprono già la finestra')}`);
  } else if (tot > 0) {
    console.log(`\nper scrivere (${tot} proposte): ${bold('node tools/classi-da-paddock.mjs --apply')}${dim(' — senza --apply nessun file cambia')}`);
  } else {
    console.log(`\n${dim('nessuna proposta in questa classe: nessun file cambia')}`);
  }
  return esito;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((esito) => process.exit(esito?.errore ? 1 : 0))
    .catch((e) => { console.error(e); process.exit(1); });
}
