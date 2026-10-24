// webui-queue.test.mjs — il GUARDIANO DELLA CODA del server GUI.
//
// Motivo (24/10): sullo slot 3 un'azione mai finita tenne l'intera coda in
// ostaggio — il bottone «Prepara tutto e divertiti» restava spinner e OGNI
// richiesta dopo di lei andava in stallo (anche un curl innocuo: 10s=timeout).
// Qui una carriera ha un'azione presumibilmente appesa (hang-test, attiva solo
// con EVO_TEST_HANG=1): il server DEVE rispondere 504 e poi tornare subito a
// rispondere per tutti. Con EVO_API_TIMEOUT_MS corto il test resta in secondi.
//
// Porta: 8733 (sua, fuori dal range di fallback dei server veri).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8733;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`server exit ${child.exitCode} subito`);
    try {
      const r = await fetch(`${BASE}/api/watcher?probe=1`);
      if (r.ok) return;
    } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error('server non pronto in tempo');
}

async function getJson(path) {
  const r = await fetch(`${BASE}${path}`);
  const j = await r.json().catch(() => null);
  return { code: r.status, j };
}

test('il guardiano della coda: un\'azione appesa torna 504 senza congelare il server', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-queue-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      ACE_UI_PORT: String(PORT),
      ACE_DATA: DATA,
      EVO_TEST_HANG: '1',
      EVO_API_TIMEOUT_MS: '1200',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitReady(child);
    // 1) il leader appeso: il browser riceve un VERDETTO (504), non uno spinner eterno
    const hang = await getJson('/api/hang-test');
    assert.equal(hang.code, 504, 'hang-test deve rispondere 504 (timeout del guardiano)');
    assert.match(String(hang.j?.error ?? ''), /hang-test/);
    // 2) la fila dopo: un'azione innocua arriva SUBITO, non aspetta in eterno
    const t0 = Date.now();
    const ok = await getJson('/api/watcher');
    assert.equal(ok.code, 200, 'dopo il leader appeso le richieste proseguono');
    assert.ok(ok.j?.active, 'watcher attivo come sempre');
    assert.ok(Date.now() - t0 < 5000, `la richiesta dopo lo stallo deve girare in fretta (ha: ${Date.now() - t0}ms)`);
  } finally {
    child.kill();
  }
});
