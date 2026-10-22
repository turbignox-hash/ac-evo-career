// memories.mjs — le Memorie di famiglia (ispirate a "memories.json" del modello originario).
//
// Ogni titolo vinto sblocca un capitolo della saga di famiglia: un antenato che
// gareggiava in un'altra epoca ti affida la sua auto (il "relic") e la sua impresa.
// Rifare l'impresa porta a casa l'eredità in denaro e il titolo di famiglia.
//
// Regole prese dal modello originario:
//  - ogni capitolo ha: antenato+relazione, epoca, disciplina/serie, auto, rounds,
//    obiettivo ("termina tra i primi 5"), eredità (inherit) e premio a ripetizione;
//  - i capitoli salgono di difficoltà e di eredità generazione dopo generazione;
//  - l'obiettivo è tematico, non solo "vinci" (termina a punti, podio tra le
//    leggende, vinci la tua manche...), per raccontare epoche diverse.
//
// In questo file vive anche il FONDO SPETTATORI (idea da "audience.json" di ZtA):
// ogni pista ha il suo pubblico tipico, e lo sponsor paga una quota proporzionale
// gara per gara — le cattedrali del motorismo pagano molto, le piste di club poco.

import { nodeById, pushMessage } from './state.mjs';
import { tr } from './lang.mjs';
import { recordFlows } from './flows.mjs';
import { publishNotice } from './gazzetta.mjs';

/* ------------------------------------------------------------------ */
/* pubblico per pista (audience.json del modello originario)                  */
/* ------------------------------------------------------------------ */

/** Spettatori tipici per pista (id ladder). Ordini di grandezza realistici: le
 *  cattedrali del motismo (Monza, Spa, Suzuka) riempiono la collina, le piste
 *  di club restano su numeri da tricolore. Piste sconosciute: 28.000. */
const TRACK_CROWD = {
  monza: 113000, spa: 70000, suzuka: 104000, fuji: 62000,
  circuit_of_the_americas: 120000, sebring: 68000, mount_panorama: 58000,
  nurburgring: 96000, laguna_seca: 52000, watkins_glen: 47000,
  road_atlanta: 44000, imola: 61000, paul_ricard: 36000, redbull_ring: 68000,
  kyalami: 32000, donington_park: 33000, brands_hatch: 38000, oulton_park: 22000,
};

/** Pubblico atteso su una pista (id ladder o nome). Null se pista ignota. */
export function raceCrowdFor(trackId) {
  const raw = String(trackId ?? '').toLowerCase().trim();
  if (!raw) return null;
  // "donington_park" (id ladder) e "Donington Park GP" (nome del gioco) devono
  // combaciare: si confrontano con spazi normalizzati e poi per contenuto
  const flat = (s) => String(s ?? '').toLowerCase().replace(/[_\s-]+/g, ' ').trim();
  const k = flat(raw);
  for (const [id, n] of Object.entries(TRACK_CROWD)) if (flat(id) === k) return n;
  if (k.length >= 5) {
    for (const [id, n] of Object.entries(TRACK_CROWD)) {
      const f = flat(id);
      if (f.length >= 5 && (f.includes(k) || k.includes(f))) return n;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* stato                                                               */
/* ------------------------------------------------------------------ */

export function ensureHeritage(state) {
  state.heritage ??= { completed: [], active: null, offers: [] };
  state.heritage.completed ??= [];
  state.heritage.active ??= null;
  state.heritage.offers ??= [];
  return state.heritage;
}

/* ------------------------------------------------------------------ */
/* attori e scenografia                                                */
/* ------------------------------------------------------------------ */

const RELATIONS = ['bisnonno', 'prozio', 'nonno', 'prozio', 'zio grande', 'nonno', 'padre'];
const ERAS = ['1968', '1974', '1983', '1989', '1995', '2004', '2013'];
const SEATS = [41, 24, 7, 12, 33, 5, 18];

const RANKS = [
  { min: 1, label: 'Debuttante' },
  { min: 3, label: 'Timoniere' },
  { min: 6, label: 'Campionetto' },
  { min: 10, label: 'Veterano del paddock' },
  { min: 15, label: 'Signore della carriera' },
  { min: 21, label: 'Leggenda di famiglia' },
  { min: 28, label: 'Mito immortale' },
];
const rankOf = (n) => [...RANKS].reverse().find((r) => n >= r.min)?.label ?? RANKS[0].label;

/** Le "leggende" della griglia: il paddock d'epoca con cui ti confronti. */
const LEGENDS = {
  entry: ['K. Stahl (DE)', 'P. Moreau (FR)', 'R. Bianchi (IT)', 'E. Costa (BR)', 'H. Vondel (NL)'],
  touring: ['N. Andersson (SE)', 'L. Bianchi (IT)', 'F. Dubois (FR)', 'J. Palmer (GB)', 'M. Rossi (IT)'],
  single: ['S. Nakai (JP)', 'A. Lombardi (IT)', 'W. Brandt (DE)', 'P. Girard (FR)'],
  gt: ['D. Ferraro (IT)', 'M. Hale (GB)', 'T. Okada (JP)', 'C. Herrera (ES)'],
  endurance: ['J. Ickx (BE)', 'V. Elford (GB)', 'R. Stommelen (DE)', 'G. Larrousse (FR)'],
  strada: ['S. Sandro (IT)', 'B. Munari (IT)', 'W. Röhrl (DE)', 'J. Ragnotti (FR)'],
};

/** Auto simbolo per disciplina (relic): la prima disponibile nel ladder vince. */
const HERO_CARS = {
  entry: ['ks_volkswagen_golf_gti_mk8', 'ks_abarth_695_biposto'],
  touring: ['ks_audi_rs_3_sportback', 'ks_hyundai_i30_n_hb'],
  single: ['ks_ferrari_f2004'],
  gt: ['ks_porsche_718_cayman_gt4_rs', 'ks_audi_r8_lms_gt4_evo'],
  endurance: ['ks_audi_r8_lms_gt4_evo', 'ks_porsche_718_cayman_gt4_rs'],
  strada: ['ks_ford_escort_rs_cosworth', 'ks_renault_5_gt_turbo'],
};
function heroCarFor(ladder, disc) {
  for (const id of HERO_CARS[disc] ?? []) {
    if (ladder.nodes.some((n) => (n.cars ?? []).includes(id))) return id;
  }
  return ladder.nodes.find((n) => n.discipline === disc)?.cars?.[0] ?? null;
}

const fmtMs = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.round(ms % 1000)).padStart(3, '0')}`;

/* ------------------------------------------------------------------ */
/* i capitoli: obiettivi tematici per epoca                            */
/* ------------------------------------------------------------------ */

const MEM_TEMPLATES = [
  {
    id: 'lorigine', era: 0, disc: 'endurance', rel: 0,
    title: 'Le Origini',
    crest: 'lo Scudo dell\'Origine',
    objective: { text: 'termina la gara tra i primi 5', kind: 'positionTop', value: 5 },
    inherit: 60000, repeat: 14000, rounds: 2,
  },
  {
    id: 'lannimale', era: 1, disc: 'strada', rel: 1,
    title: 'L\'Anno Selvaggio',
    crest: 'la Spilla del Turbina',
    objective: { text: 'chiudi in zona punti', kind: 'pointsTop', value: 0.55 },
    inherit: 85000, repeat: 18000, rounds: 2,
  },
  {
    id: 'lannidoro', era: 2, disc: 'endurance', rel: 2,
    title: 'L\'Età dell\'Oro',
    crest: 'l\'Aquila della Gruppo C',
    objective: { text: 'salisci sul podio tra le leggende', kind: 'positionTop', value: 3 },
    inherit: 110000, repeat: 26000, rounds: 2,
  },
  {
    id: 'ilpioniere', era: 3, disc: 'touring', rel: 3,
    title: 'Il Pioniere',
    crest: 'il Fazzoletto del Gruppo A',
    objective: { text: 'vinci la tua manche: chiudi davanti a metà griglia', kind: 'positionShare', value: 0.5 },
    inherit: 130000, repeat: 30000, rounds: 3,
  },
  {
    id: 'ilruggito', era: 4, disc: 'gt', rel: 4,
    title: 'Il Ruggito dei GT',
    crest: 'lo Stemma dei GT',
    objective: { text: 'termina in cima alla classifica di serie', kind: 'standings', value: 1 },
    inherit: 150000, repeat: 34000, rounds: 3,
  },
  {
    id: 'ilmonoposto', era: 5, disc: 'single', rel: 5,
    title: 'Il Monoposto di Famiglia',
    crest: 'il Casco Rosso',
    objective: { text: 'centra il podio in monoposto', kind: 'positionTop', value: 3 },
    inherit: 175000, repeat: 40000, rounds: 2,
  },
  {
    id: 'lattimo', era: 6, disc: 'gt', rel: 6,
    title: 'L\'Attimo Zero',
    crest: 'il Sigillo dell\'Apice',
    objective: { text: 'vinci la gara dedicata', kind: 'win', value: 1 },
    inherit: 220000, repeat: 50000, rounds: 2,
  },
];

/* ------------------------------------------------------------------ */
/* assegnazione e avanzamento                                          */
/* ------------------------------------------------------------------ */

function trackDisp(ladder, id) { return ladder.contentNames?.tracks?.[id] ?? id; }

function buildMemory(ladder, state, tpl, index) {
  const name = state.driver?.last ?? state.driver?.name ?? 'di famiglia';
  const ancestors = ['Aldo', 'Marco', 'Darío', 'Sandro', 'Vittorio', 'Renzo', 'Italo'];
  const series = ladder.nodes
    .filter((n) => n.discipline === tpl.disc && n.level <= 6)
    .sort((a, b) => a.level - b.level)[0] ?? ladder.nodes[0];
  const carId = heroCarFor(ladder, tpl.disc);
  const tracks = Object.keys(ladder.contentNames?.tracks ?? {}).filter((t) => (series.calendar ?? []).some((r) => r.track === t));
  const picks = tracks.length >= tpl.rounds
    ? [...tracks].sort((a, b) => a.localeCompare(b)).slice(0, tpl.rounds)
    : (series.calendar ?? []).slice(0, tpl.rounds).map((r) => r.track);
  const rel = RELATIONS[tpl.rel % RELATIONS.length];
  return {
    id: tpl.id,
    index,
    ancestor: `${ancestors[tpl.rel % ancestors.length]} ${name}`,
    relation: rel,
    era: ERAS[tpl.era % ERAS.length],
    series: series.display,
    nodeId: series.nodeId,
    disc: tpl.disc,
    seat: SEATS[tpl.era % SEATS.length],
    carId,
    carName: carId ? (ladder.contentNames?.cars?.[carId] ?? carId) : null,
    legends: LEGENDS[tpl.disc] ?? LEGENDS.entry,
    rounds: picks.map((t) => t),
    tracksDisplay: picks.map((t) => trackDisp(ladder, t)),
    objective: { ...tpl.objective },
    relic: `${tpl.era >= 0 && ERAS[tpl.era % ERAS.length] >= '1989' ? 'Prototipo' : 'Auto storica'} #${SEATS[tpl.era % SEATS.length]} (livrea d'epoca)`,
    crest: tpl.crest,
    title: tpl.title,
    inherit: tpl.inherit,
    repeat: tpl.repeat,
    assignedSeason: state.season,
  };
}

/**
 * Fine stagione: se ci sono titoli freschi e nessuna memoria in corso, arriva
 * l'invito di famiglia. Ritorna la memoria assegnata (o null).
 */
export function assignNextMemory(ladder, state) {
  const H = ensureHeritage(state);
  if (H.active) return null;
  const tpl = MEM_TEMPLATES.find((t) => !H.completed.some((c) => c.id === t.id));
  if (!tpl) return null;
  const mem = buildMemory(ladder, state, tpl, MEM_TEMPLATES.indexOf(tpl) + 1);
  H.active = { ...mem, progress: [], done: false, claimed: false };
  pushMessage(state, tr({
    it: `📜 Eredità di famiglia: ${mem.ancestor}, tuo ${mem.relation} (${mem.era}, ${mem.series}). Ti lascia ${mem.carName ?? 'la sua auto'} e un incasso di ${mem.inherit.toLocaleString('it-IT')} €: rifa la sua impresa (${mem.objective.text}) e il titolo ${mem.title} è tuo.`,
    en: `📜 Family heritage: ${mem.ancestor}, your ${mem.tr_EN_relation ?? mem.relation} (${mem.era}, ${mem.series}). He leaves you ${mem.carName ?? 'his car'} and a payment of €${mem.inherit.toLocaleString('it-IT')}: re-run his feat (${mem.objective.text}) and the title ${mem.title} is yours.`,
  }), 'title');
  return H.active;
}

/** La memoria attiva (o null), con progresso aggiornato. */
export function currentMemory(ladder, state) {
  const H = ensureHeritage(state);
  return H.active ? { ...H.active, rank: rankOf(H.completed.length + 1) } : null;
}

/**
 * Dopo ogni gara: aggiorna il progresso della memoria attiva. Quando
 * l'obiettivo è centrato la segna "pronta" (l'eredità si incassa con claim).
 */
export function checkMemoryProgress(ladder, state, entry) {
  const H = ensureHeritage(state);
  const mem = H.active;
  if (!mem || mem.done || !entry || entry.dnf) return null;
  if (mem.nodeId !== entry.nodeId) return null;
  if (!mem.rounds.includes(entry.track)) return null;
  if (mem.progress.some((p) => p.round === entry.round)) return null;

  const node = nodeById(ladder, mem.nodeId);
  const gridSize = entry.gridSize ?? node.gridSize ?? 12;
  const pos = entry.position ?? gridSize;
  let ok = false;
  let detail = '';
  switch (mem.objective.kind) {
    case 'positionTop': ok = pos <= mem.objective.value; detail = `P${pos} su ${gridSize} (serviva top ${mem.objective.value})`; break;
    case 'pointsTop': {
      const sys = ladder.pointsSystems[node.points];
      const leader = sys?.table?.[0] ?? 25;
      const need = Math.max(1, Math.round(leader * mem.objective.value));
      ok = (entry.points ?? 0) >= need;
      detail = `${entry.points ?? 0} punti (serviva ${need}+)`;
      break;
    }
    case 'positionShare': ok = pos <= Math.max(2, Math.round(gridSize * mem.objective.value)); detail = `P${pos} su ${gridSize}`; break;
    case 'win': ok = pos === 1; detail = `P${pos} su ${gridSize} (serviva la vittoria)`; break;
    default: ok = false; detail = `P${pos}`;
  }
  const prog = { round: entry.round, track: entry.track, when: new Date().toISOString(), ok, detail, durationMin: entry.durationMin ?? null };
  mem.progress.push(prog);
  if (ok) pushMessage(state, tr({
    it: `📜 ${mem.title}: round ${mem.progress.length} di ${mem.rounds.length} superato — ${detail}.`,
    en: `📜 ${mem.title}: round ${mem.progress.length} of ${mem.rounds.length} cleared — ${detail}.`,
  }), 'good');
  else pushMessage(state, tr({
    it: `📜 ${mem.title}: round ${mem.progress.length} di ${mem.rounds.length} non centrato — ${detail}. Il capitolo continua alla prossima occasione.`,
    en: `📜 ${mem.title}: round ${mem.progress.length} of ${mem.rounds.length} missed — ${detail}. The chapter continues at the next chance.`,
  }), 'info');

  // capitolo completo: tutte le prove previste sono state affrontate e superate
  const allOk = mem.progress.length >= mem.rounds.length && mem.progress.every((p) => p.ok);
  if (allOk) {
    mem.done = true;
    pushMessage(state, tr({
      it: `📜 Impresa rifatta! ${mem.ancestor} sorride da qualche parte: l'eredità (${mem.inherit.toLocaleString('it-IT')} €) è pronta da incassare nel pannello Eredità.`,
      en: `📜 Feat re-run! ${mem.ancestor} smiles somewhere: the inheritance (€${mem.inherit.toLocaleString('it-IT')}) is ready to claim on the Heritage panel.`,
    }), 'title');
    try {
      publishNotice(`L'impresa di famiglia: ${mem.title} rifatta`, `${state.driver?.name ?? 'Il pilota'} ha ripetuto l'impresa di ${mem.ancestor} (${mem.era}): ${mem.objective.text}. L'eredità di famiglia è pronta.`, { season: state.season, kind: 'notice' });
    } catch { /* la gazzetta non blocca mai */ }
  }
  return { memory: mem, progress: prog, done: mem.done };
}

/** Incassa l'eredità di una memoria completata (bottone nel pannello Eredità). */
export function claimMemory(ladder, state) {
  const H = ensureHeritage(state);
  const mem = H.active;
  if (!mem || !mem.done || mem.claimed) {
    throw new Error('Nessuna eredità pronta: completa prima la memoria in corso (pannello Eredità sul cruscotto).');
  }
  mem.claimed = true;
  state.money += mem.inherit;
  recordFlows(state, [{ kind: 'heritage', money: mem.inherit, reason: `eredità ${mem.title} — ${mem.ancestor} (${mem.era})` }]);
  pushMessage(state, tr({
    it: `📜 Eredità incassata: +${mem.inherit.toLocaleString('it-IT')} € — ${mem.title} entra nella storia di famiglia. ${mem.crest} è tuo.`,
    en: `📜 Inheritance claimed: +€${mem.inherit.toLocaleString('it-IT')} — ${mem.title} enters the family history. ${mem.crest} is yours.`,
  }), 'title');
  const completed = { ...mem, claimedAt: new Date().toISOString(), claimedSeason: state.season };
  delete completed.progress;
  H.completed.push(completed);
  H.active = null;
  return { claimed: mem.inherit, completed: completed.title, total: H.completed.length };
}

/** Vista per la GUI: pannello "Eredità di famiglia" del cruscotto. */
export function heritageOverview(ladder, state) {
  const H = ensureHeritage(state);
  const active = currentMemory(ladder, state);
  return {
    completedCount: H.completed.length,
    totalChapters: MEM_TEMPLATES.length,
    completed: H.completed.map((c) => ({ id: c.id, title: c.title, ancestor: c.ancestor, era: c.era, series: c.series, crest: c.crest, inherit: c.inherit, claimedAt: c.claimedAt ?? null })),
    rank: rankOf(H.completed.length),
    active: active ? {
      id: active.id, title: active.title, ancestor: active.ancestor, relation: active.relation,
      era: active.era, series: active.series, disc: active.disc, seat: active.seat,
      carId: active.carId, carName: active.carName,
      legends: active.legends, rounds: active.tracksDisplay, roundsDone: active.progress.length,
      objective: active.objective, relic: active.relic, crest: active.crest,
      inherit: active.inherit, repeat: active.repeat, done: !!active.done, claimed: !!active.claimed,
      progress: active.progress.map((p) => ({ track: trackDisp(ladder, p.track), ok: p.ok, detail: p.detail, durationMin: p.durationMin ?? null })),
    } : null,
    allDone: H.completed.length >= MEM_TEMPLATES.length && !H.active,
  };
}

/** La prossima pista della memoria in corso (nome visualizzato), o null. */
export function memoryRoundHint(ladder, state) {
  const H = ensureHeritage(state);
  const mem = H.active;
  if (!mem || mem.done) return null;
  const nextIdx = mem.rounds.findIndex((t) => !mem.progress.some((p) => p.track === t));
  return mem.tracksDisplay[nextIdx] ?? mem.tracksDisplay[0] ?? null;
}
