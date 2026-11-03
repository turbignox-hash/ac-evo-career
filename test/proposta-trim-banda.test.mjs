// proposta-trim-banda.test.mjs — la LEGGE DELLA BANDA del suggerimento trim.
//
// Motivo (3/11, dal banco «banner trim» con la sonda smontata): il banner del
// suggerimento adattivo promette «accettare sposta anche la banda EVO della
// serie di N punti» — qui si che la promessa è VERA, al vivo del
// dispatcher: il suggerimento in attesa (`state.difficulty.pending`) seed NEL
// SAVE (proposeDifficulty non ha endpoint di nascita: nasce da un risultato di
// gara), l'accettazione passa per l'ENDPOINT (POST /api/difficulty-action
// op 'accept', lo STESSO tasto della GUI) e la banda della serie
// (/api/difficulty → view.rows[].rangeMin/RangeMax, i cursori di
// state.raceSettings) SLITTA di ESATTAMENTE |to − from| punti — la legge
// «1 trim = 1 punto» ([webui.mjs, ramo accept], 2/11). Due sensi provati:
//   1. in salita, da trim 0 a +2 → banda +2 punti;
//   2. in discesa, da trim +2 a −1 → banda −3 punti;
// e il cancello: una seconda accettazione SENZA proposta è un 400 gentile.
// Sandbox come frà (EVO_DATA_DIR / ACE_DATA / EVO_FLOWS_DIR): mai file veri.
//
// Porta: 8742 (libera, fuori dalle porte degli altri test: 8731–8738, 8741,
// 8743–8746 e dal tetto gui-json 8745+).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8742;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`server exit ${child.exitCode} subito: ${stderr}`);
    try {
      const r = await fetch(`${BASE}/api/watcher?probe=1`);
      if (r.ok) return;
    } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`server non pronto su ${BASE}: ${stderr}`);
}

async function api(path, body = null) {
  const r = await fetch(`${BASE}${path}`, {
    method: body !== null ? 'POST' : 'GET',
    headers: body !== null ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  return { code: r.status, j };
}

/** Dato il save su disco, tocca state.difficulty (la semina della proposta) e
 *  riscrive il file, stesso formato: il server rilegge il save a ogni
 *  richiesta (requireState), quindi l'endpoint andrà a bere la proposta seminata. */
function seminaProposta(SAVE_FILE, nodeId, from, to, reason) {
  const st = JSON.parse(readFileSync(SAVE_FILE, 'utf8'));
  assert.equal(st?.difficulty?.trim?.[nodeId] ?? 0, from,
    `punto di partenza sbagliato: il trim vivo della serie è ${st?.difficulty?.trim?.[nodeId] ?? 0}, la proposta narra ${from}`);
  st.difficulty.pending = { nodeId, track: null, from, to, reason, at: new Date().toISOString() };
  writeFileSync(SAVE_FILE, JSON.stringify(st));
}

test('accettare la proposta pendente slitta la banda EVO di |to−from| punti (salita e discesa)', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-trim-banda-'));       // save/tool
  const GAME = mkdtempSync(join(tmpdir(), 'evo-trim-banda-gioco-')); // Results/weekend VERI: niente
  const FLOWS = mkdtempSync(join(tmpdir(), 'evo-trim-banda-flussi-'));
  mkdirSync(join(GAME, 'Results'), { recursive: true });

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), EVO_DATA_DIR: DATA, ACE_DATA: GAME, EVO_FLOWS_DIR: FLOWS },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitReady(child);

    // 1) carriera vergine in sandbox: modalità adattiva di default, trim 0, nessun suggerimento
    const nuova = await api('/api/new-career', { name: 'Prova Banda', nation: 'ITA', force: true });
    assert.equal(nuova.code, 200, `nuova carriera deve riuscire: ${JSON.stringify(nuova.j)}`);

    const SAVE_FILE = join(DATA, 'evo-career.save.json');
    // la serie CORRENTE: la riga marcata current nel pannello difficoltà
    const view0 = await api('/api/difficulty');
    assert.equal(view0.code, 200, '/api/difficulty deve rispondere 200');
    const nodo = view0.j.rows.find((r) => r.current);
    assert.ok(nodo, '/api/difficulty deve avere una riga current (ricerca della serie attiva)');
    assert.equal(nodo.trim, 0, 'di nascita: il trim della serie vergine è 0');
    assert.equal(view0.j.pending, null, 'nessun suggerimento pendente alla nascita');

    // 2) banda di PARTENZA scritta dall'ENDPOINT (op 'range'): il record con
    //    cursori veri è condizione perché lo slittamento 1 trim = 1 punto gira:
    //    la riga «↺» senza cursori seguirebbe il consiglio ricalcolato (2/11).
    //    La op range stringe il gap a 1 punto: banda attesa 88–89.
    const banda = await api('/api/difficulty-action', { op: 'range', nodeId: nodo.id, min: 88, max: 93 });
    assert.equal(banda.code, 200, `op range deve riuscire: ${JSON.stringify(banda.j)}`);
    const vista = await api('/api/difficulty');
    const prima = vista.j.rows.find((r) => r.id === nodo.id);
    assert.deepEqual([prima.rangeMin, prima.rangeMax], [88, 89], `la banda di partenza è 88–89 (gap stretto 1 punto), non ${prima.rangeMin}–${prima.rangeMax}`);

    // 3) PROVA IN SALITA: proposta trim 0 → +2, seminata nel save; accettata via ENDPOINT.
    seminaProposta(SAVE_FILE, nodo.id, 0, 2, 'Prova: P1 a testa alta (seminata per il test)');
    const su = await api('/api/difficulty-action', { op: 'accept' });
    assert.equal(su.code, 200, `l'accettazione deve riuscire: ${JSON.stringify(su.j)}`);
    const dopoSu = su.j.view.rows.find((r) => r.id === nodo.id);
    assert.equal(dopoSu.trim, 2, "il trim della serie è arrivato a +2 (= pending.to)");
    // LA LEGGE: |to − from| = 2 punti di banda, sia sotto che sopra
    assert.equal(dopoSu.rangeMin - prima.rangeMin, 2, 'banda min: +2 punti (|to−from|)');
    assert.equal(dopoSu.rangeMax - prima.rangeMax, 2, 'banda max: +2 punti (|to−from|)');
    assert.equal((await api('/api/difficulty')).j.pending, null, "l'accettazione ha consumato la proposta (pending null)");
    const persistSu = await api('/api/difficulty');
    assert.equal(persistSu.j.rows.find((r) => r.id === nodo.id).trim, 2, 'il trim +2 è sul DISCO (rilettura del save)');

    // 4) PROVA IN DISCESA: da trim +2 a −1 → shift −3 (|to−from| = 3)
    seminaProposta(SAVE_FILE, nodo.id, 2, -1, 'Prova: P ultima (seminata per il test)');
    const giu = await api('/api/difficulty-action', { op: 'accept' });
    assert.equal(giu.code, 200, `la seconda accettazione deve riuscire: ${JSON.stringify(giu.j)}`);
    const dopoGiu = giu.j.view.rows.find((r) => r.id === nodo.id);
    assert.equal(dopoGiu.trim, -1, 'il trim della serie è arrivato a −1');
    assert.equal(dopoGiu.rangeMin, 87, 'banda min scesa da 90 a 87: −3 punti (|to−from|)');
    assert.equal(dopoGiu.rangeMax, 88, 'banda max scesa da 91 a 88: −3 punti (|to−from|)');
    // chiusura finale: il save persiste la banda AGGIORNATA anche a valle
    const persistGiu = await api('/api/difficulty');
    const fine = persistGiu.j.rows.find((r) => r.id === nodo.id);
    assert.deepEqual([fine.rangeMin, fine.rangeMax, fine.trim], [87, 88, -1], 'banda e trim finali giusti anche rileggendo il save');

    // 5) il cancello: accettare SENZA proposta è un 400 gentile, mai un crash
    const senza = await api('/api/difficulty-action', { op: 'accept' });
    assert.equal(senza.code, 400, 'una seconda accettazione senza proposta deve dare 400');
    assert.match(String(senza.j?.error ?? ''), /suggerimento in attesa/i,
      `l'errore della seconda accettazione deve essere gentile (ha: ${senza.j?.error})`);
  } finally {
    child.kill();
  }
});
