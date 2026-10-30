// classi-gt.mjs — LA CLASSIFICAZIONE PER CLASSE, STILE 24H LE MANS
// (richiesta Mauro 28/10: «gare endurance con GT1, 2 e 3, poi calcolare le
//  posizioni tramite il nostro tool, style 24 Le Mans»).
//
// Le regole del progetto restano pietre: la POSIZIONE la dice il gioco
// (results.mjs; le penalità ufficiali sono già ricomputate da
// officialPositionOf e le DSQ escono in coda). Qui sopra c'è SOLO
// raggruppamento: ogni riga del risultato entra in una CLASSE (da un pezzo
// del nome dell'auto: «BMW M4 GT3» → GT3) e ogni classe compone il SUO
// podio, come a Le Mans: vincitore assoluto a parte, P1/P2/P3 di classe.
//
// Ordine dentro la classe = l'ordine ufficiale di gara già presente nelle
// righe (resultDetail le ordina con offSort: giri prima, poi tempo+penalità).
// Nessun raggruppamento utile (una classe sola o tutte sconosciute) → la
// funzione di riepilogo ritorna null e il rapporto resta com'era: nessun
// numero toccato, nessuna sezione vuota in fondo.
//
// Le regole di matching si sovrascrivono in data/classi-gt.json:
//   { "GT1": ["f40 lm", "f1 gtr"], "GT2": ["gt2"], ... }
// (per ora non esiste: valgono i DEFAULT qui sotto; un token assente in
//  ordine fa appendere in fondo le classi di prima nascita).

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGOLE_FILE = join(RADICE, 'data', 'classi-gt.json');

/** L'ordine con cui le classi compaiono nel rapporto: la griglia più
 *  veloce in testa. Le classi fuori da questo elenco finiscono in coda
 *  in ordine di nascita. */
export const ORDINE_CLASSI = ['Hypercar', 'LMP2', 'GT1', 'GT2', 'GT3', 'GT4'];

/**
 * Regole DEFAULT: un pezzo del nome dell'auto → il suo cluster.
 * Se gli indirizzi sono prima specificati nel JSON override, questi qui
 * non cambiano niente. La corrispondenza per i token di una parola è a
 * PAROLA INTERA (parole separate dal nome): «911 GT3 RS» porta il pezzo
 * «gt3» e va nel cluster GT3 — chi la vuole a parte nel proprio campo lo
 * scrive in data/classi-gt.json con «GT3 RS»: ["gt3 rs"] PRIMA di GT3.
 */
export function defaultRegole() {
  return {
    // Hypercar/LMP2 (28/10 sera, richieste Mauro per le endurance):
    // i prototipi davanti alla griglia. Il 963 (LMDH) è Hypercar,
    // «lmp2» e «oreca» restano LMP2.
    Hypercar: ['hypercar', '963', 'gr010', '499', 'v series'],
    LMP2: ['lmp2', 'oreca', 'aurus'],
    GT1: ['f40 lm', 'f1 gtr', 'diablo gtr', 'c7r'],
    GT2: ['gt2'],
    GT3: ['gt3'],
    GT4: ['gt4'],
  };
}

/** I regole di matching del PC: data/classi-gt.json se c'è, DEFAULT altrimenti. */
let _regole = null;
export function regolePerClasse() {
  if (_regole != null) return _regole;
  try {
    if (existsSync(REGOLE_FILE)) {
      const doc = JSON.parse(readFileSync(REGOLE_FILE, 'utf8'));
      if (doc && typeof doc === 'object' && !Array.isArray(doc) && Object.keys(doc).length) _regole = doc;
    }
  } catch { /* JSON malformato: valgono i DEFAULT, non si rompe il rapporto */ }
  if (_regole == null) _regole = defaultRegole();
  return _regole;
}

/** Azzera la cache dei regole (solo per i test). */
export function regoleClear() { _regole = null; }

/** Il nome dell'auto come lo si confronta: minuscolo, senza accenti, con solo
 *  lettere-numero come separatori — «McLaren F1 GTR» → «mc laren f1 gtr». */
const normCarClasse = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** La classe di UN'auto, per nome: qualsiasi pezzo combacia vince.
 *  Uscita sempre non-vuota: senza riscontro ritorna '-' (fuori classe). */
export function classeAuto(nomeCar, regole = null) {
  const clean = normCarClasse(nomeCar);
  if (!clean) return '-';
  const parole = new Set(clean.split(' '));
  for (const [classe, tokens] of Object.entries(regole ?? regolePerClasse())) {
    for (const t of tokens ?? []) {
      const norm = normCarClasse(t);
      if (!norm) continue;
      if (!norm.includes(' ')) { if (parole.has(norm)) return classe; }
      // token di più parole (es. «f40 lm»): containment con confini di parola
      if (clean.includes(` ${norm} `) || clean.startsWith(`${norm} `) || clean.endsWith(` ${norm}`)) return classe;
    }
  }
  return '-';
}

/**
 * I gruppi per classe di UN risultato già importato: entra la lista di righe
 * di resultDetail (rapporto-gara.mjs / catalog.mjs — con `car` nome e già
 * ordinate per offSort), esce { classi, gruppi } con gruppo =
 * { classe, righe: [...rows assegnate con posClasse = posizione di classe] }.
 * L'ordine dei gruppi segue ORDINE_CLASSI («Diversi» '-' sempre in fondo).
 */
export function classiGT(rows, regole = null) {
  const by = new Map();
  for (const r of rows ?? []) {
    const classe = classeAuto(r?.car, regole);
    if (!by.has(classe)) by.set(classe, []);
    by.get(classe).push(r);
  }
  const gruppi = [];
  for (const [classe, righe] of by) {
    gruppi.push({ classe, righe: righe.map((r, i) => ({ ...r, posClasse: i + 1 })) });
  }
  gruppi.sort((a, b) => {
    const ia = ORDINE_CLASSI.indexOf(a.classe);
    const ib = ORDINE_CLASSI.indexOf(b.classe);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.classe.localeCompare(b.classe);
  });
  return { classi: gruppi.map((g) => g.classe), gruppi };
}

/* ---------- le GRIGLIE del menu «Gara al volo» (31/10, «classi vive») ---------- */

/**
 * Il menu della griglia costruito dalle classi DAVVERO vive: entra il
 * raggruppamento delle auto del libro ladder `perClasse` (Map o oggetto
 * { classe: [id, …] }), esce la lista dei preset di griglia:
 *   • UNA riga monoclasse per ogni classe con almeno un'auto;
 *   • UNA multiclasse per OGNI combinazione di 2–4 classi vive
 *     (coppie, triple, quadruple — né hardcoded né morti: scendono e salgono
 *     col libro ladder del giorno);
 *   • con più di 4 classi vive, l'endurance INTERA (tutte le classi) in
 *     coda, che la misura a 4 non entra più nei loop.
 * Le classi escono in ordine stile 24 Le Mans (ORDINE_CLASSI; eventuali
 * classi personalizzate di data/classi-gt.json in coda, alfabetiche).
 * Nessun ramo male: perClasse vuoto o assente → [] (menu «personalizzata» soltanto).
 */
export function griglieConClassiVive(perClasse) {
  if (!perClasse) return [];
  const isMap = perClasse instanceof Map;
  const get = (cl) => [...(isMap ? (perClasse.get(cl) ?? []) : (perClasse[cl] ?? []))].filter(Boolean);
  const n = (cl) => get(cl).length;
  const vive = [
    ...ORDINE_CLASSI.filter((cl) => n(cl) > 0),
    ...(isMap ? [...perClasse.keys()] : Object.keys(perClasse))
      .filter((cl) => !ORDINE_CLASSI.includes(cl) && n(cl) > 0)
      .sort((a, b) => a.localeCompare(b)),
  ];
  const conti = (cls) => cls.map((cl) => n(cl)).join('+');
  const comb = (cls) => ({ nome: `${cls.join(' + ')} — multiclasse (${conti(cls)})`, pool: cls.flatMap((cl) => get(cl)) });
  const griglie = vive.map((cl) => ({ nome: `${cl} monoclasse (${n(cl)} auto)`, pool: get(cl) }));
  for (let size = 2; size <= Math.min(vive.length, 4); size++) {
    const cammina = (start, presi) => {
      if (presi.length === size) { griglie.push(comb(presi)); return; }
      for (let i = start; i < vive.length; i++) cammina(i + 1, [...presi, vive[i]]);
    };
    cammina(0, []);
  }
  if (vive.length > 4) griglie.push(comb(vive));       // l'endurance TUTTA, sempre in menu
  return griglie;
}

/**
 * Il riepilogo che il RAPPORTO mostra: serve ≥2 classi vere (non '-') per
 * valere lo spazio in pagina; altrimenti null e la sezione non esiste.
 * Il gruppo delle auto fuori dai cluster resta comunque distinto (classe
 * '-', «Diversi»), per non nascondere niente.
 */
export function riepilogoPerClasse(rows, regole = null) {
  const res = classiGT(rows, regole);
  const vere = res.gruppi.filter((g) => g.classe !== '-');
  if (vere.length < 2) return null;
  return res;
}
