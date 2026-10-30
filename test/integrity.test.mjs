// 30/10 — Il dottore in occhiali: integrity.mjs non aveva NESSUN test (era nella
// lista dei moduli mai toccati) e protegge la verità della carriera: statistiche
// ricalcolate dalle gare, cassa/rep ricostruita dal REGISTRO FLUISSI, coerenza
// interna delle gare (ritiro in P1, giro malformato, annuncio perso).
// Sandbox: flussi isolati (_flows-sandbox, il registro vero del PC non si tocca)
// e EVO_DATA_DIR in tmpdir — fixIntegrity scrive davvero il save (atomico).
import './_flows-sandbox.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-integrita-'));
process.env.EVO_SENZA_VINCOLI = '0';

const { checkIntegrity, fixIntegrity } = await import('../src/integrity.mjs');
const flows = await import('../src/flows.mjs');

/* ------------------ fixture ------------------ */
const ladder = {
  nodes: [{
    nodeId: 'coppa', display: 'Coppa Città',
    calendar: [{ name: 'Gara 1' }, { name: 'Gara 2' }, { name: 'Gara 3' }],
  }],
};

const mkState = (over = {}) => ({
  money: 6000,
  rep: 0,
  season: 0,
  node: 'coppa',
  stats: {},
  results: {},
  messages: [],
  ...over,
});

const gara = (over = {}) => ({
  at: '2026-10-30T10:00:00Z',
  nodeId: 'coppa', round: 0,
  position: 1, laps: 8, fl: true, pole: true,
  bestLap: '1:52.34',
  ...over,
});

const statsOf = (gare) => ({
  races: gare.length,
  wins: gare.filter((r) => !r.dnf && r.position === 1).length,
  podiums: gare.filter((r) => !r.dnf && r.position <= 3).length,
  fastestLaps: gare.filter((r) => r.fl).length,
  poles: gare.filter((r) => r.pole === true).length,
  laps: gare.reduce((a, r) => a + (r.laps ?? 0), 0),
});

/* ------------------ il dottore a riposo ------------------ */
test('senza gare registrate: zero anomalie (nessun frignare a vuoto)', () => {
  assert.deepEqual(checkIntegrity(ladder, mkState()), []);
});

test('carriera coerente: zero anomalie', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st); // cassa/rep allineate al registro
  assert.deepEqual(checkIntegrity(ladder, st), []);
});

/* ------------------ statistiche storte ------------------ */
test('statistiche storte (races/wins/podiums/fastestLaps): anomalia HIGH per ognuna', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = { races: 5, wins: 0, podiums: 0, fastestLaps: 0, poles: 1, laps: 8 };
  const issues = checkIntegrity(ladder, st).filter((i) => i.severity === 'high' && /Statistiche/.test(i.text));
  assert.equal(issues.length, 4);
  assert.match(issues[0].text, /risulta 1/);
});

test('giri percorsi storto: anomalia MEDIUM con i due dati nel testo', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = { races: 1, wins: 1, podiums: 1, fastestLaps: 1, poles: 1, laps: 99 };
  const issues = checkIntegrity(ladder, st).filter((i) => i.severity === 'medium' && /Giri percorsi/.test(i.text));
  assert.equal(issues.length, 1);
  assert.match(issues[0].text, /dice 99.*risulta 8/);
});

/* ------------------ cassa e reputazione ------------------ */
test('cassa fuori dal registro flussi: HIGH con il segno della differenza', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  st.money += 1000; // scassina dopo il seed
  const issues = checkIntegrity(ladder, st).filter((i) => /Cassa/.test(i.text));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'high');
  assert.match(issues[0].text, /diff 1000/);
});

test('reputazione fuori dal registro: HIGH con la differenza negativa', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  st.rep -= 7;
  const issues = checkIntegrity(ladder, st).filter((i) => /Reputazione/.test(i.text));
  assert.equal(issues.length, 1);
  assert.match(issues[0].text, /diff -7/);
});

/* ------------------ coerenza interna della gara ------------------ */
test('ritiro in posizione 1: MEDIUM "dati contraddittori"', () => {
  const st = mkState({ results: { coppa: [gara({ dnf: true, position: 1, fl: false, pole: false })] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  const issues = checkIntegrity(ladder, st).filter((i) => /ritiro ma posizione 1/.test(i.text));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'medium');
  assert.match(issues[0].text, /Coppa Città/);
});

test('miglior giro in formato strano: LOW e riconosciuto (era una brancha morta)', () => {
  const st = mkState({ results: { coppa: [gara({ bestLap: 'no-sono-un-giro' })] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  const issues = checkIntegrity(ladder, st).filter((i) => /formato strano/.test(i.text));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'low');
  assert.match(issues[0].text, /no-sono-un-giro/);
});

test('gara recente senza annuncio in bacheca con bacheca VIVA: LOW "Manca l\'annuncio"', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  // bacheca viva: un messaggio più VECCHIO della gara (la gara quindi è dentro il cap)
  st.messages = [{ at: '2026-10-30T09:00:00Z', text: 'Messaggio vecchio innocente' }];
  const issues = checkIntegrity(ladder, st).filter((i) => /Manca l'annuncio in bacheca/.test(i.text));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'low');
  assert.match(issues[0].text, /Gara 1/);
});

test('annuncio scappato dal cap: la regola degli annunci scappati non grida', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  // l'annuncio della gara è stato spinto FUORI dal ring: in bacheca resta solo
  // un messaggio PIÙ NUOVO della gara → la gara è "scappata", non "mancante"
  st.messages = [{ at: '2026-10-30T11:00:00Z', text: 'Messaggio più nuovo' }];
  const issues = checkIntegrity(ladder, st);
  assert.equal(issues.filter((i) => /annuncio/.test(i.text)).length, 0);
});

test('annuncio con rawPos (penalità riscritta dopo): la STESSA gara, non un annuncio perso', () => {
  const st = mkState({ results: { coppa: [gara({ position: 11, rawPos: 5, penalty: 5.0 })] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  st.messages = [{ at: '2026-10-30T10:00:01Z', text: 'Coppa Città Gara 1: P5! Premio' }];
  const issues = checkIntegrity(ladder, st);
  assert.equal(issues.filter((i) => /annuncio/.test(i.text)).length, 0);
});

test('annuncio a due secondi dalla gara con parola "premio": match per istante', () => {
  const st = mkState({ results: { coppa: [gara({ fl: false, pole: false, bestLap: null })] } });
  st.stats = statsOf(st.results.coppa);
  flows.seedFlowsFrom(st);
  st.messages = [{ at: '2026-10-30T10:00:02Z', text: 'Premio di 5000 assegnato' }];
  const issues = checkIntegrity(ladder, st);
  assert.equal(issues.filter((i) => /annuncio/.test(i.text)).length, 0);
});

/* ------------------ la cura ------------------ */
test('fixIntegrity dryRun: elenca la cura MAI eseguita', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = { races: 5, wins: 0, podiums: 0, fastestLaps: 0, poles: 1, laps: 99 };
  flows.seedFlowsFrom(st);
  st.money += 500;
  const before = { ...st.stats, money: st.money, rep: st.rep };
  const { ok, fixed, issues } = fixIntegrity(ladder, st, { dryRun: true });
  assert.equal(ok, true);
  assert.ok(issues.length >= 5);
  assert.ok(fixed.some((f) => f.startsWith('stats.races')));
  assert.equal(st.stats.races, before.races, 'dryRun: il save non cambia');
  assert.equal(st.money, before.money);
});

test('fixIntegrity con vera lente: sistema statistiche + cassa e lascia zero anomalie', () => {
  const st = mkState({ results: { coppa: [gara()] } });
  st.stats = { races: 5, wins: 0, podiums: 0, fastestLaps: 0, poles: 1, laps: 99 };
  flows.seedFlowsFrom(st);
  st.money += 500; // scassina DOPO il seed
  const { ok, fixed } = fixIntegrity(ladder, st);
  assert.equal(ok, true);
  assert.ok(fixed.includes('money = 6000'));
  const issues = checkIntegrity(ladder, st);
  assert.deepEqual(issues, [], JSON.stringify(issues));
  assert.equal(st.stats.races, 1);
  assert.equal(st.money, 6000);
  // il save atomicalmente scritto nel sandbox: c'è un evo-career.save.json
  const slotDir = join(process.env.EVO_DATA_DIR); // slot 1 → direttamente in EVO_DATA_DIR
  const files = readdirSync(slotDir);
  assert.ok(files.some((f) => /evo-career\.save(\.json)?$/.test(f)), JSON.stringify(files));
});
