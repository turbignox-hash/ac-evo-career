// Il gate delle serie: piazzamento nella feeder + reputazione per le closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-gate-'));
const { gateStatus, isClosedNode } = await import('../src/state.mjs');

const ladder = { nodes: [{ nodeId: 'f1', display: 'F1 Junior' }] };
const mkNode = (over = {}) => ({ nodeId: 'x', display: 'Serie X', ...over });

test('gate: serve un piazzamento nei primi N nella serie feeder', () => {
  const node = mkNode({ requires: { nodeId: 'f1', top: 3 } });
  const g1 = gateStatus(ladder, { bestFinish: {}, rep: 999 }, node);
  assert.equal(g1.ok, false);
  assert.ok(g1.reasons[0].includes('mai corso'));
  assert.equal(gateStatus(ladder, { bestFinish: { f1: 5 }, rep: 999 }, node).ok, false);
  assert.equal(gateStatus(ladder, { bestFinish: { f1: 3 }, rep: 999 }, node).ok, true);
});

test('gate: reputazione minima per le serie a parco chiuso', () => {
  const node = mkNode({ repRequired: 50 });
  assert.equal(gateStatus(ladder, { bestFinish: {}, rep: 10 }, node).ok, false);
  assert.equal(gateStatus(ladder, { bestFinish: {}, rep: 50 }, node).ok, true);
});

test('isClosedNode: access closed o economia factory', () => {
  assert.equal(isClosedNode({ access: 'closed' }), true);
  assert.equal(isClosedNode({ econ: { model: 'factory' } }), true);
  assert.equal(isClosedNode({ access: 'open', econ: { model: 'sponsor' } }), false);
});
