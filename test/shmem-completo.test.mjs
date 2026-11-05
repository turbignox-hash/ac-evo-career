// shmem-completo.test.mjs — i byte che c'erano già ma non uscivano (4/11).
// Graphics: 60 coordinate, 60 ID, assists, gomme complete e timing corretto.
// Physics: brakeTemp, temperature I/M/O e vibrazioni oltre roadTemp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GFX, parseGraphics, parsePhysics } from '../src/shmem.mjs';

test('parseGraphics: 60 coordinate, 60 ID e coda assists', () => {
  const buf = Buffer.alloc(GFX.carIds + 960);
  buf[GFX.assistsState] = 2;
  buf.writeFloatLE(0.75, GFX.assistsState + 8);
  for (let i = 0; i < 60; i++) {
    buf.writeFloatLE(i, GFX.carCoordinates + i * 12);
    buf.writeFloatLE(i + 100, GFX.carCoordinates + i * 12 + 4);
    buf.writeFloatLE(i + 200, GFX.carCoordinates + i * 12 + 8);
    buf.writeBigUInt64LE(BigInt(1000 + i), GFX.carIds + i * 16);
    buf.writeBigUInt64LE(BigInt(2000 + i), GFX.carIds + i * 16 + 8);
  }
  const g = parseGraphics(buf);
  assert.equal(g.truncated, false);
  assert.equal(g.carCoords.length, 60);
  assert.deepEqual(g.carCoords[59], [59, 159, 259]);
  assert.equal(g.carIds.length, 60);
  assert.deepEqual(g.carIds[59], ['1059', '2059']);
  assert.equal(g.assists.autoGear, 2);
  assert.equal(g.assists.autoSteer, 0.75);
});

test('parseGraphics: timing legge le stringhe dopo i due int32', () => {
  const buf = Buffer.alloc(GFX.carIds + 960);
  const b = GFX.timingState;
  buf.write('1:23.456', b + 0);
  buf.write('0.123', b + 15);
  buf.writeInt32LE(1, b + 32);
  buf.write('1:24.000', b + 36);
  buf.write('0.456', b + 51);
  buf.writeInt32LE(-1, b + 68);
  buf.write('1:22.000', b + 72);
  buf.write('1:21.900', b + 87);
  buf.write('12:34.567', b + 102);
  buf[b + 117] = 1;
  const g = parseGraphics(buf);
  assert.equal(g.timing.currentLap, '1:23.456');
  assert.equal(g.timing.deltaCurrentP, 1);
  assert.equal(g.timing.lastLap, '1:24.000');
  assert.equal(g.timing.deltaLastP, -1);
  assert.equal(g.timing.bestLap, '1:22.000');
  assert.equal(g.timing.idealLap, '1:21.900');
  assert.equal(g.timing.totalTime, '12:34.567');
  assert.equal(g.timing.invalid, true);
});

test('parseGraphics: gomme complete e pressioni, non solo freni', () => {
  const buf = Buffer.alloc(GFX.carIds + 960);
  buf.writeFloatLE(2.1, GFX.tyreLF + 8);
  buf.writeFloatLE(88.5, GFX.tyreLF + 24);
  buf.writeFloatLE(87.5, GFX.tyreLF + 28);
  buf.writeFloatLE(86.5, GFX.tyreLF + 32);
  buf.write('SOFT', GFX.tyreLF + 36);
  const g = parseGraphics(buf);
  assert.ok(Math.abs(g.tyres.lf.pressurePsi - 2.1) < 1e-6);
  assert.ok(Math.abs(g.tyres.lf.temperatureInnerC - 88.5) < 1e-6);
  assert.ok(Math.abs(g.tyres.lf.temperatureCenterC - 87.5) < 1e-6);
  assert.ok(Math.abs(g.tyres.lf.temperatureOuterC - 86.5) < 1e-6);
  assert.equal(g.tyres.lf.compoundFront, 'SOFT');
  assert.equal(g.tyrePressure.length, 4);
});

test('parsePhysics: brakeTemp, temperature I/M/O e vibrazioni', () => {
  const buf = Buffer.alloc(1024);
  buf.writeFloatLE(400, 348);
  buf.writeFloatLE(77, 368);
  buf.writeFloatLE(78, 384);
  buf.writeFloatLE(79, 400);
  buf.writeFloatLE(8.5, 712);
  buf.writeFloatLE(0.5, 796);
  const p = parsePhysics(buf);
  assert.equal(p.truncated, false);
  assert.deepEqual(p.brakeTemp.slice(0, 1), [400]);
  assert.deepEqual(p.tyreTempI.slice(0, 1), [77]);
  assert.deepEqual(p.tyreTempM.slice(0, 1), [78]);
  assert.deepEqual(p.tyreTempO.slice(0, 1), [79]);
  assert.equal(p.waterTemp, 8.5);
  assert.equal(p.absVibrations, 0.5);
});

test('parsePhysics: blocco corto → brakeTemp null, nessun overread', () => {
  const p = parsePhysics(Buffer.alloc(512));
  assert.equal(p.truncated, true);
  assert.equal(p.brakeTemp, null);
});
