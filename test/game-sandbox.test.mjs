import './_flows-sandbox.mjs'; // sandbox flussi
import './_game-sandbox.mjs';  // sandbox FILE DI GIOCO (prima di ogni import dei tool!)
// game-sandbox.test.mjs — regressione della lezione 23/10 (crash al tasto
// «Lancia gara»): l'evento speciale NON DEVE toccare il weekend di carriera
// né il drivergarage, e i flussi webui (event-prep / race) devono scrivere
// SOLO dentro la sandbox di gioco (ACE_GAME_SAVEDIR), mai nei file veri di
// EVO. Il server GUI parte DAVVERO (come webui-smoke) con:
//   EVO_DATA_DIR     → salvataggio carriera finto (una carriera con invito)
//   EVO_FLOWS_DIR    → registro flussi finto
//   ACE_GAME_SAVEDIR → file di gioco finti (weekend/customgrid/LGM/garage)
// Le copie DI LETTURA dal file vero (weekend/garage/customgrid) servono solo
// a ravvivare il test: senza di esse il test di degrada e passa comunque.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8735;
const BASE = `http://127.0.0.1:${PORT}`;
const sha256 = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const snapshot = (p) => (existsSync(p) ? sha256(readFileSync(p)) : 'assente');

/* ---------- 1) la sandbox reindirizza TUTTI i percorsi dei tool ---------- */
const { GAME_SANDBOX } = await import('./_game-sandbox.mjs');
const evo = await import('../tools/evo-grid.mjs');
const { WEEKEND_FILE } = await import('../tools/set-track.mjs');
const { GRID_FILE } = await import('../tools/set-car.mjs');
const { GARAGE_FILE } = await import('../tools/set-driver-car.mjs');
const { WEEKEND_FILE: WEEKEND_FILE2 } = await import('../tools/set-racetime.mjs');

test('sandbox: WEEKEND/GRID/GARAGE vivono dentro ACE_GAME_SAVEDIR, non nel PC vero', () => {
  const GAME_SAVEDIR = process.env.ACE_GAME_SAVEDIR;
  assert.ok(GAME_SAVEDIR?.startsWith(tmpdir()), 'ACE_GAME_SAVEDIR punta in temp');
  for (const [nome, p] of [['WEEKEND_FILE', WEEKEND_FILE], ['WEEKEND_FILE (set-racetime)', WEEKEND_FILE2], ['GRID_FILE', GRID_FILE], ['GARAGE_FILE', GARAGE_FILE]]) {
    assert.ok(p.startsWith(GAME_SANDBOX), `${nome} deve stare nella sandbox di gioco (visto: ${p})`);
    assert.ok(!p.includes('Saved Games'), `${nome} non deve toccare i salvataggi veri (${p})`);
  }
  assert.ok(evo.GAME_SAVEDIR.startsWith(GAME_SANDBOX), 'evo-grid.GAME_SAVEDIR in sandbox');
});

/* ---------- 2) flusso webui: prepara evento NON tocca weekend/garage ---------- */

const REAL = {
  weekend: join('C:', 'Users', 'Mauro', 'Saved Games', 'ACE', 'GameModes', 'GameModeType_RACE_WEEKEND.gamemodesave'),
};

// Tramite estrut dati: carriera finta con invito SPECIALE già accettato (stesso
// mantice degli eventi svolti: tema legend_finale risolto dal registro di src/events.mjs).
const EVENTO = {
  id: 'ev_sandbox', kind: 'special-race', tier: 'finale',
  createdAt: new Date().toISOString(), season: 5, afterRound: 0,
  theme: { id: 'legend_finale', name: 'Il Gran Finale dei Campioni', intro: 'Invito di prova (sandbox)' },
  trackId: 'cota', trackDisplay: 'Circuit Of The Americas', weather: 0, laps: 10, hour: 17, timeScale: 1,
  guests: ['Hans Stuck'],
  prize: { carId: 'lamborghini_countach_lp5000_qv', carName: 'Lamborghini Countach LP5000 QV', money: 15000, rep: 15, duplicateCash: false },
  deadlineRounds: 99,
  acceptedAt: new Date().toISOString(),
};
const SAVE = {
  version: 1, node: 'coppa_combined_tour', round: 0, season: 5, money: 10000, rep: 3,
  driver: { first: 'Prova', last: 'Sandbox', name: 'Prova Sandbox', nation: 'ITA' },
  messages: [], offers: [], pending: null, results: {},
  raceSettings: { coppa_combined_tour: { sliderMin: 92, sliderMax: 93 } },
  events: { active: EVENTO, history: [], showCase: [], lastRoundChecked: null },
};

// helper webui-smoke: aspetta che il server sbocchi su HTTP
async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`server uscito subito (exit ${child.exitCode})`);
    try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) return; } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error(`server non pronto entro ${ms}ms`);
}
const post = async (action, body = {}) => {
  const r = await fetch(`${BASE}/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* assert sotto dirà tutto */ }
  return { code: r.status, j, text };
};

test('webui event-prep in sandbox: noto a mano pista+auto, e il weekend di carriera NON cambia', async () => {
  const SAVE_DIR = mkdtempSync(join(tmpdir(), 'evo-savesandbox-'));
  const FLOWS_DIR = mkdtempSync(join(tmpdir(), 'evo-flowssandbox-'));
  writeFileSync(join(SAVE_DIR, 'evo-career.save.json'), JSON.stringify(SAVE, null, 2));

  // Semina i file DI GIOCO dalla copia del PC (SE sola lettura del vero) così
  // le scritture pregresse del bug di oggi sarebbero emerse come Δ di hash:
  mkdirSync(join(GAME_SANDBOX, 'GameModes'), { recursive: true });
  if (existsSync(REAL.weekend)) copyFileSync(REAL.weekend, WEEKEND_FILE);
  // customgrid/backup: template per la griglia evento, se esiste sul PC di sviluppo
  const realGameDir = dirname(REAL.weekend);
  // 26/10 (PC vergine simulato): il PC può avere Saved Games\ACE senza
  // GameModes (EVO avviato ma weekend di carriera mai aperto): la semina di
  // template parte SOLO se la cartella vera esiste, senò il test crolla per
  // una condizione FUORI dal codice sotto prova.
  const templates = existsSync(realGameDir)
    ? [join(realGameDir, 'last_grid.customgrid'),
      ...readdirSync(realGameDir).filter((f) => f.startsWith('last_grid.customgrid.bak-')).sort().reverse().map((f) => join(realGameDir, f))]
    : [];
  for (const t of templates) if (existsSync(t)) { copyFileSync(t, GRID_FILE); break; }

  const weekPrima = snapshot(WEEKEND_FILE);
  const garagePrima = snapshot(GARAGE_FILE);

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), EVO_DATA_DIR: SAVE_DIR, EVO_FLOWS_DIR: FLOWS_DIR, ACE_GAME_SAVEDIR: GAME_SANDBOX },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    await waitReady(child);
    const r = await post('event-prep', { noLaunch: true });
    assert.equal(r.code, 200, `event-prep deve rispondere 200 (verso: ${r.text.slice(0, 300)})`);
    const p = r.j.prep;
    // LEZIONE 23/10: pista e auto dell'evento si impostano A MANO: il tool NON
    // le scrive, e nessun'altra scrittura sfiora il file della RONDA.
    assert.ok(p.trackNote, `pista da impostare a mano è nella prepara: ${JSON.stringify(p)}`);
    assert.ok(p.carNote, `auto da impostare a mano nella prepara: ${JSON.stringify(p)}`);
    assert.ok(!('trackWritten' in p), 'nessuna scrittura pista reclamata');
    assert.ok(!('carWritten' in p), 'nessuna scrittura auto reclamata');
    assert.ok(!('aiWritten' in p), 'nessuna banda AI scritta');
    assert.ok(!('hourWritten' in p), 'nessuna ora scritta');
    assert.ok(!('lapsWritten' in p), 'nessun giro scritto');
    assert.equal(snapshot(WEEKEND_FILE), weekPrima, 'il weekend di carriera resta INTATTO: il crash del 23/10 non torna');
    if (existsSync(GARAGE_FILE)) assert.equal(snapshot(GARAGE_FILE), garagePrima, 'il drivergarage resta intatto: l\'auto si sceglie a mano');
  } finally {
    child.kill();
    if (stderr.trim()) console.log('[game-sandbox] stderr serve:\n' + stderr.slice(0, 2000));
  }
});
