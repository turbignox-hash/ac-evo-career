// state.mjs — la carriera salvata: soldi, reputazione, gate, classifica, difficoltà, mercato,
// più la vita fuori pista: contratti con obiettivi, sponsor dinamici, sfide, sigilli.
//
// Regole prese dal modello originario:
//  - gate per posizione: ogni serie chiede un piazzamento nei primi N in una serie inferiore;
//  - accesso open|closed: le serie di punta chiuse vogliono reputazione e contratto, non soldi;
//  - economia per serie: pocket | sponsor | factory | heritage, con acquisto, affitto,
//    iscrizione, premio per posizione e bonus titolo;
//  - difficolta' a strati: base + trim + offClass + offTrack, con un solo clamp su 70..120;
//  - trim adattivo: se il risultato e' lontano dall'atteso la proposta resta in attesa;
//    ogni consiglio di alzare/abbassare muove di ±1 (le fasce di posizione decidono solo se e verso dove)
//    finche' non la accetti o la rifiuti;
//  - contratti con clausole di stagione (life.mjs), sponsor a quota gara + missione,
//    sfide per round, sigilli permanenti: tutto registrato anche in flows.jsonl.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, gridFor, finishOrder, evolveWorld, pointsFor, skillToEvoSlider, clamp } from './world.mjs';
import { recordFlows } from './flows.mjs';
import { takeLastPair, tr } from './lang.mjs';
import { ensureLife, ensureContract, settleContract, sponsorFor, sigilDefs, checkSigils } from './life.mjs';
import { assignNextMemory, checkMemoryProgress, raceCrowdFor } from './memories.mjs';
import { publishNotice } from './gazzetta.mjs';
import { recordWarning } from './warnings.mjs';

// nido per-slot (24/10): rivals vive con la SUA carriera, il save 3 non incassa il campione del save 1
const RIVALS_FILE = join(slotDataDir(), 'rivals.json');

export const SAVE_VERSION = 1;

/** Gli SLOT di carriera (1..3): ognuno vive in un file suo e separato, per usare
 *  il tool con più piloti/utenti sullo stesso PC. Lo slot attivo è stabilito
 *  dalla variabile d'ambiente ACE_SLOT o dal flag --slot della CLI; il default
 *  è sempre lo slot 1 (i salvataggi vecchi restano invariati: slot 1 compatibile
 *  con le carriere esistenti).
 *    slot 1 → data/evo-career.save.json    (le carriere fatte fino ad oggi)
 *    slot 2 → data/evo-career.save-2.json
 *    slot 3 → data/evo-career.save-3.json */
export function savePath(slot) {
  const s = Math.max(1, Math.min(3, Math.floor(Number(slot) || 1)));
  return s === 1 ? "evo-career.save.json" : `evo-career.save-${s}.json`;
}

/** Il numero di slot attivo da env/flag; mai oltre 3. */
export function activeSlot(env = process.env) {
  return Math.max(1, Math.min(3, Math.floor(Number(env.ACE_SLOT) || 1)));
}

/* MODALITÀ «SENZA VINCOLI» (24/10, richiesta Mauro — 2° giro la stessa sera:
 * «reintroduci i soldi e la reputazione per i campionati», poi si riprende
 * con la build): se esiste data/senza-vincoli.json si aprono SOLO i
 * cancelletti a PIAZZAMENTO della scalata (i «servono il top N nella serie
 * montante); la REPUTAZIONE torna a contare e il DENARO torna a muoversi:
 * sedili comprati o affittati al prezzo vero, iscrizione di ronda pagata
 * anche al primo giro (chargeEntry). Il file viene ricontrollato ogni 5 s:
 * per TORNARE alla scalata vera al 100% basta cancellarlo. Restano a
 * pagamento anche gli acquisti in garage (mercato, ma quello era già così). */
const BASE_DATA_DIR = process.env.EVO_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const SENZA_VINCOLI_FILE = join(BASE_DATA_DIR, 'senza-vincoli.json');
let _senzaVincoliAt = 0;
let _senzaVincoli = false;
export function senzaVincoli() {
  const now = Date.now();
  if (now - _senzaVincoliAt > 5000) {
    // override esplicito da env: '1' = sempre ON, '0' = sempre OFF (i test della
    // scalata lo fissano a '0': descrivono il comportamento canonico)
    const env = process.env.EVO_SENZA_VINCOLI;
    _senzaVincoli = env != null ? env !== '0' : existsSync(SENZA_VINCOLI_FILE);
    _senzaVincoliAt = now;
  }
  return _senzaVincoli;
}

/* NIDO DEI REGISTRI PER-SLOT (24/10,requested da Mauro col save 3 vergine) —
 * rivals.json, archivio risultati, ledger e log di import, magazzino griglie,
 * snapshot customgrid, journal stagioni, backup del save e flussi appartengono
 * alla VITA di UNA carriera: fino a ieri erano tutti in data/ condivisi, e una
 * carriera nuova (es. simulare il PC amico) partiva con gli album del save 1
 * già pieni. Regola:
 *   slot 1 → data/                (le carriere fin qui non si spostano)
 *   slot 2-3 → data/slot-2|-3/    (nati vergini e RESTANO vergini)
 * Restano CONDIVISI le cose del PC o del progetto: grid-classes.json,
 * griglie-fabbrica, calibrazione AI, MoTec (EVO scrive per-PC), config, ladder,
 * errors.jsonl. */
export function slotDataDir(env = process.env) {
  const base = env.EVO_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const s = activeSlot(env);
  return s === 1 ? base : join(base, `slot-${s}`);
}
// partenza POVERA (visione "dalla 500"): la scalata si compra con i premie,
// non col pacchetto di benvenuto. I vecchi salvataggi non cambiano: è il valore
// usato solo da createCareer.
export const START_MONEY = 6000;

// guadagno di reputazione PER LIVELLO (a P1 si incassa ×1,5, poi sempre meno):
// scalata lenta — 30 gare circa di serie basse prima di toccare le GT3, come ZTA
const REP_GAIN = { 1: 5, 2: 7, 3: 10, 4: 13, 5: 17, 6: 22, 7: 28 };
const EXPECTED_POSITION_SHARE = 0.5;

export function nodeById(ladder, id) {
  const node = ladder.nodes.find((n) => n.nodeId === id);
  if (!node) throw new Error(`Serie sconosciuta: ${id}\nElenco: node ac-evo-career.mjs series`);
  return node;
}

export function disciplineName(ladder, id) {
  return ladder.disciplines.find((d) => d.id === id)?.name ?? id;
}

export function tierOf(ladder, level) {
  return ladder.tiers.find((t) => level >= t.fromLevel && level <= t.toLevel)?.name ?? '?';
}

/* ------------------------------------------------------------------ */
/* creazione e persistenza                                             */
/* ------------------------------------------------------------------ */

export function createCareer(ladder, { name, first, last, nation = 'ITA', discipline = null, seed = null }) {
  // la porta d'ingresso è la SERIE STARTER (la 500): la più povera e lenta della scala
  const startNode = discipline
    ? ladder.nodes.filter((n) => n.discipline === discipline && n.level === 1).sort((a, b) => a.nodeId.localeCompare(b.nodeId))[0]
    : (ladder.nodes.find((n) => n.nodeId === 'coppa_500') ?? ladder.nodes.find((n) => n.nodeId === 'coppa_citta'));
  if (!startNode) throw new Error(`Nessuna serie di livello 1 per la disciplina "${discipline}".`);
  const fullName = name ?? `${first} ${last}`;
  const parts = fullName.trim().split(/\s+/);
  return {
    version: SAVE_VERSION,
    // momento di nascita della carriera (24/10): la LAP CHART e lo storico setup
    // di MoTeC (per-PC) si filtrano da qua → un save vergine parte con il cruscotto
    // VERGINO, senza le sessioni telemetriche delle carriere precedenti. I save
    // vecchi non lo hanno e restano com'erano: vedono tutto.
    createdAt: Date.now(),
    driver: {
      name: fullName.trim(),
      first: first ?? parts[0],
      last: last ?? parts.slice(1).join(' '),
      nation,
    },
    money: START_MONEY,
    rep: 0,
    season: 1,
    node: startNode.nodeId,
    round: 0,
    titles: [],
    seasons: [],
    results: {},
    bestFinish: {},
    championships: {},
    // agenda a giorni (stile del modello originario): il primo sedile parte il giorno 1
    agenda: { day: 1 },
    seats: { [startNode.nodeId]: { day: 1, season: 1 } },
    world: createWorld(ladder, seed ?? fullName.trim().toLowerCase()),
    difficulty: { mode: 'adaptive', base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], pending: null },
    paidEntries: {},
    flowSeed: false,
    life: {},
    messages: [{ at: new Date().toISOString(), kind: 'info', text: `Carriera iniziata in ${startNode.display}. Soldi in tasca: ${START_MONEY}.` }],
    offers: [],
    pending: null,
  };
}

/**
 * Cambia il nome del pilota: deve combaciare con quello registrato dentro EVO,
 * altrimenti l'import non ti riconosce nel file di risultato.
 */
export function renameDriver(state, { name = null, first = null, last = null } = {}) {
  const before = state.driver.name;
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  state.driver.first = first ?? (parts[0] ?? state.driver.first);
  state.driver.last = last ?? (parts.slice(1).join(' ') || state.driver.last || '');
  state.driver.name = `${state.driver.first} ${state.driver.last}`.trim();
  return { before, after: state.driver.name };
}

export function loadState(file) {
  if (!existsSync(file)) {
    throw new Error(`Nessuna carriera in ${file}.\nComincia con: node ac-evo-career.mjs new --name "Il Tuo Nome" --nation ITA`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    recordWarning('state', 'salvataggio illeggibile (JSON rotto): ' + file, e?.message ?? null);
    throw new Error(`Il salvataggio in ${file} è corrotto o incompleto (JSON illeggibile).\n` +
      `I backup si trovano in data/backups/ (evo-career.save.bak-*.json): copia il più recente su evo-career.save.json per ripristinare.`);
  }
  if (!parsed.driver || typeof parsed.money !== 'number' || !Array.isArray(parsed.messages)) {
    recordWarning('state', 'salvataggio non valido (struttura incompleta): ' + file);
    throw new Error(`Il salvataggio in ${file} esiste ma non è una carriera valida (struttura incompleta).\n` +
      `Se hai un backup recente (data/backups/evo-career.save.bak-*.json), copia il più recente su evo-career.save.json.`);
  }
  // Migrazione del salvataggio: mai più "Ricomincia con new" per una versione passata.
  // Le differenze fra versioni vecchie si riconciliano con i backfill difensivi (??=)
  // sparsi nel motore; qui si riconcilia solo il numero di versione, con un messaggio
  // in cruscotto. Una versione PIÙ NUOVA dell'app invece si rifiuta senza toccare il file.
  const savedVersion = Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 0;
  if (savedVersion > SAVE_VERSION) {
    throw new Error(`Salvataggio di versione ${parsed.version}, scritto da un tool più nuovo di questo (${SAVE_VERSION}): il file non viene toccato. Aggiorna il tool, o riparti dal backup più recente in data/backups/.`);
  }
  // agenda a giorni e sedili delle serie iscritte: retrocompatibilità con i salvataggi vecchi
  if (!parsed.agenda || typeof parsed.agenda !== "object") parsed.agenda = { day: 1 };
  const dayNum = Number(parsed.agenda.day);
  parsed.agenda.day = Number.isFinite(dayNum) && dayNum >= 1 ? Math.floor(dayNum) : 1;
  if (!parsed.seats || typeof parsed.seats !== "object") parsed.seats = {};
  // migrazione carriere pre-agenda: la serie in corso diventa la prima iscrizione,
  // cosi' il calendario a giorni comincia subito con quel campionato (niente signup admin)
  if (parsed.node && !Object.keys(parsed.seats).length) {
    const oldLadder = (() => { try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'career.evo.ladder.json'), 'utf8')); } catch { return null; } })();
    const oldNode = oldLadder?.nodes?.find((n) => n.nodeId === parsed.node);
    let seatSeason = Number(parsed.season) || 1;
    if (oldNode) {
      const oldResults = (parsed.results?.[parsed.node] ?? []);
      let last = 0;
      for (const r of oldResults) if (Number(r.season) > last) last = Number(r.season);
      if (last && oldResults.filter((r) => Number(r.season) === last).length < oldNode.calendar.length) seatSeason = last;
    }
    parsed.seats[parsed.node] = { day: parsed.agenda.day, season: seatSeason };
  }
  if (savedVersion < SAVE_VERSION) {
    parsed.version = SAVE_VERSION;
    parsed.messages.push({ at: new Date().toISOString(), kind: 'info', text: `Salvataggio aggiornato alla versione ${SAVE_VERSION} (era ${savedVersion || 'senza numero'}): nessun dato toccato.` });
  }
  return parsed;
}

export function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  // scrittura atomica: prima su un file temporaneo, poi rename. Se il processo
  // muore a metà, al massimo rimane un .tmp orfano: il salvataggio vero resta
  // sempre integro (è la lezione di repair-20260924.mjs).
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  try {
    renameSync(tmp, file);
  } catch (e) {
    recordWarning('state', 'rename del salvataggio fallito: ' + tmp, e?.message ?? null);
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* gate e disponibilità delle serie                                    */
/* ------------------------------------------------------------------ */

export function gateStatus(ladder, state, node) {
  // senza vincoli: i cancelletti a PIAZZAMENTO si aprono (test libero delle
  // serie), ma la REPUTAZIONE richiesta resta un vero blocco (24/10 notte,
  // Mauro: soldi e reputazione reintrodotti per i campionati)
  const aperto = senzaVincoli();
  const reasons = [];
  let ok = true;
  const req = node.requires;
  if (req && !aperto) {
    const best = state.bestFinish[req.nodeId];
    const feeder = nodeById(ladder, req.nodeId);
    if (best == null) {
      ok = false;
      reasons.push(`serve un piazzamento nei primi ${req.top} in ${feeder.display} (mai corso)`);
    } else if (best > req.top) {
      ok = false;
      reasons.push(`miglior piazzamento in ${feeder.display}: P${best} (serve top ${req.top})`);
    }
  }
  if (node.repRequired && state.rep < node.repRequired) {
    ok = false;
    reasons.push(`reputazione ${state.rep}/${node.repRequired} per un contratto ufficiale`);
  }
  return { ok, reasons };
}

/**
 * Le serie a PARCO CHIUSO (access "closed") non si affittano e non si comprano:
 * ci si entra solo firmando il contratto di stagione, come le works team.
 * La reputazione richiesta diventa il minimo per sedersi al tavolo.
 */
export function isClosedNode(node) {
  return node.access === 'closed' || node.econ?.model === 'factory';
}

/* ------------------------------------------------------------------ */
/* classifica della serie                                              */
/* ------------------------------------------------------------------ */

function playerAsDriver(state) {
  return { driverId: 'player', name: state.driver.name, country: state.driver.nation, carNumber: 1 };
}

/** Classifica della serie: i punti dei rivali sono simulati con la loro banda, i tuoi sono i tuoi. */
export function standingsFor(ladder, state, node, season = state.season) {
  const grid = gridFor(state.world, ladder, node, season);
  const totals = new Map();
  const add = (id, pts) => totals.set(id, (totals.get(id) ?? 0) + pts);
  grid.forEach((s) => { totals.set(s.driverId, 0); });
  totals.set('player', 0);

  const mine = (state.results[node.nodeId] ?? []).filter((r) => r.season === season);
  const roundsPlayed = new Set(mine.map((r) => r.round));

  // la classifica conta solo le ronde GIÀ CORSE nel calendario a giorni:
  // una ronda a settimana dall'ancoraggio del sedile. Le ronde SALTATE (settimane
  // passate senza risultato tuo) restano contate per i rivali — tu prendi 0.
  // Niente più stagioni simulate al punto di 158 pt dopo una gara sola.
  const totalRounds = node.calendar.length;
  const seatDay = Number(state.seats?.[node.nodeId]?.day) || null;
  const today = Math.max(1, Math.floor(Number(state.agenda?.day) || 1));
  const elapsed = seatDay ? Math.floor((today - seatDay) / 7) + 1 : (mine.length ? Math.max(...mine.map((r) => r.round)) + 1 : 0);
  const upTo = Math.min(totalRounds, Math.max(0, elapsed));

  for (let r = 0; r < upTo; r++) {
    const mineRound = mine.find((x) => x.round === r);
    const player = mineRound
      ? { ...playerAsDriver(state, node), position: mineRound.position, dnf: mineRound.dnf }
      : null;
    const history = mine.filter((x) => x.round < r).sort((a, b) => a.round - b.round);
    const order = finishOrder(grid, node, season, r, player, ladder, history);
    for (const entry of order) {
      // gara NON disputata dal giocatore (ronda saltata): 0 punti — la classifica
      // di ZTA si fa severa: i rivali corrono, tu prendi zero. Niente
      // punti simulati per il sedile vuoto.
      const pts = entry.isPlayer
        ? (mineRound ? mineRound.points : 0)
        : pointsFor(ladder, node, entry.position, entry.dnf);
      add(entry.driverId, pts);
    }
    // punti COMPLETI stile del modello originario: giro veloce e pole valgono per tutti,
    // non solo per il giocatore. Nei round simulati il vincitore della gara porta
    // anche i bonus (come in pointsForPos); per il giocatore valgono i flag veri.
    if (roundsPlayed.has(r)) {
      const sys = ladder.pointsSystems[node.points];
      const topN = sys.flTopN || Infinity;
      if (mineRound?.fl && !mineRound.dnf && mineRound.position <= topN) add('player', sys.flPoint);
      if (mineRound?.pole && !mineRound.dnf) add('player', sys.polePoint);
      const simWinner = finishOrder(grid, node, season, r, null, ladder, history).find((e) => !e.dnf);
      if (simWinner && !simWinner.isPlayer) {
        if (sys.flPoint) add(simWinner.driverId, sys.flPoint);
        if (sys.polePoint) add(simWinner.driverId, sys.polePoint);
      }
    }
  }

  const rows = [];
  for (const [driverId, points] of totals) {
    if (driverId === 'player') continue;
    const seat = grid.find((s) => s.driverId === driverId);
    if (!seat) continue;
    rows.push({ driverId, name: seat.name, country: seat.country, points, archetype: seat.archetype, iconic: seat.iconic, hot: seat.hot, isPlayer: false });
  }
  const playerRound = mine.reduce((acc, r) => acc + r.points, 0);
  rows.push({ driverId: 'player', name: state.driver.name, country: state.driver.nation, points: playerRound, isPlayer: true, archetype: 'TU' });
  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  rows.forEach((row, i) => { row.position = i + 1; });
  return rows;
}

export function playerStanding(ladder, state, node, season = state.season) {
  return standingsFor(ladder, state, node, season).find((r) => r.isPlayer);
}

/* ------------------------------------------------------------------ */
/* difficoltà                                                          */
/* ------------------------------------------------------------------ */

const bandCenter = (node) => (node.ai[0] + node.ai[1]) / 2;

export function difficultyFor(ladder, state, node, track = null) {
  const d = state.difficulty;
  const base = d.base?.[node.nodeId] ?? bandCenter(node);
  const trim = d.trim[node.nodeId] ?? 0;
  const offClass = d.offClass[node.discipline] ?? 0;
  const offTrack = track ? (d.offTrack[track] ?? 0) : 0;
  const total = clamp(base + trim + offClass + offTrack, 70, 120);
  return { base, trim, offClass, offTrack, total, slider: skillToEvoSlider(total, ladder), locked: d.locked.includes(node.nodeId), mode: d.mode };
}

/** Proposta di correzione del trim, in attesa di conferma. */
export function proposeDifficulty(ladder, state, node, position, gridSize) {
  if (state.difficulty.mode !== 'adaptive' || state.difficulty.locked.includes(node.nodeId)) return null;
  const expected = Math.round(gridSize * EXPECTED_POSITION_SHARE);
  const delta = expected - position; // positivo = hai fatto meglio del previsto
  let change = 0;
  if (position === 1) change = 4;
  else if (position <= 3) change = 3;
  else if (position <= gridSize * 0.25) change = 2;
  else if (position >= gridSize) change = -4;
  else if (position >= gridSize - 2) change = -3;
  else if (position >= gridSize * 0.75) change = -2;
  if (change === 0) return null;
  // le fasce decidono solo se dare il consiglio e in che direzione: il passo è sempre ±1
  change = Math.sign(change);
  const current = state.difficulty.trim[node.nodeId] ?? 0;
  const next = clamp(current + change, -20, 20);
  if (next === current) return null;
  const pending = {
    nodeId: node.nodeId,
    track: node.calendar[state.round]?.track ?? null,
    from: current,
    to: next,
    reason: `P${position} su ${gridSize} (atteso intorno a P${expected}, scarto ${delta > 0 ? '+' : ''}${delta})`,
    at: new Date().toISOString(),
  };
  state.difficulty.pending = pending;
  return pending;
}

/* ------------------------------------------------------------------ */
/* economia                                                            */
/* ------------------------------------------------------------------ */

/** Quota del montepremi per posizione: 1.000 al vincitore, decrescente. Le prove iconiche pagano x1,5. */
export function prizeFor(node, position, gridSize, { iconicRound = false } = {}) {
  const factor = 1 / (1 + (position - 1) * 0.35);
  return Math.round(node.econ.prize * factor * (iconicRound ? 1.5 : 1));
}

/** La ronda è una prova iconica della serie (Le Mans, Sebring, Bathurst...)? */
export function isIconicRound(node, track) {
  if (!node.econ.icon || !track) return false;
  const wanted = String(node.econ.icon).toLowerCase();
  return String(track).toLowerCase().includes(wanted) || wanted.includes(String(track).toLowerCase());
}

export function entryFee(node) {
  return node.econ.entry ?? 0;
}

export function repGain(node, position, gridSize) {
  const base = REP_GAIN[node.level] ?? 10;
  const factor = position === 1 ? 1.5 : 1 / (1 + (position - 1) * 0.25);
  return Math.max(1, Math.round(base * factor * (1 + (gridSize - 12) * 0.01)));
}

/* ------------------------------------------------------------------ */
/* ingresso in una serie                                               */
/* ------------------------------------------------------------------ */

function garageCarForSeat(state, node) {
  // l'auto del garage che copre il pool della serie: la prima combaciante.
  // Match normalizzato (senza prefisso ks e senza segni), inclusione bidirezionale
  // come le statistiche del garage — così "ks_peugeot_205_t16" della serie
  // combacia con "peugeot_205_t16" del garage e col nome completo.
  const pool = (node.cars ?? []).map((c) => String(c).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^ks/, ''));
  if (!pool.length) return null;
  for (const g of state.garage?.cars ?? []) {
    const id = String(g.carId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^ks/, '');
    const name = String(g.carName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const p of pool) {
      if (!p) continue;
      if (p === id || p === name || p.startsWith(id) || id.startsWith(p) || name.startsWith(p) || p.startsWith(name)) return g;
    }
  }
  return null;
}

export function enterNode(ladder, state, node, { buy = false, force = false } = {}) {
  // la modalità «senza vincoli» (= cancelletti a piazzamento aperti, già
  // gestito dentro gateStatus) NON sorvola la reputazione e NON regala i
  // sedili: il denaro della scalata torna a muoversi (24/10 notte, revisione
  // Mauro «reintroduci i soldi e la reputazione per i campionati»)
  const gate = gateStatus(ladder, state, node);
  if (!gate.ok && !force) {
    throw new Error(`Sedile non disponibile in ${node.display}:\n  - ${gate.reasons.join('\n  - ')}\nUsa --force per forzare.`);
  }
  const closed = isClosedNode(node);
  const econ = node.econ;
  const buyPrice = closed ? 0 : (econ.buy ?? 0);
  if (closed) {
    // parco chiuso: il team ti mette a disposizione auto e posto (niente acquisti, niente affitto)
    pushMessage(state, `${node.display} è a parco chiuso: contratto ufficiale, la vettura te la danno loro.`, 'info');
  } else if (buy && buyPrice > 0) {
    if (state.money < buyPrice) throw new Error(`Servono ${buyPrice} per comprare il sedile, ne hai ${state.money}.`);
    state.money -= buyPrice;
    pushMessage(state, `Hai comprato il sedile in ${node.display} (-${buyPrice}).`, 'money');
  } else {
    const rent = closed ? 0 : (econ.rent ?? 0);
    const owned = rent > 0 ? garageCarForSeat(state, node) : null;
    if (owned) {
      // precedenza del garage: se il pool della serie ha un'auto che hai in garage,
      // la usi tu e il noleggio non esiste (l'usura la paga l'odometro del garage)
      pushMessage(state, `Il sedile in ${node.display} vai a sedere con la tua ${owned.carName} del garage: niente affitto (risparmiati ${rent}).`, 'money');
    } else if (rent > 0) {
      if (state.money < rent) throw new Error(`Servono ${rent} per l'affitto del sedile in ${node.display}, ne hai ${state.money}.`);
      state.money -= rent;
      pushMessage(state, `Hai affittato il sedile in ${node.display} (-${rent}).`, 'money');
    }
  }
  state.node = node.nodeId;
  // agenda: il sedile (nuovo o rinnovato) fissa la cadenza delle gare DA OGGI
  const list = state.results[node.nodeId] ?? [];
  let lastSeason = 0;
  for (const r of list) if (Number(r.season) > lastSeason) lastSeason = Number(r.season);
  const seatSeason = (lastSeason && list.filter((r) => Number(r.season) === lastSeason).length < node.calendar.length)
    ? lastSeason   // riprendi la campagna in corso (cambiare sedile non azzera la serie)
    : state.season;
  state.seats ??= {};
  state.agenda ??= { day: 1 };
  state.seats[node.nodeId] = { day: Math.max(1, Math.floor(Number(state.agenda.day) || 1)), season: seatSeason };
  const played = list.filter((r) => r.season === seatSeason);
  state.round = played.length ? Math.max(...played.map((r) => r.round)) + 1 : 0;
  if (state.round >= node.calendar.length) state.round = 0;
  // contratto di stagione: tre clausole con premio finale (uno per stagione+serie)
  const contract = ensureContract(ladder, state, node);
  if (contract) pushMessage(state, tr({ it: `Contratto ${node.display}: ${contract.clauses.map((c) => c.text).join('; ')}. Premio al rispetto: ${contract.payout} €`, en: `Contract ${node.display}: ${contract.clauses.map((c) => c.textEn ?? c.text).join('; ')}. Reward for compliance: ${contract.payout} €` }), 'info');
  return state;
}

/* ------------------------------------------------------------------ */
/* import del risultato di una gara                                    */
/* ------------------------------------------------------------------ */

function lapTimeMs(t) {
  const m = String(t ?? '').match(/^(\d+):(\d+)\.(\d+)$/);
  if (!m) return Infinity;
  return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]);
}

function ensureStats(state) {
  state.stats ??= { races: 0, wins: 0, podiums: 0, fastestLaps: 0, laps: 0, bestLaps: {} };
  state.stats.bestLaps ??= {};
  state.stats.poles ??= 0;
  return state.stats;
}

/** Statistiche di carriera aggregate, per la pagina Statistiche. */
export function careerStats(ladder, state) {
  const s = ensureStats(state);
  const all = [];
  for (const [nodeId, list] of Object.entries(state.results)) {
    for (const r of list) all.push({ ...r, nodeId });
  }
  all.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  const titles = state.titles ?? [];
  const seasonsTable = (state.seasons ?? []).slice().reverse();
  // piste più corse
  const byTrack = {};
  for (const r of all) if (r.track) byTrack[r.track] ??= { races: 0, wins: 0, bestLap: null };
  for (const r of all) {
    const t = byTrack[r.track];
    if (!t) continue;
    t.races += 1;
    if (!r.dnf && r.position === 1) t.wins += 1;
    if (!r.dnf && r.bestLap && (!t.bestLap || lapTimeMs(r.bestLap) < lapTimeMs(t.bestLap.time)))
      t.bestLap = { time: r.bestLap, car: r.car ?? null };
  }
  const tracks = Object.entries(byTrack)
    .map(([track, t]) => ({ track, display: ladder.contentNames?.tracks?.[track] ?? track, ...t }))
    .sort((a, b) => b.races - a.races);
  const dnfCount = all.filter((r) => r.dnf).length;
  // sala trofei: le prime volte e i record, letti dalla storia delle gare
  const tDisp = (r) => `${ladder.contentNames?.tracks?.[r.track] ?? r.track} · S${r.season} R${r.round + 1}`;
  const trophies = [];
  if (all.length) trophies.push({ icon: '🎬', label: tr({ it: 'Esordio', en: 'Debut' }), detail: tDisp(all[0]) });
  const firstPodium = all.find((r) => !r.dnf && r.position <= 3);
  if (firstPodium) trophies.push({ icon: '🥉', label: tr({ it: 'Primo podio', en: 'First podium' }), detail: `P${firstPodium.position} · ${tDisp(firstPodium)}` });
  const firstWin = all.find((r) => !r.dnf && r.position === 1);
  if (firstWin) trophies.push({ icon: '🏆', label: tr({ it: 'Prima vittoria', en: 'First win' }), detail: tDisp(firstWin) });
  const firstPole = all.find((r) => r.pole === true);
  if (firstPole) trophies.push({ icon: '⚡', label: tr({ it: 'Prima pole', en: 'First pole' }), detail: tDisp(firstPole) });
  const firstFL = all.find((r) => r.fl);
  if (firstFL) trophies.push({ icon: '⏱️', label: tr({ it: 'Primo giro veloce', en: 'First fastest lap' }), detail: tDisp(firstFL) });
  for (const t of titles) trophies.push({ icon: '👑', label: tr({ it: 'Titolo', en: 'Title' }), detail: tr({ it: `${t.display} · stagione ${t.season}`, en: `${t.display} · season ${t.season}` }) });
  const bestRecovery = all.filter((r) => Number.isFinite(r.gridPosition) && Number.isFinite(r.position))
    .map((r) => ({ r, gain: r.gridPosition - r.position })).sort((a, b) => b.gain - a.gain)[0];
  if (bestRecovery && bestRecovery.gain > 0) trophies.push({ icon: '🚀', label: tr({ it: 'Rimonta record', en: 'Record recovery' }), detail: tr({ it: `P${bestRecovery.r.gridPosition} → P${bestRecovery.r.position} (+${bestRecovery.gain}) · ${tDisp(bestRecovery.r)}`, en: `P${bestRecovery.r.gridPosition} → P${bestRecovery.r.position} (+${bestRecovery.gain}) · ${tDisp(bestRecovery.r)}` }) });
  let streakBest = 0, streakRun = 0;
  for (const r of all) {
    if (!r.dnf && r.position === 1) { streakRun += 1; streakBest = Math.max(streakBest, streakRun); }
    else streakRun = 0;
  }
  if (streakBest >= 2) {
    const end = all.filter((r) => !r.dnf && r.position === 1).slice(-streakBest);
    trophies.push({ icon: '🔥', label: tr({ it: `${streakBest} vittorie di fila`, en: `${streakBest} wins in a row` }), detail: end.map((r) => tDisp(r)).join(' · ') });
  }
  // rimonte e posizioni guadagnate: servono la griglia di partenza (dai rivali) e la gara
  const startMap = new Map();
  try {
    const store = JSON.parse(readFileSync(RIVALS_FILE, 'utf8'));
    for (const r of store.races ?? []) {
      const me = (r.grid ?? []).find((g) => g.isPlayer);
      if (me) startMap.set(`${r.season}|${r.nodeId}|${r.round}`, me.position);
    }
  } catch {}
  let comebacks = 0, ledLaps = 0, gained = 0, gainedN = 0;
  for (const r of all) {
    // griglia di partenza: prima la posizione salvata nell'entry (dalla qualifica),
    // poi il registro rivali (che però contiene l'ordine d'arrivo: solo riserva)
    const start = Number.isFinite(r.gridPosition) ? r.gridPosition : startMap.get(`${r.season}|${r.nodeId}|${r.round}`);
    if (start != null && !r.dnf && r.position) {
      gained += start - r.position; gainedN += 1;
      if (r.position < start) comebacks += 1;
    }
    if (!r.dnf && r.position === 1 && r.winnerLaps != null && r.laps != null && r.laps >= r.winnerLaps && r.winnerLaps > 0) ledLaps += 1;
  }
  return {
    totals: {
      races: s.races, wins: s.wins, podiums: s.podiums, fastestLaps: s.fastestLaps,
      laps: s.laps, titles: titles.length, dnf: dnfCount,
      podiumRate: s.races ? Math.round(s.podiums / s.races * 100) : 0,
      winRate: s.races ? Math.round(s.wins / s.races * 100) : 0,
      poles: s.poles,
      comebacks,
      ledAll: ledLaps,
      avgGain: gainedN ? Math.round((gained / gainedN) * 10) / 10 : null,
    },
    titles,
    seasons: seasonsTable.map((x) => ({ ...x, display: ladder.nodes.find((n) => n.nodeId === x.node)?.display ?? x.node })),
    bestLaps: Object.entries(s.bestLaps)
      .map(([track, rec]) => ({ track, display: ladder.contentNames?.tracks?.[track] ?? track, ...rec }))
      .sort((a, b) => a.display.localeCompare(b.display)),
    trophies,
    tracks,
    sigils: ensureLife(state).sigils.map((s) => ({ ...(sigilDefs(ladder).find((d) => d.id === s.id) ?? {}), ...s })),
    saga: all.slice().reverse().slice(0, 12).map((r) => ({
      season: r.season, round: r.round + 1,
      series: ladder.nodes.find((n) => n.nodeId === r.nodeId)?.display ?? r.nodeId,
      track: ladder.contentNames?.tracks?.[r.track] ?? r.track,
      position: r.dnf ? null : r.position, dnf: !!r.dnf, points: r.points, prize: r.prize,
    })),
    palmares: (state.seasons ?? []).map((s) => ({
      season: s.season,
      series: ladder.nodes.find((n) => n.nodeId === s.node)?.display ?? s.node,
      position: s.position, points: s.points, champion: !!s.champion,
      contract: (state.life?.contractHistory ?? []).find((c) => c.season === s.season)?.verdict ?? null,
    })),
    history: all.slice(-60).reverse().map((r) => ({
      season: r.season, round: r.round + 1, node: ladder.nodes.find((n) => n.nodeId === r.nodeId)?.display ?? r.nodeId,
      track: ladder.contentNames?.tracks?.[r.track] ?? r.track, position: r.dnf ? null : r.position,
      gridSize: r.gridSize, dnf: !!r.dnf, fl: !!r.fl, points: r.points, prize: r.prize,
      laps: r.laps ?? null, bestLap: r.bestLap ?? null, gapMs: r.gapMs ?? null, car: r.car ?? null,
    })),
  };
}

export function applyRaceResult(ladder, state, node, payload) {
  const { position, gridSize, dnf = false, fl = false, track = null, round = state.round, at = new Date().toISOString(),
    laps = null, winnerLaps = null, bestLap = null, totalTime = null, gapMs = null, car = null, carNumber = null, sectors = null, durationMin = null,
    penalty = null, rawPos = null, dsq = false, autoFuori = null } = payload;
  // VIGIA DEL PARCO AUTO (24/10, richiesta Mauro): la gara girata con un'auto
  // FUORI dal parco della serie (una classe multiclasse ha il poolAuto di
  // grid-classes.json, altrimenti valgono le node.cars del ladder) si registra
  // MA valendo ZERO: niente punti, niente premio, nessuna reputazione, la
  // vittoria non entra nei contatori di carriera e nei record personali.
  // La posizione resta nell'archivio — che rimane per vedere — ma il
  // campionato non lo paga.
  const fuori = !!autoFuori;
  // round A TEMPO (durationMin>0, stile del modello originario): la "distanza" piena è la durata
  // del calendario e il premio scala con la distanza scelta (50% → metà premio)
  const distPct = [25, 50, 75, 100].includes(Number(state.raceSettings?.[node.nodeId]?.distPct)) ? Number(state.raceSettings[node.nodeId].distPct) : 100;
  node = { ...node, econ: { ...node.econ, prize: Math.max(1, Math.round((node.econ.prize ?? 0) * distPct / 100)) } };
  const points = fuori ? 0 : pointsFor(ladder, node, position, dnf);
  const iconicRound = isIconicRound(node, track ?? node.calendar[round]?.track);
  const prize = dnf || fuori ? 0 : prizeFor(node, position, gridSize, { iconicRound });
  const rep = dnf ? 1 : fuori ? 0 : Math.round(repGain(node, position, gridSize) * (iconicRound ? 1.25 : 1));
  state.results[node.nodeId] ??= [];
  const existing = state.results[node.nodeId].find((r) => r.season === state.season && r.round === round);
  const entry = { season: state.season, round, track, position, gridSize, dnf, fl, points, prize, rep, at,
    laps, winnerLaps, bestLap, totalTime, gapMs, car, carNumber, sectors, durationMin,
    penalty, rawPos, dsq,
    // il sigillo del vigia: auto fuori parco → l'Ufficio sport vedrà perché
    autoFuori: fuori ? { car: autoFuori?.car ?? null } : null };
  if (existing) Object.assign(existing, entry);
  else state.results[node.nodeId].push(entry);

  // statistiche di carriera: conteggi e record personali di pista
  if (!existing) {
    const s = ensureStats(state);
    s.races += 1;
    if (!dnf && !fuori) {   // fuori parco: zero statistiche di merito (niente vittoria, niente podio)
      s.laps += Number(laps ?? 0) || 0;
      if (position === 1) s.wins += 1;
      if (position <= 3) s.podiums += 1;
    }
    if (fl && !fuori) s.fastestLaps += 1;
    if (!dnf && !fuori && track && bestLap) {
      const rec = s.bestLaps[track];
      if (!rec || lapTimeMs(bestLap) < lapTimeMs(rec.time)) {
        s.bestLaps[track] = { time: bestLap, car, season: state.season, round, node: node.nodeId, at };
        pushMessage(state, tr({
          it: `Nuovo miglior giro personale a ${track}: ${bestLap} (${car ?? 'auto n/d'}).`,
          en: `New personal best lap at ${track}: ${bestLap} (${car ?? 'car n/a'}).`,
        }), 'good');
      }
    }
  }

  // registro flussi: il dottore ricostruisce da qui cassa e reputazione
  // (il seeding per carriere preesistenti avviene via ensureFlowsSeeded nel server e in CLI)
  if (prize) recordFlows(state, [{ kind: 'prize', money: prize, reason: `${node.display} R${round + 1}` }]);
  recordFlows(state, [{ kind: 'rep', rep, reason: `${node.display} R${round + 1}` }]);

  // sponsor dinamico: quota a gara + missione "podio entro il round N"
  let sponsorTotal = 0;
  const sp = sponsorFor(state);
  if (sp) {
    sponsorTotal += sp.perRace;
    sp.roundsPaid += 1;
    recordFlows(state, [{ kind: 'sponsor', money: sp.perRace, reason: `${sp.name} — quota gara` }]);
    if (!dnf && !fuori && position <= 3 && round <= sp.deadlineRound && !sp.missionDone) {
      sponsorTotal += sp.bonus;
      sp.missionDone = true;
      recordFlows(state, [{ kind: 'bonus', money: sp.bonus, reason: `${sp.name} — missione podio entro il round ${sp.deadlineRound + 1}` }]);
      pushMessage(state, tr({
        it: `Missione sponsor centrata: podio entro il round ${sp.deadlineRound + 1} (+${sp.bonus} da ${sp.name}).`,
        en: `Sponsor mission met: podium by round ${sp.deadlineRound + 1} (+${sp.bonus} from ${sp.name}).`,
      }), 'money');
    }
  }

  // FONDO SPETTATORI (audience del modello originario): le piste del mondo portano gente,
  // e lo sponsor paga una quota proporzionale al pubblico della pista (max +50%).
  let crowdBonus = 0;
  const crowd = raceCrowdFor(track ?? node.calendar[round]?.track);
  if (!dnf && crowd && sp) {
    const baseCrowd = sp.perRace + prize;
    crowdBonus = Math.round(baseCrowd * 0.10 * Math.min(5, Math.round(crowd / 20000)));
    if (crowdBonus > 0) {
      sponsorTotal += crowdBonus;
      recordFlows(state, [{ kind: 'sponsor', money: crowdBonus, reason: `${sp.name} — fondo spettatori (${Math.round(crowd / 1000)}k) ${ladder.contentNames?.tracks?.[track ?? node.calendar[round]?.track] ?? track ?? ''}` }]);
    }
  }

  state.money += prize + sponsorTotal;
  state.rep += rep;
  if (!dnf && !fuori) {   // fuori parco: il bestFinish della scalata non subisce benefici
    const best = state.bestFinish[node.nodeId];
    state.bestFinish[node.nodeId] = best == null ? position : Math.min(best, position);
  }
  if (state.pending && state.pending.node === node.nodeId && state.pending.round === round) state.pending = null;
  if (state.round <= round) state.round = round + 1;

  // agenda a giorni: finita la gara, il giorno del calendario avanza di 1
  state.agenda ??= { day: 1 };
  state.agenda.day = Math.max(1, Math.floor(Number(state.agenda.day) || 1)) + 1;

  const gapText = !dnf && Number.isFinite(gapMs) && gapMs != null && gapMs > 0
    ? (gapMs >= 60000 ? `+${Math.floor(gapMs / 60000)}'${String(Math.round((gapMs % 60000) / 1000)).padStart(2, '0')}"` : `+${(gapMs / 1000).toFixed(1)}"`)
    : null;
  // penalità e squalifica in vista: «il gioco le calcola, anche il tool» (Mauro 23/10)
  const posText = dsq ? tr({ it: 'squalifica', en: 'disqualified' }) : dnf ? tr({ it: 'ritiro', en: 'retired' }) : `P${position}`;
  const penText = !dsq && !dnf && penalty
    ? (rawPos && rawPos !== position
      ? ` · ${tr({ it: `penalità ${penalty} (da P${rawPos})`, en: `${penalty} penalty (from P${rawPos})` })}`
      : ` · ${tr({ it: `penalità ${penalty}`, en: `${penalty} penalty` })}`)
    : '';
  pushMessage(state, tr({
    it: `${node.display} · ${node.calendar[round]?.name ?? 'Round ' + (round + 1)}: ${posText}${penText}${gapText ? ' ' + gapText : ''}${fl && bestLap ? ` · giro veloce ${bestLap}` : ''} · +${prize} premio${iconicRound ? ' (prova iconica)' : ''} (+${sponsorTotal} sponsor) · +${rep} reputazione`,
    en: `${node.display} · ${node.calendar[round]?.name ?? 'Round ' + (round + 1)}: ${posText}${penText}${gapText ? ' ' + gapText : ''}${fl && bestLap ? ` · fastest lap ${bestLap}` : ''} · +${prize} prize${iconicRound ? ' (iconic race)' : ''} (+${sponsorTotal} sponsor) · +${rep} reputation`,
  }), dnf ? 'bad' : position <= 3 ? 'good' : 'info');
  // il comunicato del vigia — la UI non può più fingere di non sapere quale auto ha girato (24/10)
  if (fuori) {
    const parcoMsg = (autoFuori?.ammesse ?? []).slice(0, 5).join(', ') || null;
    pushMessage(state, tr({
      it: `🚫 Auto FUORI dal parco ammesso di ${node.display}: «${car ?? 'n/d'}»${parcoMsg ? ` — ammesse: ${parcoMsg}` : ''}. La gara è registrata come P${position} ma vale ZERO: 0 punti, 0 premio, 0 reputazione, e vittoria/podio non contano in carriera. Corri la prossima con una vettura della serie e quella paga.`,
      en: `🚫 Car OUTSIDE the series' pool at ${node.display}: «${car ?? 'n/a'}»${parcoMsg ? ` — allowed: ${parcoMsg}` : ''}. The race is recorded as P${position} but scores ZERO: 0 points, 0 prize, 0 reputation, win/podium don't count in the career. Run the next one with a series car and that one pays.`,
    }), 'bad');
  }

  const proposal = proposeDifficulty(ladder, state, node, dnf ? gridSize : position, gridSize);
  // memoria di famiglia in corso: la gara sta contando per l'impresa dell'antenato?
  try { checkMemoryProgress(ladder, state, { ...entry, nodeId: node.nodeId }); } catch { /* mai bloccare l'import */ }
  return { entry, proposal, sponsor: sponsorTotal, crowdBonus };
}

/* ------------------------------------------------------------------ */
/* fine stagione e mercato                                             */
/* ------------------------------------------------------------------ */

export function seasonEnd(ladder, state) {
  const node = nodeById(ladder, state.node);
  const table = standingsFor(ladder, state, node, state.season);
  const me = table.find((r) => r.isPlayer);
  const champion = me.position === 1;
  const bonus = champion ? (node.econ.champion ?? 0) : 0;

  state.championships[node.nodeId] ??= [];
  if (champion) {
    state.championships[node.nodeId].push(state.season);
    state.titles.push({ season: state.season, node: node.nodeId, display: node.display });
    state.money += bonus;
    pushMessage(state, tr({ it: `CAMPIONE di ${node.display} (stagione ${state.season})! Bonus titolo +${bonus}.`, en: `CHAMPION of ${node.display} (season ${state.season})! Title bonus +${bonus}.` }), 'title');
  } else {
    pushMessage(state, tr({ it: `Stagione ${state.season} in ${node.display} chiusa in P${me.position} con ${me.points} punti.`, en: `Season ${state.season} in ${node.display} closed in P${me.position} with ${me.points} points.` }), 'info');
  }
  state.seasons.push({ season: state.season, node: node.nodeId, position: me.position, points: me.points, champion });

  // eredità di famiglia: un titolo fresco (e nessuna memoria in corso) sblocca il capitolo successivo
  try { assignNextMemory(ladder, state); } catch { /* l'eredità non deve bloccare la chiusura */ }

  // contratto di stagione: clausole verificate, premio pagato o no
  const settle = settleContract(ladder, state, { recordFlows });
  if (settle) pushMessage(state, settle.text, settle.success ? 'good' : 'info');
  if (bonus) recordFlows(state, [{ kind: 'bonus', money: bonus, reason: `bonus titolo ${node.display}` }]);
  ensureLife(state).sponsor = null; // gli sponsor si rinegoziano ogni anno
  try {
    publishNotice(
      champion ? `Titolo di ${node.display} al ${state.driver.name}` : `Fine stagione in ${node.display}: P${me.position}`,
      settle ? settle.text : champion ? `Campionato chiuso con ${me.points} punti: il paddock se ne ricorderà.` : `Stagione chiusa con ${me.points} punti: si riparte con nuove ambizioni.`,
      { season: state.season, kind: 'season' },
    );
  } catch { /* la gazzetta non deve mai bloccare la chiusura */ }

  const offers = buildOffers(ladder, state, node);
  state.offers = offers;
  state.world = evolveWorld(state.world, ladder, state.season);
  state.season += 1;
  state.round = 0;
  return { table, me, champion, bonus, offers };
}

function buildOffers(ladder, state, currentNode) {
  const candidates = ladder.nodes
    .filter((n) => n.nodeId !== currentNode.nodeId)
    .filter((n) => gateStatus(ladder, state, n).ok)
    .filter((n) => !currentNode || n.level >= currentNode.level - 1);
  candidates.sort((a, b) => b.level - a.level || a.display.localeCompare(b.display));
  const offers = candidates.slice(0, 5).map((n) => ({
    nodeId: n.nodeId,
    display: n.display,
    level: n.level,
    discipline: n.discipline,
    access: n.access,
    rent: n.econ.rent,
    note: n.level > currentNode.level ? 'promozione' : 'cambio categoria',
  }));
  offers.push({
    nodeId: currentNode.nodeId,
    display: currentNode.display,
    level: currentNode.level,
    discipline: currentNode.discipline,
    access: currentNode.access,
    rent: currentNode.econ.rent,
    note: 'conferma',
  });
  return offers.map((o, i) => ({ ...o, index: i + 1 }));
}

export function acceptOffer(ladder, state, index) {
  const offer = state.offers.find((o) => o.index === index) ?? state.offers[index - 1];
  if (!offer) throw new Error(`Offerta ${index} non presente. Usa "messages" o "season-end" per vederle.`);
  const node = nodeById(ladder, offer.nodeId);
  enterNode(ladder, state, node, {});
  state.offers = [];
  pushMessage(state, `Contratto firmato con ${node.display} per la stagione ${state.season}.`, 'good');
  return node;
}

/* ------------------------------------------------------------------ */
/* effetti post-gara: duello di stagione, sigilli                      */
/* ------------------------------------------------------------------ */

/**
 * Chiamato dopo ogni import: aggiorna il "duello della stagione" (il rivale con
 * cui ti combatti la classifica) e controlla i sigilli. Ritorna cosa è successo.
 */
export function postRaceEffects(ladder, state, node) {
  const season = state.season;
  const myEntry = (state.results[node.nodeId] ?? []).find((r) => r.season === season && r.round === state.round - 1) ?? null;
  const rivalPts = new Map();
  try {
    const grid = gridFor(state.world, ladder, node, season);
    const roundsPlayed = new Set((state.results[node.nodeId] ?? []).filter((r) => r.season === season).map((r) => r.round));
    for (const s of grid) rivalPts.set(s.driverId, { name: s.name, pts: 0 });
    for (const rIdx of roundsPlayed) {
      const mine = (state.results[node.nodeId] ?? []).find((r) => r.season === season && r.round === rIdx);
      // anche qui la storia del pilota, così il duello usa le stesse regole della classifica
      const hist = (state.results[node.nodeId] ?? []).filter((r) => r.season === season && r.round < rIdx).sort((a, b) => a.round - b.round);
      const order = finishOrder(grid, node, season, rIdx, mine ? { ...playerAsDriver(state, node), position: mine.position, dnf: mine.dnf } : null, ladder, hist);
      for (const e of order) {
        const rp = rivalPts.get(e.driverId);
        if (rp) rp.pts += pointsFor(ladder, node, e.position, e.dnf);
      }
    }
  } catch { /* senza simulazione non c'è duello */ }
  const myPts = (state.results[node.nodeId] ?? []).filter((r) => r.season === season).reduce((a, r) => a + (r.points ?? 0), 0);
  let duello = null;
  for (const rp of rivalPts.values()) {
    const gap = Math.abs(myPts - rp.pts);
    if (!duello || gap < duello.gap) duello = { name: rp.name, gap, hisPoints: rp.pts, myPoints: myPts };
  }
  const L = ensureLife(state);
  if (duello) L.duel = { season, nodeId: node.nodeId, ...duello };
  const newSigils = checkSigils(ladder, state);
  return { duel: duello, newSigils, entry: myEntry };
}

/* ------------------------------------------------------------------ */
/* messaggi e sponsor                                                  */
/* ------------------------------------------------------------------ */

export function pushMessage(state, text, kind = 'info') {
  // Messaggio bilingue: se il testo viene da tr({it,en}), la coppia è consumata
  // da takeLastPair (lang.mjs). Guardia di combacenza: la coppia vale solo se
  // uno dei due lati è proprio il testo passato (niente coppie stantie di altro).
  const m = { at: new Date().toISOString(), kind, text };
  const pair = takeLastPair();
  if (pair && typeof pair.it === 'string' && (pair.it === text || pair.en === text)) {
    m.text = pair.it; // la lingua di nascita nel save resta l'italiano
    if (pair.en != null && pair.en !== pair.it) m.textEn = pair.en;
  }
  state.messages.push(m);
  if (state.messages.length > 60) state.messages = state.messages.slice(-60);
}

export function sponsorTier(state) {
  const s = sponsorFor(state);
  return s ? { name: s.name, bonus: s.perRace } : null;
}

export { gridFor, finishOrder, sigilDefs };
