// 28/10 — NONA FILA: IL MONDO DEI PILOTI. world.mjs (391 righe) è il motore
// invisibile del campionato — createWorld (parco 240), gridFor (chi corre contro
// chi, per banda di livello), finishOrder (ordine d'arrivo con DNF, inserimento
// del giocatore alla posizione REALE e rubber-band), pointsFor/pointsForPos,
// evolveWorld (invecchia il parco fra stagioni, ritira i vecchi, rinnova i
// rookie), playerWorldSkill e skillToEvoSlider (fonte UNICA della difficoltà
// della GUI) — e non aveva NESSUN import diretto nei test: arrivava sotto
// puntini in state/life/rivals. Qui lo si presenta a se stesso: módulo PURO
// (zero fs, zero env), deterministico seme per seme: niente nidi, niente
// buffer, i semi fanno da orologio.
import test from 'node:test';
import assert from 'node:assert/strict';

const world = await import('../src/world.mjs');

/* ---- fixture minima: ciò che il modulo chiede davvero al ladder ---- */
const mkLadder = (over = {}) => ({
  driverPool: {
    firstNames: ['Aldo', 'Bruno', 'Carlo', 'Dario', 'Enzo', 'Fabio', 'Gino', 'Hugo', 'Ivo', 'Luca', 'Marco', 'Nino', 'Otto', 'Paolo', 'Remo', 'Sergio', 'Titu', 'Ugo', 'Vito', 'Zeno'],
    lastNames: ['Rossi', 'Bianchi', 'Verdi', 'Neri', 'Gallo', 'Costa', 'Mancini', 'Ferri', 'Conti', 'Longo', 'Marino', 'Riva', 'Bolli', 'Danti', 'Serra', 'Fiori', 'Guerra', 'Vicini'],
    nations: [{ code: 'IT' }, { code: 'FR' }, { code: 'DE' }],
  },
  archetypes: {
    AP: { skill: 0.9, consistency: 0.8, aggression: 0.7, name: 'Asfalto Pulito' },
    MT: { skill: 0.8, consistency: 0.7, aggression: 0.5, name: 'Metodo Tedesco' },
    AM: { skill: 0.7, consistency: 0.6, aggression: 0.8, name: 'Attista Momentaneo' },
    CH: { skill: 0.6, consistency: 1.0, aggression: 0.3, name: 'Caviale Horizonte' },
  },
  pointsSystems: {
    f1: { table: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], flPoint: 1, polePoint: 1, flTopN: 10 },
    zero: { table: [0], flPoint: 0, polePoint: 0, flTopN: 0 },
  },
  nodes: [{
    nodeId: 'coppa', display: 'Coppa', discipline: 'd', level: 3, gridSize: 10,
    calendar: [{ track: 'monza', hour: 15 }, { track: 'imola', hour: 16 }],
    ai: [80, 84], points: 'f1',
  }, {
    nodeId: 'apice', display: 'Apice', discipline: 'd', level: 7, gridSize: 8,
    calendar: [{ track: 'spa', hour: 14 }], ai: [112, 118], points: 'f1',
  }],
  ...over,
});
const nodeOf = (l, i = 0) => l.nodes[i];

/* l'esportazione ha una firma UNICA: createWorld(ladder, seed, count) */

test('createWorld: parco da 240, nomi UNICI, Idi da slug, talenti nella banda', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'seme-test', 240);
  assert.equal(w.drivers.length, 240);
  const ids = new Set(w.drivers.map((d) => d.id));
  const names = new Set(w.drivers.map((d) => d.name));
  assert.equal(ids.size, 240, 'id unici');
  assert.equal(names.size, 240, 'nomi unici');
  for (const d of w.drivers) {
    assert.ok(d.id === 'rd_' + world.slug(d.name), `id da slug: ${d.id} (${d.name})`);
    // skill = (0.72..0.985) × skill dell'archetipo (0.6 AP..0.9): banda REALE 0.43..0.89
    assert.ok(d.skill >= 0.42 && d.skill <= 0.9, `skill in banda: ${d.skill}`);
    assert.ok(d.age >= 18 && d.age <= 41, `età in banda: ${d.age}`);
    assert.ok(['AP', 'MT', 'AM', 'CH'].includes(d.archetype));
    assert.ok(['IT', 'FR', 'DE'].includes(d.country));
  }
});

test('createWorld: SESSO di seeds uguali NON cambia: il mondo è un cofano chiudibile', () => {
  const ladder = mkLadder();
  const a = world.createWorld(ladder, 'un-seme', 20);
  const b = world.createWorld(ladder, 'un-seme', 20);
  assert.deepEqual(b, a);
  // e seeds diversi differiscono (almeno un nome)
  const c = world.createWorld(ladder, 'altro-seme', 20);
  assert.notEqual(a.drivers[0].name, c.drivers[0].name);
});

test('createWorld: gli ICONICI sono gli 8% più forti del parco', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'iconico', 100);
  const ranked = [...w.drivers].sort((a, b) => b.skill - a.skill);
  expectIconic(w.drivers, ranked);
  function expectIconic(drivers, ranked) {
    const nIconic = Math.round(100 * 0.08);
    assert.equal(drivers.filter((d) => d.iconic).length, nIconic, '8% esatti marcanti');
    // sono ESATTAMENTE i primi in classifica skill
    const iconic = new Set(drivers.filter((d) => d.iconic).map((d) => d.id));
    for (let i = 0; i < ranked.length; i++) {
      if (i < nIconic) assert.ok(iconic.has(ranked[i].id), `rank ${i} (skill ${ranked[i].skill}) deve essere iconico`);
      else assert.ok(!iconic.has(ranked[i].id), `rank ${i} (skill ${ranked[i].skill}) NON deve essere iconico`);
    }
  }
});

test('gridFor: che corre contro chi — la griglia è DETERMINISTICA e i sedili partono da 2 (l\'1 è del giocatore)', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'griglia-s', 60);
  const seats = world.gridFor(w, ladder, nodeOf(ladder, 0), 1);
  assert.equal(seats.length, nodeOf(ladder, 0).gridSize - 1, 'griglia = gridSize − il sedile del giocatore');
  for (let i = 0; i < seats.length; i++) {
    assert.equal(seats[i].seat, i + 2, `sedile ${i + 2} dall'ordine`);
  }
  // stessa ronda: stessa griglia (la verità deterministica richiesta dal modello)
  const seats2 = world.gridFor(w, ladder, nodeOf(ladder, 0), 1);
  assert.deepEqual(seats2, seats);
});

test('gridFor: i PIÙ FORTI stanno davanti: seat 2 > seat 3 > … sia per skill che per BANDA', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'ordine', 40);
  // BUG FISSATO DI ADO (nona fila, con il ladder VERO confermato): il nodo
  // porte ai ASC [80, 84] — il vecchio codice destrutturava [hi, lo] e il
  // rivalde più forte (seat 2) correva sul PUNTO BASSO della banda, l'ultimo
  // sul PUNTO ALTO: forza INVERTITA in classifica. Ora rank 0 = PUNTO ALTO,
  // uno per quale ordine scrittura nel JSON.
  const seats = world.gridFor(w, ladder, nodeOf(ladder, 0), 2);   // ai [80, 84]
  for (let i = 1; i < seats.length; i++) {
    assert.ok(seats[i - 1].bandValue > seats[i].bandValue, `bandValue sedile ${i + 1} > sedile ${i + 2}: lo scatto DEVE scendere`);
  }
  assert.equal(seats[0].bandValue, 84, 'il primo sedile è sulla CIMA della banda');
  assert.equal(seats[seats.length - 1].bandValue, 80, 'l\'ultimo sul punto basso');
  assert.ok(seats[0].skill > seats[seats.length - 1].skill, 'simSkill segue la banda');
  // e la scrittura INVERSA nel JSON vale uguale: banda [84, 80] → stesso risultato
  const ladderInv = { nodes: [{ ...nodeOf(ladder, 0), ai: [84, 80] }] };
  const alContrario = world.gridFor(w, ladderInv, nodeOf(ladderInv, 0), 2);
  assert.deepEqual([...alContrario], [...seats]);
});

test('gridFor: livelli DIFFERENTI — la serie apessa recluta rookie, la serie apice alieni', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'livelli', 200);
  const bassa = world.gridFor(w, ladder, nodeOf(ladder, 0), 1);   // level 3, banda 80-84
  const alta = world.gridFor(w, ladder, nodeOf(ladder, 1), 1);    // level 7, banda 112-118
  const mediaBassa = bassa.reduce((a, s) => a + s.skill, 0) / bassa.length;
  const mediaAlta = alta.reduce((a, s) => a + s.skill, 0) / alta.length;
  assert.ok(mediaAlta > mediaBassa, `l'apice deve scorrere più veloce: ${mediaAlta} > ${mediaBassa}`);
  // E la griglia PIU FORTE del parco sta in cima: gli alieni della serie 7 hanno skill-top mondiale
  const topParco = [...w.drivers].sort((a, b) => b.skill - a.skill).slice(0, 8);
  const mediaTop = topParco.reduce((a, s) => a + s.skill, 0) / topParco.length;
  assert.ok(mediaAlta >= mediaTop * 0.9, 'la serie di apice recluta la CIMA del parco');
});

test('gridFor: gli ICONICI della SERIE stanno nei PRIMI DUE SEDILI — non del parco ad ribalzare', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'iconici-serie', 80);
  const seats = world.gridFor(w, ladder, nodeOf(ladder, 0), 1);
  assert.ok(seats[0].iconic, 'il merito 1 della serie (seat 2) è iconico DELLA SERIE');
  assert.ok(seats[1].iconic, 'il merito 2 della serie (seat 3) è iconico DELLA SERIE');
  for (const s of seats.slice(2)) assert.equal(s.iconic, false, `seat ${s.seat} NON deve essere iconico-di-serie`);
  // e worldIconic (merito del PARCO) viene portato separato, non confuso
  assert.ok('worldIconic' in seats[0]);
});

test('finishOrder: il giocatore entra alla posizione REALE, gli altri scalano; DNF = ultimo', () => {
  const ladder = mkLadder();
  const node = nodeOf(ladder, 0);
  // griglia FINTA stabile: le skill sono già scalate, il posto è quello
  const grid = Array.from({ length: 8 }, (_, i) => ({
    driverId: `r${i + 1}`, name: `Rivale ${i + 1}`, country: 'IT', archetype: 'AP',
    skill: 0.9 - i * 0.01, cons: 1, aggr: 0.5, hot: false, seat: i + 2,
  }));
  const o1 = world.finishOrder(grid, node, 1, 0, { position: 3, name: 'Io', dnf: false }, ladder);
  assert.equal(o1.length, 9);
  assert.equal(o1[2].name, 'Io', 'posizione 3 = indice 2');
  assert.equal(o1[2].isPlayer, true);
  // niente buchi: positions 1..N senza salti
  const posizioni = o1.map((e) => e.position);
  assert.deepEqual(posizioni, [...Array(9).keys()].map((i) => i + 1));
  // DNF del giocatore: ULTIMO assoluto (dietro i ritiranti)
  const o2 = world.finishOrder(grid, node, 1, 0, { position: 1, name: 'Io', dnf: true }, ladder);
  assert.equal(o2[o2.length - 1].name, 'Io');
  assert.equal(o2[o2.length - 1].position, o2.length, 'DNF = posizione ultima');
  // e la stessa gara proposta SINDO il giocatore propone NO buchi
  const o0 = world.finishOrder(grid, node, 1, 0, null, ladder);
  assert.equal(o0.length, 8);
  assert.deepEqual(o0.map((e) => e.position), [...Array(8).keys()].map((i) => i + 1));
});

test('finishOrder: i RITIRANTI stanno tutti DOPO i classificati e i punti di chi ritira sono ZERO', () => {
  const ladder = mkLadder();
  const node = nodeOf(ladder, 0);
  const grid = Array.from({ length: 10 }, (_, i) => ({
    driverId: `r${i + 1}`, name: `Rivale ${i + 1}`, country: 'IT', archetype: 'AP',
    skill: 0.9, cons: 0, aggr: 0.5, hot: false, seat: i + 2,    // cons 0: DNFQUASI certo
  }));
  const o = world.finishOrder(grid, node, 1, 0, null, ladder, []);
  // scan: subito dopo l'ultimo non ritirato NON ci sono classificati
  const ultimoClassificato = Math.max(...o.filter((e) => !e.dnf).map((e) => e.position));
  for (const e of o) if (e.dnf) assert.ok(e.position > ultimoClassificato, 'ritiranti in fondo');
  // e punti: chi non dnf con pos<=10 prende dalla tabella; chi vince porta
  // ANCHE fl + pole (pointsForPos col vincitore di gara: il modello originario
  // lo dà ai round simulati, per il giocatore valgono i flag veri)
  for (const e of o) {
    if (e.dnf) { assert.equal(e.points, 0, `Rivale ${e.name} ritirato: 0 punti`); continue; }
    const base = e.position < 11 ? ladder.pointsSystems.f1.table[e.position - 1] : 0;
    const bonus = e.position === 1 ? 2 : 0;   // flPoint 1 + polePoint 1
    assert.equal(e.points, base + bonus, `punti Rivale ${e.name}: pos ${e.position}`);
  }
});

test('pointsFor/pointsForPos: tabella, DNF zero, sistema mancante zero, FL+pole al vincitore', () => {
  const ladder = mkLadder();
  const node = nodeOf(ladder, 1);      // points 'f1', tabella [25,18,15,…]
  assert.equal(world.pointsFor(ladder, node, 1), 25);
  assert.equal(world.pointsFor(ladder, node, 2), 18);
  assert.equal(world.pointsFor(ladder, node, 11), 0, 'fuori tabella: 0, mai crash');
  assert.equal(world.pointsFor(ladder, node, 1, true), 0, 'DNF: 0');
  // pointsForPos: il primo con ordered/index prende BONUS fl + pole (25+1+1=27)
  assert.equal(
    world.pointsForPos(ladder, node, 1, false, [{}, {}], 0),
    27, 'vincitore dei round simulati porta anche fl + pole',
  );
  // il SECONDO non porta bonus
  assert.equal(world.pointsForPos(ladder, node, 2, false, [{}, {}], 1), 18);
  // il giocatore REALE porta i SUOI punti già calcolati (myPoints vince)
  assert.equal(world.pointsForPos(ladder, node, 3, false, [{}, {}, {}], 2, 12), 12);
  // sistema inesistente: 0, non crash
  assert.equal(world.pointsForPos(mkLadder({ pointsSystems: {} }), node, 1, false, [{}, {}], 0), 0);
  // DNF con myPoints: comunque 0 (la la dotte non segue)
  assert.equal(world.pointsForPos(ladder, node, 1, true, [{}, {}], 0, 99), 0);
});

test('evolveWorld: età +1, NUOVI rookie se tornano a 240, i VECCHI escono dai conti E il parco di PARTENZA non lo tocchi', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'evoluzione', 240);
  const backup = JSON.parse(JSON.stringify(w.drivers));
  const w2 = world.evolveWorld(w, ladder, 1);
  // il parco di PARTENZA è intatto (evolve NON deve scrivere dove non constante a lui)
  assert.deepEqual(w.drivers.map((d) => d.age), backup.map((d) => d.age));
  // nel nuovo: TUTTI invecchiano; chi era giovane si migliora, chi era vecchio cala
  // l'evoluzione NON cancella i ritirati dalla lista: il parco IN LISTA può
  // superare 240, ma il parco ATTIVO (chi corre) torna sempre a quota 240
  assert.ok(w2.drivers.length >= 240, 'la lista mai sotto il parco');
  const att = w2.drivers.filter((d) => d.active).length;
  assert.ok(att <= 240, `il parco ATTIVO non sfora la capienza (${att})`);
  for (const d of w2.drivers) {
    const prima = backup.find((x) => x.id === d.id);
    if (!prima) continue;
    assert.equal(d.age, prima.age + 1, `${d.name}: +1 anno`);
    // banda alla nascita 0.43..0.89 (0.72..0.985 × archetipo); solo i giovani salono e i 33+ calano (clamp 0.6..0.99)
    assert.ok(d.skill >= 0.42 && d.skill <= 1, `skill in banda anche dopo l'evoluzione: ${d.skill}`);
  }
  // e la MIA evoluzione: la stessa seed + stessa stagione = stesso mondo (determinismo)
  const w3 = world.evolveWorld(world.createWorld(ladder, 'evoluzione', 240), ladder, 1);
  assert.deepEqual(w3.drivers.map((d) => d.id), w2.drivers.map((d) => d.id));
});

test('evolveWorld: i ritiranti METTONO da parte e i rookie RENTRANO attivi a 18-22 anni', () => {
  const ladder = mkLadder();
  let w = world.createWorld(ladder, 'ritiri', 240);
  // 14 stagioni: seasons>=14 per TUTTI — il parco di partenza va tutto in pensione
  for (let s = 1; s <= 14; s++) w = world.evolveWorld(w, ladder, s);
  const vecchi = w.drivers.filter((d) => d.age > 35);
  assert.ok(vecchi.length > 0, 'i piloti di partenza sono in lista');
  assert.equal(vecchi.filter((d) => !d.active).length, vecchi.length, 'chi ha 14+ stagioni SI STA FUORI');
  const rookies = w.drivers.filter((d) => d.seasons === 0 && d.active);
  assert.ok(rookies.length > 0, 'il parco si RINNOVA: nuovi rookie');
  for (const d of rookies) assert.ok(d.age >= 18 && d.age <= 22, `rookie ${d.name} di età ${d.age}`);
  assert.ok(w.drivers.filter((d) => d.active).length <= 240, 'il parco attivo non sfora');
});

test('playerWorldSkill / skillToEvoSlider: da banda e risultati, ai cursori del gioco', () => {
  const node = { ai: [90, 80] };
  const state = { node: 'coppa', season: 1, results: {} };
  // nessun risultato: la banda dà la base 85 → ourToSkill(85) = 0.30
  const base = world.playerWorldSkill(node, state);
  // nessun risultato: la banda dà la base 85; a carriera Vergine la quota
  // media (avgShare 0) LA SCALSA DI 6: base 79, non 85 — quirk vero, ora
  // FISSATO IN TEST: chi entra nel gioco parte SOTTO il centro della serie
  assert.ok(Math.abs(base - world.ourToSkill(79)) < 1e-12, `base vergine = skill(79), non skill(85): ${base}`);
  const win = { node: 'coppa', season: 1, results: { s1: [{ season: 1, position: 1, gridSize: 12, dnf: false }] } };
  const lose = { node: 'coppa', season: 1, results: { s1: [{ season: 1, position: 4, gridSize: 12, dnf: false }] } };
  const dnf = { node: 'coppa', season: 1, results: { s1: [{ season: 1, position: 1, gridSize: 12, dnf: true }] } };
  assert.ok(world.playerWorldSkill(node, win) > world.playerWorldSkill(node, lose), 'vittoria > quartoposto');
  assert.ok(world.playerWorldSkill(node, dnf) <= base, 'un DNF non alza la base (sharing 0): al pavimento del quirk vergine −6 vale l\'uguaglianza con il mai-gareggiato');
  // fuori banda la skill si limita 0..1
  assert.equal(world.playerWorldSkill({ ai: [120, 110] }, win), 1);
  // skillToEvoSlider: ANCHORS = tratti lineari calibrati (curva reale dell'utente)
  const ladder = { aiSlider: { anchors: [[70, 10], [95, 60], [120, 110]] } };
  assert.equal(world.skillToEvoSlider(70, ladder), 10);
  assert.equal(world.skillToEvoSlider(95, ladder), 60);
  assert.equal(world.skillToEvoSlider(120, ladder), 110);
  assert.equal(world.skillToEvoSlider(82.5, ladder), 35, 'punto MEDIO dell\'ancora 1→2');
  assert.equal(world.skillToEvoSlider(125, ladder), 110, 'sopra l\'ultimo ancora: cap all\'ultimo valore');
  // senza anchors: tratto lineare ourMin..ourMax → evoMin..evoMax
  const ladder2 = { aiSlider: { ourMin: 70, ourMax: 120, evoMin: 0, evoMax: 100 } };
  assert.equal(world.skillToEvoSlider(70, ladder2), 0);
  assert.equal(world.skillToEvoSlider(95, ladder2), 50);
  assert.equal(world.skillToEvoSlider(120, ladder2), 100);
  assert.equal(world.skillToEvoSlider(60, ladder2), 0, 'sotto min: clamp 0');
});

test('midSeasonPulse: hot/cold SONO membri della griglia e il rookie DEBUTTA solo a metà calendario', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'pulse', 60);
  const node = nodeOf(ladder, 0);            // calendar 2 round: metà = 1
  const e = world.midSeasonPulse(w, ladder, node, 1, 0);
  const nomi = new Set(world.gridFor(w, ladder, node, 1).map((s) => s.name));
  for (const n of [...e.hot, ...e.cold]) assert.ok(nomi.has(n), `${n} è nella griglia della serie`);
  assert.equal(e.hot.length, 2);
  assert.equal(e.cold.length, 2);
  assert.equal(e.rookie, null, 'non a metà: nessun debutto');
  // al round di metà calendario PUÒ entrare un rookie giovane (age <=21 fuori griglia)
  const e1 = world.midSeasonPulse(w, ladder, node, 1, 1);
  if (e1.rookie != null) {
    const r = w.drivers.find((d) => d.name === e1.rookie);
    assert.ok(r.age <= 21, 'il debuttante è un GIOVANE del parco');
    assert.ok(!nomi.has(e1.rookie), 'non poteva già essere nella griglia');
  }
  // e la storia si RIPETE: stesso round = stessi nomi
  const e2 = world.midSeasonPulse(w, ladder, node, 1, 0);
  assert.deepEqual(e2.hot, e.hot, 'stesso round: stessi "in forma" — la storia non si riscrive');
});

test('paddock: il paddock dei rivali porta evoSlider e nome archetipo per ogni sedile', () => {
  const ladder = mkLadder();
  const w = world.createWorld(ladder, 'paddock', 40);
  const node = nodeOf(ladder, 0);
  const p = world.paddock(w, ladder, node, 1);
  assert.equal(p.length, node.gridSize - 1);
  for (const s of p) {
    assert.equal(s.archetypeName, ladder.archetypes[s.archetype].name);
    assert.equal(s.evoSlider, world.skillToEvoSlider(s.bandValue, ladder), `evoSlider coerente per ${s.name}`);
  }
});

test('utilità: slug, hash32, rng e ourToSkill sono GLI stessi coi SEMI al metro', () => {
  // la Ø (U+00D8) NON si scompone in NFD: resta un non-[a-z0-9] e sale a separator
  assert.equal(world.slug('Müller账户 Fabi-Ø2'), 'muller_fabi_2');
  assert.equal(world.slug('  Volgare  Settore3!'), 'volgare_settore3');
  const h1 = world.hash32('pista');
  assert.equal(world.hash32('pista'), h1, 'hash deterministico');
  assert.equal(world.hash32('pista'), h1 >>> 0, 'unsigned 32bit');
  // rng stesso seed = stessa sequenza; seed diverso = sequenza diversa
  const r1 = world.rng('a-seed');
  const seq1 = [r1(), r1(), r1()];
  const r2 = world.rng('a-seed');
  assert.deepEqual([r2(), r2(), r2()], seq1);
  const r3 = world.rng('b-seed');
  assert.notEqual(r3(), seq1[0]);
  // sequenza in [0,1)
  for (const v of seq1) assert.ok(v >= 0 && v < 1);
  // ourToSkill: la scala della difficoltà interna
  assert.equal(world.ourToSkill(70), 0);
  assert.equal(world.ourToSkill(120), 1);
  assert.equal(world.ourToSkill(95), 0.5);
  assert.equal(world.ourToSkill(50), 0, 'clamp sotto');
  assert.equal(world.ourToSkill(200), 1, 'clamp sopra');
});
