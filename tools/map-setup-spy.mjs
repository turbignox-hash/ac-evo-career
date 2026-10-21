// map-setup-spy.mjs — la MAPPA della prova controlli (DA FARE del 21/10, ora fatto).
// Legge data/setup-monitor.jsonl e distingue:
//   • cambi visti LIVE con la schermata SETUP aperta (uiSetup=true)
//   • cambi visti solo fuori dal setup (uiSetup=false: drive/attesa/menu)
//   • FILE toccati durante la prova (sporchi a prescindere dai log di gioco)
// Uso: node tools/map-setup-spy.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, '..', 'data', 'setup-monitor.jsonl');
const lines = readFileSync(LOG, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const conta = { on: {}, off: {} };
const valori = {};                       // min/max dei valori live (per capire scala/versi)
const files = {};
let firstAt = null, lastAt = null, nSetupOn = 0, nSetupOff = 0;

for (const e of lines) {
  firstAt ??= e.at; lastAt = e.at;
  const key = e.uiSetup ? 'on' : 'off';
  const n = Object.keys(e.changed).length;
  if (e.uiSetup) nSetupOn += n; else nSetupOff += n;
  for (const [k, d] of Object.entries(e.changed)) {
    if (k === 'primo') continue;
    conta[key][k] = (conta[key][k] ?? 0) + 1;
    const v = d && d.a;
    if (v != null) (valori[k] ??= new Set()).add(JSON.stringify(v).slice(0, 60));
  }
  for (const f of e.files ?? []) {
    if (/Logs.*log-26\d|\.tmp|bak-/.test(f.file)) continue;
    const nome = f.file.split('\\').pop();
    files[nome] = files[nome] ?? new Set();
    files[nome].add(f.evento);
  }
}

const agg = (o, limit = 200) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, v]) => `${k}×${v}`).join(' · ') || '(nessuno)';
const esempi = (k, n = 6) => [...(valori[k] ?? [])].slice(0, n).join(' | ');

console.log(`FINESTRA: ${firstAt} → ${lastAt} · righe ${lines.length} · cambi@setup ${nSetupOn} · cambi@fuori ${nSetupOff}`);
console.log('\n════ LIVE CON SETUP APERTA (uiSetup=true) ════');
console.log(agg(conta.on));
console.log('\n════ SOLO FUORI dal setup (u È: uiDrive/attesa/menu) ════');
console.log(agg(conta.off, 60));
console.log('\n════ VALORI visti (esempi per campo principale) ════');
for (const k of ['p.camRAD', 'p.camberRAD', 'p.rideHeight', 'p.suspensionTravel', 'p.ballast', 'p.airTemp', 'p.roadTemp', 'e.tc', 'e.abs', 'e.brakeBias', 'e.diffPower', 'e.diffCoast', 'e.frontBump', 'e.rearBump', 'e.frontRebound', 'e.rearRebound', 'e.engineMap', 'p.fuel', 'g.fuelLiters']) {
  if (valori[k]) console.log(`  ${k}: ${esempi(k)}`);
}
console.log('\n════ FILE toccati durante la prova (no log/.tmp/backup) ════');
console.log(Object.entries(files).map(([f, ev]) => `${f} [${[...ev].join(',')}]`).join(' · ') || '(nessuno)');
