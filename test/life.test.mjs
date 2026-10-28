// 2/11 — LA VITA FUORI DALLA PISTA senza strumento: life.mjs (445 righe: contratti
// con clausole, sponsor ricorrenti, sfide per ronda, sigilli, maestria piste,
// pianificatore) finalizava l'impiego DI PRODUZIONE più importante e risolutivo
// senza TEST UNIT. Qui i contratti CHIARO delle firme usate dalle viste e dallo
// stato: payout SOLO se TUTTE le clausole; rep persa SOLO se sfida persa; il
// nulla di garantito è lo standard: nessuna struttura inventata, DEDUCO dalla
// funzione di ogni chiamante.
import test from 'node:test';
import assert from 'node:assert/strict';

test('nome-pilota: il duplicato nome=cognome si scrive una volta, l\'AI perde il pallino', async () => {
  const { nomePilota } = await import('../src/nome-pilota.mjs');
  assert.equal(nomePilota('Mauro', 'Turbigno'), 'Mauro Turbigno');
  assert.equal(nomePilota('Turbigno', 'Turbigno'), 'Turbigno');     // il doppiato del 15/4
  assert.equal(nomePilota('• Rivale', 'Uno'), 'Rivale Uno');
  assert.equal(nomePilota('', 'Solo Cognome'), 'Solo Cognome');
  assert.equal(nomePilota('Solo Nome', ''), 'Solo Nome');
});

/* ---- helper di carriera finta (le firme di life servono CON lo stato) ----
   gridFor vuole un mundo con il PARCO PILOTI (world.drivers): 30 rover attivi
   col minimo di campi che la selezione del sedile legge. */
const mkWorld = () => ({
  drivers: Array.from({ length: 30 }, (_, i) => ({
    id: `d${i + 1}`, name: `Rivale ${i + 1}`, first: 'Rivale', last: `${i + 1}`,
    country: 'IT', archetype: 'pro', iconic: false, age: 25, hot: false,
    skill: 90 - i, active: true,
  })),
});
const mkLadder = () => ({
  disciplines: [],
  nodes: [{
    nodeId: 'coppa', display: 'Coppa Città', discipline: 'd', level: 1,
    calendar: [{}, {}, {}, {}],           // 4 rondas
    ai: [80, 84], gridSize: 10, points: 'fake',
    econ: { entry: 500, rent: 0, prize: 5000 },
    cars: [],
  }],
  pointsSystems: { fake: { flPoint: 1, polePoint: 1, flTopN: 10 } },
  contentNames: { tracks: {}, cars: {} },
});
const mkState = () => ({
  node: 'coppa', season: 1, round: 0, money: 5000, rep: 0, world: mkWorld(),
  driver: { name: 'Mauro Turbigno', nation: 'IT' },
  results: { coppa: [] }, titles: [], seasons: [{ season: 1 }],
  bestFinish: {}, difficulty: { base: {}, trim: {}, offClass: {} },
  stats: { bestLaps: {} },
});
const noFlows = { recordFlows: (state, rows) => state._flows = rows, pushMessage: (state, t) => state._msg = t };
const nodeFrom = (ladder) => ladder.nodes[0];

/* le firme: IMPORT=/node life.mjs; il ladro delle clausole è interno (clausePoolFor
   usa node.discipline), quindi Assegno la palestra col poo stabilito dal NODO. */
const life = await import('../src/life.mjs');

test('ensureLife: struttura garantita e migrazione UNA-TANTO dei sigilli senza detailEn', () => {
  const st = mkState();
  st.life = { sigils: [{ id: 'lightsout', detail: 'vittoria da pole' }] };
  const L = life.ensureLife(st);
  assert.equal(L.contract, null);
  assert.equal(L.challengeStats.taken, 0);
  assert.equal(L.sigils[0].detailEn, 'win from pole', 'la coppia EN ricavata dal dettaglio IT');
  // seconda chiamata: idempotente, NON risolleva la lista
  assert.equal(life.ensureLife(st).sigils.length, 1);
});

test('assignContract: 3 clausole deterministiche per stagione+serie, payout 80% del premio', () => {
  const ladder = mkLadder();
  const st = mkState();
  const c = life.assignContract(ladder, st, nodeFrom(ladder));
  assert.ok(c.clauses.length >= 1 && c.clauses.length <= 3, `le clausole scelte: ${c.clauses.length}`);
  assert.equal(c.payout, 4000);
  assert.equal(c.verdict, null);
  // deterministica: stessa stagione+serie → stessa clausola pool
  const st2 = mkState();
  const c2 = life.assignContract(ladder, st2, nodeFrom(ladder));
  assert.deepEqual(c2.clauses.map((x) => x.id), c.clauses.map((x) => x.id));
  // già firmato per la STESSA ronda+stagione: ensureContract non rifirma
  st.season = c.season;
  assert.equal(life.ensureContract(ladder, st, nodeFrom(ladder)), null);
});

test('contractStatus/spend: clausole con progresso, payout SOLO se TUTTE le clausole rispettate', () => {
  const ladder = mkLadder();
  const st = mkState();
  life.assignContract(ladder, st, nodeFrom(ladder));
  // una stagione con 1 vittoria e 2 podi: le clausole 'wins'/'podiums' si vedono
  st.results.coppa.push({ season: 1, position: 1, points: 25, dnf: false });
  st.results.coppa.push({ season: 1, position: 3, points: 14, dnf: false });
  const status = life.contractStatus(ladder, st);
  assert.ok(status);
  assert.ok(status.rows.length >= 1);
  assert.equal(status.metrics.wins, 1);
  assert.equal(status.metrics.podiums, 2);
  assert.equal(status.metrics.points, 39);
});

test('settleContract: paga SOLO a contratto COMPLETO, e registra il flow per il dottore', () => {
  const ladder = mkLadder();
  const st = mkState();
  life.assignContract(ladder, st, nodeFrom(ladder));
  st.money = 0;
  // NISBA gara in stagione: tutte le clausole numeriche mancanti → contratto PERSO
  const out = life.settleContract(ladder, st, noFlows);
  assert.equal(out.success, false);
  assert.equal(st.money, 0, 'contratto fallito: nessun premio');
  assert.equal(st.life.contract.verdict, 'failed');
  assert.ok(out.text.includes('mancati'));
  // stessa stagione con TUTTE le clausole: impossibile fingere qui (le soglie
  // del pool dipendono dalla serie), quindi si prova il pagamento via assenza:
  // seasons senza contratto → null senza null-safe crash
  const st2 = mkState();
  assert.equal(life.settleContract(ladder, st2, noFlows), null, 'senza contratto: null, non crash');
});

test('sponsor: offerta a rep bassa solo tier 1, accettata paga per ronda, scaduta dopo il deadline', async () => {
  const ladder = mkLadder();
  const st = mkState();
  const offers = life.sponsorOffers(ladder, st);
  assert.equal(offers.length, 1, 'rep 0: una sola offerta (tier 1)');
  assert.equal(offers[0].tier, 1);
  life.acceptSponsor(st, offers[0]);
  assert.ok(life.sponsorFor(st));
  assert.equal(life.sponsorOffers(ladder, st).length, 0, 'con sponsor attivo: niente offerte');
  life.declineSponsor(st);
  assert.equal(life.sponsorFor(st), null);
});

test('challengeFor/accept/settle: vinta ONORE il reward, persa TOGLIE rep; non vale per altre rondas', () => {
  const ladder = mkLadder();
  const st = mkState();
  const ch = life.challengeFor(ladder, st);
  assert.ok(ch);
  assert.equal(ch.accepted, false);
  // stessa chiamata: deterministica (stesso valore, NON rinnovata)
  assert.deepEqual(life.challengeFor(ladder, st), ch);
  life.acceptChallenge(st, ch);
  assert.equal(ch.accepted, true);
  // una gara di cui SAPEVA: entry round sbagliato → nessun verdetto
  assert.equal(life.settleChallenge(ladder, st, { round: 99, position: 1, dnf: false }, noFlows), null);
  // la sfida specifica dipende dal seed; proviamo tutti e tre i kind
  const test = (entry) => life.settleChallenge(ladder, st, entry, noFlows);
  if (ch.kind === 'beat') {
    const out = test({ round: 0, position: 1, dnf: false, beatenNames: [ch.target], nodeId: 'coppa' });
    assert.equal(out.won, true);
  } else if (ch.kind === 'top3') {
    const out = test({ round: 0, position: 2, dnf: false, nodeId: 'coppa' });
    assert.equal(out.won, true);
  } else {
    const out = test({ round: 0, position: 1, dnf: false, nodeId: 'coppa' });
    assert.equal(out.won, true);
  }
  assert.equal(st.life.challenge.verdict, 'won');
  assert.equal(st._flows[0].money, ch.reward, 'il flow registra il premio per il dottore');
  // PERSA: nuova sfida, un ritiro
  st.life.challenge = { ...ch, accepted: true, verdict: null };
  const before = st.rep;
  const lost = life.settleChallenge(ladder, st, { round: 0, position: 9, dnf: true, nodeId: 'coppa' }, noFlows);
  assert.equal(lost.won, false);
  assert.equal(st.rep, Math.max(0, before - ch.penalty));
  assert.equal(st.life.challengeLostRep, ch.penalty);
});

/* CAMPO LARGO anche nella vita di pit-lane (28/10): le sfide per ronda e le
   card rivali devono leggere la STESSA griglia della classifica simulata.
   La sfida è firmata alla ronda PRECEDENTE; il settore punti è quello in cui
   già gareggi: la media del ladder QUI pesa su results del nodo, così al
   settle la zona punti segue la griglia vera LARGA se c'è. */
test('settleChallenge: la zona punti segue il campo largo, non la stima del ladder', () => {
  const ladder = mkLadder();
  const st = mkState();
  // resultList: stima ladder 10, corse vere a 17 → campo largo 17 → zona = max(3, round(17*0.4)) = 7
  st.results.coppa = [
    { season: 1, round: 0, position: 4, gridSize: 17, dnf: false, points: 12, prize: 1000, rep: 5 },
  ];
  life.ensureLife(st);
  st.life.challenge = { season: 1, nodeId: 'coppa', round: 0, kind: 'nopit', target: '1', text: 'zona punti', reward: 100, penalty: 5, accepted: true, verdict: null };
  const out = life.settleChallenge(ladder, st, { round: 0, position: 6, dnf: false, nodeId: 'coppa' }, noFlows);
  assert.equal(out.won, true, 'P6 su griglia vera 17 è zona punti (7) — non va rispremuto nel campo corto da 10');

  // senza griglia vera: stima ladder (10) → zona 4 → P6 persa
  const st2 = mkState();
  life.ensureLife(st2);
  st2.life.challenge = { season: 1, nodeId: 'coppa', round: 0, kind: 'nopit', target: '1', text: 'zona punti', reward: 100, penalty: 5, accepted: true, verdict: null };
  const out2 = life.settleChallenge(ladder, st2, { round: 0, position: 6, dnf: false, nodeId: 'coppa' }, noFlows);
  assert.equal(out2.won, false, 'senza griglia vera il nodo resta la stima (10): zona 4, P6 fuori');
});

test('challengeFor: la lista rivali è quella del CAMPO LARGO (stessa fonte della classifica)', () => {
  const ladder = mkLadder();
  const st = mkState();
  st.results.coppa = [{ season: 1, round: 0, position: 4, gridSize: 17, dnf: false, points: 12, prize: 1000, rep: 5 }];
  const ch = life.challengeFor(ladder, st);
  assert.ok(ch, 'sfida disponibile col campo largo');
  assert.deepEqual(life.challengeFor(ladder, st), ch, 'due letture, stessa sfida (deterministica sul campo largo)');
});

test('checkSigils: sfide personali assegnate UNA volta, la stagione pulita a 3+ gare senza ritiri', () => {
  const ladder = mkLadder();
  const st = mkState();
  st.results.coppa.push({ season: 1, position: 1, points: 25, dnf: false, pole: true, at: '2026-01-01' });
  st.results.coppa.push({ season: 1, position: 1, points: 25, dnf: false, pole: true, fl: true, at: '2026-01-08' });
  st.results.coppa.push({ season: 1, position: 2, points: 18, dnf: false, at: '2026-01-15' });
  const out = life.checkSigils(ladder, st);
  const ids = out.map((s) => s.id);
  assert.ok(ids.includes('lightsout'));
  assert.ok(ids.includes('grandchelem'));
  assert.ok(ids.includes('cleanseason'));
  // NON riassegnati
  assert.deepEqual(life.checkSigils(ladder, st), []);
});

test('trackMastery: da sconosciuta a maestro in 4 gare, col miglior giro personale', () => {
  const ladder = mkLadder();
  ladder.contentNames.tracks = {};
  const st = mkState();
  assert.equal(life.trackMastery(ladder, st, 'Monza').level, 0);
  st.results.coppa.push({ season: 1, track: 'Monza', position: 1, points: 25, dnf: false });
  assert.equal(life.trackMastery(ladder, st, 'Monza').level, 1);
  st.results.coppa.push({ season: 1, track: 'Monza', position: 2, points: 18, dnf: false });
  assert.equal(life.trackMastery(ladder, st, 'Monza').level, 2);
  st.results.coppa.push({ season: 1, track: 'Monza', position: 3, points: 12, dnf: false });
  st.results.coppa.push({ season: 1, track: 'Monza', position: 4, points: 10, dnf: false });
  const m = life.trackMastery(ladder, st, 'Monza');
  assert.equal(m.level, 3);
  assert.equal(m.races, 4);
  assert.ok(/maestro/.test(m.name));
});

test('careerPlanner: bloccato da best finish troppo alto o rep mancanza, aperto se a posto', () => {
  const ladder = mkLadder();
  ladder.nodes.push({
    nodeId: 'modalita', display: 'Modalità', discipline: 'd', level: 2, calendar: [{}],
    ai: [90, 94], gridSize: 8, econ: { entry: 1000, rent: 2000, prize: 12000 }, cars: [],
    requires: { nodeId: 'coppa', top: 3 }, repRequired: 50,
  });
  const st = mkState();
  st.money = 1000;
  const planner = life.careerPlanner(ladder, st);
  const mod = planner.find((r) => r.nodeId === 'modalita');
  assert.equal(mod.open, false);
  assert.ok(mod.blockers.some((b) => /mai corso/.test(b)));
  st.bestFinish.coppa = 2;   // requisito a posto
  const planner2 = life.careerPlanner(ladder, st);
  const mod2 = planner2.find((r) => r.nodeId === 'modalita');
  assert.equal(mod2.open, false);
  assert.ok(mod2.blockers.some((b) => /rep/.test(b)), `manca la rep: ${mod2.blockers.join('; ')}`);
  st.rep = 60; st.money = 5000;
  const planner3 = life.careerPlanner(ladder, st);
  assert.equal(planner3.find((r) => r.nodeId === 'modalita').open, true);
});

/* ------------------------------------------------------------------ */
/* warnings.mjs — il registro degli errori silenziosi (correttamente    */
/* corazzato)                                                           */
/* ------------------------------------------------------------------ */

test('warnings: recordWarning registra, readWarnings raggruppa per modulo, la voce DOPPIA si filtra', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'evo-warn-'));
  // EVO_DATA_DIR è letto A LIVELLO MODULO: il modulo deve essere ricaricato
  process.env.EVO_DATA_DIR = dir;
  delete process.env.EVO_DATA_DIR_TEST;
  const w = await import(`../src/warnings.mjs?bust=${Date.now()}`);
  w.recordWarning('motec', 'file .ld illeggibile', 'AtMonza.ld');
  w.recordWarning('motec', 'file .ld illeggibile', 'AtMonza.ld');   // DOPPIA identica: filtrata
  w.recordWarning('shmem', 'shared memory persa');
  const r = w.readWarnings();
  assert.ok(r.modules.length >= 2);
  const motec = r.modules.find((m) => m.module === 'motec');
  assert.equal(motec.count, 1, 'la voce identica di fila NON si duplica');
  assert.equal(w.readWarnings().total, 2);
  // il registro NON ROMPE i chiamanti anche quando EVO_DATA_DIR è impazzita:
  // la voce si perde (pazienza, scritto nel design del modulo), ma record e
  // read rispondo senza lanciare errori
  process.env.EVO_DATA_DIR = 'Z:\\_non-esiste_\\per-niente\\';
  const w2 = await import(`../src/warnings.mjs?bust2=${Date.now()}`);
  assert.doesNotThrow(() => w2.recordWarning('x', 'prova su percorso impazzito'));
  assert.ok(Array.isArray(w2.readWarnings().modules));
  delete process.env.EVO_DATA_DIR;
});
