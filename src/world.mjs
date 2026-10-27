// world.mjs — il mondo dei piloti rivali: chi sono, come crescono, come si popolano le griglie.
//
// Come nel modello originario: il livello di una serie definisce la BANDA di difficolta' (ai: [lo, hi]),
// il pilota piu' forte sta in alto e il piu' debole in basso (CurveSkill). Le statistiche innate
// del pilota (skill distinta da cons/aggr) decidono chi entra nella serie e in che ordine,
// mentre la banda della serie decide quanto vanno forte sul giro.

export const OUR_MIN = 70;   // estremi della difficolta' interna (come nel modello originario)
export const OUR_MAX = 120;

/* ------------------------------------------------------------------ */
/* utilità deterministiche                                             */
/* ------------------------------------------------------------------ */

export function slug(name) {
  return String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = (typeof seed === 'string' ? hash32(seed) : seed) >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Difficolta' interna (70..120) -> skill normalizzata (0..1). */
export function ourToSkill(v) {
  return clamp((v - OUR_MIN) / (OUR_MAX - OUR_MIN), 0, 1);
}

/** Skill mondiale del GIOCATORE (0..1): base dalla banda della serie corrente,
 *  più i risultati reali della stagione (condivisione media della griglia legata ai
 *  risultati e bonus per vittorie e podi). Fonte UNICA per il Mondiale della GUI e
 *  per la mini-classifica del cruscotto in gioco così il numero non può divergere. */
export function playerWorldSkill(curNode, state) {
  const [hi, lo] = curNode?.ai ?? [80, 70];
  const base = ((Number(hi) || 80) + (Number(lo) || 70)) / 2;
  const mineAll = Object.values(state.results ?? {}).flat().filter((r) => r.season === state.season);
  const races = mineAll.length || 1;
  const avgShare = mineAll.reduce((acc, r) => acc + (r.dnf ? 0 : 1 - ((Number(r.position) || 10) / (Number(r.gridSize) || 12))), 0) / races;
  const bonuses = mineAll.filter((r) => !r.dnf && r.position === 1).length * 3 + mineAll.filter((r) => !r.dnf && r.position <= 3).length * 1.2;
  return ourToSkill(Math.max(OUR_MIN, Math.min(OUR_MAX, base + (avgShare - 0.5) * 12 + bonuses)));
}

/** Difficoltà interna -> slider AI del gioco (0..120). La mappatura è a tratti lineari
 *  fra i punti di ancoraggio del ladder (calibrata sul riscontro reale del pilota);
 *  in assenza di anchor si usa il vecchio formato lineare ourMin..ourMax -> evoMin..evoMax. */
export function skillToEvoSlider(v, ladder) {
  const cfg = ladder.aiSlider ?? { ourMin: OUR_MIN, ourMax: OUR_MAX, evoMin: 0, evoMax: 100 };
  if (Array.isArray(cfg.anchors) && cfg.anchors.length >= 2) {
    const pts = [...cfg.anchors].sort((a, b) => a[0] - b[0]);
    if (v <= pts[0][0]) return Math.round(pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      if (v <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const t = (v - x0) / (x1 - x0 || 1);
        return Math.round(y0 + t * (y1 - y0));
      }
    }
    return Math.round(cfg.cap ?? pts[pts.length - 1][1]);
  }
  const ratio = clamp((v - cfg.ourMin) / (cfg.ourMax - cfg.ourMin), 0, 1);
  return Math.round(cfg.evoMin + ratio * (cfg.evoMax - cfg.evoMin));
}

/* ------------------------------------------------------------------ */
/* creazione del mondo                                                 */
/* ------------------------------------------------------------------ */

function pickName(rand, pool, used) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const first = pool.firstNames[Math.floor(rand() * pool.firstNames.length)];
    const last = pool.lastNames[Math.floor(rand() * pool.lastNames.length)];
    const key = `${first} ${last}`;
    if (!used.has(key)) { used.add(key); return { first, last, name: key }; }
  }
  const first = pool.firstNames[Math.floor(rand() * pool.firstNames.length)];
  const last = pool.lastNames[Math.floor(rand() * pool.lastNames.length)];
  const name = `${first} ${last} ${used.size}`;
  used.add(name);
  return { first, last, name };
}

/** Mondo iniziale: un parco piloti ampio, con archetipi, eta' e crescita. */
export function createWorld(ladder, seed = 'evo-world-1', count = 240) {
  const rand = rng(seed);
  const pool = ladder.driverPool;
  const used = new Set();
  const drivers = [];
  for (let i = 0; i < count; i++) {
    const { first, last, name } = pickName(rand, pool, used);
    const nation = pool.nations[Math.floor(rand() * pool.nations.length)];
    const roll = rand();
    const archetype = roll < 0.25 ? 'AP' : roll < 0.6 ? 'MT' : roll < 0.85 ? 'AM' : 'CH';
    const arch = ladder.archetypes[archetype];
    // talento di base: pochi fenomeni, molti onesti mestieranti
    const talent = Math.pow(rand(), 1.7);
    const skill = clamp(0.78 + talent * 0.2, 0.72, 0.985);
    const age = 18 + Math.floor(rand() * 24);
    drivers.push({
      id: 'rd_' + slug(name),
      name,
      first,
      last,
      country: nation.code,
      archetype,
      skill: Math.round((skill * arch.skill) * 1000) / 1000,
      cons: Math.round((arch.consistency + (rand() - 0.5) * 0.12) * 1000) / 1000,
      aggr: Math.round((arch.aggression + (rand() - 0.5) * 0.14) * 1000) / 1000,
      age,
      hot: rand() < 0.05,
      iconic: false,
      active: true,
      seasons: 0,
    });
  }
  // gli "iconici" sono i piu' forti in circolazione: hanno un bonus banda nel modello originario
  [...drivers].sort((a, b) => b.skill - a.skill).slice(0, Math.round(count * 0.08)).forEach((d) => { d.iconic = true; });
  return { seed, created: 1, drivers };
}

/**
 * Vittorie di fila recenti del giocatore (per il rubber-band): passi la lista
 * dei risultati della serie (i più recenti alla fine) e conta la striscia di
 * vittorie che chiude la lista. Null/assente = nessuna informazione.
 */
function countPlayerStreak(history) {
  if (!Array.isArray(history) || !history.length) return 0;
  let run = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i] ?? {};
    if (!r.dnf && r.position === 1) run += 1;
    else break;
  }
  return run;
}

/* ------------------------------------------------------------------ */
/* griglia di una serie                                                */
/* ------------------------------------------------------------------ */

/**
 * Quanti piloti "reclutare" per nodo. Le serie basse pescano i piloti meno forti del parco,
 * quelle alte i piu' forti: al livello 1 si corre contro i rookie, all'apice contro gli alieni.
 */
function poolWindow(world, _ladder, node, season) {
  const active = world.drivers.filter((d) => d.active).sort((a, b) => b.skill - a.skill);
  const level = clamp(node.level, 1, 7);
  const windowSize = (node.gridSize - 1) * 3;
  const maxOffset = Math.max(0, active.length - windowSize);
  const offset = Math.min(maxOffset, Math.round(((7 - level) / 6) * maxOffset) + (hash32(`${node.nodeId}:${season}`) % 5));
  return active.slice(offset, offset + windowSize);
}

/**
 * Griglia della serie per una stagione: deterministica.
 * Array di { driverId, name, country, seat, simSkill, cons, aggr, archetype, iconic, age, hot }.
 */
export function gridFor(world, ladder, node, season) {
  const window = poolWindow(world, ladder, node, season);
  const rand = rng(`${node.nodeId}|${season}|grid`);
  // ordine interno: i piu' forti prendono i sedili alti, con un minimo di casualita' di mercato
  const ranked = [...window]
    .map((d) => ({ d, jitter: (rand() - 0.5) * 0.05 }))
    .sort((a, b) => (b.d.skill + b.jitter) - (a.d.skill + a.jitter))
    .slice(0, node.gridSize - 1)
    .map((x) => x.d);

  const [hi, lo] = node.ai;
  const n = ranked.length;
  const seats = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const bandValue = hi + (lo - hi) * t;             // rank 0 = hi, ultimo = lo
    const d = ranked[i];
    seats.push({
      driverId: d.id,
      name: d.name,
      first: d.first,
      last: d.last,
      country: d.country,
      archetype: d.archetype,
      age: d.age,
      hot: d.hot,
      // iconico = stella DELLA SERIE (i primi due sedili), non del parco piloti mondiale
      iconic: i <= 1,
      worldIconic: d.iconic,
      skill: ourToSkill(bandValue),
      bandValue,
      cons: d.cons,
      aggr: d.aggr,
      seat: i + 2,                                     // il numero 1 e' del giocatore
    });
  }
  return seats;
}

/* ------------------------------------------------------------------ */
/* simulazione di una sessione                                         */
/* ------------------------------------------------------------------ */

/**
 * Ordine d'arrivo di una gara. Il giocatore viene inserito alla posizione reale
 * (quella letta dal file risultati del gioco), gli altri scalano.
 * player = { position, dnf } oppure null (gara non disputata).
 *
 * RUBBER-BAND (stile del modello originario): quando il giocatore è in striscia vincente,
 * i rivali "in forma" (hot) alzano il ritmo — il campionato non si regala.
 */
export function finishOrder(grid, node, season, roundIndex, player = null, ladder = null, history = null) {
  const rand = rng(`${node.nodeId}|${season}|round|${roundIndex}`);
  const entries = grid.map((s) => {
    const noise = (rand() - 0.5) * (0.035 + (1 - s.cons) * 0.07);
    const trackOffset = ((hash32(`${node.calendar[roundIndex]?.track ?? 'x'}|${s.archetype}`) % 100) / 100 - 0.5) * 0.02;
    const dnfRoll = rand();
    const dnfChance = 0.006 + (1 - s.cons) * 0.03;
    return { ...s, score: s.skill + noise + trackOffset, dnf: dnfRoll < dnfChance };
  });
  // elastico sulla forma del giocatore: +0..0.018 (≈ fino a 1,8% di ritmo, dalla
  // terza vittoria di fila in poi) per i piloti marcanti "hot" della serie
  {
    const streak = countPlayerStreak(history ?? player?.__history ?? null);
    const boost = Math.min(0.018, Math.max(0, streak - 2) * 0.004);
    if (boost > 0) for (const e of entries) if (e.hot) e.score += boost * (0.6 + rand() * 0.8);
  }

  const classified = entries.filter((e) => !e.dnf).sort((a, b) => b.score - a.score);
  const retired = entries.filter((e) => e.dnf).sort((a, b) => b.score - a.score);

  const field = [...classified];
  if (player) {
    const pos = player.dnf ? field.length + 1 : clamp(player.position, 1, field.length + 1);
    field.splice(pos - 1, 0, {
      driverId: state_playerId(player),
      name: player.name,
      country: player.country,
      seat: player.carNumber ?? 1,
      isPlayer: true,
      dnf: !!player.dnf,
      score: null,
    });
  }

  const ordered = [...field, ...retired];
  const total = ordered.length;
  return ordered.map((e, i) => ({
    ...e,
    position: e.isPlayer && player?.dnf ? total : i + 1,
    points: ladder ? pointsForPos(ladder, node, i + 1, !!(e.dnf || (e.isPlayer && player?.dnf)), ordered, i) : 0,
  }));
}

function state_playerId(player) {
  return player.driverId ?? 'player';
}

/** Punti per posizione, secondo il sistema della serie. */
export function pointsFor(ladder, node, position, dnf = false) {
  if (dnf) return 0;
  const sys = ladder.pointsSystems[node.points];
  return sys?.table?.[position - 1] ?? 0;
}

/**
 * Punti COMPLETI stile del modello originario: tabella per posizione + punto giro veloce
 * (solo dentro top flTopN) + punto pole. Nei ROUND SIMULATI entrambi i bonus
 * vanno al vincitore di gara (chi parte davanti vince e spesso firma anche il
 * giro veloce); il giocatore reale invece porta i SUOI flag (entry.fl/entry.pole)
 * già calcolati da applyRaceResult: lì la chiamata usa myPoints.
 */
export function pointsForPos(ladder, node, position, dnf = false, ordered = null, index = -1, myPoints = null) {
  if (dnf) return 0;
  const sys = ladder.pointsSystems[node.points];
  if (!sys) return 0;
  let pts = pointsFor(ladder, node, position, false);
  const flTopN = sys.flTopN || Infinity;
  if (ordered && index === 0) {
    if (sys.flPoint && position <= flTopN) pts += sys.flPoint;
    if (sys.polePoint) pts += sys.polePoint;
  }
  return myPoints != null ? myPoints : pts;
}

/* ------------------------------------------------------------------ */
/* evoluzione di fine stagione                                         */
/* ------------------------------------------------------------------ */

/** Eta' che avanza, crescita, calo, ritiri e nuovi rookie. */
export function evolveWorld(world, ladder, season) {
  const rand = rng(`evolve|${world.seed}|${season}`);
  const next = { ...world, drivers: world.drivers.map((d) => ({ ...d })) };
  const pool = ladder.driverPool;
  const used = new Set(next.drivers.map((d) => d.name));

  for (const d of next.drivers) {
    d.age += 1;
    d.seasons += 1;
    if (d.age <= 23) d.skill = clamp(d.skill + (0.008 + rand() * 0.012) * (1 - d.skill), 0.6, 0.99);
    else if (d.age >= 33) d.skill = clamp(d.skill - (0.008 + rand() * 0.016), 0.6, 0.99);
    if ((d.age > 35 && rand() < (d.age - 34) * 0.14) || d.seasons >= 14) d.active = false;
  }

  const active = next.drivers.filter((d) => d.active).length;
  const missing = Math.max(0, 240 - active);
  for (let i = 0; i < missing; i++) {
    const { first, last, name } = pickName(rand, pool, used);
    const nation = pool.nations[Math.floor(rand() * pool.nations.length)];
    const roll = rand();
    const archetype = roll < 0.25 ? 'AP' : roll < 0.6 ? 'MT' : roll < 0.85 ? 'AM' : 'CH';
    const arch = ladder.archetypes[archetype];
    next.drivers.push({
      id: 'rd_' + slug(name) + (used.has(name) ? `_${i}` : ''),
      name, first, last,
      country: nation.code,
      archetype,
      skill: Math.round(clamp(0.78 + Math.pow(rand(), 1.5) * 0.19, 0.72, 0.97) * arch.skill * 1000) / 1000,
      cons: Math.round((arch.consistency + (rand() - 0.5) * 0.12) * 1000) / 1000,
      aggr: Math.round((arch.aggression + (rand() - 0.5) * 0.14) * 1000) / 1000,
      age: 18 + Math.floor(rand() * 5),
      hot: rand() < 0.05,
      iconic: false,
      active: true,
      seasons: 0,
    });
  }

  // ricalcola gli iconici sul nuovo parco piloti
  const ranked = [...next.drivers].filter((d) => d.active).sort((a, b) => b.skill - a.skill);
  const iconicIds = new Set(ranked.slice(0, Math.round(ranked.length * 0.08)).map((d) => d.id));
  for (const d of next.drivers) d.iconic = iconicIds.has(d.id);
  return next;
}

/* ------------------------------------------------------------------ */
/* respiro di metà stagione                                            */
/* ------------------------------------------------------------------ */

/**
 * Tra un round e l'altro il paddock respira: due piloti sono "in forma" (si dice
 * che stanno evoluendo), due sono in declino, e a metà calendario può debuttare
 * un esordiente dal parco piloti. Deterministico per serie+stagione+round: la
 * stessa coppia di gare racconta sempre la stessa storia.
 */
export function midSeasonPulse(world, ladder, node, season, round) {
  const grid = gridFor(world, ladder, node, season);
  const rand = rng(`pulse|${node.nodeId}|${season}|${round}`);
  const events = { hot: [], cold: [], rookie: null };
  const shuffled = [...grid].sort(() => rand() - 0.5);
  for (const s of shuffled.slice(0, 2)) events.hot.push(s.name);
  for (const s of shuffled.slice(2, 4)) events.cold.push(s.name);
  const midRound = Math.floor(node.calendar.length / 2);
  if (round === midRound) {
    const inGrid = new Set(grid.map((s) => s.driverId));
    const young = world.drivers.filter((d) => d.active && d.age <= 21 && !inGrid.has(d.id))
      .sort((a, b) => b.skill - a.skill);
    if (young.length) events.rookie = young[Math.floor(rand() * young.length)].name;
  }
  return events;
}

/** Statistiche dei rivali che corrono in una serie, per il comando paddock. */
export function paddock(world, ladder, node, season) {
  return gridFor(world, ladder, node, season).map((s) => ({
    ...s,
    archetypeName: ladder.archetypes[s.archetype]?.name ?? s.archetype,
    evoSlider: skillToEvoSlider(s.bandValue, ladder),
  }));
}

export { clamp };

