// life.mjs — la vita fuori dalla pista: contratti con obiettivi, sponsor con
// ricorrenze, sfide per round, sigilli (sfide personali permanenti), maestria
// delle piste e pianificatore di carriera.
//
// Tutto deterministico dove conta (i payout vengono registrati anche nei FLOWS
// per il dottore) e tutto opzionale: senza questi dati la carriera funziona come prima.

import { nodeById, playerStanding, grigliaSimEstesa } from './state.mjs';
import { gridFor } from './world.mjs';
import { tr } from './lang.mjs';


/* ------------------------------------------------------------------ */
/* migrazione leggera del salvataggio                                  */
/* ------------------------------------------------------------------ */

export function ensureLife(state) {
  state.life ??= {};
  const L = state.life;
  L.contract ??= null;         // { nodeId, display, season, clauses[], payout, verdict:null|'kept'|'failed' }
  L.contractHistory ??= [];    // [{ season, display, verdict, payout }]
  L.sponsor ??= null;          // { name, tier, perRace, bonus, deadlineRound, takenRound, payout }
  L.challenge ??= null;        // { round, nodeId, text, reward, penalty, kind, target, verdict:null }
  L.sigils ??= [];             // [{ id, at, detail, detailEn }]
  // Migrazione UNA-TANTO-VIA: i sigilli scrittati prima della bilinguizzazione
  // (o senza) detailEn ricevono la controparte inglese ricavata dal dettaglio.
  if (L.sigils.length && L.sigils.some((s) => !s.detailEn)) {
    L.sigils = L.sigils.map((s) => {
      if (s.detailEn || !s.detail) return s;
      const map = [
        [/^vittoria da pole$/, 'win from pole'],
        [/^pole \+ vittoria \+ giro veloce$/, 'pole + win + fastest lap'],
        [/^(\d+) vittorie di fila$/, (n) => `${n} wins in a row`],
        [/^(\d+) gare di fila a punti$/, (n) => `${n} points finishes in a row`],
        [/^(\d+) titoli$/, (n) => `${n} titles`],
        [/^stagione ([\w-]+) senza ritiri$/, (n) => `season ${n} without a retirement`],
        [/^rimonta \+(\d+) posizioni$/, (n) => `recovery of +${n} places`],
      ];
      let en = null;
      for (const [re, out] of map) {
        const m = re.exec(s.detail);
        if (!m) continue;
        en = typeof out === 'function' ? out(m[1]) : out;
        break;
      }
      return en ? { ...s, detailEn: en } : s;
    });
  }
  L.challengeStats ??= { taken: 0, won: 0 };
  L.challengeLostRep ??= 0;
  L.paddockQuotes ??= {};      // key -> ultima citazione
  return L;
}

/* ------------------------------------------------------------------ */
/* contratti con obiettivi di stagione                                 */
/* ------------------------------------------------------------------ */

/** Clausole possibili in base alla serie: più la serie è alta, più sono dure. */
function clausePoolFor(node) {
  const size = node.gridSize;
  const rounds = node.calendar.length;
  const podio = Math.max(2, Math.round(size * 0.15));
  const top = Math.max(4, Math.round(size * 0.4));
  // Clausola bilingue PER DATO: text è la lingua di nascita (italiano), textEn
  // la controparte. La scelta della lingua avviene alla vista, mai qui.
  return [
    { id: 'podiums', text: `chiudi almeno ${podio} gare sul podio`, textEn: `finish at least ${podio} races on the podium`, target: podio, metric: 'podiums' },
    { id: 'points', text: `totalizza almeno ${rounds * 14} punti in stagione`, textEn: `score at least ${rounds * 14} championship points in the season`, target: rounds * 14, metric: 'points' },
    { id: 'wins', text: `vinci almeno ${Math.max(1, Math.round(rounds / 4))} gare`, textEn: `win at least ${Math.max(1, Math.round(rounds / 4))} races`, target: Math.max(1, Math.round(rounds / 4)), metric: 'wins' },
    { id: 'nofirst3', text: 'nessun ritiro nelle prime 3 gare', textEn: 'no retirements in the first 3 races', target: 3, metric: 'nofirst3' },
    { id: 'standings', text: `chiudi il campionato nei primi ${top}`, textEn: `close the championship in the top ${top}`, target: top, metric: 'standings' },
  ];
}

/**
 * Garantisce che ci sia un contratto per la stagione in corso su questa serie:
 * crea e ritorna quello nuovo (al chiamante l'annuncio in bacheca), o null se
 * quello attuale è già valido.
 */
/** Salvataggi d'epoca: le clausole del save portano i testi della lingua in cui
 *  sono nate. Qui li sincronizzo con i testi correnti (stesso id, certo: target
 *  e metrica restano quelli del save — cambia solo la frase). */
export function refreshContractTexts(_ladder, state, node) {
  const c = ensureLife(state).contract;
  if (!c) return;
  // CAMPO LARGO (28/10): i testi/numeri correnti delle clausole seguono la
  // griglia larga come la classifica (soglie di «podio» e «top» sul campo vero)
  const pool = clausePoolFor(grigliaSimEstesa(_ladder, state, node));
  for (const cl of c.clauses) {
    const fresh = pool.find((p) => p.id === cl.id);
    // migrazione una-tanto-via dei testi: la frase cambia, target/metrica no
    if (fresh && fresh.text !== cl.text) cl.text = fresh.text;
    if (fresh && fresh.textEn != null && fresh.textEn !== cl.textEn) cl.textEn = fresh.textEn;
  }
}

export function ensureContract(ladder, state, node) {
  const L = ensureLife(state);
  if (L.contract && L.contract.season === state.season && L.contract.nodeId === node.nodeId) return null;
  return assignContract(ladder, state, node);
}

/** Firmato il sedile, il contratto porta 3 clausole deterministiche per stagione+serie. */
export function assignContract(_ladder, state, node) {
  // CAMPO LARGO (28/10): le clausole si firmano sul campo largo (la griglia
  // che EVO corre davvero quando c'è storia), come la classifica e le sfide
  const pool = clausePoolFor(grigliaSimEstesa(_ladder, state, node));
  const seedStr = `${node.nodeId}|${state.season}|contract`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const pick = (i) => pool[(h >>> (i * 7)) % pool.length];
  const chosen = [];
  for (const idx of [0, 1, 2]) { const c = pick(idx); if (!chosen.some((x) => x.id === c.id)) chosen.push(c); }
  const L = ensureLife(state);
  L.contract = {
    nodeId: node.nodeId,
    display: node.display,
    season: state.season,
    clauses: chosen,
    payout: Math.round((node.econ.prize ?? 3000) * 0.8),
    verdict: null,
  };
  return L.contract;
}

/** Metriche della stagione in corso per le clausole. */
function seasonMetrics(ladder, state) {
  const node = nodeById(ladder, state.node);
  const mine = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season);
  return {
    node,
    rounds: node.calendar.length,
    podiums: mine.filter((r) => !r.dnf && r.position <= 3).length,
    wins: mine.filter((r) => !r.dnf && r.position === 1).length,
    points: mine.reduce((a, r) => a + (r.points ?? 0), 0),
    first3Dnf: mine.filter((r) => r.round < 3 && r.dnf).length,
    standingPos: playerStanding(ladder, state, node)?.position ?? null,
  };
}

function clauseProgress(clause, m) {
  switch (clause.metric) {
    case 'podiums': return [m.podiums, clause.target];
    case 'wins': return [m.wins, clause.target];
    case 'points': return [m.points, clause.target];
    case 'nofirst3': return [m.first3Dnf, clause.target];
    case 'standings': return [m.standingPos, clause.target];
    default: return [0, clause.target];
  }
}

/** Stato del contratto corrente: clausole con progresso, esito già deciso o in corsa. */
export function contractStatus(ladder, state) {
  const c = ensureLife(state).contract;
  if (!c || c.season !== state.season) return null;
  const m = seasonMetrics(ladder, state);
  // testi correnti per id sul campo largo (28/10), come alla firma
  const pool = clausePoolFor(grigliaSimEstesa(ladder, state, m.node));
  const rows = c.clauses.map((cl) => {
    const [cur, target] = clauseProgress(cl, m);
    const fresh = pool.find((p) => p.id === cl.id);
    const ok = cl.metric === 'nofirst3' ? cur === 0 : (cur != null && cur >= target);
    const progress = cl.metric === 'nofirst3' ? tr({ it: `${cur} ritiri (max 0)`, en: `${cur} retirements (max 0)` }) : tr({ it: `${cur ?? '—'}/${target ?? '—'}`, en: `${cur ?? '—'}/${target ?? '—'}` });
    const decided = cl.metric === 'nofirst3' ? (cur > 0 ? false : null) : null; // false = già persa
    return { ...cl, text: tr({ it: fresh?.text ?? cl.text, en: fresh?.textEn ?? cl.textEn ?? cl.text }), progress, ok, decided };
  });
  return { contract: c, rows, metrics: { podiums: m.podiums, wins: m.wins, points: m.points, rounds: m.rounds, roundsTotal: m.rounds, standingPos: m.standingPos } };
}

/** A fine stagione: clausole rispettate? Payout o silenzio. Ritorna il testo per la bacheca. */
export function settleContract(ladder, state, { recordFlows }) {
  const c = ensureLife(state).contract;
  if (!c || c.season !== state.season) return null;
  const m = seasonMetrics(ladder, state);
  const results = c.clauses.map((cl) => {
    const [cur, target] = clauseProgress(cl, m);
    const ok = cl.metric === 'nofirst3' ? cur === 0 : (cl.metric === 'standings' ? (m.standingPos != null && m.standingPos <= target) : cur >= target);
    return { id: cl.id, text: tr({ it: cl.text, en: cl.textEn ?? cl.text }), textEn: cl.textEn ?? cl.text, ok, progress: cl.metric === 'nofirst3' ? tr({ it: `${cur} ritiri`, en: `${cur} retirements` }) : tr({ it: `${cur ?? '—'} su ${target ?? '—'}`, en: `${cur ?? '—'} of ${target ?? '—'}` }) };
  });
  const kept = results.filter((r) => r.ok).length;
  const success = kept === results.length;
  c.verdict = success ? 'kept' : 'failed';
  let paid = 0;
  if (success) {
    paid = c.payout;
    state.money += paid;
  }
  const text = success
    ? tr({
        it: `Contratto ${c.display}: tutti gli obiettivi rispettati (${results.map((r) => r.text).join('; ')}). Premio contrattuale +${paid}.`,
        en: `Contract ${c.display}: every objective met (${results.map((r) => r.textEn ?? r.text).join('; ')}). Contractual reward +${paid}.`,
      })
    : tr({
        it: `Contratto ${c.display}: obiettivi mancati (${results.filter((r) => !r.ok).map((r) => r.text).join('; ')}). Nessun premio contrattuale.`,
        en: `Contract ${c.display}: objectives missed (${results.filter((r) => !r.ok).map((r) => r.textEn ?? r.text).join('; ')}). No contractual reward.`,
      });
  if (paid) recordFlows(state, [{ kind: 'contract', money: paid, reason: `premio contratto ${c.display} S${c.season}` }]);
  const L2 = ensureLife(state);
  L2.contractHistory = [{ season: c.season, display: c.display, verdict: c.verdict, payout: paid }, ...(L2.contractHistory ?? [])].slice(0, 12);
  return { success, paid, results, text };
}

/* ------------------------------------------------------------------ */
/* sponsor dinamici                                                    */
/* ------------------------------------------------------------------ */

const SPONSOR_NAMES = ['Liqui Vespa', 'TecnoGomme Rossi', 'Banka del Sport', 'Caschi Falco', 'Energia Zebra', 'Officina Bruno', 'Caffè Pole Position', 'Assicurazioni Curva 2'];

export function sponsorOffers(ladder, state) {
  const L = ensureLife(state);
  if (L.sponsor) return [];
  const rep = state.rep ?? 0;
  const tiers = [
    { tier: 1, minRep: 0, perRace: 120, bonus: 600, deadline: 3 },
    { tier: 2, minRep: 30, perRace: 250, bonus: 1200, deadline: 3 },
    { tier: 3, minRep: 80, perRace: 500, bonus: 2400, deadline: 4 },
  ];
  const eligible = tiers.filter((t) => rep >= t.minRep);
  if (!eligible.length) return [];
  // offerta deterministica per stagione
  const idx = (state.season * 31 + 7) % SPONSOR_NAMES.length;
  const t = eligible[eligible.length - 1];
  const name = SPONSOR_NAMES[(idx + t.tier) % SPONSOR_NAMES.length];
  const node = nodeById(ladder, state.node);
  return [{
    name: `${name} (tier ${t.tier})`,
    tier: t.tier,
    perRace: t.perRace,
    bonus: t.bonus,
    deadlineRound: t.deadline,
    target: 'podio',
    note: `${t.perRace} € a gara in stagione + ${t.bonus} € se sali sul podio entro il round ${t.deadline}`,
    noteEn: `€${t.perRace} per race in the season + €${t.bonus} if you podium by round ${t.deadline}`,
    series: node.display,
  }];
}

export function acceptSponsor(state, offer) {
  const L = ensureLife(state);
  L.sponsor = {
    name: offer.name, tier: offer.tier,
    perRace: offer.perRace, bonus: offer.bonus,
    deadlineRound: offer.deadlineRound - 1, // round 0-based in cui scade la missione
    takenSeason: state.season,
    roundsPaid: 0,
  };
  return L.sponsor;
}

export function declineSponsor(state) { ensureLife(state).sponsor = null; }

/** Sponsor attivo (solo se la stagione combacia). */
export function sponsorFor(state) {
  const s = ensureLife(state).sponsor;
  return s && s.takenSeason === state.season ? s : null;
}

/* ------------------------------------------------------------------ */
/* sfide per round                                                     */
/* ------------------------------------------------------------------ */

/**
 * Una mini-sfida facoltativa per la ronda corrente, deterministica su
 * stagione+serie+round. Ritorna null se la stagione è chiusa o c'è già una sfida.
 */
export function challengeFor(ladder, state) {
  const L = ensureLife(state);
  const node = nodeById(ladder, state.node);
  if (state.round >= node.calendar.length) return null;
  if (L.challenge && L.challenge.season === state.season && L.challenge.nodeId === node.nodeId && L.challenge.round === state.round) return L.challenge;
  // CAMPO LARGO (28/10): la sfida vede lo stesso campo che vede la classifica —
  // largo quanto il massimo gridSize incassato nei risultati reali. Il
  // «chiudi davanti a X» resta al rivale PIÙ forte (l'ampliamento aggiunge
  // solo sedili deboli in fondo, quindi il bersaglio non cambia né per il
  // nemico dato né per le sfide già salvate): cambia solo la COERENZA — la
  // lista rivali è la stessa della sim, non la stima corta del ladder.
  const campoLargo = grigliaSimEstesa(ladder, state, node);
  const rivals = gridFor(state.world, ladder, campoLargo, state.season);
  const seed = `${node.nodeId}|${state.season}|${state.round}|challenge`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const beats = [...rivals].sort((a, b) => b.bandValue - a.bandValue);
  const strong = beats[0] ?? null;
  const kinds = [];
  if (strong) kinds.push({
    kind: 'beat', target: strong.name,
    text: tr({ it: `chiudi davanti a ${strong.name}`, en: `finish ahead of ${strong.name}` }),
    reward: Math.round((node.econ.prize ?? 3000) * 0.12), penalty: 5,
  });
  kinds.push(
    { kind: 'nopit', target: '1', text: tr({ it: 'chiudi la gara in zona punti senza toccare nulla (nessun ritiro)', en: 'finish the race in the points without touching anything (no retirements)' }), reward: Math.round((node.econ.prize ?? 3000) * 0.1), penalty: 5 },
    { kind: 'top3', target: '3', text: tr({ it: 'chiudi almeno terzo', en: 'finish at least third' }), reward: Math.round((node.econ.prize ?? 3000) * 0.12), penalty: 5 },
  );
  const k = kinds[h % kinds.length];
  return { season: state.season, nodeId: node.nodeId, round: state.round, ...k, accepted: false, verdict: null };
}

export function acceptChallenge(state, challenge) {
  const L = ensureLife(state);
  L.challenge = challenge;
  challenge.accepted = true;
  return challenge;
}

/** Verdetto della sfida, chiamato dopo ogni import. */
export function settleChallenge(ladder, state, entry, { pushMessage, recordFlows }) {
  const L = ensureLife(state);
  const c = L.challenge;
  if (!c || c.verdict != null || !entry) return null;
  if (!c.accepted) return null;
  if (entry.round != null && entry.round !== c.round) return null; // la sfida vale per la sua ronda
  const node = nodeById(ladder, c.nodeId);
  if (entry.nodeId && entry.nodeId !== c.nodeId) return null;
  // ZONA PUNTI sul campo largo (28/10): la soglia della sfida «in zona punti»
  // segue la griglia CHE LA CLASSIFICA mostra (larga quanto il massimo
  // incassato), non la stima corta del ladder che spremeva il 40% in un campo
  // da 7 quando la gara vera correva a 17.
  const campoLargo = grigliaSimEstesa(ladder, state, node);
  const zona = Math.max(3, Math.round(campoLargo.gridSize * 0.4));
  const won = c.kind === 'beat'
    ? (!entry.dnf && entry.beatenNames?.includes(c.target))
    : c.kind === 'top3' ? (!entry.dnf && entry.position <= 3)
    : (!entry.dnf && entry.position <= zona);
  c.verdict = won ? 'won' : 'lost';
  L.challengeStats.taken += 1;
  if (won) {
    state.money += c.reward;
    L.challengeStats.won += 1;
    recordFlows(state, [{ kind: 'bonus', money: c.reward, reason: `sfida vinta: ${c.text}` }]);
    pushMessage(state, `Sfida vinta: ${c.text} (+${c.reward}).`, 'good');
  } else {
    state.rep = Math.max(0, state.rep - c.penalty);
    L.challengeLostRep += c.penalty;
    recordFlows(state, [{ kind: 'penalty', rep: -c.penalty, reason: `sfida persa: ${c.text}` }]);
    pushMessage(state, `Sfida persa: ${c.text} (-${c.penalty} rep).`, 'bad');
  }
  return { won, challenge: c };
}

/* ------------------------------------------------------------------ */
/* sigilli (sfide personali permanenti)                                */
/* ------------------------------------------------------------------ */

export function sigilDefs() {
  return [
    { id: 'lightsout', label: tr({ it: 'Luci spente', en: 'Lights out' }), detail: tr({ it: 'vittoria partendo da pole', en: 'win from pole position' }) },
    { id: 'last2first', label: tr({ it: "Dall'ultimo al primo", en: 'Last to first' }), detail: tr({ it: "vittoria partendo dall'ultimo posto", en: 'win from the last grid spot' }) },
    { id: 'grandchelem', label: 'Grand Chelem', detail: tr({ it: 'pole + vittoria + giro veloce nella stessa gara', en: 'pole + win + fastest lap in the same race' }) },
    { id: 'streak3', label: tr({ it: 'Treno in corsa', en: 'Running train' }), detail: tr({ it: '3 vittorie di fila', en: '3 wins in a row' }) },
    { id: 'streak5points', label: tr({ it: 'Metro pari', en: 'Steady stepper' }), detail: tr({ it: '5 gare di fila a punti', en: '5 points finishes in a row' }) },
    { id: 'champion2', label: tr({ it: 'Bicampione', en: 'Two-time champion' }), detail: tr({ it: '2 titoli in carriera', en: '2 titles in the career' }) },
    { id: 'cleanseason', label: tr({ it: 'Anno senza macchie', en: 'Spotless season' }), detail: tr({ it: 'una stagione senza ritiri (min. 3 gare)', en: 'a season with no retirements (min. 3 races)' }) },
    { id: 'comeback5', label: tr({ it: 'Sottano', en: 'Fighter' }), detail: tr({ it: 'rimonta di almeno 5 posizioni', en: 'recovery of at least 5 places' }) },
  ];
}

/** Controlla e assegna i sigilli dopo ogni gara. Ritorna i nuovi. */
export function checkSigils(_ladder, state) {
  const L = ensureLife(state);
  const have = new Set(L.sigils.map((s) => s.id));
  const out = [];
  /* ogni sigillo conserva la coppia it/en alla scarata (le vecchie restano          */
  /*  con solo detail IT: la vista cade su detailEn ?? detail). */
  const add = (id, pair) => {
    if (!have.has(id)) {
      const detail = pair?.it ?? '', detailEn = pair?.en ?? detail;
      out.push({ id, detail, detailEn });
      L.sigils.push({ id, at: new Date().toISOString(), detail, detailEn });
    }
  };
  const all = Object.entries(state.results ?? {}).flatMap(([, list]) => list);
  const wins = all.filter((r) => !r.dnf && r.position === 1);
  if (wins.some((r) => r.pole === true)) add('lightsout', tr({ it: 'vittoria da pole', en: 'win from pole' }));
  if (wins.some((r) => Number.isFinite(r.gridPosition) && r.gridPosition === (r.gridSize ?? null))) {
    const last = wins.find((r) => r.gridPosition === r.gridSize);
    add('last2first', { it: `P${last.gridSize} → P1`, en: `P${last.gridSize} → P1` });
  }
  if (wins.some((r) => r.pole === true && r.fl)) add('grandchelem', tr({ it: 'pole + vittoria + giro veloce', en: 'pole + win + fastest lap' }));
  // vittorie di fila (in ordine di data)
  const sorted = all.slice().sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
  let run = 0, bestRun = 0;
  for (const r of sorted) { if (!r.dnf && r.position === 1) { run += 1; bestRun = Math.max(bestRun, run); } else run = 0; }
  if (bestRun >= 3) add('streak3', tr({ it: `${bestRun} vittorie di fila`, en: `${bestRun} wins in a row` }));
  // 5 gare a punti di fila
  let ptsRun = 0;
  for (const r of sorted) { if (!r.dnf && (r.points ?? 0) > 0) { ptsRun += 1; if (ptsRun >= 5) break; } else ptsRun = 0; }
  if (ptsRun >= 5) add('streak5points', tr({ it: '5 gare di fila a punti', en: '5 points finishes in a row' }));
  if ((state.titles ?? []).length >= 2) add('champion2', tr({ it: `${state.titles.length} titoli`, en: `${state.titles.length} titles` }));
  // stagione senza ritiri
  for (const s of state.seasons ?? []) {
    const seasonRaces = all.filter((r) => r.season === s.season);
    if (seasonRaces.length >= 3 && seasonRaces.every((r) => !r.dnf)) { add('cleanseason', tr({ it: `stagione ${s.season} senza ritiri`, en: `season ${s.season} without a retirement` })); break; }
  }
  const bestComeback = all.filter((r) => Number.isFinite(r.gridPosition) && Number.isFinite(r.position) && !r.dnf)
    .map((r) => r.gridPosition - r.position).sort((a, b) => b - a)[0] ?? 0;
  if (bestComeback >= 5) add('comeback5', tr({ it: `rimonta +${bestComeback} posizioni`, en: `recovery of +${bestComeback} places` }));
  return out;
}

/* ------------------------------------------------------------------ */
/* maestria delle piste                                                */
/* ------------------------------------------------------------------ */

/**
 * Livello di conoscenza di un tracciato, da gare corse e miglior giro personale.
 * Ritorna { level: 0..3, name, races, bestLap }.
 */
export function trackMastery(ladder, state, trackDisplay) {
  const all = Object.entries(state.results ?? {}).flatMap(([, list]) => list);
  const trackName = (r) => ladder.contentNames?.tracks?.[r.track] ?? r.track;
  const races = all.filter((r) => trackName(r) === trackDisplay);
  const best = state.stats?.bestLaps?.[trackDisplay] ?? null;
  const n = races.length;
  const level = n === 0 ? 0 : n < 2 ? 1 : n < 4 ? 2 : 3;
  return {
    level,
    name: tr({
      it: ['sconosciuta', 'novizio', 'conoscente', 'maestro'][level],
      en: ['unknown', 'novice', 'familiar', 'master'][level],
    }),
    races: n,
    bestLap: best ? { ...best } : null,
  };
}

/* ------------------------------------------------------------------ */
/* pianificatore di carriera                                           */
/* ------------------------------------------------------------------ */

/**
 * Le serie raggiungibili l'anno prossimo col livello attuale: gate ok o quasi,
 * con soldi necessari e premio in palio.
 */
export function careerPlanner(ladder, state) {
  const rows = [];
  for (const n of ladder.nodes) {
    const reasons = [];
    let ok = true;
    if (n.requires) {
      const best = state.bestFinish[n.requires.nodeId];
      const feeder = ladder.nodes.find((x) => x.nodeId === n.requires.nodeId);
      if (best == null) { ok = false; reasons.push(`mai corso in ${feeder?.display ?? n.requires.nodeId} (serve top ${n.requires.top})`); }
      else if (best > n.requires.top) { ok = false; reasons.push(`best P${best} in ${feeder?.display ?? ''} (serve top ${n.requires.top})`); }
    }
    if (n.repRequired && state.rep < n.repRequired) { ok = false; reasons.push(`rep ${state.rep}/${n.repRequired}`); }
    const needBuy = n.econ.buy ?? 0;
    const needRent = n.econ.rent ?? 0;
    const moneyOk = state.money >= needRent || needRent === 0;
    if (!moneyOk) reasons.push(`affitto ${needRent} (hai ${state.money})`);
    rows.push({
      nodeId: n.nodeId, display: n.display, discipline: n.discipline, level: n.level,
      access: n.access, entry: n.econ.entry ?? 0, rent: needRent, buy: needBuy, prize: n.econ.prize ?? 0,
      open: ok, moneyOk,
      blockers: reasons,
      current: n.nodeId === state.node,
      cars: (n.cars ?? []).map((c) => ladder.contentNames?.cars?.[c] ?? c).slice(0, 3),
    });
  }
  rows.sort((a, b) => Number(b.open) - Number(a.open) || b.level - a.level || a.display.localeCompare(b.display));
  return rows;
}

