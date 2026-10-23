import "./_flows-sandbox.mjs";
// difficulty-evento.test.mjs — la scheda difficoltà DEVE mostrare l'evento
// speciale (richiesta Mauro 23/10: "non vedo nessun evento speciale"). Non è
// una serie del ladder: nasce come riga in CIMA con ★, banda fissa 88–93 della
// card evento (o override `evento_*` scritto dall'utente), senza base/trim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCard } from '../src/events.mjs';
import { viewDifficulty } from '../src/webui-views.mjs';

const mkEvent = () => ({
  id: 'ev_test', kind: 'special-race', tier: 'finale',
  createdAt: new Date().toISOString(), season: 5, afterRound: 0,
  theme: { id: 'legend_finale', name: 'Il Gran Finale dei Campioni', nameEn: 'The Champions\u2019 Grand Finale' },
  trackId: 'kyalami', trackDisplay: 'Kyalami', weather: 0, laps: 10, hour: 17, timeScale: 1,
  guests: ['Hans Stuck'],
  prize: { carId: 'lamborghini_countach_lp5000_qv', carName: 'Lamborghini Countach LP5000 QV', money: 21000, rep: 15, duplicateCash: false },
  deadlineRounds: 99, acceptedAt: new Date().toISOString(),
});
const mkState = (active) => ({
  season: 5, money: 10000, rep: 0, results: {}, round: 0, node: 'coppa_gt86-cup',
  events: { active, history: [], showCase: [], lastRoundChecked: null },
  difficulty: { mode: 'adaptive', base: {}, trim: {}, locked: [], offClass: {}, offTrack: {} },
});
const mkLadder = () => ({
  nodes: [{ nodeId: 'coppa_gt86-cup', level: 1, discipline: 'gt', display: 'Toyota GR86 Cup', ai: [90, 94], calendar: [{ track: 'kyalami' }] }],
  disciplines: [],
  contentNames: { cars: {}, tracks: {} },
});

test('viewDifficulty: con evento attivo la riga ★ evento è in cima con la banda 88-93', () => {
  const ladder = mkLadder(), state = mkState(mkEvent());
  const v = viewDifficulty(ladder, state);
  assert.equal(v.rows[0].id, 'evento_legend_finale', 'la riga evento è in cima');
  assert.match(v.rows[0].display, /★ /);
  assert.match(v.rows[0].display, /evento speciale/);
  assert.equal(v.rows[0].rangeMin, 88);
  assert.equal(v.rows[0].rangeMax, 93);
  assert.equal(v.rows[0].base, '—', 'senza base: colonna del ladder');
  assert.equal(v.rows[0].trim, '—', 'senza trim: colonna del ladder');
  assert.equal(v.rows[0].evento, true);
  // le serie restano tutte sotto
  assert.ok(v.rows.some((r) => r.id === 'coppa_gt86-cup'));
});

test('viewDifficulty: override evento_* salvato dall\'utente vince sul fisso 88-93', () => {
  const ladder = mkLadder(), state = mkState(mkEvent());
  state.raceSettings = { evento_legend_finale: { sliderMin: 90, sliderMax: 96 } };
  const v = viewDifficulty(ladder, state);
  assert.equal(v.rows[0].rangeMin, 90);
  assert.equal(v.rows[0].rangeMax, 96);
  assert.equal(v.rows[0].overridden, true);
});

test('viewDifficulty: override banda LARGA (niente clamp a gap 1, è l\'evento)', () => {
  const ladder = mkLadder(), state = mkState(mkEvent());
  state.raceSettings = { evento_legend_finale: { sliderMin: 88, sliderMax: 93 } };
  const v = viewDifficulty(ladder, state);
  assert.equal(v.rows[0].rangeMax - v.rows[0].rangeMin, 5, 'l\'evento può stare largo');
});

test('viewDifficulty senza evento attivo: la scheda resta quella delle sole serie', () => {
  const ladder = mkLadder(), state = mkState(null);
  const v = viewDifficulty(ladder, state);
  assert.ok(!v.rows.some((r) => r.evento), 'nessuna riga evento');
  assert.equal(v.rows.length, 1);
});

test('coerenza con la card: la banda mostrata in scheda è quella della Difficoltà AI evento', () => {
  const ladder = mkLadder(), state = mkState(mkEvent());
  state.raceSettings = { evento_legend_finale: { sliderMin: 89, sliderMax: 95 } };
  const card = eventCard(ladder, state);
  assert.equal(card.diffMin, 88, 'la CARD resta il fisso 88–93, non mostra l\'override');
  assert.equal(card.diffMax, 93);
  const v = viewDifficulty(ladder, state);
  assert.equal(v.rows[0].rangeMin, 89);
  assert.equal(v.rows[0].rangeMax, 95);
  const scheda = card.settings.find(([k]) => k === 'Difficoltà AI')?.[1] ?? '';
  assert.equal(scheda, '88–93 %');
});
