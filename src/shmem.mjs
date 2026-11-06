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
import { buildPathProg, liveDelta, deltaSegments, settorePeggiore } from './lapdelta.mjs';

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

const ASSISTS = structLayout([
  ['autoGear', 'u8'], ['autoBlip', 'u8'], ['autoClutch', 'u8'], ['autoClutchOnStart', 'u8'],
  ['manualIgnition', 'u8'], ['autoPitLimiter', 'u8'], ['standingStart', 'u8'],
  ['autoSteer', 'f32'], ['arcadeStability', 'f32'], ['placeholder', 'raw(48)'],
]);
_chk('SMEvoAssistsState', ASSISTS.__size, 64);

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
  // La coda della struct (header ufficiale): prima i campi singoli, poi i 960
  // byte dei 60 ID auto. `padCarIds` rappresenta i 3 byte di padding che il
  // pack(4) mette prima del primo uint64_t.
  ['activeCars', 'u8'], ['fuelPerLapTarget', 'f32'], ['fuelEstimatedLaps', 'f32'],
  ['assistsState', 'raw(64)'], ['maxFuel', 'f32'], ['maxTurboBoost', 'f32'],
  ['useSingleCompound', 'bool'], ['padCarIds', 'raw(3)'], ['carIds', 'raw(960)'],
]);

/* DATI di timing ONLINE-dash: dentro graphics c'è raw(256) del timingState
   (SMEvoTimingState) con i tempi di giro come STRINGHE HH:MM:SS.mmm
dell'HUD. Layout confermato dall'header: currentLap, deltaCurrent, lastLap,
deltaLast, bestLap, idealLap, totalTime, invalid bool. */
// Offset VERI di SMEvoTimingState (header ufficiale, pack(4)): i due int32
// delta_current_p/delta_last_p occupano 4 byte e spostano le stringhe dopo.
// La versione precedente leggeva last_laptime a 34 e best_laptime a 68: erano
// dentro i due int32, non nelle stringhe. Qui la correzione sta alla fonte,
// così HUD, radio e API leggono gli stessi byte giusti.
const TIMOFF = {
  currentLap: 0, deltaCurrent: 15, deltaCurrentP: 32,
  lastLap: 36, deltaLast: 51, deltaLastP: 68,
  bestLap: 72, idealLap: 87, totalTime: 102, invalid: 117,
};
export function parseTimingState(buf, base) {
  if (!buf || buf.length < base + 128) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const at = (o, n = 15) => {
    const start = base + o;
    const s = buf.slice(start, start + n);
    let end = 0; while (end < s.length && s[end] !== 0) end++;
    return s.slice(0, end).toString('utf8').trim() || null;
  };
  return {
    currentLap: at(TIMOFF.currentLap), delta: at(TIMOFF.deltaCurrent),
    deltaCurrentP: dv.getInt32(base + TIMOFF.deltaCurrentP, true),
    lastLap: at(TIMOFF.lastLap), deltaLast: at(TIMOFF.deltaLast),
    deltaLastP: dv.getInt32(base + TIMOFF.deltaLastP, true),
    bestLap: at(TIMOFF.bestLap), idealLap: at(TIMOFF.idealLap),
    totalTime: at(TIMOFF.totalTime), invalid: buf[base + TIMOFF.invalid] !== 0,
  };
}

export const GFX = GFX_LAYOUT;

/* ------------------------------------------------------------------ */
/* letture delle sotto-struct della graphics                           */
/* ------------------------------------------------------------------ */

function readCString(buf, offset, length) {
  const start = Math.max(0, offset);
  const end = Math.min(buf.length, start + length);
  let p = start;
  while (p < end && buf[p] !== 0) p++;
  return buf.slice(start, p).toString('utf8');
}

function parseTyreState(buf, base) {
  const f = (o) => buf.readFloatLE(base + o);
  return {
    slip: f(TYRE.slip),
    lock: buf[base + TYRE.lock] !== 0,
    pressurePsi: f(TYRE.pression),
    temperatureC: f(TYRE.tempC),
    brakeTempC: f(TYRE.brakeTempC),
    brakePressure: f(TYRE.brakePressure),
    temperatureInnerC: f(TYRE.tempLeft),
    temperatureCenterC: f(TYRE.tempCenter),
    temperatureOuterC: f(TYRE.tempRight),
    compoundFront: readCString(buf, base + TYRE.compoundFront, 33),
    compoundRear: readCString(buf, base + TYRE.compoundRear, 33),
    normalizedPressure: f(TYRE.normPressure),
    normalizedTemperatureInner: f(TYRE.normTempLeft),
    normalizedTemperatureCenter: f(TYRE.normTempCenter),
    normalizedTemperatureOuter: f(TYRE.normTempRight),
    normalizedBrakeTemperature: f(TYRE.normBrakeTemp),
    normalizedTemperatureCore: f(TYRE.normTempCore),
  };
}

function parseDamageState(buf, base) {
  const f = (o) => buf.readFloatLE(base + o);
  return {
    front: f(DAMAGE.front), rear: f(DAMAGE.rear), left: f(DAMAGE.left), right: f(DAMAGE.right), center: f(DAMAGE.center),
    suspension: { lf: f(DAMAGE.suspLF), rf: f(DAMAGE.suspRF), lr: f(DAMAGE.suspLR), rr: f(DAMAGE.suspRR) },
  };
}

function parsePitInfo(buf, base) {
  return {
    damage: buf.readInt8(base + PITINFO.damage), fuel: buf.readInt8(base + PITINFO.fuel),
    tyres: {
      lf: buf.readInt8(base + PITINFO.tyreLF), rf: buf.readInt8(base + PITINFO.tyreRF),
      lr: buf.readInt8(base + PITINFO.tyreLR), rr: buf.readInt8(base + PITINFO.tyreRR),
    },
  };
}

function parseInstrumentation(buf, base) {
  const pagesStart = base + INSTR.pages;
  return {
    mainLights: buf.readInt8(base + INSTR.mainLights), specialLights: buf.readInt8(base + INSTR.specialLights),
    cockpitLights: buf.readInt8(base + INSTR.cockpitLights), wipers: buf.readInt8(base + INSTR.wipers),
    rainLights: buf[base + INSTR.rainLights] !== 0, turnLeft: buf[base + INSTR.turnL] !== 0,
    turnRight: buf[base + INSTR.turnR] !== 0, flashing: buf[base + INSTR.flashing] !== 0,
    warning: buf[base + INSTR.warning] !== 0, selectedDisplayIndex: buf.readInt8(base + INSTR.displayIndex),
    pages: Array.from(buf.subarray(pagesStart, pagesStart + 16)),
    headlightsVisible: buf[base + INSTR.headlightsVisible] !== 0,
  };
}

function parseElectronics(buf, base) {
  const i8 = (o) => buf.readInt8(base + o);
  const f = (o) => buf.readFloatLE(base + o);
  const bool = (o) => buf[base + o] !== 0;
  return {
    tcLevel: i8(ELECTRONICS.tc), tcCutLevel: i8(ELECTRONICS.tcCut), absLevel: i8(ELECTRONICS.abs),
    escLevel: i8(ELECTRONICS.esc), ebbLevel: i8(ELECTRONICS.ebb), brakeBias: f(ELECTRONICS.brakeBias),
    engineMapLevel: i8(ELECTRONICS.engineMap), turboLevel: f(ELECTRONICS.turbo),
    ersDeploymentMap: i8(ELECTRONICS.ersMap), ersRechargeMap: f(ELECTRONICS.ersRecharge),
    ersHeatCharging: bool(ELECTRONICS.ersHeat), ersOvertakeMode: bool(ELECTRONICS.ersOvertake),
    drsOpen: bool(ELECTRONICS.drsOpen), diffPowerLevel: i8(ELECTRONICS.diffPower),
    diffCoastLevel: i8(ELECTRONICS.diffCoast), frontBumpDamperLevel: i8(ELECTRONICS.frontBump),
    frontReboundDamperLevel: i8(ELECTRONICS.frontRebound), rearBumpDamperLevel: i8(ELECTRONICS.rearBump),
    rearReboundDamperLevel: i8(ELECTRONICS.rearRebound), ignitionOn: bool(ELECTRONICS.ignition),
    pitLimiterOn: bool(ELECTRONICS.pitLimiter), activePerformanceMode: i8(ELECTRONICS.performanceMode),
  };
}

function parseSessionState(buf, base) {
  const i32 = (o) => buf.readInt32LE(base + o);
  const bool = (o) => buf[base + o] !== 0;
  return {
    phaseName: readCString(buf, base + SESSION_STATE.phaseName, 33),
    timeLeft: readCString(buf, base + SESSION_STATE.timeLeft, 15), timeLeftMs: i32(SESSION_STATE.timeLeftMs),
    waitTime: readCString(buf, base + SESSION_STATE.waitTime, 15), totalLap: i32(SESSION_STATE.totalLap),
    currentLap: i32(SESSION_STATE.currentLap), lightsOn: i32(SESSION_STATE.lightsOn), lightsMode: i32(SESSION_STATE.lightsMode),
    lapLengthKm: buf.readFloatLE(base + SESSION_STATE.lapLengthKm), endSessionFlag: i32(SESSION_STATE.endFlag),
    timeToNextSession: readCString(buf, base + SESSION_STATE.timeToNext, 15), disconnectedFromServer: bool(SESSION_STATE.disconnected),
    restartSeasonEnabled: bool(SESSION_STATE.restartSeason), uiEnableDrive: bool(SESSION_STATE.uiDrive),
    uiEnableSetup: bool(SESSION_STATE.uiSetup), isReadyToNextBlinking: bool(SESSION_STATE.readyBlink),
    showWaitingForPlayers: bool(SESSION_STATE.waitingPlayers),
  };
}

function parseAssists(buf, base) {
  const i8 = (o) => buf.readInt8(base + o);
  return {
    autoGear: i8(ASSISTS.autoGear), autoBlip: i8(ASSISTS.autoBlip), autoClutch: i8(ASSISTS.autoClutch),
    autoClutchOnStart: i8(ASSISTS.autoClutchOnStart), manualIgnitionEStart: i8(ASSISTS.manualIgnition),
    autoPitLimiter: i8(ASSISTS.autoPitLimiter), standingStartAssist: i8(ASSISTS.standingStart),
    autoSteer: buf.readFloatLE(base + ASSISTS.autoSteer), arcadeStabilityControl: buf.readFloatLE(base + ASSISTS.arcadeStability),
  };
}

export function parseGraphics(buf) {
  if (!buf || buf.length < GFX_LAYOUT.gapBehind + 4) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const has = (offset, size = 4) => offset >= 0 && offset + size <= buf.length;
  const f32 = (o) => (has(o) ? dv.getFloat32(o, true) : null);
  const i32 = (o) => (has(o) ? dv.getInt32(o, true) : null);
  const u32 = (o) => (has(o) ? dv.getUint32(o, true) : null);
  const i16 = (o) => (has(o, 2) ? dv.getInt16(o, true) : null);
  const u16 = (o) => (has(o, 2) ? dv.getUint16(o, true) : null);
  const u8 = (o) => (has(o, 1) ? dv.getUint8(o) : null);
  const i8 = (o) => (has(o, 1) ? dv.getInt8(o) : null);
  const str = (o, n = 33) => (has(o, n) ? readCString(buf, o, n) : null);
  const pair = (a, b) => ({ a: has(a, 8) ? String(dv.getBigUint64(a, true)) : null, b: has(b, 8) ? String(dv.getBigUint64(b, true)) : null });
  const tyres = {
    lf: parseTyreState(buf, GFX.tyreLF), rf: parseTyreState(buf, GFX.tyreRF),
    lr: parseTyreState(buf, GFX.tyreLR), rr: parseTyreState(buf, GFX.tyreRR),
  };
  const brakeTempC = ['lf', 'rf', 'lr', 'rr']
    .map((k) => tyres[k].brakeTempC)
    .map((v) => (Number.isFinite(v) && v > 0 && v < 1500 ? Math.round(v) : null));
  const carCoords = (() => {
    if (!has(GFX.carCoordinates, 60 * 12)) return null;
    const out = [];
    for (let i = 0; i < 60; i++) {
      const x = dv.getFloat32(GFX.carCoordinates + i * 12, true);
      const y = dv.getFloat32(GFX.carCoordinates + i * 12 + 4, true);
      const z = dv.getFloat32(GFX.carCoordinates + i * 12 + 8, true);
      out.push(Number.isFinite(x) ? [Math.round(x), Math.round(y), Math.round(z)] : null);
    }
    return out;
  })();
  const carIds = has(GFX.carIds, 60 * 16)
    ? Array.from({ length: 60 }, (_, i) => [
      String(dv.getBigUint64(GFX.carIds + i * 16, true)),
      String(dv.getBigUint64(GFX.carIds + i * 16 + 8, true)),
    ])
    : null;
  const timing = parseTimingState(buf, GFX.timingState);
  // I ms numerici e le stringhe HUD sono due sensori dello stesso tempo: se
  // l'int32 è a zero o palesemente sbagliato (offset cambiato), la stringa
  // corretta resta la fonte di verità per HUD, delta e registratore.
  const lapMs = {
    current: lapMsOr(i32(GFX.currentLapMs), timing?.currentLap),
    last: lapMsOr(i32(GFX.lastLapMs), timing?.lastLap),
    best: lapMsOr(i32(GFX.bestLapMs), timing?.bestLap),
    predicted: Number.isFinite(i32(GFX.predictedLapMs)) && i32(GFX.predictedLapMs) > 0 ? i32(GFX.predictedLapMs) : null,
  };
  return {
    packetId: i32(GFX.packetId),
    status: i32(GFX.status),              // 0 off, 1 replay, 2 live, 3 pause
    focusedCarId: pair(GFX.focusedA, GFX.focusedB),
    playerCarId: pair(GFX.playerA, GFX.playerB),
    speedKmh: i16(GFX.speedKmh),
    speedMph: i16(GFX.speedMph), speedMs: i16(GFX.speedMs),
    gear: i16(GFX.gearInt),
    rpm: u16(GFX.rpm), rpmPercent: f32(GFX.rpmPercent), rpmLimiter: u8(GFX.rpmLimiter) !== 0,
    changeUp: u8(GFX.changeUp) !== 0, changeDown: u8(GFX.changeDown) !== 0,
    tcActive: u8(GFX.tcActive) !== 0, absActive: u8(GFX.absActive) !== 0,
    escActive: u8(GFX.escActive) !== 0, launchActive: u8(GFX.launchActive) !== 0,
    ignitionOn: u8(GFX.ignitionOn) !== 0, engineRunning: u8(GFX.engineRunning) !== 0,
    kersCharging: u8(GFX.kersCharging) !== 0, wrongWay: u8(GFX.wrongWay) !== 0,
    drsAvailable: u8(GFX.drsAvailable) !== 0, batteryCharging: u8(GFX.batteryCharging) !== 0,
    maxKjPerLap: u8(GFX.maxKjPerLap) !== 0, maxChargeKj: u8(GFX.maxChargeKj) !== 0,
    gasPercent: f32(GFX.gasPercent), brakePercent: f32(GFX.brakePercent),
    handbrakePercent: f32(GFX.handbrakePercent), clutchPercent: f32(GFX.clutchPercent),
    steeringPercent: f32(GFX.steeringPercent), steerDegrees: i32(GFX.steerDegrees), pitspeedDelta: f32(GFX.pitspeedDelta),
    ffbStrength: f32(GFX.ffbStrength), carFfbMultiplier: f32(GFX.carFfbMultiplier),
    waterTempPercent: f32(GFX.waterTempPercent), waterPressureBar: f32(GFX.waterPressureBar),
    fuelPressureBar: f32(GFX.fuelPressureBar), waterTempC: i8(GFX.waterTempC), airTempC: i8(GFX.airTempC),
    oilTempC: f32(GFX.oilTempC), oilPressureBar: f32(GFX.oilPressureBar), exhaustTempC: f32(GFX.exhaustTempC),
    gForces: { x: f32(GFX.gForceX), y: f32(GFX.gForceY), z: f32(GFX.gForceZ) },
    turboBoost: f32(GFX.turboBoost), turboBoostLevel: f32(GFX.turboBoostLevel), turboBoostPerc: f32(GFX.turboBoostPerc),
    currentKm: f32(GFX.currentKm), totalKm: u32(GFX.totalKm), totalDriveTimeS: u32(GFX.totalDriveTimeS),
    timeOfDayH: i32(GFX.timeOfDayH), timeOfDayM: i32(GFX.timeOfDayM), timeOfDayS: i32(GFX.timeOfDayS),
    timeOfDay: `${i32(GFX.timeOfDayH)}:${String(i32(GFX.timeOfDayM)).padStart(2, '0')}`,
    currentLapMs: lapMs.current, lastLapMs: lapMs.last, bestLapMs: lapMs.best,
    predictedLapMs: lapMs.predicted, deltaMs: i32(GFX.deltaTimeMs), lapMs,
    isValidLap: u8(GFX.isValidLap) !== 0,
    fuelLiters: f32(GFX.fuelLiters), fuelPercent: f32(GFX.fuelPercent),
    fuelPerKm: f32(GFX.fuelPerKm), kmPerLiter: f32(GFX.kmPerLiter),
    lapsPossibleFuel: f32(GFX.lapsPossibleFuel),
    totalLaps: i32(GFX.totalLapCount), totalLapCount: i32(GFX.totalLapCount),
    totalLapsSession: i32(GFX.sessionState + SESSION_STATE.totalLap),
    currentLapNo: i32(GFX.sessionState + SESSION_STATE.currentLap),
    sessionPhase: str(GFX.sessionState + SESSION_STATE.phaseName, 33),
    timeLeftStr: str(GFX.sessionState + SESSION_STATE.timeLeft, 15),
    currentPos: u32(GFX.currentPos), totalDrivers: u32(GFX.totalDrivers),
    gapAhead: f32(GFX.gapAhead), gapBehind: f32(GFX.gapBehind),
    isLastLap: u8(GFX.isLastLap) !== 0, flag: i32(GFX.flag), globalFlag: i32(GFX.globalFlag),
    timing,
    carCoords, carIds,
    carLocation: i32(GFX.carLocation),
    raceCutGainedMs: i32(GFX.raceCutGainedMs), raceCutDelta: f32(GFX.raceCutCurrentDelta), cutDeadline: i32(GFX.distanceToDeadline),
    brakeTempC: brakeTempC.some((v) => v != null) ? brakeTempC : null,
    tyres, tyrePressure: ['lf', 'rf', 'lr', 'rr'].map((k) => tyres[k].pressurePsi),
    driverName: str(GFX.driverName), driverSurname: str(GFX.driverSurname), carModel: str(GFX.carModel),
    fps: i32(GFX.playerFps), playerFps: i32(GFX.playerFps), playerFpsAvg: i32(GFX.playerFpsAvg),
    playerPing: i32(GFX.playerPing), playerLatency: i32(GFX.playerLatency),
    playerCpu: i32(GFX.playerCpu), playerCpuAvg: i32(GFX.playerCpuAvg),
    playerQos: i32(GFX.playerQos), playerQosAvg: i32(GFX.playerQosAvg),
    isInPitBox: u8(GFX.isInPitBox) !== 0, isInPitLane: u8(GFX.isInPitLane) !== 0,
    activeCars: u8(GFX.activeCars), fuelPerLapTarget: f32(GFX.fuelPerLapTarget), fuelEstimatedLaps: f32(GFX.fuelEstimatedLaps),
    maxFuel: f32(GFX.maxFuel), maxTurboBoost: f32(GFX.maxTurboBoost), useSingleCompound: u8(GFX.useSingleCompound) !== 0,
    npos: f32(GFX.npos), kersChargePerc: f32(GFX.kersChargePerc), kersCurrentPerc: f32(GFX.kersCurrentPerc),
    controlLockTime: f32(GFX.controlLockTime),
    currentTorque: f32(GFX.currentTorque), currentBhp: i32(GFX.currentBhp),
    fuelUsed: f32(GFX.fuelUsed), fuelPerLap: f32(GFX.fuelPerLap),
    lapsPossibleFuelHud: f32(GFX.lapsPossibleFuel),
    batteryTemp: f32(GFX.batteryTemp), batteryVoltage: f32(GFX.batteryVoltage),
    instantaneousFuelPerKm: f32(GFX.instFuelPerKm), instantaneousKmPerLiter: f32(GFX.instKmPerLiter),
    gearRpmWindow: f32(GFX.gearRpmWindow),
    carDamage: parseDamageState(buf, GFX.carDamage), pitInfo: parsePitInfo(buf, GFX.pitInfo),
    instrumentation: parseInstrumentation(buf, GFX.instr),
    instrumentationMin: parseInstrumentation(buf, GFX.instrMin),
    instrumentationMax: parseInstrumentation(buf, GFX.instrMax),
    electronics: parseElectronics(buf, GFX.electronics),
    electronicsMin: parseElectronics(buf, GFX.electronicsMin),
    electronicsMax: parseElectronics(buf, GFX.electronicsMax),
    electronicsModifiable: parseElectronics(buf, GFX.electronicsMod),
    sessionState: parseSessionState(buf, GFX.sessionState),
    assists: has(GFX.assistsState, 64) ? parseAssists(buf, GFX.assistsState) : null,
    maxGears: u32(GFX.maxGears), engineType: i32(GFX.engineType), hasKers: u8(GFX.hasKers) !== 0,
    performanceModeName: str(GFX.performanceModeName), diffCoastRaw: f32(GFX.diffCoastRaw), diffPowerRaw: f32(GFX.diffPowerRaw),
    truncated: buf.length < GFX.carIds + 60 * 16,
  };
}

/* ------------------------------------------------------------------ */
/* posizione e consumo del GIOCATORE                                   */
/* ------------------------------------------------------------------ */

/**
 * Posizione XZ dell'auto del giocatore.
 *
 * La build live di EVO può lasciare `graphics.car_coordinates[0]` con memoria
 * non inizializzata (valori enormi o zeri): non è una posizione. La fisica
 * invece porta i quattro punti di contatto delle gomme, che sono specifici
 * dell'auto del giocatore e sono sempre coerenti. Preferiamo quelli; le
 * graphics restano solo un fallback per i payload vecchi/sintetici.
 */
export function currentCarPosition(g, p) {
  const pts = Array.isArray(p?.tyreContactPoint) ? p.tyreContactPoint : [];
  const valid = pts.filter((q) => Array.isArray(q) && q.length >= 3
    && Number.isFinite(q[0]) && Number.isFinite(q[2]));
  if (valid.length >= 2) {
    const x = valid.reduce((s, q) => s + q[0], 0) / valid.length;
    const z = valid.reduce((s, q) => s + q[2], 0) / valid.length;
    const r = Math.hypot(x, z);
    if (Number.isFinite(x) && Number.isFinite(z) && r > 0.01 && r < 100000) {
      return { x, z, source: 'physics' };
    }
  }
  const fallback = (g?.carCoords ?? []).find((c) => Array.isArray(c) && c.length >= 3
    && Number.isFinite(c[0]) && Number.isFinite(c[2])
    && Math.hypot(c[0], c[2]) > 0.5 && Math.hypot(c[0], c[2]) < 100000);
  return fallback ? { x: fallback[0], z: fallback[2], source: 'graphics' } : null;
}

/** Consumo per giro: campo diretto del gioco, altrimenti litri / giri stimati. */
export function liveFuelPerLap(g) {
  const direct = Number(g?.fuelPerLap);
  if (Number.isFinite(direct) && direct >= 0.3 && direct <= 20) {
    return Math.round(direct * 100) / 100;
  }
  const liters = Number(g?.fuelLiters);
  const laps = Number(g?.lapsPossibleFuel);
  if (Number.isFinite(liters) && liters > 0 && Number.isFinite(laps) && laps > 0) {
    const ratio = liters / laps;
    if (ratio >= 0.3 && ratio <= 20) return Math.round(ratio * 100) / 100;
  }
  return null;
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
  // Da qui in poi la struct continua: brakeTemp, contatti gomma, forze,
  // compound, usura pastiglie/dischi, accensione e vibrazioni. La MMF fisica
  // viene letta per 1024 byte, quindi questi campi sono già a bordo: prima
  // venivano buttati. La coda si legge solo se il buffer è abbastanza lungo,
  // così un blocco troncato non fa esplodere il lettore.
  // La struct fisica completa finisce a 800 B: sotto quella soglia la coda
  // non c'è e brakeTemp resta null (compatibilità col vecchio payload).
  out.truncated = buf.length < 800;
  if (out.truncated) { out.brakeTemp = null; return out; }
  out.localAngularVel = [c.f32(), c.f32(), c.f32()];
  out.finalFF = c.f32();
  out.performanceMeter = c.f32();
  out.engineBrake = c.i32();
  out.ersRecoveryLevel = c.i32();
  out.ersPowerLevel = c.i32();
  out.ersHeatCharging = c.i32();
  out.ersIsCharging = c.i32();
  out.kersCurrentKJ = c.f32();
  out.drsAvailable = c.i32();
  out.drsEnabled = c.i32();
  out.brakeTemp = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.clutch = c.f32();
  out.tyreTempI = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.tyreTempM = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.tyreTempO = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.isAIControlled = c.i32();
  out.tyreContactPoint = [[c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()]];
  out.tyreContactNormal = [[c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()]];
  out.tyreContactHeading = [[c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()], [c.f32(), c.f32(), c.f32()]];
  out.brakeBias = c.f32();
  out.localVelocity = [c.f32(), c.f32(), c.f32()];
  out.P2PActivations = c.i32();
  out.P2PStatus = c.i32();
  out.currentMaxRpm = c.i32();
  out.mz = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.fx = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.fy = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.slipRatio = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.slipAngle = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.tcinAction = c.i32();
  out.absInAction = c.i32();
  out.suspensionDamage = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.tyreTemp = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.waterTemp = c.f32();
  out.brakeTorque = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.frontBrakeCompound = c.i32();
  out.rearBrakeCompound = c.i32();
  out.padLife = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.discLife = [c.f32(), c.f32(), c.f32(), c.f32()];
  out.ignitionOn = c.i32();
  out.starterEngineOn = c.i32();
  out.isEngineRunning = c.i32();
  out.kerbVibration = c.f32();
  out.slipVibrations = c.f32();
  out.roadVibrations = c.f32();
  out.absVibrations = c.f32();
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

/** Delta numerico (ms) come testo HUD, per quando la stringa del gioco è vuota. */
export function fmtDeltaText(ms) {
  if (ms == null) return null;
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  return `${n > 0 ? '+' : ''}${(n / 1000).toFixed(3)}`;
}

/**
 * Tempo giro HUD («1:23.456», «23.456», «1:23,4») in millisecondi.
 * null per vuoto, «—», DNF o testo non numerico: il chiamante distingue
 * «campo assente» da «zero».
 */
export function parseLapText(text) {
  if (text == null) return null;
  const s = String(text).trim().replace(',', '.');
  const m = /^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  if (m[1] != null && Number(m[2]) >= 60) return null;
  const min = Number(m[1] ?? 0);
  const sec = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
  const frac = (m[3] ?? '').padEnd(3, '0').slice(0, 3);
  return min * 60000 + sec * 1000 + Number(frac);
}

/** Sceglie il numero dei ms se sano, altrimenti la stringa HUD (fonte corretta). */
function lapMsOr(numeric, text) {
  const n = Number(numeric);
  const t = parseLapText(text);
  if (!Number.isFinite(n) || n < 0) return t;
  if (n === 0) return t;
  // un int32 che non somiglia né al current né al last HUD è un offset in fumo
  if (t != null && Math.abs(n - t) > 2000) return t;
  return n;
}

/** Il delta dell'HUD («+0.456», «-0.123» o «0.123») in millisecondi. */
export function parseHudDelta(text) {
  if (text == null) return null;
  const m = /^([+-])?\s*(\d+)[.,](\d{1,3})$/.exec(String(text).trim());
  if (!m) return null;
  const v = Number(m[2]) * 1000 + Number(m[3].padEnd(3, '0').slice(0, 3));
  return Number.isFinite(v) ? (m[1] === '-' ? -v : v) : null;
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
    this.trail = [];         // contorno della sessione in corso
    this._sessionKey = null; // firma eventId:sessionId:tipo dell'ultima sessione vista
    this.settoreUltimo = null; // il settore peggiore del giro appena chiuso (dal vivo, per la qualifica del copilota)
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
      try { console.error('[live] powershell non avviabile:', err?.message ?? err); } catch { /* nemmeno stderr risponde: il lettore resta spento */ }
    });
    child.on('exit', () => { if (this.child === child) this.child = null; });
  }
  /** cambio sessione (menu → campionato, pista nuova): niente best o mappa vecchi. */
  _resetSession() {
    this.trail = [];
    this.settoreUltimo = null;
    this.lapTrack = [];
    this.lapNoSeen = null;
    this.bestTrack = null;
    this.bestLapNo = null;
    this.bestLapMs = null;
    this._bestPath = null;
    this._deltaCache = null;
    this._deltaKey = '';
  }
  /** cambio giro: il giro appena chiuso diventa il nuovo best della sessione? */
  _commitLap(lapNo) {
    const g = this.last.graphics;
    const track = this.lapTrack;
    // serve una traccia lunga (min 10 campioni) e un giro completo (≥ 15 s)
    const lapMs = Number(g?.lapMs?.last ?? g?.lastLapMs);
    if (track.length >= 10 && Number.isFinite(lapMs) && lapMs > 15000
      && g?.isValidLap && (this.bestLapMs == null || lapMs < this.bestLapMs)) {
      this.bestTrack = track.slice();
      this.bestLapNo = lapNo;
      this.bestLapMs = lapMs;
      this._bestPath = null;         // il percorso cambia col nuovo best
      this._deltaCache = null;
      this._deltaKey = '';
    }
    // SETTORE PEGGIORE DEL GIRO CHE ESCE (6/11, dal vivo — richiesta Mauro:
    // «leggiamo anche i delta dal vivo, inseriscili in qualifica nel copilot»).
    // Si confronta col best che c'era PRIMA: se il giro uscito È il nuovo best
    // il confronto sarebbe «perdere contro se stesso» e non si dice.
    try {
      if (track.length >= 10 && Number.isFinite(this.bestLapMs) && Number.isFinite(lapMs)
        && lapMs > this.bestLapMs && this.bestTrack && this.bestTrack.length >= 4) {
        const percorso = buildPathProg(this.bestTrack);
        if (percorso) {
          const peggio = settorePeggiore(deltaSegments(track, percorso, 48));
          if (peggio) this.settoreUltimo = { ...peggio, lapNo, at: Date.now() };
        }
      }
    } catch { /* senza percorso il settore non grida: non è un errore */ }
    this.lapTrack = [];              // riparte il campionamento del giro nuovo
  }

  /** il delta «adesso» + i tagli per fascia (memo: li ricalcola a cambio di giro o di traccia) */
  _deltaInfo() {
    const g = this.last.graphics;
    // Il testo HUD è la fonte primaria; i due int32 sono il fallback quando il
    // gioco non scrive la stringa. `deltaCurrentP = 0` a inizio giro NON è un
    // delta zero: è il campo ancora vuoto. In quel caso vale il deltaTimeMs del
    // gioco, che nei dati reali di Laguna Seca era già negativo e plausibile.
    const hudText = parseHudDelta(g?.timing?.delta ?? null);
    const hudP = Number(g?.timing?.deltaCurrentP);
    const hudRaw = Number(g?.deltaMs);
    const hud = hudText
      ?? (Number.isFinite(hudP) && hudP !== 0 && Math.abs(hudP) < 300000 ? hudP : null)
      ?? (Number.isFinite(hudRaw) && hudRaw !== 0 && Math.abs(hudRaw) < 300000 ? hudRaw : null);
    // lapNo ANCHE in 'hud': senza di lui il narratore «giro finito» della copilota
    // tace finché non entra 'tracked' (best committato) — lezione 24/10 sera:
    // «altra gara ma ho sentito solo la benzina, niente tempi sul giro».
    const lapNo = this.lapNoSeen ?? null;
    const bestLapMs = this.bestLapMs ?? g?.lapMs?.best ?? g?.bestLapMs ?? null;
    if (!this.bestTrack || this.bestTrack.length < 4) {
      return { source: 'hud', dv: hud, bestLapMs, bestLapNo: this.bestLapNo ?? null, lapNo };
    }
    this._bestPath ??= buildPathProg(this.bestTrack);
    if (!this._bestPath) return { source: 'hud', dv: hud, bestLapMs, bestLapNo: this.bestLapNo, lapNo };
    const currentLapMs = Number(g?.lapMs?.current ?? g?.currentLapMs);
    const key = `${this.bestLapMs}|${this.lapNoSeen}|${this.lapTrack.length}`;
    if (this._deltaKey !== key) {
      this._deltaCache = {
        live: liveDelta(this.lapTrack, this._bestPath, currentLapMs),
        segments: deltaSegments(this.lapTrack, this._bestPath, 48),
      };
      this._deltaKey = key;
    }
    const trackedDv = this._deltaCache.live?.deltaMs ?? null;
    // Un delta non può essere più negativo del tempo già trascorso nel giro:
    // se lo è, la traccia del best è ancorata a un punto sbagliato (es. giro
    // d'uscita dai box) e il numero non va mostrato come se fosse vero.
    const impossible = trackedDv != null && (
      Math.abs(trackedDv) > 300000
      || (Number.isFinite(currentLapMs) && currentLapMs >= 0 && trackedDv < -currentLapMs - 1000)
    );
    if (impossible) {
      return {
        source: 'hud',
        dv: hud,
        bestLapMs,
        bestLapNo: this.bestLapNo,
        lapNo,
        hudDv: hud,
        segments: null,
      };
    }
    return {
      source: 'tracked',
      bestLapMs,
      bestLapNo: this.bestLapNo,
      lapNo: this.lapNoSeen ?? null,
      dv: trackedDv,     // ms
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
    // La firma della sessione cambia quando si esce in menu o si carica un
    // altro evento: best, delta e contorno della pista precedente NON devono
    // sopravvivere nel campionato nuovo.
    const st = this.last.static;
    if (st) {
      const key = `${st.eventId ?? ''}:${st.sessionId ?? ''}:${st.sessionType ?? ''}`;
      if (this._sessionKey !== null && key !== this._sessionKey) this._resetSession();
      this._sessionKey = key;
    }
    // BUG 21/10 (verificato IN GIOCO su Practice/Imola): il flag game non veniva
    // MAI settato a true su 'data' — lo snapshot usciva subito su !game e la GUI
    // diceva «EVO chiuso» anche con la sessione in pista (MMF vive, parser OK).
    this.last.game = true;
    this.last.graphics = parseGraphics(dec(msg.graphics)) ?? this.last.graphics;
    this.last.physics = parsePhysics(dec(msg.physics)) ?? this.last.physics;
    // LA TUA posizione: i punti di contatto delle gomme dalla fisica (le
    // graphics possono avere car_coordinates[0] non inizializzato in questa
    // build). Il contorno pista usa un punto ogni ~60 m; oltre 1500 si compatta.
    const g = this.last.graphics;
    const p = this.last.physics;
    const pos = currentCarPosition(g, p);
    if (pos) {
      const tr = (this.trail ??= []);
      const last = tr.length ? tr[tr.length - 1] : null;
      if (!last || Math.hypot(pos.x - last[0], pos.z - last[1]) > 60) {
        tr.push([pos.x, pos.z]);
        if (tr.length > 1500) this.trail = tr.filter((_, i) => i % 2 === 0);
      }
    }
    /* --- tracking del giro per il delta di ritmo (lapdelta.mjs) --- */
    if (pos) {
      const x = pos.x, z = pos.z;
      const lapNo = g.currentLapNo;
      if (Number.isFinite(lapNo) && this.lapNoSeen != null && lapNo !== this.lapNoSeen) {
        this._commitLap(this.lapNoSeen);       // il giro appena chiuso va in campagna per il best
      }
      if (Number.isFinite(lapNo)) this.lapNoSeen = lapNo;
      const lapMs = Number(g.lapMs?.current ?? g.currentLapMs);
      if (Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(lapMs) && lapMs > 0 && g.status === 2) {
        const kt = this.lapTrack;
        const lp = kt.length ? kt[kt.length - 1] : null;
        if (!lp || Math.hypot(x - lp.x, z - lp.z) > 25) kt.push({ x, z, t: lapMs });
      }
    }
  }
  stop() { try { this.child?.kill(); } catch { /* già morto: è quello che volevamo */ } this.child = null; }
  /**
   * Istantanea per i consumatori. `raw:true` aggiunge i tre blocchi PARSATI
   * COMPLETI (static, graphics, physics): la GUI e il copilota continuano a
   * usare il payload compatto, mentre /api/live può mostrare ogni campo già
   * letto dalla MMF senza una seconda lettura né un secondo processo.
   */
  snapshot({ raw = false } = {}) {
    const { static: st, graphics: g, physics: p, game } = this.last;
    if (!game || !st) return { game: false };
    // dati vecchi = dati inaffidabili: se il lettore non aggiorna da oltre 20s
    // (gioco chiuso senza 'nogame', lettore impallato) non fidarci mai
    if (this.last.at && Date.now() - this.last.at > 20000) return { game: false, stale: true };
    const deltaInfo = this._deltaInfo();
    const playerPos = currentCarPosition(g, p);
    const fuelPerLapLive = liveFuelPerLap(g);
    const snap = {
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
        // È GARA? (6/11, la gara di Laguna Seca): il tipo STATIC di EVO scrive
        // «TimeAttack» anche in gara e la fase può arrivare vuota, quindi la
        // riga di verifica scheda non poteva MAI dire «pronto» e inRace restava
        // falso mentre si correva. La firma vera: gara A GIRI senza timer.
        race: eGaraSessione({ tipo: SESSION_T[st.sessionType] ?? 'sconosciuta', giriTotali: g?.totalLapsSession, tempoRimanente: g?.timeLeftStr }),
      },
      timing: g?.timing ?? null,
      // tempi numerici normalizzati (stringa HUD come fallback): il cruscotto
      // non deve mostrare «—» quando il gioco ha il tempo ma l'int32 è a zero.
      lapTimes: g?.lapMs ?? null,
      // delta di ritmo: il giro di adesso contro il best della sessione (o l'HUD del gioco)
      delta: deltaInfo,
      settoreUltimo: this.settoreUltimo ?? null,
      // mappa live: contorno raccolto dai tuoi giri + coordinate delle auto in griglia
      // + la traccia del BEST (per la mappa «dove perdo tempo») e il punto auto di adesso
      map: {
        trail: this.trail ?? [],
        cars: g?.carCoords ?? null,
        best: this.bestTrack ? this.bestTrack.map((p) => [Math.round(p.x), Math.round(p.z)]) : null,
        bestLap: this.bestLapMs != null ? { no: this.bestLapNo, ms: this.bestLapMs } : null,
        cur: playerPos ? [Math.round(playerPos.x), Math.round(playerPos.z)] : null,
        playerSource: playerPos?.source ?? null,
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
        bestLap: fmtMs(g.lapMs?.best ?? g.bestLapMs),
        lastLap: fmtMs(g.lapMs?.last ?? g.lastLapMs),
        currentLapMs: g.lapMs?.current ?? g.currentLapMs ?? null,
        lastLapMs: g.lapMs?.last ?? g.lastLapMs ?? null,
        bestLapMs: g.lapMs?.best ?? g.bestLapMs ?? null,
        deltaMs: Number.isFinite(Number(g.deltaMs)) ? Number(g.deltaMs) : null,
        gapAhead: Number.isFinite(g.gapAhead) && g.gapAhead > 0 ? g.gapAhead : null,
        gapBehind: Number.isFinite(g.gapBehind) && g.gapBehind > 0 ? g.gapBehind : null,
        // GREZZI (31/10 pomeriggio, carta bianca): il valore scritto dal gioco
        // SENZA il filtro >0 sopra. Nei 1890 tick dei log delle gare registrate
        // gapAhead/gapBehind non sono mai arrivati filtrati e NON si riusciva a
        // distinguere «il gioco non scrive il campo (già uphill il valore resta
        // 0 di default)» da «offset sbagliato / spazzatura». Con i grezzi il
        // registro della PROSSIMA gara lo dice da solo: sempre 0.0 = campo morto
        // in SP, valori volanti = offset in fumo, valori sensati = il campo
        // esiste e radio e GUI possono parlarlo. Layout verificato a mano:
        // gap_behind finisce a 3852 B come la nota del bridge
        // (docs/acevo-wrapper.hpp:842, tools/acevo-live.ps1:47) — non è un
        // problema di offset.
        gapAheadRaw: Number.isFinite(g.gapAhead) ? g.gapAhead : null,
        gapBehindRaw: Number.isFinite(g.gapBehind) ? g.gapBehind : null,
        inPit: g.carLocation === 1,
        location: LOCATION[g.carLocation] ?? null,
        flag: FLAG[g.flag] ?? null,
        globalFlag: FLAG[g.globalFlag] ?? null,
        // CODICE GREZZO DEL FLAG (28/10 notte, «le bandiere blu non segnano
        // giusto nelle endurance»): accanto alla PAROLA la cifra scritta dal
        // gioco (0 nessuna … 4 blu … 10 sdrucciolevole, mappa).
        // flagCode/globaleFlagCode in ingegnere.mjs e campi() del monitor:
        // se una endurance scrivesse un valore FUORI mappa la parola esce
        // null e la diagnosi non distingue «campo assente» da «valore
        // nuovo di EVO»: col grezzo il registro della gara lo dice da solo.
        flagCode: Number.isFinite(g.flag) ? g.flag : null,
        globalFlagCode: Number.isFinite(g.globalFlag) ? g.globalFlag : null,
        wrongWay: !!g.wrongWay,
        lapInvalid: !!g.timing?.invalid,
        // PENALITÀ TAGLI (30/10, «penalità a voce»): il ms cumulativi
        // GUADAGNATI tagliando — il gioco li scala dal tuo tempo finale.
        // 0 o assente = nessun taglio contabilizzato (non è un errore:
        // qualifiche e TimeAttack li lasciano a zero).
        cutPenaltyMs: Number.isFinite(g.raceCutGainedMs) ? g.raceCutGainedMs : null,
        currentLapText: g.timing?.currentLap ?? fmtMs(g.lapMs?.current ?? null),
        deltaText: g.timing?.delta ?? fmtDeltaText(deltaInfo?.dv),
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
        damage: danniPercent(p?.carDamage),
        tyreWear: (p?.tyreWear ?? []).map((v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)) ?? null,
        tyreCoreTemp: (p?.tyreCoreTemp ?? []).map((v) => (Number.isFinite(v) ? Math.round(v) : null)) ?? null,
        // I nuovi campi della MMF non restano chiusi in raw: la radio e il
        // meccanico li ricevono anche dallo snapshot compatto.
        tyreTempC: ['lf', 'rf', 'lr', 'rr'].map((k) => {
          const v = g.tyres?.[k]?.temperatureC;
          return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
        }),
        tyreInnerC: ['lf', 'rf', 'lr', 'rr'].map((k) => {
          const v = g.tyres?.[k]?.temperatureInnerC;
          return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
        }),
        tyreOuterC: ['lf', 'rf', 'lr', 'rr'].map((k) => {
          const v = g.tyres?.[k]?.temperatureOuterC;
          return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
        }),
        tyrePressure: (p?.wheelPressure ?? g.tyrePressure ?? []).map((v) => (Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null)),
        brakeTempC: (g?.brakeTempC ?? p?.brakeTemp ?? []).map((v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : null)),
        fuelPerLap: fuelPerLapLive,
        tcActive: !!g.tcActive,
        gForces: p?.accG ?? g?.gForces ?? null,
        camberRAD: p?.camberRAD ?? null,
        suspensionTravel: p?.suspensionTravel ?? null,
        rideHeight: p?.rideHeight ?? null,
        timeLeft: !!st.timedRace && g.timeLeftStr?.trim() ? g.timeLeftStr.trim() : null,
      } : null,
    };
    if (raw) snap.raw = { static: st, graphics: g, physics: p };
    return snap;
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
/** È GARA? (6/11): il tipo STATIC di EVO scrive «TimeAttack» anche in gara e la
 *  fase può arrivare vuota, quindi non basta nessuno dei due. La firma vera è
 *  la coppia: sessione A GIRI e NESSUN timer — prove e qualifiche sono a tempo
 *  e la gara no. Una sola regola per live, verifica scheda e copilota. */
export function eGaraSessione({ tipo = null, giriTotali = null, tempoRimanente = null } = {}) {
  if (String(tipo ?? '') === 'Race') return true;
  const giri = Number(giriTotali);
  const timer = tempoRimanente == null ? '' : String(tempoRimanente).trim();
  return Number.isFinite(giri) && giri > 0 && timer === '';
}

/** Danni per area in % [fronte, post, sx, dx, centro]. Il gioco scrive di norma
 *  frazioni 0..1, ma in certi frame il blocco arriva GIÀ in percentuale
 *  (6.76 = 6.76%): la scala si riconosce dal blocco intero — la stessa regola
 *  dell'usura gomme in engineer.mjs — e il risultato non passa mai il 100.
 *  Prima ogni valore era × 100 a prescindere: la gara di Laguna Seca ha
 *  mostrato «676 %» e «964 %». */
export function danniPercent(damage) {
  const vals = (Array.isArray(damage) ? damage : []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : null));
  const scala = vals.some((v) => v != null && v > 1.5) ? 1 : 100;
  return vals.map((v) => (v == null ? null : Math.min(100, Math.round(scala === 1 ? v : v * 100))));
}

export function liveReader() {
  if (!reader) reader = new LiveReader({ intervalMs: 900 });
  return reader;
}
