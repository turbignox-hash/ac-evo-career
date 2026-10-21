// watch-setup-changes.mjs — la SPIA della prova CONTROLLI (Mauro 21/10).
// Obiettivo: capire QUALE controlli del setup si vedono dal tool in diretta.
//
// Come funziona:
//   • legge i tre blocchi shared memory (come il LIVE) ogni ~1s;
//   • quando l'auto è FERMA (≤5 km/h: sei nel setup/menu/pit) confronta campo per
//     campo lo snapshot col precedente e REGISTRA ogni valore cambiato, con il
//     flag uiSetup (sei dentro la schermata SETUP?);
//   • ELECTRONICS del blocco graphics decodifica a parte: brake bias, TC, ABS,
//     diff trazione/Coast, bump/rebound, engine map — le maniglie del MFD;
//   • features file-system: scandisce ogni 2s le cartelle del gioco (Saved Games
//     e Documents ACE) e registra QUALSIASI file creato/cambiato;
//   • tutto in append su data/setup-monitor.jsonl: {at, uiSetup, speed, changed, files}.
//
// Uso:  node tools/watch-setup-changes.mjs   (Ctrl+C o kill per fermare)
import { readdirSync, statSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { resolvePaths } from '../src/paths.mjs';
import { parseStatic, parseGraphics, parsePhysics, GFX, ELECTRONICS } from '../src/shmem.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PS1 = join(HERE, 'acevo-live.ps1');
const paths = resolvePaths({ ...process.env });
const OUT = join(HERE, '..', 'data', 'setup-monitor.jsonl');
mkdirSync(join(HERE, '..', 'data'), { recursive: true });

let logLine = 0;
const log = (obj) => {
  try { appendFileSync(OUT, JSON.stringify(obj) + '\n'); } catch {}
  logLine++;
};

/* --- decode ELECTRONICS dal raw(128) dentro graphics --- */
function electronicsOf(gbuf) {
  if (!gbuf || gbuf.length < GFX.electronics + ELECTRONICS.__size) return null;
  const b = gbuf.subarray(GFX.electronics, GFX.electronics + ELECTRONICS.__size);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const f32 = (o) => dv.getFloat32(o, true);
  const i8 = (o) => dv.getInt8(o);
  const bool = (o) => dv.getUint8(o) !== 0;
  const pick = {};
  for (const [name, off] of Object.entries(ELECTRONICS)) {
    if (name === '__size' || name === 'placeholder') continue;
    if (name === 'ignition' || name === 'pitLimiter') pick[name] = bool(off);
    else if (name === 'ersHeat') pick[name] = bool(off);
    else if (name === 'ersRecharge' || name === 'ersOvertake') pick[name] = bool(off);
    else if (['brakeBias', 'turbo'].includes(name)) pick[name] = Math.round(f32(off) * 1000) / 1000;
    else pick[name] = i8(off);
  }
  return pick;
}

/* --- file: mtime+size di tutto l'Albero del gioco --- */
// l'albero dei salvataggi ha migliaia di file: a ogni tick (1s) ri-readdirare e
// ri-statizzare tutto si mangia il disco. Cache per cartella basata sul mtime
// DELLA CARTELLA: se la cartella non cambia, riuso la lista di voci senza
// ri-leggerla (creazioni/cancellazioni cambiano il mtime della cartella, quindi
// non si perdono eventi). Il statSync per-file resta: coglie le MODIFICHE ai
// file esistenti (content change), che il mtime della cartella non vedrebbe.
const dirCache = new Map(); // dirPath → { mtimeMs, ents }
function listDir(dirpath) {
  let d;
  try { d = statSync(dirpath); } catch { dirCache.delete(dirpath); return []; }
  const mtimeMs = Math.round(d.mtimeMs);
  const hit = dirCache.get(dirpath);
  if (hit && hit.mtimeMs === mtimeMs) return hit.ents;
  let ents;
  try { ents = readdirSync(dirpath, { withFileTypes: true }); } catch { dirCache.delete(dirpath); return []; }
  dirCache.set(dirpath, { mtimeMs, ents });
  return ents;
}
function oldtree(dirs) {
  const map = new Map();
  for (const dir of dirs) walk(dir, '');
  function walk(dir, sub) {
    for (const e of listDir(join(dir, sub))) {
      const rel = sub ? join(sub, e.name) : e.name;
      if (e.isDirectory()) walk(dir, rel);
      else {
        try { const st = statSync(join(dir, rel)); map.set(join(dir, rel), { size: st.size, mtime: Math.round(st.mtimeMs) }); } catch {}
      }
    }
  }
  return map;
}
const fileDirs = [...(paths.dataDirs ?? [])];
const prior = oldtree(fileDirs);

/* --- shared memory --- */
const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-IntervalMs', '900'], { windowsHide: true });
let buffer = '';
child.stdout.setEncoding('utf8');
child.stderr.resume();

const NOISE = new Set(['packetId', 'fps', 'rpm', 'speedKmh', 'gear', 'gasPercent', 'brakePercent', 'timing']);
const round = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : Math.round(v * 1000) / 1000)
  : Array.isArray(v) ? v.map(round)
  : typeof v === 'object' && v ? Object.fromEntries(Object.entries(v).map(([k, w]) => [k, round(w)]))
  : v);

function flatOf(bufs) {
  const st = parseStatic(bufs.static), g = parseGraphics(bufs.graphics), p = parsePhysics(bufs.physics);
  if (!g) return null;
  const out = {};
  const keepG = { status: g.status, speedKmh: g.speedKmh, fuelLiters: g.fuelLiters, lapsPossibleFuel: g.lapsPossibleFuel,
    currentPos: g.currentPos, totalDrivers: g.totalDrivers, gapAhead: g.gapAhead, gapBehind: g.gapBehind,
    sessionPhase: g.sessionPhase, timeLeftStr: g.timeLeftStr, isValidLap: g.isValidLap, carLocation: g.carLocation,
    driverName: g.driverName, carModel: g.carModel, fuelPerLap: null };
  keepG.fuelPerLap = round(g.fuelPerLap ?? null);
  for (const [k, v] of Object.entries(keepG)) out['g.' + k] = v;
  if (g.timing) for (const [k, v] of Object.entries(g.timing)) out['t.' + k] = v;
  const el = electronicsOf(bufs.graphics);
  if (el) for (const [k, v] of Object.entries(el)) out['e.' + k] = v;
  if (st) for (const [k, v] of Object.entries(st).filter(([k]) => !NOISE.has(k))) out['s.' + k] = round(v);
  if (p) for (const [k, v] of Object.entries(p).filter(([k]) => ['gas','brake','fuel','rpms','wheelPressure','tyreWear','tyreCoreTemp','camberRAD','suspensionTravel','rideHeight','ballast','airTemp','roadTemp','tyresOut','tc','abs','drs','autoShifterOn'].includes(k))) out['p.' + k] = round(v);
  // flag UI setup (sei NELLA schermata setup?)
  const dv = new DataView(bufs.graphics.buffer, bufs.graphics.byteOffset, bufs.graphics.byteLength);
  const sessBase = GFX.sessionState;
  // dentro SESSION_STATE: uiDrive e uiSetup sono bool consecutivi dopo restartSeason/disconnected/waitingPlayers
  const ui = { uiDrive: null, uiSetup: null };
  try {
    ui.uiDrive = dv.getUint8(sessBase + SESSION_UI.uiDrive) !== 0;
    ui.uiSetup = dv.getUint8(sessBase + SESSION_UI.uiSetup) !== 0;
  } catch {}
  out.ui = ui;
  return out;
}
// offset di uiSetup/uiDrive dal layout (SESSION_STATE è esportato? no: calcolo da structLayout locale)
const SESSION_UI = (() => {
  // replico i primi campi di SESSION_STATE fino a uiSetup (str(33)+str(15)+i32+str(15)+i32+i32+i32+i32+i32+f32+i32+bool+bool+... )
  const SZ = { bool: 1, 'str(33)': 33, 'str(15)': 15, i32: 4, f32: 4 };
  const fields = ['phaseName:str(33)','timeLeft:str(15)','timeLeftMs:i32','waitTime:str(15)','totalLap:i32','currentLap:i32','lightsOn:i32','lightsMode:i32','lapLengthKm:f32','endFlag:i32','timeToNext:str(15)','disconnected:bool','restartSeason:bool','uiDrive:bool','readyBlink:bool','uiSetup?x:bool'];
  void fields; // (placeholder — vedi calcolo reale sotto)
  // calcolo VERITIERO: rileggo i flag dal buffer con una leggera sonda? No: replico l'ordine del layout reale
  let o = 0; const off = {};
  const real = [['phaseName','str(33)'],['timeLeft','str(15)'],['timeLeftMs','i32'],['waitTime','str(15)'],['totalLap','i32'],['currentLap','i32'],['lightsOn','i32'],['lightsMode','i32'],['lapLengthKm','f32'],['endFlag','i32'],['timeToNext','str(15)'],['disconnected','bool'],['restartSeason','bool'],['uiDrive','bool'],['readyBlink','bool'],['uiSetup','bool']];
  for (const [n, t] of real) { off[n] = o; o += SZ[t]; }
  return { uiDrive: off.uiDrive, uiSetup: off.uiSetup };
})();

let prev = null, prevFiles = prior;
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.ev !== 'data') continue;
    const bufs = {
      static: msg.static ? Buffer.from(msg.static, 'base64') : null,
      graphics: msg.graphics ? Buffer.from(msg.graphics, 'base64') : null,
      physics: msg.physics ? Buffer.from(msg.physics, 'base64') : null,
    };
    const cur = flatOf(bufs);
    const changed = {};
    if (cur) {
      if (prev) {
        for (const [k, v] of Object.entries(cur)) {
          const was = prev[k];
          const ne = JSON.stringify(round(v)), ol = JSON.stringify(round(was));
          if (ol !== ne) changed[k] = { da: JSON.parse(ol), a: JSON.parse(ne) };
        }
      }
      const speed = cur['g.speedKmh'] ?? 0;
      if (speed <= 5) { // fermo: è QUELLO che conta per il setup
        const entry = { at: new Date().toISOString(), uiSetup: cur.ui?.uiSetup ?? null, uiDrive: cur.ui?.uiDrive ?? null, speed, nChanged: Object.keys(changed).length, changed: prev ? changed : { primo: 'snapshot iniziale' } };
        // file cambiati in questo tick? segnalo in affianco solo se ci sono
        const now = oldtree(fileDirs);
        const fileDiff = [];
        for (const [f, v] of now) { const was = prevFiles.get(f); if (!was) fileDiff.push({ file: f, evento: 'CREATO', size: v.size }); else if (was.mtime !== v.mtime || was.size !== v.size) fileDiff.push({ file: f, evento: 'MODIFICATO', size: `${was.size}->${v.size}` }); }
        for (const [f] of prevFiles) if (!now.has(f)) fileDiff.push({ file: f, evento: 'ELIMINATO' });
        prevFiles = now;
        if (fileDiff.length) entry.files = fileDiff;
        if (Object.keys(entry.changed).length || entry.files) log(entry);
      }
      prev = cur;
    }
  }
});
setInterval(() => { /* keepalive: il flusso continua finché il processo vive */ }, 60000);
console.log(`SPIA attiva → ${OUT} · approccio: confronto campo per campo a vettore fermo (≤5 km/h). Dimmi quando la PROVA è finita.`);
