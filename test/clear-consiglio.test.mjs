// clear-consiglio.test.mjs — il PROBLEMA del 2/11 (richiesta Mauro): «↺» nel
// pannello Difficoltà cancellava l'override e riscriveva nei cursori del gioco
// il consiglio calcolato, ma il SETTING automatico a capo di ogni chiamata API
// (webui.mjs, seeding 84–85 per le serie senza cursori) ripartiva per ogni
// richiesta DOPO: il record vuoto lasciato dal clear veniva riempito col fisso
// 84–85 e la riga saltava di nuovo sul default, un istante dopo il render.
//
// Qui un server VERO con una carriera finta (trainer EVO_DATA_DIR + ACE_DATA in
// tmpdir, porta propria 8737): override 90–91 sulla prima serie, poi «↺»; la
// riga DEVE restare sul consiglio calcolato [slider, slider+1] di difficultyFor
// — anche nella risposta di una lettura successiva, quando il seeding ha
// già girato. Ricalcolo il consiglio con l'import STESSO del server, così se
// il test e il server divergono non si nasconde un semplice cambiamento di numero.

import './_flows-sandbox.mjs'; // PRIMA riga: registro flussi in tmp (come webui-smoke)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8737;            // sua, fuori dai fallback e dalle porte degli altri test
const BASE = `http://127.0.0.1:${PORT}`;

// il ladder VERO del progetto: la carriera finta punta alla PRIMA serie (level più basso)
const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
const node0 = ladder.nodes.slice().sort((a, b) => a.level - b.level)[0];
const track0 = node0.calendar?.[0]?.track ?? null;

// lo stesso consiglio che calcola il server (import diretto di src/state.mjs)
const { difficultyFor } = await import('../src/state.mjs');

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio`);
    try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) return; } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`il server non ha risposto su ${BASE} entro ${ms}ms`);
}

async function call(path, method = 'GET', body = null) {
  const r = await fetch(`${BASE}${path}`, { method, headers: body !== null ? { 'Content-Type': 'application/json' } : undefined, body: body !== null ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { }
  return { code: r.status, j, text };
}

test('«↺» porta la banda al consiglio calcolato e NON riappare il fisso 84–85 al render dopo', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-consiglio-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });

  // stato VIVO minimale: driver/money/messages per loadState, il resto è ciò che
  // difficulty-action e viewDifficulty leggono davvero
  const state = {
    version: 1,
    driver: { name: 'Pilota Prova', nation: 'IT' }, money: 1000, messages: [],
    node: node0.nodeId, season: 1, round: 0,
    difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
    raceSettings: {}, results: {}, stats: { bestLaps: {} }, agenda: { day: 1 }, titles: [],
  };
  writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(state));

  const sugg = difficultyFor(ladder, state, node0, track0).slider;
  const want = Math.max(0, Math.min(100, Math.round(sugg)));

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, EVO_DATA_DIR: DATA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let _stderr = '';
  child.stderr.on('data', (d) => { _stderr += d; });
  try {
    await waitReady(child);

    // 1) la PREMESSA del difetto: la prima lettura porta il fisso del seeding
    //    (record appiccicato dal setting automatico), override «finto» visibile
    const d0 = await call('/api/difficulty');
    assert.equal(d0.code, 200, `GET difficulty: ${d0.text.slice(0, 200)}`);
    const row0 = d0.j.rows.find((r) => r.id === node0.nodeId);
    assert.ok(row0, `la serie ${node0.nodeId} compare nel pannello`);
    assert.equal(row0.rangeMin, 84, 'prima lettura: il seeding mette il fisso 84');
    assert.equal(row0.rangeMax, 85, 'prima lettura: il seeding mette il fisso 85');

    // 2) un override MANUALE vero (90–91), come se l'utente avesse trascinato i cursori
    const po = await call('/api/difficulty-action', 'POST', { op: 'range', nodeId: node0.nodeId, min: 90, max: 91 });
    assert.equal(po.code, 200, `POST range: ${po.text.slice(0, 200)}`);
    const rowOv = po.j.view.rows.find((r) => r.id === node0.nodeId);
    assert.equal(rowOv.rangeMin, 90, 'override scritto: min 90');
    assert.equal(rowOv.rangeMax, 91, 'override scritto: max 91');

    // 3) «↺»: la risposta DELLA STESSA richiesta deve già mostrare il consiglio
    const pc = await call('/api/difficulty-action', 'POST', { op: 'range', nodeId: node0.nodeId, clear: true });
    assert.equal(pc.code, 200, `POST range clear: ${pc.text.slice(0, 200)}`);
    const rowC = pc.j.view.rows.find((r) => r.id === node0.nodeId);
    assert.equal(rowC.overridden, false, '«↺»: la riga non è più override');
    assert.equal(rowC.rangeMin, want, `«↺»: min torna al consiglio calcolato (${want})`);
    assert.equal(rowC.rangeMax, Math.min(100, want + 1), '«↺»: max = consiglio+1, banda di 1 punto');

    // 4) LA FLECTURA DEL DIFETTO: una lettura DOPO, quando il seeding è già
    //    girato sulla riga vuiota. Il difetto la riportava a 84–85.
    const d1 = await call('/api/difficulty');
    const row1 = d1.j.rows.find((r) => r.id === node0.nodeId);
    assert.equal(row1.overridden, false, 'dopo: la riga resta NON-override');
    assert.equal(row1.rangeMin, want, `dopo: min resta il consiglio calcolato (${want}), non il fisso 84–85`);
    assert.equal(row1.rangeMax, Math.min(100, want + 1), 'dopo: max resta consiglio+1');
  } finally {
    child.kill();
    await new Promise((res) => setTimeout(res, 300));
  }
});

/** test collegato: trim su una riga TORNATA al consiglio — la banda parte dal
 * consiglio calcolato, non dal fisso 84 del vecchio fallback. */
test('trim su una riga «↺»: la banda si muove dal consiglio, non dal fisso 84–85', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-consiglio-trim-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const state = {
    version: 1,
    driver: { name: 'Pilota Prova 2', nation: 'IT' }, money: 1000, messages: [],
    node: node0.nodeId, season: 1, round: 0,
    difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
    raceSettings: {}, results: {}, stats: { bestLaps: {} }, agenda: { day: 1 }, titles: [],
  };
  writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(state));
  const sugg = difficultyFor(ladder, state, node0, track0).slider;
  const want = Math.max(0, Math.min(100, Math.round(sugg)));

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, EVO_DATA_DIR: DATA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitReady(child);
    // clear per tornare al consiglio (niente override: la riga segue difficultyFor)
    const pc0 = await call('/api/difficulty-action', 'POST', { op: 'range', nodeId: node0.nodeId, clear: true });
    assert.equal(pc0.code, 200, `POST clear: ${pc0.text.slice(0, 200)}`);
    const rowC0 = pc0.j.view.rows.find((r) => r.id === node0.nodeId);
    // il clear DEVE già stare sul consiglio del test: se qui diverge, è lo stato
    // caricato/migrato a parlare diverso, non il trim
    assert.equal(rowC0.rangeMin, want, `dopo clear il consiglio coincide (${want})`);
    // trim +2 della SERIE: la riga che è tornata al consiglio va al consiglio
    // RICALCOLATO col nuovo trim (il consiglio già parla della banda — nient'
    // doppio spostamento); il vecchio fallback partiva dal fisso 84+2
    const pt = await call('/api/difficulty-action', 'POST', { op: 'trim', nodeId: node0.nodeId, value: 2 });
    assert.equal(pt.code, 200, `POST trim: ${pt.text.slice(0, 200)}`);
    // il consiglio post-trim: STESSO stato con trim 2 sulla serie
    const stateT = JSON.parse(JSON.stringify(state));
    stateT.difficulty.trim = { [node0.nodeId]: 2 };
    const wantT = Math.max(0, Math.min(100, Math.round(difficultyFor(ladder, stateT, node0, track0).slider)));
    const rowT = pt.j.view.rows.find((r) => r.id === node0.nodeId);
    assert.equal(rowT.rangeMin, wantT, `trim +2 su riga al consiglio: min = consiglio post-trim (${wantT})`);
    assert.equal(rowT.rangeMax, Math.min(100, wantT + 1), 'max resta banda di 1 punto');
  } finally {
    child.kill();
    await new Promise((res) => setTimeout(res, 300));
  }
});
