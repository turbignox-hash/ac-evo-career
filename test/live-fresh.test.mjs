// live-fresh.test.mjs — i dati nuovi della MMF devono arrivare ai consumatori
// (snapshot compatto, radio, meccanico) e i tempi giro non devono sparire se
// l'int32 è a zero: la stringa HUD è il fallback corretto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GFX, LiveReader, currentCarPosition, fmtDeltaText, liveFuelPerLap, parseGraphics, parseHudDelta, parseLapText } from '../src/shmem.mjs';
import { liveSetupSignals, mechanicExtraEdits, startPsiFromLive } from '../src/setup.mjs';

const rawLive = () => ({
  graphics: {
    fuelPerLap: 2.5,
    tyres: {
      lf: { temperatureC: 95, temperatureInnerC: 90, temperatureOuterC: 84, brakeTempC: 650 },
      rf: { temperatureC: 96, temperatureInnerC: 89, temperatureOuterC: 83, brakeTempC: 640 },
      lr: { temperatureC: 82, temperatureInnerC: 80, temperatureOuterC: 79, brakeTempC: 400 },
      rr: { temperatureC: 83, temperatureInnerC: 81, temperatureOuterC: 80, brakeTempC: 410 },
    },
    brakeTempC: [650, 640, 400, 410],
  },
  physics: {
    wheelPressure: [28.4, 28.8, 28.5, 28.7],
    brakeTemp: [650, 640, 400, 410],
  },
});

test('tempi HUD: parseLapText e parseHudDelta accettano le forme reali', () => {
  assert.equal(parseLapText('1:23.456'), 83456);
  assert.equal(parseLapText('23.456'), 23456);
  assert.equal(parseLapText('1:23,4'), 83400);
  assert.equal(parseLapText('—'), null);
  assert.equal(parseLapText('DNF'), null);
  assert.equal(parseHudDelta('0.123'), 123);
  assert.equal(parseHudDelta('-0.123'), -123);
  assert.equal(parseHudDelta('+1.2'), 1200);
  assert.equal(parseHudDelta('1:23.456'), null);
});

test('parseGraphics: int32 a zero → i tempi arrivano dalle stringhe HUD', () => {
  const buf = Buffer.alloc(GFX.carIds + 960);
  buf.write('1:23.456', GFX.timingState);
  buf.write('1:24.000', GFX.timingState + 36);
  buf.write('1:22.000', GFX.timingState + 72);
  const g = parseGraphics(buf);
  assert.equal(g.currentLapMs, 83456);
  assert.equal(g.lastLapMs, 84000);
  assert.equal(g.bestLapMs, 82000);
  assert.deepEqual(g.lapMs, { current: 83456, last: 84000, best: 82000, predicted: null });
});

test('snapshot compatto: freni, pressioni, tempi e consumo nuovi sono presenti', () => {
  const r = new LiveReader();
  const g = {
    status: 2,
    timing: { currentLap: '1:23.456', lastLap: '1:24.000', bestLap: '1:22.000', delta: '0.123', deltaCurrentP: 0 },
    lapMs: { current: 83456, last: 84000, best: 82000, predicted: null },
    currentLapMs: 83456, lastLapMs: 84000, bestLapMs: 82000, deltaMs: 123,
    fuelPerLap: 2.5, fuelLiters: 40,
    currentLapNo: 2, totalLapCount: 2, totalLapsSession: 10,
    currentPos: 2, totalDrivers: 10, carLocation: 4,
    carCoords: [[10, 0, 20]],
    tyres: rawLive().graphics.tyres,
    brakeTempC: [650, 640, 400, 410],
  };
  const p = {
    fuel: 40, wheelPressure: [28.4, 28.8, 28.5, 28.7],
    tyreCoreTemp: [80, 81, 78, 79], tyreWear: [0.2, 0.2, 0.2, 0.2],
    carDamage: [0, 0, 0, 0, 0], brakeTemp: [650, 640, 400, 410],
  };
  r.last = {
    game: true, at: Date.now(),
    static: { sessionType: 1, sessionName: 'Race', track: 'Imola', startingGrip: 0, online: false, timedRace: false },
    graphics: g, physics: p,
  };
  const snap = r.snapshot({ raw: true });
  assert.deepEqual(snap.player.brakeTempC, [650, 640, 400, 410]);
  assert.deepEqual(snap.player.tyrePressure, [28.4, 28.8, 28.5, 28.7]);
  assert.equal(snap.player.currentLapMs, 83456);
  assert.equal(snap.player.lastLapMs, 84000);
  assert.equal(snap.player.bestLapMs, 82000);
  assert.equal(snap.player.bestLap, '1:22.000');
  assert.equal(snap.player.fuelPerLap, 2.5);
  assert.equal(snap.lapTimes.best, 82000);
  assert.equal(snap.delta.source, 'hud');
  assert.equal(snap.delta.dv, 123);
  assert.equal(snap.raw.graphics, g);
});

test('liveSetupSignals: estrae solo i valori plausibili dalla MMF', () => {
  const s = liveSetupSignals({ raw: rawLive() });
  assert.deepEqual(s.livePsi, [28.4, 28.8, 28.5, 28.7]);
  assert.deepEqual(s.brakes, { LF: 650, RF: 640, LR: 400, RR: 410 });
  assert.deepEqual(s.camberProxy, { LF: 6, RF: 6, LR: 1, RR: 1 });
  assert.equal(s.fuelPerLap, 2.5);
  assert.deepEqual(s.tyreTempC, [95, 96, 82, 83]);
});

test('startPsiFromLive: pressione di partenza ruota per ruota', () => {
  const s = liveSetupSignals({ raw: rawLive() });
  const r = startPsiFromLive({
    livePsi: s.livePsi, target: 27, coldNow: 24,
    coldByWheel: [24, 24.5, 23.5, 24],
  });
  assert.equal(r.startPsi, 22.4);
  assert.deepEqual(r.pressures, [22.6, 22.7, 22, 22.3]);
});

test('parseGraphics: fuelPerLap è letto dalla MMF e non resta un campo fantasma', () => {
  const buf = Buffer.alloc(GFX.carIds + 960);
  buf.writeFloatLE(1.6, GFX.fuelPerLap);
  const g = parseGraphics(buf);
  assert.ok(Math.abs(g.fuelPerLap - 1.6) < 1e-6, `fuelPerLap ${g.fuelPerLap}`);
});

test('posizione live: usa i punti di contatto della fisica, non carCoords[0]', () => {
  const pos = currentCarPosition(
    { carCoords: [[1e30, 0, -1e30]] },
    { tyreContactPoint: [[-202.369, 261.24, -335.1], [-203.594, 261.27, -336.02], [-200.824, 261.26, -337.14], [-202.062, 261.30, -338.07]] },
  );
  assert.equal(pos.source, 'physics');
  assert.ok(Math.abs(pos.x + 202.21225) < 0.01, `x ${pos.x}`);
  assert.ok(Math.abs(pos.z + 336.5817) < 0.01, `z ${pos.z}`);
});

test('consumo live: fallback litri / giri stimati quando fuelPerLap manca', () => {
  assert.equal(liveFuelPerLap({ fuelLiters: 28, lapsPossibleFuel: 17.5 }), 1.6);
  assert.equal(liveFuelPerLap({ fuelPerLap: 1.75 }), 1.75);
  assert.equal(liveFuelPerLap({ fuelLiters: 0, lapsPossibleFuel: 0 }), null);
});

test('cambio sessione: best, delta e mappa della sessione vecchia spariscono', () => {
  const r = new LiveReader();
  r.trail = [[1, 2], [3, 4]];
  r.lapTrack = [{ x: 1, z: 2, t: 1000 }];
  r.lapNoSeen = 7;
  r.bestTrack = [{ x: 1, z: 2, t: 1000 }];
  r.bestLapNo = 7;
  r.bestLapMs = 90000;
  r._bestPath = { pts: [] };
  r._deltaCache = { live: { deltaMs: -1 } };
  r._deltaKey = 'vecchia';
  r._resetSession();
  assert.deepEqual(r.trail, []);
  assert.deepEqual(r.lapTrack, []);
  assert.equal(r.lapNoSeen, null);
  assert.equal(r.bestTrack, null);
  assert.equal(r.bestLapNo, null);
  assert.equal(r.bestLapMs, null);
  assert.equal(r._bestPath, null);
  assert.equal(r._deltaCache, null);
  assert.equal(r._deltaKey, '');
});

test('delta HUD: deltaCurrentP a zero non spegne il deltaTimeMs del gioco', () => {
  const r = new LiveReader();
  r.last = { graphics: { timing: { delta: null, deltaCurrentP: 0 }, deltaMs: -2845, lapMs: { current: 23558 }, currentLapMs: 23558 } };
  const d = r._deltaInfo();
  assert.equal(d.source, 'hud');
  assert.equal(d.dv, -2845);
  assert.equal(fmtDeltaText(d.dv), '-2.845');
  assert.equal(fmtDeltaText(null), null);
});

test('mechanicExtraEdits: camber, bias e benzina calcolati dai segnali live', () => {
  const s = liveSetupSignals({ raw: rawLive() });
  const mech = mechanicExtraEdits({
    cur: {
      tires: [
        { pressure: 24, camber: -3.5 }, { pressure: 24, camber: -3.4 },
        { pressure: 24, camber: -2.8 }, { pressure: 24, camber: -2.9 },
      ],
      brakes: { bias: 52 }, fuel: { liters: 50 }, elec: { tc1: 5 }, aero: {},
    },
    latest: {
      trackOk: true, brakes: s.brakes, camberProxy: s.camberProxy,
      fuelPerLap: s.fuelPerLap, raceLaps: 20,
    },
  });
  assert.equal(mech.patches.brakes.bias, 51);
  // 2.5 L/giro × 20 giri × 1,05 = 53, più i 3 L di riserva della carta: 56
  // (prima qui mancavano i 3 L e il meccanico diceva 56 mentre il file ne
  // aveva 53 — test/benzina-allineata.test.mjs tiene allineate le due strade)
  assert.equal(mech.patches.fuel.liters, 56);
  assert.equal(mech.tiresExtra.find((t) => t.i === 0).camber, -3.2);
  assert.ok(mech.text.some((t) => /Bias freni/.test(t)));
  assert.ok(mech.text.some((t) => /Benzina:/.test(t)));
});
