// car-match.mjs — IL MATCH GRADUALE delle auto (26/10, importato dal Gufo
// Paddock: la sua findModel). Perché: il builder costruiva il pool con un
// confronto ESATTO (wantCars.has(carIdOf(cell))) — basta un preset rinominato
// da Kunos o un nome con l'accento di troppo e la serie si srotola. La catena
// graduale torna invece l'auto anche se:
//   • il nome è scritto diverso («1600 GT Apex» vs «1600GT-Apex (AE86)`);
//   • le cifre/parole cambiano di separatore;
//   • l'alias arriva dai dati («stevo2» ...).
// E i mancanti NON fanno più un errore cieco: nel log (data/match-auto.log)
// finiscono con i NOMI VERI che il gioco had on disc — same trick di Paddock:
// «auto della classe non trovate: X · auto del gioco: ...» e in un colpo si
// sistema la fonte dati.
//
// Le stesse quattro strade che già usa carInPool del vigia (car-pool.mjs), qui
// in versione generica: candidate possono essere qualunque cosa (stringhe
// nell'archivio, celle customgrid nel builder) e la chiave si decide col
// chiamante via keyOf.

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const normKey = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\u0300-\u036f/g, '')   // «é» → «e»: gli accenti cambiano a caso fra archivio, ladder e gioco
  .replace(/[^a-z0-9]/g, '');

/** Le parole lunghe ≥3 di un nome («GT», «AE86», «sprinter»…). Più corto
 *  non conta: «gt», «R» e quelle lì matchano qualsiasi cosa. */
export function wordsOf(s) {
  return (String(s ?? '').toLowerCase().match(/[a-zà-ú0-9]{3,}/g) ?? [])
    .map((w) => String(w));
}

/**
 * La catena graduale per UN nome richiesto.
 * candidates = [{ ... , keyOf: (c) => label|array }]; chi matcha meglio vince
 * (Paddock: a parità di tappa il nome più CORTO — l'auto più specifica, non la
 * too generica «Abarth» che contiene tutto).
 * aliases: { 'nome richiesto (lower)': 'alias con cui cercarlo anche' }.
 * Ritorna { hit, stage: 'esatta'|'contiene'|'parole'|'alias', label } o null.
 */
export function carMatch(name, candidates, keyOf, aliases = {}) {
  if (!name || !Array.isArray(candidates)) return null;
  const want = normKey(name);
  if (!want) return null;
  const labels = candidates.map((c) => {
    const raw = keyOf(c);
    const list = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : []);
    return list.map((l) => String(l));
  });

  // 1) esatta
  for (let i = 0; i < candidates.length; i++)
    for (const l of labels[i]) if (normKey(l) === want) return { hit: candidates[i], stage: 'esatta', label: l };

  // 2) contiene (in entrambe le direzioni, come motore e archivio si scrivono)
  const contenente = candidates.map((c, i) => ({ c, i, l: labels[i].find((l) => { const n = normKey(l); return n && (n.includes(want) || want.includes(n)); }) }))
    .filter((x) => x.l)
    .sort((a, b) => normKey(a.l).length - normKey(b.l).length)[0];
  if (contenente) return { hit: contenente.c, stage: 'contiene', label: contenente.l };

  // 3) TUTTE le parole (≥3) del nome richiesto dentro l'etichetta, comunque
  //    scritte — l'ordine non conta; vince come su, la parola più specifica.
  const parole = wordsOf(name);
  if (parole.length >= 2) {
    const perParole = candidates.map((c, i) => ({ c, i, l: labels[i].find((l) => { const n = normKey(l); return n && parole.every((p) => n.includes(p)); }) }))
      .filter((x) => x.l)
      .sort((a, b) => normKey(a.l).length - normKey(b.l).length)[0];
    if (perParole) return { hit: perParole.c, stage: 'parole', label: perParole.l };
  }

  // 4) ALIAS: si riprovano le tre tappe con l'alias del nome, se i dati lo
  //    dichiarano (map lower del nome richiesto → alias stringa).
  const alias = aliases[String(name).toLowerCase()];
  if (alias) {
    const viaAlias = carMatch(alias, candidates.filter((_c) => true), keyOf, {});
    if (viaAlias) return { ...viaAlias, stage: 'alias' };
  }
  return null;
}

/**
 * Il match graduale applicato al POOL della griglia: ogni nome del ladder
 * RIVENDICA TUTTE le celle che matcha. Primo tentativo (26/10) prendeva UNA
 * cella per nome — peccato che un template monomarca porta 6 varianti STESSA
 * auto: restava 1 cella e l'anti-crash del builder (celle uniche ≥ target)
 * spezzava la build che il vecchio filtro ESATTO passava (test del magazzino).
 * Lezioni: il builder fotocopia CELLE REALI (zero articolaire inventate,
 * lezione 20/10), e le celle byte-uniche NEL PIENO vanno tutte in pool.
 * Ritorna:
 *   { sel: [cell,…] (ordine template), perNome: [{ richiesto, trovato,
 *     stage }], mancanti: [richiesto,…], reali: [etichette del template] }
 */
export function matchPool(wantNames, cells, labelsOf, aliases = {}) {
  const richiesti = (Array.isArray(wantNames) ? wantNames : [...wantNames]).filter(Boolean);
  const cand = cells.map((b, i) => ({ b, i }));
  const presi = new Set();
  const perNome = [];
  for (const nome of richiesti) {
    const m = carMatch(nome, cand, (x) => labelsOf(x.b), aliases);
    if (m) {
      // TUTTE le celle che rispondono a QUESTO nome (il builder deve avere
      // tutto il pool: 6 varianti dell'auto restano 6, non 1).
      for (const x of cand) {
        const one = carMatch(nome, [x], (c) => labelsOf(c.b), aliases);
        if (one) presi.add(x.i);
      }
      perNome.push({ richiesto: nome, trovato: m.label, stage: m.stage });
    }
    else perNome.push({ richiesto: nome, trovato: null, stage: null });
  }
  const sel = [...presi].sort((a, b) => a - b).map((i) => cells[i]);
  const mancanti = perNome.filter((x) => !x.trovato).map((x) => x.richiesto);
  // i NOMI VERI del gioco (etichette distrinte delle celle del template):
  // vanno nel log insieme ai mancanti, per sistemare la fonte in un colpo.
  const reali = [...new Set(cells.flatMap((b) => {
    const raw = labelsOf(b);
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    return list;
  }).filter(Boolean).map((l) => String(l)))].slice(0, 400);
  return { sel, perNome, mancanti, reali };
}

/** Il log dei mancanti (data/match-auto.log): append datato, MAI throw — un
 *  log non deve bloccare la preparazione di una gara. Ritorna true se scritto. */
export function logMatch(dataDir, righe) {
  const lista = Array.isArray(righe) ? righe : [righe];
  if (!lista.length) return true;
  try {
    appendFileSync(join(dataDir, 'match-auto.log'),
      lista.map((r) => `[${new Date().toISOString().replace('T', ' ').slice(0, 16)}] ${r}`).join('\n') + '\n',
      'utf8');
    return true;
  } catch { return false; }
}
