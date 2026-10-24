import "./_flows-sandbox.mjs"; // sandbox flussi
// garage-seat.test.mjs — la precedenza del garage all'ingresso in serie:
// se il pool auto della serie combacia con un'auto in garage, il sedile
// non si noleggia (e con garage vuoto o auto diversa si paga come sempre).
import test from 'node:test';
import assert from 'node:assert/strict';
import { enterNode } from '../src/state.mjs';

// i test descrivono la scalata canonica: la modalità «senza vincoli» (se il
// dev ce l'ha accesa sulla sua data/) non dovrà regalare affitti qui
process.env.EVO_SENZA_VINCOLI = '0';

const mkNode = (cars, rent = 3000) => ({
  nodeId: 'n1',
  display: 'Serie Prova',
  level: 1,
  discipline: 'touring',
  access: 'open',
  cars,
  econ: { model: 'pocket', buy: 70000, rent, entry: 900, prize: 7000 },
  calendar: [{}, {}, {}],
  points: {},
});
const mkLadder = (node) => ({
  nodes: [node],
  contentNames: { cars: {} },
});
const mkState = (garageCars) => {
  const state = {
    season: 1,
    money: 10000,
    rep: 0,
    node: null,
    round: 0,
    agenda: { day: 1 },
    bestFinish: {},
    results: { n1: [] },
    garage: garageCars === null ? undefined : { cars: garageCars, importedFromShowcase: [] },
    messages: [],
  };
  return state;
};
const messages = (state) => state.messages.map((m) => m.text ?? '').join(' | ');

test('auto del garage combaciante: il sedile non si noleggia', () => {
  const node = mkNode(['ks_peugeot_205_t16']);
  const state = mkState([{ carId: 'peugeot_205_t16', carName: 'Peugeot 205 T16', how: 'won', since: '2026-10-01' }]);
  enterNode(mkLadder(node), state, node);
  assert.equal(state.money, 10000, 'niente affitto: l\u2019auto \u00e8 tua');
  assert.match(messages(state), /garage/i);
});

test('auto del garage combaciante per nome completo: stessa precedenza', () => {
  const node = mkNode(['ks_peugeot_205_t16']);
  const state = mkState([{ carId: 'altro_id', carName: 'Peugeot 205 T16', how: 'won', since: '2026-10-01' }]);
  enterNode(mkLadder(node), state, node);
  assert.equal(state.money, 10000);
});

test('garage vuoto: l\u2019affitto si paga come prima', () => {
  const node = mkNode(['ks_peugeot_205_t16']);
  const state = mkState([]);
  enterNode(mkLadder(node), state, node);
  assert.equal(state.money, 7000, 'affitto 3000 staccato');
  assert.match(messages(state), /Hai affittato il sedile/);
  assert.doesNotMatch(messages(state), /garage/i);
});

test('auto DIVERSA in garage: l\u2019affitto si paga (nessun falso match)', () => {
  const node = mkNode(['ks_mazda_mx5_na']);
  const state = mkState([{ carId: 'peugeot_205_t16', carName: 'Peugeot 205 T16', how: 'won', since: '2026-10-01' }]);
  enterNode(mkLadder(node), state, node);
  assert.equal(state.money, 7000);
});

test('pool multiclasse: un\u2019sola auto in garage fra le tre basta a coprire il sedile', () => {
  const node = mkNode(['ks_peugeot_205_t16', 'ks_ford_escort_rs_cosworth', 'ks_lancia_delta_hf_integrale_evo_ii'], 8000);
  const state = mkState([{ carId: 'peugeot_205_t16', carName: 'Peugeot 205 T16', how: 'won', since: '2026-10-01' }]);
  enterNode(mkLadder(node), state, node);
  assert.equal(state.money, 10000);
});

test('MX-5 NA vs ND: varianti diverse NON si confondono', () => {
  const node = mkNode(['ks_mazda_mx5_na']);
  const state = mkState([{ carId: 'mazda_mx5_nd_cup', carName: 'Mazda MX-5 ND Cup', how: 'won', since: '2026-10-01' }]);
  enterNode(mkLadder(node), state, node);
  assert.equal(state.money, 7000, 'la ND cup non copre la serie NA');
});
