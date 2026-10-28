// tools/_genera-stili.mjs — GENERATORE dei campionati per STILE (28/10) —
// TU/mix RISCHIOuMIX: pescaggio COMPLETAMENTE RANDOM a traverso il catalogo,
// mono e multiclasse allo stesso livello (richiesta Mauro 28/10 sera:
// «a questi devi mischiare tutto, anche le mono e multiclasse stesso livello,
// un miscuglio quello che pesca sarà completamente random»).
//
// I cinque campionati non sono più pool «per stile»: ogni livello L2..L6
// prende in prestito una finestra PI e SORTEGGIA a sorte tutto ciò che la
// abita — stradali, Cup, GT2, GT3, campioni d'epoca — tramite un rand
// seminabile. La convalida religiosa resta la pista: griglia-calib con
// ramo-C regola-classe sistematica e ramo C-bis (esclusione solo a gara
// provata). A ogni generazione un miscuglio NUOVO (record il seme!). Con
// `--seed N` esatto riesce identico.
//
// Il CANONICO dell'estratto è:
//   • fonte: cars.json del DEDICATED SERVER (presets che EVO nota), stessa
//     di grid-tune --propose. I preset si raggruppano per MODELLO e il
//     riscontro nel LADDER avviene sul display_name contenuto (non a mano:
//     niente campi, niente "era")
//   • la finestra PI per LIVELLO e finisce con la poolAuto della classe che
//     sceglie non-base. Il base PI del pool formula le regole: 100kg fisse,
//     pendenza ΔPI×25 (calibrata 19/10 sulla classe 8–9), arrotondate a .5,
//     cap 20 (lezione 27/10: mai oltre)
//   • il calendario SOLO piste dichiarate dal ladder
//
// uso: node tools/_genera-stili.mjs --dry            → solo il piano, niente scritture
//      node tools/_genera-stili.mjs                  → genera e scrive (backup)
//      node tools/_genera-stili.mjs --seed 42        → riproduce un pescaggio
//      node tools/_genera-stili.mjs --rigenera       → rimpiazza le classi/nodi dei
//           CINQUE già nati dal generatore (MAI classi scritte a mano come
//           campionato_aperto o sport_moderno)
import { readFileSync, writeFileSync, copyFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..');
const CARS_JSON = 'E:/SteamLibrary/steamapps/common/Assetto Corsa EVO Dedicated Server/cars.json';
const LADDER_FILE = join(PROJECT, 'config', 'career.evo.ladder.json');
const CLASSES_FILE = join(PROJECT, 'data', 'grid-classes.json');

const PENDENZA = 25;      // % per punto PI — calibrata il 19/10 sulla classe 8–9
const BALLAST_STD = 100;  // convenzione di Mauro: zavorra fissa
const CAP_PCT = 20;       // cap del gioco (lezione 27/10: mai oltre il 20%)
const BANDA_PI = 1.3;     // larghezza della banda di pescaggio: span ≈1.3 PI
                          // → la formula sta sotto il cap 20 (Δ≤0.8) e i
                          // fuori scala il cap li nota, come da costituzione

/* I CINQUE LIVELLI. Le finestre non descrivono più uno stile ma il BANDO del
   livello: dentro ci sta TUTTO ciò che quel mese gira col prelievo — stradali,
   trackday, una Cup, una GT2... «stesso livello»: anche F1 Libya (PI 41+
   e Irresso F2004) resta fuori, il cap 20 non copre quel divario — e la
   costituzione del 28/10 la convalida con ramo C-bis, come già fatto per
   la R7 Kyalami. Goldberg (0.9.1) lascia l'armonica autogestita. */
const LIVELLI = [
  {
    id: 'campionato_epoca', display: 'Campionato Epoca',
    discipline: 'strada', profile: 'historic', points: 'club',
    level: 2, repRequired: 90, gridSize: 14, ai: [80, 90],
    econ: { phase: 2, disc: 'strada', buy: 36000, rent: 1200, entry: 450, prize: 3600, champion: 6000, model: 'heritage', icon: '' },
    finestra: [7.2, 10.3],
    nModelli: 8,
    // calendari: ritmatura ALTERNATA misto↔veloce (rev 28/10, Mauro: pagelle
    // dei pezzi lunghi alternati alle tecnico-mistiche di ogni gara)
    calendar: ['brands_hatch', 'monza', 'oulton_park', 'imola'],
    nota: "Finestra PI 7.2–10.3: pescaggio completamente random di livello L2 — sports stradali, hot hatch, Cup leggere: mono e multiclasse messe alla stanga con la stessa lotteria.",
  },
  {
    id: 'campionato_moderno', display: 'Campionato Moderno',
    discipline: 'touring', profile: 'sprint', points: 'club',
    level: 3, repRequired: 150, gridSize: 14, ai: [85, 95],
    econ: { phase: 3, disc: 'touring', buy: 50000, rent: 2400, entry: 1000, prize: 7000, champion: 11000, model: 'pocket', icon: '' },
    finestra: [9.3, 11.6],
    nModelli: 7,
    calendar: ['suzuka', 'monza', 'laguna_seca', 'spa'],
    nota: "Finestra PI 9.3–11.6: pescaggio random L3 — Cup, GT moderne leggere, sportive d'epoca veloci, tutto insieme: la sorte decide, il bilancio di griglia-calib sistema.",
  },
  {
    id: 'campionato_strada', display: 'Campionato Strada',
    discipline: 'strada', profile: 'sprint', points: 'club',
    level: 4, repRequired: 450, gridSize: 14, ai: [87, 98],
    econ: { phase: 4, disc: 'strada', buy: 62000, rent: 3000, entry: 1200, prize: 8000, champion: 13000, model: 'pocket', icon: '' },
    finestra: [11.0, 13.5],
    nModelli: 7,
    calendar: ['paul_ricard', 'laguna_seca', 'monza', 'road_atlanta'],
    nota: "Finestra PI 11.0–13.5: pescaggio random L4 — omologate, Cup stradali, GT: categoria ignota, PI uguale per tutti.",
  },
  {
    id: 'campionato_pista', display: 'Campionato Pista',
    discipline: 'touring', profile: 'sprint', points: 'club',
    level: 5, repRequired: 800, gridSize: 14, ai: [89, 100],
    econ: { phase: 5, disc: 'touring', buy: 96000, rent: 4800, entry: 2400, prize: 12000, champion: 20000, model: 'sponsor', icon: '' },
    finestra: [12.5, 17.1],
    nModelli: 6,
    calendar: ['redbull_ring', 'watkins_glen', 'sebring', 'circuit_of_the_americas'],
    nota: "Finestra PI 12.5–17.1: pescaggio random L5 — trackday, Cup da corsa, GT2: la griglia miscchia tipi, non stili.",
  },
  {
    id: 'campionato_corsa', display: 'Campionato Corsa',
    discipline: 'gt', profile: 'feature', points: 'sro_gtwc',
    level: 6, repRequired: 1200, gridSize: 14, ai: [90, 101],
    econ: { phase: 6, disc: 'gt', buy: 420000, rent: 34000, entry: 5000, prize: 34000, champion: 100000, model: 'sponsor', icon: '' },
    finestra: [14.5, 21.4],
    nModelli: 5,
    calendar: ['spa', 'kyalami', 'fuji', 'mount_panorama'],
    nota: "Finestra PI 14.5–21.4: pescaggio random L6 — GT2, GT3, Cup di fabbrica al massimo: il seme di questo tiro è scritto nella classe, a ogni generazione un miscuglio diverso.",
  },
];

// Gli id POSSEDUTI dal generatore (campionato_epoca/moderno/strada/pista/corsa):
// --rigenera sostituisce SOLO questi — mai le classi scritte a mano
// (campionato_aperto, sport_moderno, hyper_road...): la verifica è la `storia`
// della classe, che deve portare «_genera-stili» (controllo sotto, dopo il catch).

/* ---------- DNS dell'archivio: rand seminabile (mulberry32) ---------- */
function rngDa(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- FONTE: modelli dal catalogo, riconosciuti nel ladder ---------- */
const normLc = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** Raggruppa i preset per MODELLO e riscontra il gruppo nel ladder
 *  (contentNames.cars). Kivs: modelli MULTI-CONFRONTO, match a caso con
 *  tie-break sul contenimento NETTO. Ritorna [{ id, nome, presets }],
 *  ordinata per PI minimo. */
function modelliDalCatalogo(catalogo, contentNames) {
  const famiglie = new Map();  // display "Abarth 695..." → presets[]
  for (const c of catalogo.cars ?? []) {
    const k = String(c.display_name ?? c.name).split(' - ')[0];
    if (!famiglie.has(k)) famiglie.set(k, []);
    famiglie.get(k).push(c);
  }
  const nomLadder = Object.entries(contentNames ?? {});
  const usati = new Set();     // un modello del ladder: UNA sola famiglia (contenimenti inca)
  const lista = [];
  for (const [d, ps] of [...famiglie.entries()].sort((a, b) => b[1].length - a[1].length)) { // le grandi prima
    const nd = normLc(d);
    let hit = null;
    // corrispondenza: identità > inclusione con garden-pick. La famiglia più
    // popolata vince l'id più generico, le specializzate prendono il resto.
    for (const [id, dn] of nomLadder) {
      if (usati.has(id)) continue;
      const n = normLc(dn);
      if (!n || !nd) continue;
      if (n === nd || (n.includes(nd) && nd.length >= 6) || (nd.includes(n) && n.length >= 6)) { hit = id; break; }
    }
    if (!hit) continue;      // famiglia non nota al ladder: fuori dal pescaggio
    usati.add(hit);
    lista.push({ id: hit, nome: contentNames[hit] ?? hit, presets: ps.map((p) => [p.name, p.performance_indicator]) });
  }
  return lista.map((m) => {
    const pis = m.presets.map((x) => x[1]);
    return { ...m, piMin: Math.min(...pis), piMax: Math.max(...pis) };
  }).sort((a, b) => a.piMin - b.piMin);
}

/* ---------- PESCAGGIO: sorte selettiva per finestra ---------- */
/** I modelli la CUI PI MINIMA casca nella finestra del livello: l' «entrata»
 *  è il bando del livello (il pieno nel TRASVOLI che il seme decide). */
function candidati(modelli, [piMin, piMax]) {
  return modelli.filter((m) => m.piMin >= piMin - 1e-9 && m.piMin <= piMax + 1e-9);
}
/** Estrazione a sorteggio: pesca nModelli distinte, MAI la stessa família. */
function pesca(candid, n, rand) {
  const sacco = [...candid];
  for (let i = sacco.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [sacco[i], sacco[j]] = [sacco[j], sacco[i]];
  }
  return sacco.slice(0, Math.min(n, sacco.length)).sort((a, b) => a.piMin - b.piMin);
}

/* ---------- 1) regole da catalogo, formula 19/10 (già pescato in pool) ---------- */
function proposteStile(prelevati, livello) {
  const piFin = livello.finestra;
  const lista = [];
  for (const m of prelevati) {
    for (const [preset, pi] of m.presets) lista.push({ id: m.id, preset, pi, display: m.nome });
  }
  // display DIFFERENTI per ogni preset («Standard», «Mech 2»): la regola descrive
  // il preset (auto = modello), la determinazione della base la regge il PI di preset
  const base = lista.reduce((a, b) => (b.pi < a.pi ? b : a));
  const regole = [];
  for (const r of lista.sort((a, b) => b.pi - a.pi)) {
    const dPI = r.pi - base.pi;
    if (r.preset === base.preset) {
      regole.push({ preset: r.preset, auto: r.display, ballastKg: 0, restrictorPct: 0 });
      continue;
    }
    if (dPI <= 0.02) {
      regole.push({ preset: r.preset, auto: r.display, ballastKg: 0, restrictorPct: 0,
        nota: `variante alla stessa PI della base (${r.pi.toFixed(3)}): 0/0, la stessa legge giusta della base` });
      continue;
    }
    const pct = Math.min(CAP_PCT, Math.round(dPI * PENDENZA * 2) / 2);
    const reg = { preset: r.preset, auto: r.display, ballastKg: BALLAST_STD, restrictorPct: pct };
    const fuori = r.pi > piFin[1] || r.pi < piFin[0];
    if (fuori || pct >= CAP_PCT) {
      reg.nota = fuori
        ? `variante fuori dalla finestra del livello (${r.pi.toFixed(3)}) → cap ${CAP_PCT} come l'Escort (lezione 27/10); la prima gara decide`
        : `formula Δ${dPI.toFixed(3)}×25=${+(dPI * PENDENZA).toFixed(1)}% → cap ${CAP_PCT}; la prima gara decide`;
    }
    regole.push(reg);
  }
  return { regole, base, span: Math.max(...lista.map((x) => x.pi)) - base.pi };
}

/* ---------- 2) nodo ladder con calendario dichiarabile ---------- */
function nodoStile(namesTrack, livello, prelevati) {
  const nome = (id) => namesTrack[id] ?? id;
  const calendario = livello.calendar.map((t, i) => ({
    track: t,
    name: `${nome(t)} - ${i === livello.calendar.length - 1 ? 'Finale' : `Round ${i + 1}`}`,
    laps: 3,
    hour: 12 + i,
    weather: [0, 2, 1, 4][i % 4],
  }));
  return {
    nodeId: livello.id, display: livello.display, discipline: livello.discipline, level: livello.level,
    access: 'rep', requires: null, points: livello.points, profile: livello.profile,
    gridSize: livello.gridSize, ai: livello.ai, econ: livello.econ,
    cars: prelevati.map((m) => m.id), calendar: calendario, repRequired: livello.repRequired,
  };
}

const STRUTTURA = (livello, { regole, base, span }, prelevati, seed) => ({
  id: livello.id,
  note: `${livello.nota} Pescaggio a sorte (seed=${seed}) su ${prelevati.length} modelli — ${prelevati.map((m) => m.nome).join(', ')}. Base=${base.display} (PI ${base.pi.toFixed(3)}) span ΔPI ${span.toFixed(3)}: PUNTO DI PARTENZA, la prima gara con griglia-calib decide (ramo C regola-classe attivo da subito). Copertura completa dei preset del pool (lezione 28/10: ogni preset pescato deve avere una regola). Niente aiStandard: banda dal ladder (${livello.ai[0]}–${livello.ai[1]}).`,
  autoBase: base.display,
  piMin: livello.finestra[0],
  piMax: livello.finestra[1],
  poolAuto: prelevati.map((m) => m.id),
  regole,
  LIMITI_GIOCO: { ballastMaxKg: 100, restrictorMaxPct: 20 },
  storia: [{
    data: new Date().toISOString().slice(0, 10),
    variante: `nascita: generata da tools/_genera-stili.mjs (miscuglio completamente random, mono+multiclasse, seed=${seed})`,
    nota: 'prima gara nera (nessun override per pista): la calibrazione parte al giro 1.',
  }],
});

/* ---------- 3) CLI ---------- */
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const rigenera = args.includes('--rigenera');
const seedArg = args.includes('--seed') ? Number(args[args.indexOf('--seed') + 1]) : null;
const seed = Number.isFinite(seedArg) ? seedArg : Math.floor(Math.random() * 1e9);
const rand = rngDa(seed);

const LADDER = JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
const CLASSI = JSON.parse(readFileSync(CLASSES_FILE, 'utf8'));
const catalogo = JSON.parse(readFileSync(CARS_JSON, 'utf8'));
if (!catalogo?.cars?.length) throw new Error('cars.json del server non leggibile');

const modelli = modelliDalCatalogo(catalogo, LADDER.contentNames.cars);
if (!modelli.length) throw new Error('nessun modello del catalogo riconosciuto nel ladder: check contentNames');

const piano = [];
for (const livello of LIVELLI) {
  for (const t of livello.calendar) if (!LADDER.contentNames.tracks[t]) throw new Error(`pista ladder mancante: ${t} (${livello.id})`);
  const esisteClasse = !!CLASSI.classi[livello.id];
  const esisteNodo = LADDER.nodes.some((n) => n.nodeId === livello.id);
  if (!rigenera && (esisteClasse || esisteNodo)) throw new Error(`${livello.id} già esistente (il generatore non sovrascrive; usa --rigenera se è tuo)`);
  if (rigenera && !(esisteClasse || esisteNodo)) throw new Error(`--rigenera ma ${livello.id} non esiste`);
  if (rigenera && esisteClasse) {
    const nota = JSON.stringify(CLASSI.classi[livello.id]?.storia?.[0]?.variante ?? '');
    if (!nota.includes('_genera-stili')) throw new Error(`${livello.id} NON è del generatore: riscrittura rifiutata (proteggo le classi a mano)`);
  }
  // banda sorteggiata ANCORATA a un modello: prendo a sorte un candidato come
  // bocca di banda (mai nel vuoto delle deserte PI del catalogo, tipo il tratteggio
  // Cup→GT3) e i modelli di sopra fino a BANDA_PI. Risultato: miscuglio random
  // COMPLETAMENTE, ma GIOCABIILE: oltre il cap 20% nessuna zavorra recupera il
  // divario (lezione R5/Escort 27-28/10) — una banda da 5 PI scriverebbe mezza
  // griglia al cap con gare decise dal campionato, non dal pilota.
  const cand = candidati(modelli, livello.finestra);
  if (cand.length < 2) throw new Error(`${livello.id}: finestra PI ${livello.finestra.join('–')} ha solo ${cand.length} modelli — allargala`);
  let prelevati = null, banda = null;
  for (let tent = 0; tent < 5 && (!prelevati || prelevati.length < 2); tent++) {
    const anchor = cand[Math.floor(rand() * cand.length)];
    banda = [anchor.piMin - 1e-6, anchor.piMin + BANDA_PI];
    const dentro = cand.filter((m) => m.piMin >= banda[0] && m.piMin <= banda[1]);
    if (dentro.length >= 2) prelevati = pesca(dentro, livello.nModelli, rand);
  }
  if (!prelevati) throw new Error(`${livello.id}: 5 tentativi senza banda da ≥2 modelli — cambia seed`);
  // VARIETÀ garantita: con meno di 4 modelli il pescaggio è un duello, non un
  // miscuglio — estendo la banda a gradini (+0.35 PI) finché entro 2.2. Più
  // estensione = dei cap NOTATI in più (li decide la prima gara, come da
  // costituzione R5/Escort 28/10). Il seed rende tutto riproducibile.
  const bandaSorteggiata = [...banda];
  while (prelevati.length < 4 && banda[1] - banda[0] < 2.2) {
    const span = banda[1] - banda[0];
    banda[1] += 0.35;
    const entroAncora = candidati(modelli, banda).filter((m) => !prelevati.some((x) => x.id === m.id));
    const extra = pesca(entroAncora, Math.max(0, Math.min(livello.nModelli - prelevati.length, entroAncora.length)), rand);
    if (extra.length) prelevati = pesca([...prelevati, ...extra], livello.nModelli, rand);
    else banda[1] -= 0.35;   // nessuno in più: non primo altri gradini
    if (banda[1] - banda[0] === span) break;   // nulla da pescare in più
  }
  piano.push({ livello, prelevati, banda, bandaSorteggiata, ...proposteStile(prelevati, livello) });
}

function scrivi(file, dati) {
  const backup = `${file}.bak-stile-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  writeFileSync(`${file}.tmp`, JSON.stringify(dati, null, 2) + '\n');
  renameSync(`${file}.tmp`, file);
  console.log(`scritto: ${file} (backup ${backup.replace(/.*[/\\]/, '')})`);
}

if (dry) {
  console.log(`seed=${seed} (con --seed ${seed} riesce identico)\n`);
  for (const p of piano) {
    const bx = p.bandaSorteggiata.map((x) => x.toFixed(2)).join('–');
    const ex = p.banda.map((x) => x.toFixed(2)).join('–');
    console.log(`\n=== ${p.livello.display} (${p.livello.id}) · L${p.livello.level} · finestra ${p.livello.finestra[0]}–${p.livello.finestra[1]} · banda sorteggiata PI ${bx}${ex !== bx ? ` (estesa: ${ex})` : ''} · span ΔPI ${p.span.toFixed(3)} · pescati ${p.prelevati.length}/${p.livello.nModelli} modelli ===`);
    for (const r of p.regole) console.log(`  ${String(r.ballastKg).padStart(3)}kg  ${String(r.restrictorPct ?? 0).padStart(4)}%   ${r.preset.padEnd(28)} ${r.auto}${r.nota ? '  ·  ' + r.nota : ''}`);
    console.log(`  base=${p.base.display} · calendario ${p.livello.calendar.join(', ')} · AI ${p.livello.ai[0]}-${p.livello.ai[1]} · ${p.livello.econ.model}`);
  }
  console.log('\nDRY: niente scritto. Togli --dry per scrivere (con --rigenera sostituisce i cinque già nati).');
} else {
  for (const p of piano) {
    CLASSI.classi[p.livello.id] = STRUTTURA(p.livello, p, p.prelevati, seed);
    if (rigenera) {
      const i = LADDER.nodes.findIndex((n) => n.nodeId === p.livello.id);
      if (i >= 0) LADDER.nodes.splice(i, 1);
    }
    LADDER.nodes.push(nodoStile(LADDER.contentNames.tracks, p.livello, p.prelevati));
  }
  scrivi(CLASSES_FILE, CLASSI);
  scrivi(LADDER_FILE, LADDER);
  console.log(`seed=${seed}: generati (miscuglio random, mono+multiclasse) → ` + piano.map((p) => p.livello.id).join(', '));
  console.log('ripete identico con: node tools/_genera-stili.mjs --rigenera --seed ' + seed);
}
