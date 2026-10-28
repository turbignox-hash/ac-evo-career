// shmem.mjs — lettura live dei blocchi di memoria condivisa di Assetto Corsa EVO.
//
// I tre blocchi (Local\acevo_pmf_static / _graphics / _physics) vengono letti in
// sola lettura da tools/acevo-live.ps1, che ci passa i byte; qui li interpretiamo
// con i layout dell'header ufficiale (docs/acevo-wrapper.hpp, pack(4)).
//
// Serve per: verifica automatica della configurazione gara (pista, auto, giri,
// meteo…) e per i dati live (posizione, gap, giri) nella GUI.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordWarning } from './warnings.mjs';
import { buildPathProg, liveDelta, deltaSegments } from './lapdelta.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PS1 = join(HERE, '..', 'tools', 'acevo-live.ps1');

/* ------------------------------------------------------------------ */
/* primitive di lettura                                                */
/* ------------------------------------------------------------------ */

class Cursor {
  constructor(buf, base = 0) {
    this.dv = new DataView(buf.buffer, buf.byteOffset + base, buf.byteLength - base);
    this.o = 0;
    this.bytes = buf;
  }
  i32() { const v = this.dv.getInt32(this.o, true); this.o += 4; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  skip(n) { this.o += n; }
  str(n) {
    const start = this.o;
    let end = start;
    const limit = start + n;
    while (end < limit && this.bytes[end] !== 0) end++;
    const s = this.bytes.slice(start, end).toString('utf8');
    this.o += n;
    return s;
  }
  strAt(abs, n) {
    let end = abs;
    const limit = abs + n;
    while (end < limit && this.bytes[end] !== 0) end++;
    return this.bytes.slice(abs, end).toString('utf8');
  }
  align4() { const r = this.o % 4; if (r) this.o += 4 - r; }
}

/* ------------------------------------------------------------------ */
/* compilatore di struct (regole #pragma pack(4) di MSVC)             */
/*  - char[]/bool/i8/u8: allineamento 1, nessun padding                */
/*  - short/u16: allineamento 2                                        */
/*  - int/float/u32: allineamento 4 (massimo, pack(4))                 */
/*  - uint64: allineamento 4 (pack(4) limita a 4)                      */
/* Verificati a mano sui static_assert dell'header (le sub-struct):   */
/*  TyreState=256, DamageState=128, PitInfo=64, Instrumentation=128,  */
/*  Electronics=128, SessionState=256, TimingState=256.               */
/* SPageFileGraphicEvo completa pesa 4900 B (car_coordinates 720 B e  */
/* car_ids 960 B in coda): qui dichiariamo solo fino a gap_behind.    */
/* ------------------------------------------------------------------ */

const SIZE = { i8: 1, u8: 1, bool: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, u64: 8 };
const ALIGN = { i8: 1, u8: 1, bool: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, u64: 4 };

function structLayout(fields) {
  const out = {};
  let o = 0;
  for (const [name, type] of fields) {
    let size, align;
    if (type.startsWith('str')) { size = Number(type.slice(4, -1)); align = 1; }
    else if (type.startsWith('raw')) { size = Number(type.slice(4, -1)); align = 1; } // char[] nel header
    else { size = SIZE[type]; align = ALIGN[type]; }
    if (align > 1) o = Math.ceil(o / align) * align;
    out[name] = o;
    o += size;
  }
  out.__size = Math.ceil(o / 4) * 4;
  return out;
}

/* ------------------------------------------------------------------ */
/* static — scritto una volta per sessione                             */
/* ------------------------------------------------------------------ */

const STATIC_LAYOUT = structLayout([
  ['smVersion', 'str(15)'], ['gameVersion', 'str(15)'],
  ['sessionType', 'i32'], ['sessionName', 'str(33)'],
  ['eventId', 'u8'], ['sessionId', 'u8'],
  ['startingGrip', 'i32'], ['ambientTempC', 'f32'], ['groundTempC', 'f32'],
  ['staticWeather', 'bool'], ['timedRace', 'bool'], ['online', 'bool'],
  ['numberOfSessions', 'i32'],
  ['nation', 'str(33)'], ['longitude', 'f32'], ['latitude', 'f32'],
  ['track', 'str(33)'], ['trackConfiguration', 'str(33)'], ['trackLengthM', 'f32'],
]);

export function parseStatic(buf) {
  if (!buf || buf.length < STATIC_LAYOUT.__size) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const L = STATIC_LAYOUT;
  const str = (o, n) => {
    let end = o;
    const limit = o + n;
    while (end < limit && buf[end] !== 0) end++;
    return buf.slice(o, end).toString('utf8');
  };
  return {
    smVersion: str(L.smVersion, 15),
    gameVersion: str(L.gameVersion, 15),
    sessionType: dv.getInt32(L.sessionType, true),   // -1 unk, 0 TA, 1 race, 2 hotstint, 3 cruise
    sessionName: str(L.sessionName, 33),
    eventId: dv.getUint8(L.eventId),
    sessionId: dv.getUint8(L.sessionId),
    startingGrip: dv.getInt32(L.startingGrip, true), // 0 green, 1 fast, 2 optimum
    ambientTempC: dv.getFloat32(L.ambientTempC, true),
    groundTempC: dv.getFloat32(L.groundTempC, true),
    staticWeather: dv.getUint8(L.staticWeather) !== 0,
    timedRace: dv.getUint8(L.timedRace) !== 0,
    online: dv.getUint8(L.online) !== 0,
    numberOfSessions: dv.getInt32(L.numberOfSessions, true),
    nation: str(L.nation, 33),
    longitude: dv.getFloat32(L.longitude, true),
    latitude: dv.getFloat32(L.latitude, true),
    track: str(L.track, 33),
    trackConfiguration: str(L.trackConfiguration, 33),
    trackLengthM: dv.getFloat32(L.trackLengthM, true),
  };
}

/* ------------------------------------------------------------------ */
/* graphics — ogni frame; la parte che ci serve per la carriera        */
/* ------------------------------------------------------------------ */

// sub-struct dichiarate con i loro static_assert dell'header
const TYRE = structLayout([
  ['slip', 'f32'], ['lock', 'bool'], ['pression', 'f32'], ['tempC', 'f32'],
  ['brakeTempC', 'f32'], ['brakePressure', 'f32'],
  ['tempLeft', 'f32'], ['tempCenter', 'f32'], ['tempRight', 'f32'],
  ['compoundFront', 'str(33)'], ['compoundRear', 'str(33)'],
  ['normPressure', 'f32'], ['normTempLeft', 'f32'], ['normTempCenter', 'f32'],
  ['normTempRight', 'f32'], ['normBrakeTemp', 'f32'], ['normTempCore', 'f32'],
  ['placeholder', 'raw(128)'],
]);
const DAMAGE = structLayout([
  ['front', 'f32'], ['rear', 'f32'], ['left', 'f32'], ['right', 'f32'], ['center', 'f32'],
  ['suspLF', 'f32'], ['suspRF', 'f32'], ['suspLR', 'f32'], ['suspRR', 'f32'],
  ['placeholder', 'raw(92)'],
]);
const PITINFO = structLayout([
  ['damage', 'i8'], ['fuel', 'i8'], ['tyreLF', 'i8'], ['tyreRF', 'i8'], ['tyreLR', 'i8'], ['tyreRR', 'i8'],
  ['placeholder', 'raw(58)'],
]);
const INSTR = structLayout([
  ['mainLights', 'i8'], ['specialLights', 'i8'], ['cockpitLights', 'i8'], ['wipers', 'i8'],
  ['rainLights', 'bool'], ['turnL', 'bool'], ['turnR', 'bool'], ['flashing', 'bool'], ['warning', 'bool'],
  ['displayIndex', 'i8'], ['pages', 'raw(16)'], ['headlightsVisible', 'bool'],
  ['placeholder', 'raw(101)'],
]);
export const ELECTRONICS = structLayout([
  ['tc', 'i8'], ['tcCut', 'i8'], ['abs', 'i8'], ['esc', 'i8'], ['ebb', 'i8'],
  ['brakeBias', 'f32'], ['engineMap', 'i8'], ['turbo', 'f32'], ['ersMap', 'i8'],
  ['ersRecharge', 'f32'], ['ersHeat', 'bool'], ['ersOvertake', 'bool'], ['drsOpen', 'bool'],
  ['diffPower', 'i8'], ['diffCoast', 'i8'], ['frontBump', 'i8'], ['frontRebound', 'i8'],
  ['rearBump', 'i8'], ['rearRebound', 'i8'], ['ignition', 'bool'], ['pitLimiter', 'bool'],
  ['performanceMode', 'i8'], ['placeholder', 'raw(88)'],
]);
const SESSION_STATE = structLayout([
  ['phaseName', 'str(33)'], ['timeLeft', 'str(15)'], ['timeLeftMs', 'i32'],
  ['waitTime', 'str(15)'], ['totalLap', 'i32'], ['currentLap', 'i32'],
  ['lightsOn', 'i32'], ['lightsMode', 'i32'], ['lapLengthKm', 'f32'], ['endFlag', 'i32'],
  ['timeToNext', 'str(15)'], ['disconnected', 'bool'], ['restartSeason', 'bool'],
  ['uiDrive', 'bool'], ['uiSetup', 'bool'], ['readyBlink', 'bool'], ['waitingPlayers', 'bool'],
  ['placeholder', 'raw(140)'],
]);
const TIMING = structLayout([
  ['currentLap', 'str(15)'], ['deltaCurrent', 'str(15)'], ['deltaCurrentP', 'i32'],
  ['lastLap', 'str(15)'], ['deltaLast', 'str(15)'], ['deltaLastP', 'i32'],
  ['bestLap', 'str(15)'], ['idealLap', 'str(15)'], ['totalTime', 'str(15)'],
  ['invalid', 'bool'], ['placeholder', 'raw(137)'],
]);

// sanity check sui static_assert dell'header
const _chk = (name, got, want) => { if (got !== want) throw new Error(`${name}: ${got} != ${want}`); };
_chk('SMEvoTyreState', TYRE.__size, 256);
_chk('SMEvoDamageState', DAMAGE.__size, 128);
_chk('SMEvoPitInfo', PITINFO.__size, 64);
_chk('SMEvoInstrumentation', INSTR.__size, 128);
_chk('SMEvoElectronics', ELECTRONICS.__size, 128);
_chk('SMEvoSessionState', SESSION_STATE.__size, 256);
_chk('SMEvoTimingState', TIMING.__size, 256);

const GFX_LAYOUT = structLayout([
  ['packetId', 'i32'], ['status', 'i32'],
  ['focusedA', 'u64'], ['focusedB', 'u64'], ['playerA', 'u64'], ['playerB', 'u64'],
  ['rpm', 'u16'],
  ['rpmLimiter', 'bool'], ['changeUp', 'bool'], ['changeDown', 'bool'],
  ['tcActive', 'bool'], ['absActive', 'bool'], ['escActive', 'bool'],
  ['launchActive', 'bool'], ['ignitionOn', 'bool'], ['engineRunning', 'bool'],
  ['kersCharging', 'bool'], ['wrongWay', 'bool'], ['drsAvailable', 'bool'],
  ['batteryCharging', 'bool'], ['maxKjPerLap', 'bool'], ['maxChargeKj', 'bool'],
  ['speedKmh', 'i16'], ['speedMph', 'i16'], ['speedMs', 'i16'],
  ['pitspeedDelta', 'f32'], ['gearInt', 'i16'],
  ['rpmPercent', 'f32'], ['gasPercent', 'f32'], ['brakePercent', 'f32'],
  ['handbrakePercent', 'f32'], ['clutchPercent', 'f32'], ['steeringPercent', 'f32'],
  ['ffbStrength', 'f32'], ['carFfbMultiplier', 'f32'],
  ['waterTempPercent', 'f32'], ['waterPressureBar', 'f32'], ['fuelPressureBar', 'f32'],
  ['waterTempC', 'i8'], ['airTempC', 'i8'],
  ['oilTempC', 'f32'], ['oilPressureBar', 'f32'], ['exhaustTempC', 'f32'],
  ['gForceX', 'f32'], ['gForceY', 'f32'], ['gForceZ', 'f32'],
  ['turboBoost', 'f32'], ['turboBoostLevel', 'f32'], ['turboBoostPerc', 'f32'],
  ['steerDegrees', 'i32'], ['currentKm', 'f32'], ['totalKm', 'u32'], ['totalDriveTimeS', 'u32'],
  ['timeOfDayH', 'i32'], ['timeOfDayM', 'i32'], ['timeOfDayS', 'i32'],
  ['deltaTimeMs', 'i32'], ['currentLapMs', 'i32'], ['predictedLapMs', 'i32'],
  ['fuelLiters', 'f32'], ['fuelPercent', 'f32'], ['fuelPerKm', 'f32'], ['kmPerLiter', 'f32'],
  ['currentTorque', 'f32'], ['currentBhp', 'i32'],
  ['tyreLF', 'raw(256)'], ['tyreRF', 'raw(256)'], ['tyreLR', 'raw(256)'], ['tyreRR', 'raw(256)'],
  ['npos', 'f32'], ['kersChargePerc', 'f32'], ['kersCurrentPerc', 'f32'], ['controlLockTime', 'f32'],
  ['carDamage', 'raw(128)'], ['carLocation', 'i32'],
  ['pitInfo', 'raw(64)'],
  ['fuelUsed', 'f32'], ['fuelPerLap', 'f32'], ['lapsPossibleFuel', 'f32'],
  ['batteryTemp', 'f32'], ['batteryVoltage', 'f32'],
  ['instFuelPerKm', 'f32'], ['instKmPerLiter', 'f32'],
  ['gearRpmWindow', 'f32'],
  ['instr', 'raw(128)'], ['instrMin', 'raw(128)'], ['instrMax', 'raw(128)'],
  ['electronics', 'raw(128)'], ['electronicsMin', 'raw(128)'], ['electronicsMax', 'raw(128)'], ['electronicsMod', 'raw(128)'],
  ['totalLapCount', 'i32'],
  ['currentPos', 'u32'], ['totalDrivers', 'u32'],
  ['lastLapMs', 'i32'], ['bestLapMs', 'i32'],
  ['flag', 'i32'], ['globalFlag', 'i32'],
  ['maxGears', 'u32'], ['engineType', 'i32'],
  ['hasKers', 'bool'], ['isLastLap', 'bool'],
  ['performanceModeName', 'str(33)'],
  ['diffCoastRaw', 'f32'], ['diffPowerRaw', 'f32'],
  ['raceCutGainedMs', 'i32'], ['distanceToDeadline', 'i32'], ['raceCutCurrentDelta', 'f32'],
  ['sessionState', 'raw(256)'], ['timingState', 'raw(256)'],
  ['playerPing', 'i32'], ['playerLatency', 'i32'], ['playerCpu', 'i32'], ['playerCpuAvg', 'i32'],
  ['playerQos', 'i32'], ['playerQosAvg', 'i32'], ['playerFps', 'i32'], ['playerFpsAvg', 'i32'],
  ['driverName', 'str(33)'], ['driverSurname', 'str(33)'], ['carModel', 'str(33)'],
  ['isInPitBox', 'bool'], ['isInPitLane', 'bool'], ['isValidLap', 'bool'],
  // nell'header ufficiale PRIMA dei gap c'è la posizione delle 60 auto
  // (60×3 float = 720 byte): senza questo campo leggevamo le coordinate
  // come se fossero i gap, mostrando distacchi senza senso.
  ['carCoordinates', 'raw(720)'],
  ['gapAhead', 'f32'], ['gapBehind', 'f32'],
]);

/* DATI di timing ONLINE-dash: dentro graphics c'è raw(256) del timingState
   (SMEvoTimingState) con i tempi di giro come STRINGHE HH:MM:SS.mmm
dell'HUD. Layout confermato dall'header: currentLap, deltaCurrent, lastLap,
deltaLast, bestLap, idealLap, totalTime, invalid bool. */
const TIMOFF = { currentLap: 0, deltaCurrent: 15, lastLap: 34, bestLap: 68, idealLap: 83, totalTime: 98, invalid: 113 };
export function parseTimingState(buf, base) {
  if (!buf || buf.length < base + 128) return null;
  const at = (o, n = 15) => {
    const s = buf.slice(base + o, base + o + n);
    let end = 0; while (end < s.length && s[end] !== 0) end++;
    return s.slice(0, end).toString('utf8').trim() || null;
  };
  return {
    currentLap: at(TIMOFF.currentLap), delta: at(TIMOFF.deltaCurrent),
    lastLap: at(TIMOFF.lastLap), bestLap: at(TIMOFF.bestLap),
    idealLap: at(TIMOFF.idealLap), invalid: buf[base + TIMOFF.invalid] !== 0,
  };
}

export const GFX = GFX_LAYOUT;

export function parseGraphics(buf) {
  if (!buf || buf.length < GFX_LAYOUT.gapBehind + 4) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const f32 = (o) => dv.getFloat32(o, true);
  const i32 = (o) => dv.getInt32(o, true);
  const u32 = (o) => dv.getUint32(o, true);
  const i16 = (o) => dv.getInt16(o, true);
  const str = (o, n = 33) => {
    const s = buf.slice(o, o + n);
    let end = 0; while (end < s.length && s[end] !== 0) end++;
    return s.slice(0, end).toString('utf8');
  };
  return {
    packetId: i32(GFX.packetId),
    status: i32(GFX.status),              // 0 off, 1 replay, 2 live, 3 pause
    speedKmh: i16(GFX.speedKmh),
    gear: i16(GFX.gearInt),
    rpm: dv.getUint16(GFX.rpm, true),
    gasPercent: f32(GFX.gasPercent),
    brakePercent: f32(GFX.brakePercent),
    timeOfDay: `${i32(GFX.timeOfDayH)}:${String(i32(GFX.timeOfDayM)).padStart(2, '0')}`,
    currentLapMs: i32(GFX.currentLapMs),
    lastLapMs: i32(GFX.lastLapMs),
    bestLapMs: i32(GFX.bestLapMs),
    deltaMs: i32(GFX.deltaTimeMs),
    isValidLap: dv.getUint8(GFX.isValidLap) !== 0,
    fuelLiters: f32(GFX.fuelLiters),
    lapsPossibleFuel: f32(GFX.lapsPossibleFuel),   // giri stimati col fuel residuo (HUD del gioco)
    totalLaps: i32(GFX.totalLapCount),
    totalLapsSession: i32(GFX.sessionState + SESSION_STATE.totalLap),
    currentLapNo: i32(GFX.sessionState + SESSION_STATE.currentLap),
    sessionPhase: str(GFX.sessionState + SESSION_STATE.phaseName, 33),
    timeLeftStr: str(GFX.sessionState + SESSION_STATE.timeLeft, 15),
    currentPos: u32(GFX.currentPos),
    totalDrivers: u32(GFX.totalDrivers),
    gapAhead: f32(GFX.gapAhead),
    gapBehind: f32(GFX.gapBehind),
    isLastLap: dv.getUint8(GFX.isLastLap) !== 0,
    flag: i32(GFX.flag),
    globalFlag: i32(GFX.globalFlag),
    wrongWay: dv.getUint8(GFX.wrongWay) !== 0,
    // timingState: tempi di giro come stringhe dell'HUD ("1:12.456") + delta live
    timing: parseTimingState(buf, GFX.timingState),
    // monitor stile/default RF2: coordinate (x,y,z) delle prime 20 auto (60 in totale):
    // per ogni auto un BUBBLE in griglia con la sua distanza dal tuo e la posizione
    carCoords: (() => {
      const n = Math.min(20, 60);
      const out = [];
      const b = Buffer.from(buf.buffer, buf.byteOffset + GFX.carCoordinates, n * 12);
      for (let i = 0; i < n; i++) {
        const x = b.readFloatLE(i * 12), y = b.readFloatLE(i * 12 + 4), z = b.readFloatLE(i * 12 + 8);
        out.push(Number.isFinite(x) ? [Math.round(x), Math.round(y), Math.round(z)] : null);
      }
      return out;
    })(),
    carLocation: i32(GFX.carLocation),    // 1 pitlane, 4 track
    driverName: str(GFX.driverName),
    driverSurname: str(GFX.driverSurname),
    carModel: str(GFX.carModel),
    fps: i32(GFX.playerFps),
  };
}

/* ------------------------------------------------------------------ */
/* physics (1 KB, ogni step di simulazione)                            */
/* ------------------------------------------------------------------ */

export function parsePhysics(buf) {
  if (!buf || buf.length < 512) return null;
  const c = new Cursor(buf);
  const out = {};
  out.packetId = c.i32();
  out.gas = c.f32();
  out.brake = c.f32();
  out.fuel = c.f32();
  out.gear = c.i32();
  out.rpms = c.i32();
  out.steerAngle = c.f32();
  out.speedKmh = c.f32();
  out.velocity = [c.f32(), c.f32(), c.f32()];
  out.accG = [c.f32(), c.f32(), c.f32()];
  out.wheelSlip = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.wheelLoad = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.wheelPressure = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.wheelAngularSpeed = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.tyreWear = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.tyreDirty = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.tyreCoreTemp = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.camberRAD = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.suspensionTravel = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.drs = c.f32();
  out.tc = c.f32();
  out.heading = c.f32();
  out.pitch = c.f32();
  out.roll = c.f32();
  out.cgHeight = c.f32();
  out.carDamage = [c.f32(), c.f32(), c.f32(), c.f32(), c.f32()];
  out.tyresOut = c.i32();
  out.pitLimiterOn = c.i32();
  out.abs = c.f32();
  out.kersCharge = c.f32();
  out.kersInput = c.f32();
  out.autoShifterOn = c.i32();
  out.rideHeight = [c.f32(), c.f32()];
  out.turboBoost = c.f32();
  out.ballast = c.f32();
  out.airDensity = c.f32();
  out.airTemp = c.f32();
  out.roadTemp = c.f32();
  out.brakeTemp = null;
  // da qui in poi ci fermiamo: il resto serve solo a telemetrie complete
  return out;
}

/* ------------------------------------------------------------------ */
/* processo helper + flusso                                            */
/* ------------------------------------------------------------------ */

const SESSION_T = { 0: 'TimeAttack', 1: 'Race', 2: 'HotStint', 3: 'Cruise' };
const GRIP = { 0: 'Green', 1: 'Fast', 2: 'Optimum' };
const LOCATION = { 0: 'n/d', 1: 'pitlane', 2: 'ingresso box', 3: 'uscita box', 4: 'pista' };
const FLAG = ['nessuna', 'bianca', 'verde', 'rossa', 'blu', 'gialla', 'nera', 'b/n', 'a scacchi', 'meccanica', 'sdrucciolevole'];

export function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** il delta dell'HUD del gioco («+0.456» / «-0.123», millisecondi con il segno) */
export function parseHudDelta(text) {
  if (!text) return null;
  const m = /^([+-])\s*(\d+[.,]\d+)$/.exec(String(text).trim());
  if (!m) return null;
  const v = Number(m[2].replace(',', '.')) * 1000;
  return Number.isFinite(v) ? (m[1] === '-' ? -Math.round(v) : Math.round(v)) : null;
}

export class LiveReader {
  constructor({ intervalMs = 900 } = {}) {
    this.intervalMs = intervalMs;
    this.child = null;
    this.last = { game: false, static: null, graphics: null, physics: null, at: 0 };
    this.lastMsgAt = 0; // qualsiasi messaggio (anche nogame): prova che il lettore è vivo
    this.buffer = '';
    this.restarts = 0;  // quante volte il watchdog ha riciclato il processo
    // --- tracking del giro per il delta di ritmo (lapdelta.mjs) ---
    this.lapTrack = [];      // [{x, z, t:ms}] del giro CORRENTE
    this.lapNoSeen = null;   // numero del giro visto per ultimo
    this.bestTrack = null;   // la traccia [{x, z, t}] del MIGLIOR giro della sessione
    this.bestLapNo = null;
    this.bestLapMs = null;
    this._bestPath = null;   // buildPathProg della traccia del best (memo)
    this._deltaCache = null; // segments memo: una chiave = il giro corrente|len traccia
    this._deltaKey = '';
  }
  start() {
    // auto-riparazione: se il processo PowerShell è vivo ma da troppo tempo non
    // manda nulla, è impallato: lo uccidiamo e lo rilanciamo al prossimo giro.
    // Vale anche per il caso peggiore: avviato ma il PRIMO messaggio non è mai
    // arrivato (Add-Type bloccato, antivirus, ...) — altrimenti resterebbe
    // per sempre "vivo ma muto" e il watcher non vedrebbe mai una gara.
    const mutoDa = this.lastMsgAt
      ? Date.now() - this.lastMsgAt
      : (this.spawnedAt ? Date.now() - this.spawnedAt : 0);
    if (this.child && this.spawnedAt && mutoDa > 15000) {
      this.restarts += 1;
      recordWarning('shmem.reader', 'lettore live impallato: riciclato (nessun messaggio da >15s)');
      this.stop();
    }
    // nogame PERSISTENTE con il gioco vivo: il lettore parte spesso PRIMA della
    // sessione e le MMF di EVO una volta create non si ricreano — se OpenFileMapping
    // è fallito al primo giro (gioco avviato dopo) rimarrebbe "nogame" per sempre.
    // Riciclo a cuor più ogni 30s finché non vede il gioco.
    if (this.child && !this.last.game && mutoDa > 30000) {
      this.restarts += 1;
      recordWarning('shmem.reader', 'lettore live in nogame persistente: riciclato');
      this.stop();
    }
    if (this.child || !existsSync(PS1)) return;
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-IntervalMs', String(this.intervalMs)], { windowsHide: true });
    this.child = child;
    this.spawnedAt = Date.now();
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try { this.handle(JSON.parse(line)); } catch (e) {
          recordWarning('shmem.reader', 'riga live non interpretabile', (e?.message ?? '') + ' :: ' + line.slice(0, 120));
        }
      }
    });
    // stderr va consumato anche se non lo usiamo: se nessuno legge, il buffer
    // può riempirsi (64 KB) e bloccare il processo PowerShell. Teniamo una
    // coda corta per il debug.
    this.stderrTail = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-2000);
    });
    // senza handler su 'error', un fallito avvio di powershell.exe (ENOENT,
    // policy) emette un evento non gestito e uccide l'intero server
    child.on('error', (err) => {
      if (this.child === child) this.child = null;
      try { console.error('[live] powershell non avviabile:', err?.message ?? err); } catch {}
    });
    child.on('exit', () => { if (this.child === child) this.child = null; });
  }
  /** cambio giro: il giro appena chiuso diventa il nuovo best della sessione? */
  _commitLap(lapNo) {
    const g = this.last.graphics;
    const track = this.lapTrack;
    // serve una traccia lunga (min 10 campioni) e un giro completo (≥ 15 s)
    const lapMs = Number(g?.lastLapMs);
    if (track.length >= 10 && Number.isFinite(lapMs) && lapMs > 15000
      && g?.isValidLap && (this.bestLapMs == null || lapMs < this.bestLapMs)) {
      this.bestTrack = track.slice();
      this.bestLapNo = lapNo;
      this.bestLapMs = lapMs;
      this._bestPath = null;         // il percorso cambia col nuovo best
      this._deltaCache = null;
      this._deltaKey = '';
    }
    this.lapTrack = [];              // riparte il campionamento del giro nuovo
  }

  /** il delta «adesso» + i tagli per fascia (memo: li ricalcola a cambio di giro o di traccia) */
  _deltaInfo() {
    const g = this.last.graphics;
    const hud = parseHudDelta(g?.timing?.delta ?? null);
    // lapNo ANCHE in 'hud': senza di lui il narratore «giro finito» della copilota
    // tace finché non entra 'tracked' (best committato) — lezione 24/10 sera:
    // «altra gara ma ho sentito solo la benzina, niente tempi sul giro».
    const lapNo = this.lapNoSeen ?? null;
    if (!this.bestTrack || this.bestTrack.length < 4) {
      return { source: 'hud', dv: hud, bestLapMs: this.bestLapMs ?? g?.bestLapMs ?? null, bestLapNo: this.bestLapNo ?? null, lapNo };
    }
    this._bestPath ??= buildPathProg(this.bestTrack);
    if (!this._bestPath) return { source: 'hud', dv: hud, bestLapMs: this.bestLapMs, bestLapNo: this.bestLapNo, lapNo };
    const key = `${this.bestLapMs}|${this.lapNoSeen}|${this.lapTrack.length}`;
    if (this._deltaKey !== key) {
      this._deltaCache = {
        live: liveDelta(this.lapTrack, this._bestPath, Number(g?.currentLapMs)),
        segments: deltaSegments(this.lapTrack, this._bestPath, 48),
      };
      this._deltaKey = key;
    }
    return {
      source: 'tracked',
      bestLapMs: this.bestLapMs,
      bestLapNo: this.bestLapNo,
      lapNo: this.lapNoSeen ?? null,
      dv: this._deltaCache.live?.deltaMs ?? null,     // ms
      prog: this._deltaCache.live?.prog ?? null,
      hudDv: hud,
      segments: this._deltaCache.segments,
    };
  }

  handle(msg) {
    this.lastMsgAt = Date.now();
    if (msg.ev === 'nogame') { this.last.game = false; this.last.static = null; this.last.graphics = null; return; }
    if (msg.ev !== 'data') return;
    this.last.at = Date.now();
    const dec = (b64) => (b64 ? Buffer.from(b64, 'base64') : null);
    this.last.static = parseStatic(dec(msg.static)) ?? this.last.static;
    // BUG 21/10 (verificato IN GIOCO su Practice/Imola): il flag game non veniva
    // MAI settato a true su 'data' — lo snapshot usciva subito su !game e la GUI
    // diceva «EVO chiuso» anche con la sessione in pista (MMF vive, parser OK).
    this.last.game = true;
    this.last.graphics = parseGraphics(dec(msg.graphics)) ?? this.last.graphics;
    this.last.physics = parsePhysics(dec(msg.physics)) ?? this.last.physics;
    // MA essi del giro (per la mappa live): il punto dell'auto 0 (la tua) disegna
    // il contorno pista, un punto ogni 60 m; oltre 1500 campioni si compatta.
    const pt0 = this.last.graphics?.carCoords?.[0];
    if (pt0) {
      const tr = (this.trail ??= []);
      const last = tr.length ? tr[tr.length - 1] : null;
      if (!last || Math.hypot(pt0[0] - last[0], pt0[2] - last[2]) > 60) {
        tr.push([pt0[0], pt0[2]]);
        if (tr.length > 1500) this.trail = tr.filter((_, i) => i % 2 === 0);
      }
    }
    /* --- tracking del giro per il delta di ritmo (lapdelta.mjs) --- */
    const g = this.last.graphics;
    if (g?.carCoords?.[0]) {
      const [x,, z] = g.carCoords[0];
      const lapNo = g.currentLapNo;
      if (Number.isFinite(lapNo) && this.lapNoSeen != null && lapNo !== this.lapNoSeen) {
        this._commitLap(this.lapNoSeen);       // il giro appena chiuso va in campagna per il best
      }
      if (Number.isFinite(lapNo)) this.lapNoSeen = lapNo;
      const lapMs = Number(g.currentLapMs);
      if (Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(lapMs) && lapMs > 0 && g.status === 2) {
        const kt = this.lapTrack;
        const lp = kt.length ? kt[kt.length - 1] : null;
        if (!lp || Math.hypot(x - lp.x, z - lp.z) > 25) kt.push({ x, z, t: lapMs });
      }
    }
  }
  stop() { try { this.child?.kill(); } catch {} this.child = null; }
  snapshot() {
    const { static: st, graphics: g, physics: p, game } = this.last;
    if (!game || !st) return { game: false };
    // dati vecchi = dati inaffidabili: se il lettore non aggiorna da oltre 20s
    // (gioco chiuso senza 'nogame', lettore impallato) non fidarci mai
    if (this.last.at && Date.now() - this.last.at > 20000) return { game: false, stale: true };
    return {
      game: true,
      live: !!g && g.status === 2,
      paused: !!g && g.status === 3,
      session: {
        /* FIRMA DELLA SESSIONE (28/10): eventId+sessionId+tipo è scritta dal
           gioco UNA volta per sessione — è l'impronta che il copilota del
           cruscotto usa per capire che la sessione è cambiata e azzerare la
           memoria dei narratori (prima di questo la «posizione persa» metteva
           insieme la posizione della sessione prima con quella della gara
           nuova durante il caricamento). */
        id: `${st.eventId ?? ''}:${st.sessionId ?? ''}:${st.sessionType ?? ''}`,
        type: SESSION_T[st.sessionType] ?? 'sconosciuta',
        name: st.sessionName?.trim() || null,
        track: st.track?.trim() || null,
        layout: st.trackConfiguration?.trim() || null,
        trackLengthM: st.trackLengthM ?? null,
        nation: st.nation?.trim() || null,
        grip: GRIP[st.startingGrip] ?? null,
        ambientTempC: st.ambientTempC ?? null,
        online: !!st.online,
        timedRace: !!st.timedRace,
      },
      timing: g?.timing ?? null,
      // delta di ritmo: il giro di adesso contro il best della sessione (o l'HUD del gioco)
      delta: this._deltaInfo(),
      // mappa live: contorno raccolto dai tuoi giri + coordinate delle auto in griglia
      // + la traccia del BEST (per la mappa «dove perdo tempo») e il punto auto di adesso
      map: {
        trail: this.trail ?? [],
        cars: g?.carCoords ?? null,
        best: this.bestTrack ? this.bestTrack.map((p) => [Math.round(p.x), Math.round(p.z)]) : null,
        bestLap: this.bestLapMs != null ? { no: this.bestLapNo, ms: this.bestLapMs } : null,
        cur: g?.carCoords?.[0] ? [Math.round(g.carCoords[0][0]), Math.round(g.carCoords[0][2])] : null,
      },
      player: g ? {
        car: g.carModel?.trim() || p?.car || null,
        driver: `${g.driverName?.trim() || ''} ${g.driverSurname?.trim() || ''}`.trim() || null,
        // CURRENT POS È 0-BASED nonostante l'header (che dice «1 = leader»):
        // prova reale del 25/10 (Imola 500 Cup, gara importata P5/10): il file
        // sessionresults scriveva Mauro a position=4 e la SM diceva 4 per TUTTA
        // la gara — l'HUD del gioco mostra 5. ZERO qui è il LEADER (il campo
        // ACEVO_UNASSIGNED dell'header riguarda la CAR LOCATION, non la
        // posizione). Il copilota e il cruscotto parlano le posizioni COME
        // LE VEDI in pista: +1 qui alla sorgente, niente correzioni sparse
        // nelle viste. Valori fuori griglia (≥ auto totali) = spazzatura del
        // buffer: null, non numeri fantasma.
        position: g.totalDrivers ? (g.currentPos != null && g.currentPos >= 0 && g.currentPos < g.totalDrivers ? g.currentPos + 1 : null) : (g.currentPos != null ? g.currentPos + 1 : null),
        drivers: g.totalDrivers || null,
        // EVO MEMORIZZA IL GIRO IN CORSO in totalLapCount: 1 alla partenza,
        // +1 a ogni traguardo — compiendo il giro 2 il campo legge 3 e la
        // copilota diceva «Giro 3» (25/10, Mauro con la 500, «si sbaglia di
        // un giro sul traguardo, al secondo dice 3 … terzo giro, quarto»).
        // Qui lo si riporta a GIRI COMPIUTI, la semantica che TUTTI i
        // consumatori (copilota, cruscotto «giro X/Y», ingegnere col suo
        // lapsLeft e la finestra pit) davano per scontata: un solo punto
        // di verità, niente -1 sparsi nelle viste.
        // SENSORI DOPPI, LETTO SENSATO (28/10, registro copilot-8642 24/10): in
        // una gara INTERA totalLapCount del graphics è rimasto a 0 per TUTTI i
        // giri, mentre SessionState.currentLap saliva regolarmente 1→2→3→4
        // (1 alla partenza, +1 a ogni traguardo, 4 sul traguardo finale) —
        // risultato: lapsDone fermo a 0, mai «Ultimo giro!», mai «Bandiera».
        // I due campi hanno la STESSA semantica (giro in corso, 1-based):
        // lapsDone = giri compiuti = max(dei valori sensati) - 1; il max protegge
        // il caso precedente (quello che salisce per primo vince, l'altro resta 0).
        lapsDone: (() => {
          const tot = Number.isFinite(g.totalLapCount) && g.totalLapCount > 0 ? g.totalLapCount : null;
          const cur = Number.isFinite(g.currentLapNo) && g.currentLapNo > 0 ? g.currentLapNo : null;
          const inCorso = tot != null && cur != null ? Math.max(tot, cur) : (tot ?? cur);
          return inCorso != null ? Math.max(0, inCorso - 1) : 0;
        })(),
        isLastLap: !!g.isLastLap,
        lapNo: g.currentLapNo ?? null,
        lapsTotal: g.totalLapsSession ?? null,
        bestLap: fmtMs(g.bestLapMs),
        lastLap: fmtMs(g.lastLapMs),
        gapAhead: Number.isFinite(g.gapAhead) && g.gapAhead > 0 ? g.gapAhead : null,
        gapBehind: Number.isFinite(g.gapBehind) && g.gapBehind > 0 ? g.gapBehind : null,
        inPit: g.carLocation === 1,
        location: LOCATION[g.carLocation] ?? null,
        flag: FLAG[g.flag] ?? null,
        globalFlag: FLAG[g.globalFlag] ?? null,
        wrongWay: !!g.wrongWay,
        lapInvalid: !!g.timing?.invalid,
        currentLapText: g.timing?.currentLap ?? null,
        deltaText: g.timing?.delta ?? null,
        idealLapText: g.timing?.idealLap ?? null,
        sessionPhase: g.sessionPhase ?? null,
        timeLeftAll: g.timeLeftStr?.trim() || null,
        speedKmh: g.speedKmh ?? null,
        fuel: p?.fuel ?? g.fuelLiters ?? null,
        lapsPossible: Number.isFinite(g.lapsPossibleFuel) && g.lapsPossibleFuel > 0 ? Math.round(g.lapsPossibleFuel * 10) / 10 : null,
        timeOfDay: g.timeOfDay,
        gear: g.gear ?? (Number.isFinite(p?.gear) ? p.gear : null),
        airTempC: Number.isFinite(p?.airTemp) ? Math.round(p.airTemp) : null,
        roadTempC: Number.isFinite(p?.roadTemp) ? Math.round(p.roadTemp) : null,
        // danni auto dal physics: [fronte, post, sx, dx, centro] come % (0=intatto)
        damage: (p?.carDamage ?? []).map((v) => (Number.isFinite(v) ? Math.round(v * 100) : null)) ?? null,
        tyreWear: (p?.tyreWear ?? []).map((v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)) ?? null,
        tyreCoreTemp: (p?.tyreCoreTemp ?? []).map((v) => (Number.isFinite(v) ? Math.round(v) : null)) ?? null,
        timeLeft: !!st.timedRace && g.timeLeftStr?.trim() ? g.timeLeftStr.trim() : null,
      } : null,
    };
  }

  /**
   * Stato di salute del lettore, per il pannello Salute sistema.
   * gameVersion/smVersion arrivano dal blocco static (scritto dal gioco per
   * ogni sessione): se cambiano tra una sessione e l'altra, i layout delle
   * shared memory potrebbero essere cambiati con loro.
   */
  health() {
    const childOk = !!this.child;
    const alive = childOk && this.lastMsgAt && (Date.now() - this.lastMsgAt) < 15000;
    return {
      reader: { running: childOk, alive, restarts: this.restarts, ps1Exists: existsSync(PS1) },
      game: this.last.game,
      gameVersion: this.last.static?.gameVersion?.trim() || null,
      smVersion: this.last.static?.smVersion?.trim() || null,
      sessionType: this.last.static?.sessionType ?? null,
      stderrTail: this.stderrTail || null,
    };
  }
}

/* singleton per il server */
let reader = null;
export function liveReader() {
  if (!reader) reader = new LiveReader({ intervalMs: 900 });
  return reader;
}
