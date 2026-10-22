// orario.mjs — L'OROLOGIO DELLE GARE: piani orari per round, notte e tramonto-alba.
//
// Richiesta di Mauro (21/10/2026): ora che il meteo e la pista sono scritti
// direttamente nei file di gioco, anche l'ORA si può comandare — nel
// gamemodesave di ogni sessione (prova/qualifica/warmup/gara) c'è il campo
// datetime (f4: anno, mese, giorno, ora) e il moltiplicatore tempo vive nel
// profilo della serie (già spinto nei consigli di race.mjs dallo state).
//
// Tre leve, per ROUND del calendario di una serie:
//   1. hour    → l'ora di partenza della GARA (le sessioni precedenti si
//                calcolano a ritroso col moltiplicatore, come già fa race.mjs)
//   2. scale   → moltiplicatore tempo del round (1..60): 48x = "dal tramonto
//                all'alba" in una gara di 3 giri
//   3. PIANI   → ricette pronte applicate a un range di round:
//                notte      : ore 1-3, scala bassa (2x) per stare nel buio
//                crepuscolo : partenza al tramonto (19-21 Con scale 8x) il
//                             ciclo giorno/notte attraversa l'intera gara
//                alba       : ore 4-6, il sole sale durante la sessione
//                variabile  : ad ogni round un orario diverso (rotazione
//                             deterministica per round, mai la stessa ora
//                             due round di fila)
//
// Il piano si SCRIVE nel calendario del ladder (career.evo.ladder.json), round
// per round, come hour/timeScale del round stesso: race.mjs li legge già.
// La scrittura del gamemodesave dell'orologio reale del gioco (la sync "a
// selezione fatta") resta al watcher, con lo stesso schema del meteo.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';
import { mkdirSync, copyFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LADDER_FILE = join(HERE, '..', 'config', 'career.evo.ladder.json');
const BACKUP_DIR = join(HERE, '..', 'data', 'backups');

/** I piani orari: nome → descrizione + generatore di (hour, timeScale). */
export const PIANI = {
  notte: {
    label: 'Gara di notte',
    desc: 'ore 01–03 + moltiplicatore 2x: tutta la gara nel buio, con fari.',
    orari: [1, 2, 3],
    scale: 2,
  },
  crepuscolo: {
    label: 'Dal tramonto alla notte',
    desc: 'partenza ore 19–21 + moltiplicatore 8x: la luce muore durante la gara.',
    orari: [19, 20, 21],
    scale: 8,
  },
  alba: {
    label: "L'alba in dolce attesa",
    desc: 'partenza ore 04–06 + moltiplicatore 10x: il sole sorge mentre lotti.',
    orari: [4, 5, 6],
    scale: 10,
  },
  tramontoalba: {
    label: 'Dal tramonto all\u2019alba (48x)',
    desc: 'ore 21 + moltiplicatore 48x: cicli completi giorno/notte in una gara.',
    orari: [21],
    scale: 48,
  },
  variabile: {
    label: 'Orari sempre diversi',
    desc: 'ad ogni round un\u2019ora diversa (rotazione deterministica), tempo 4x.',
    orari: [9, 12, 15, 18, 21, 0, 3, 6],
    scale: 4,
  },
  mattina: {
    label: 'Gara mattutina',
    desc: 'ore 09–11, tempo 2x: luce radente e pista asciutta.',
    orari: [9, 10, 11],
    scale: 2,
  },
};

/** Id del piano da nome o prefisso univoco ("tram" → tramontoalba).
 *  Ordine di risoluzione: chiave ESATTA → chiavi per PREFISSO → etichette.
 *  Il testo dell'etichetta si usa SOLO se le chiavi non hanno nulla da dire:
 *  evita l'ambiguità "tram" (chiave di tramontoalba) vs l'etichetta di
 *  crepuscolo "Dal tramonto alla notte" che contiene la stessa parola. */
export function pianoFor(name) {
  const s = String(name ?? '').trim().toLowerCase();
  if (!s) return null;
  if (PIANI[s]) return s;
  const prefissi = Object.keys(PIANI).filter((k) => k.startsWith(s));
  if (prefissi.length === 1) return prefissi[0];
  const label = Object.keys(PIANI).filter((k) => PIANI[k].label.toLowerCase().includes(s));
  return label.length === 1 ? label[0] : null;
}

/**
 * Il piano applicato a UN round (funzione pura): ritorna { hour, timeScale }
 * in base al piano e all'indice del round (per "variabile" e il reparto tra le
 * ore consentite del piano). Round 1-based? No: 0-based come il calendario.
 */
export function specForRound(pianoId, roundIdx, rounds = 6) {
  const p = PIANI[pianoId] ?? PIANI.variabile;
  if (pianoId === 'variabile') {
    // rotazione deterministica: ogni round prende l'ora successiva della lista,
    // con uno scarto di metà lista se il numero dei round lo permette (mai due
    // round di fila con la stessa ora)
    const step = rounds > p.orari.length ? 1 : 1;
    const hour = p.orari[(roundIdx * step) % p.orari.length];
    return { hour, timeScale: p.scale };
  }
  // i piani con finestra: round pari/inDispari ruotano dentro la finestra
  const hour = p.orari[roundIdx % p.orari.length];
  return { hour, timeScale: p.scale };
}

/**
 * Il piano applicato al calendario DI UNA SERIE: dai round [da..a] (0-based,
 * default tutto il calendario) scrive hour/timeScale secondo il piano.
 * dry=true non tocca nulla. Ritorna il report per riga di round.
 */
export function applyPianoToCalendar(ladder, nodeId, pianoId, { da = 0, a = null, over = null, dry = false, file = LADDER_FILE, backup = true } = {}) {
  const node = ladder.nodes?.find((n) => n.nodeId === nodeId);
  if (!node) throw new Error(`serie "${nodeId}" non trovata nel ladder`);
  if (!Array.isArray(node.calendar) || !node.calendar.length) throw new Error(`serie "${nodeId}" senza calendario`);
  const piano = pianoFor(pianoId) ?? (over ? null : null);
  if (!piano && !over) throw new Error(`piano "${pianoId}" non riconosciuto (usa: ${Object.keys(PIANI).join(', ')})`);
  const last = a == null ? node.calendar.length - 1 : Math.min(a, node.calendar.length - 1);
  const righe = [];
  for (let i = Math.max(0, da); i <= last; i++) {
    const r = node.calendar[i];
    const spec = over ?? specForRound(piano, i, node.calendar.length);
    const before = { hour: r.hour ?? null, timeScale: r.timeScale ?? null };
    if (!dry) {
      r.hour = spec.hour;
      if (spec.timeScale != null) r.timeScale = spec.timeScale;
      else delete r.timeScale;
    }
    righe.push({ round: i, name: r.name ?? `R${i + 1}`, piano: piano ?? 'override', prima: before, dopo: { hour: spec.hour, timeScale: spec.timeScale ?? null } });
  }    if (!dry) {
      if (backup) {
        try { mkdirSync(BACKUP_DIR, { recursive: true }); copyFileSync(file, join(BACKUP_DIR, `career.evo.ladder.bak-orario-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}.json`)); } catch { /* il backup non deve bloccare */ }
      }
      // Il ladder in ingresso può essere localizzato (EVO_LANG=en): rileggo la
      // base dal disco e sopra scrivo SOLO il calendario toccato, cosi' i testi
      // del file restanno sempre in lingua di origine.
      let toWrite = ladder;
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8'));
        const rawNode = raw?.nodes?.find((n) => n.nodeId === nodeId);
        if (rawNode && Array.isArray(rawNode.calendar)) rawNode.calendar = node.calendar;
        toWrite = rawNode ? raw : toWrite;
      } catch { /* niente base dal disco: scrive come prima */ }
      writeJsonAtomic(file, toWrite);
    }
  return { piano: piano ?? 'override', node: nodeId, dry, righe };
}

/* ---------------- CLI ---------------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--list') || args.length === 0) {
    console.log('Piani orari disponibili:');
    for (const [k, v] of Object.entries(PIANI)) console.log(`  ${k.padEnd(14)} ${v.desc}`);
    console.log('\nUso: node src/orario.mjs <piano> <nodeId> [--da N] [--a N] [--dry]');
    process.exit(0);
  }
  const [piano, nodeId] = args;
  const da = args.includes('--da') ? Number(args[args.indexOf('--da') + 1]) : 0;
  const a = args.includes('--a') ? Number(args[args.indexOf('--a') + 1]) : null;
  const dry = args.includes('--dry');
  const ladder = JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
  const rep = applyPianoToCalendar(ladder, nodeId, piano, { da, a, dry });
  for (const r of rep.righe) {
    console.log(`  R${r.round + 1} ${r.name}: ${r.prima.hour ?? '—'}h/${r.prima.timeScale ?? '—'}x → ${r.dopo.hour}h/${r.dopo.timeScale}x`);
  }
  console.log(`${dry ? '[dry] ' : ''}piano "${rep.piano}" su ${rep.node}: ${rep.righe.length} round toccati.`);
}
