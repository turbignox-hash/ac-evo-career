// freni-danni.test.mjs — i dati che esistevano e non parlavano (4/11).
// 1) parseGraphics legge brake_temp_c dal blocco TyreState (offset 16) delle
//    quattro ruote: prima restava null.
// 2) engineerLive traduce i danni (%) e lo SQUILIBRIO termico dei freni in
//    radio — nessun limite assoluto inventato, solo differenze relative.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GFX, parseGraphics } from '../src/shmem.mjs';
import { engineerLive } from '../src/engineer.mjs';

test('parseGraphics: temperature freno per ruota dal blocco tyre', () => {
  const buf = Buffer.alloc(GFX.gapBehind + 8);
  const vals = [420, 430, 300, 310];
  ['tyreLF', 'tyreRF', 'tyreLR', 'tyreRR'].forEach((k, i) => {
    buf.writeFloatLE(vals[i], GFX[k] + 16);
  });
  const g = parseGraphics(buf);
  assert.deepEqual(g.brakeTempC, vals);
});

test('parseGraphics: buffer senza freni validi → null, non zeri fantasma', () => {
  const g = parseGraphics(Buffer.alloc(GFX.gapBehind + 8));
  assert.equal(g.brakeTempC, null);
});

const baseSnap = (player = {}) => ({
  live: true,
  session: { type: 'Race' },
  player: {
    fuel: 40, lapsTotal: 40, lapsDone: 10,
    tyreWear: [0.2, 0.2, 0.2, 0.2], tyreCoreTemp: [80, 80, 80, 80],
    gapAhead: null, gapBehind: null,
    damage: [0, 0, 0, 0, 0], brakeTempC: [400, 410, 300, 310],
    ...player,
  },
});

test('radio danni: 45% all anteriore → riparazione consigliata', () => {
  const out = engineerLive(baseSnap({ damage: [45, 0, 0, 0, 0] }), {});
  const tip = out.tips.find((t) => /Danni/.test(t.title));
  assert.ok(tip, 'la radio deve dire del danno');
  assert.match(tip.title, /anteriore/);
  assert.deepEqual(out.gauges.damage, [45, 0, 0, 0, 0]);
});

test('radio freni: posteriore più caldo dell anteriore → bias da spostare', () => {
  const out = engineerLive(baseSnap({ brakeTempC: [300, 310, 420, 430] }), {});
  const tip = out.tips.find((t) => /Freni: posteriori/.test(t.title));
  assert.ok(tip, 'posteriori a 425 contro 305 davanti');
  assert.deepEqual(out.gauges.brakeTempC, [300, 310, 420, 430]);
});

test('radio freni: una ruota 250° sopra la gemella → controllo condotto', () => {
  const out = engineerLive(baseSnap({ brakeTempC: [400, 650, 300, 310] }), {});
  const tip = out.tips.find((t) => /Freno RF/.test(t.title));
  assert.ok(tip, 'RF 650° contro LF 400°');
});

test('radio freni: temperature plausibili e bilanciate → nessun consiglio', () => {
  const out = engineerLive(baseSnap(), {});
  assert.equal(out.tips.find((t) => /Freni:/.test(t.title)), undefined);
});
