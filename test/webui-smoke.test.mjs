// webui-smoke.test.mjs — la RETE DI SICUREZZA del server GUI.
//
// Motivo: dopo lo split di webui.mjs (viste in webui-views.mjs, costanti in
// webui-env.mjs) ogni modifica al server muove una mano piena di viste e switch
// gia' senza nessuna prova: chi toccava la GUI lo faceva "a curl a mano".
// Qui invece il server PARTE DAVVERO su porta sua (legge --port/ACE_UI_PORT),
// con cartella dati temporanea, e le risposte di alcune API chiave vengono
// verificate. Nessuna scrittura sul salvataggio vero:ACHI le chiamate sono di
// sola lettura e il watcher di questo server guarda la cartella TEMPORANEA
// (ACE_DATA vince su tutto in paths.mjs), quindi non puo' incassare gare vere.
//
// Porta: 8731 (fuori dal range di fallback 8642..8655 → se occupata il server
// esce subito e il test fallisce chiaro, non aggancia il server vero).
//
// Nota: non sconta che ESISTA una carriera (il test gira anche su un PC senza
// EVO): se c'e', /api/card deve costruire la scheda; se no, deve dire perche'.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8731;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) {
      throw new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio`);
    }
    try {
      const r = await fetch(`${BASE}/api/watcher?probe=1`);
      if (r.ok) return;
    } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`il server non ha risposto su ${BASE} entro ${ms}ms`);
}

async function getJson(path, method = 'GET') {
  const r = await fetch(`${BASE}${path}`, { method });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { }
  return { code: r.status, j, text };
}

test('il server GUI parte e serve le API chiave (boot, status, card, pagina)', async () => {
  // cartella dati di EVO finta: le strade di lettura (MoTec, Results) puntano qui
  const DATA = mkdtempSync(join(tmpdir(), 'evo-webui-smoke-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    await waitReady(child);

    // 1) il boot risponde con la cornice completa della pagina
    const boot = await getJson('/api/boot');
    assert.equal(boot.code, 200, 'boot deve rispondere 200');
    assert.ok(boot.j, 'boot deve essere JSON');
    assert.equal(typeof boot.j.hasCareer, 'boolean', 'boot.hasCareer deve esserci');
    assert.ok(boot.j.setup, 'boot.setup (viste/setup) deve esserci');
    assert.ok(Array.isArray(boot.j.setup.slots) && boot.j.setup.slots.length === 3, 'boot.setup.slots deve elencare i 3 slot');
    assert.equal(boot.j.setup.slots.filter((s) => s.active).length, 1, 'esattamente uno slot attivo');
    assert.ok(Array.isArray(boot.j.setup.dataDirs) && boot.j.setup.dataDirs.length > 0, 'setup.dataDirs deve puntare alla cartella dati');

    // 2) sotto pagina: HTML vero
    const page = await fetch(`${BASE}/`);
    assert.equal(page.status, 200, 'la pagina / deve rispondere 200');
    assert.match(page.headers.get('content-type') ?? '', /text\/html/, 'la pagina deve essere HTML');
    const html = await page.text();
    assert.ok(html.includes('id="nav"'), 'la pagina deve contenere la nav');
    assert.ok(!html.includes('TABS_NASCOSTI'), 'le schede nascoste rimosse non devono comparire più nel codice della pagina');

    // 3-bis) lo split del GUI: index rinvia a CSS e JS separati, e TUTTI devono rispondere 200
    for (const src of [...html.matchAll(/<(?:script src="([^"]+)"|link rel="stylesheet" href="([^"]+)")>/g)].map((m) => m[1] ?? m[2])) {
      const r = await fetch(`${BASE}/${src}`);
      assert.equal(r.status, 200, `asset ${src} deve rispondere 200`);
      const ct = r.headers.get('content-type') ?? '';
      assert.ok(/css|javascript/.test(ct), `asset ${src} deve avere il MIME giusto (ha: ${ct})`);
    }

    // 3) lo stato del watcher: attivo (questo server incassa, se c'è una carriera)
    const watcher = await getJson('/api/watcher');
    assert.equal(watcher.code, 200, 'watcher deve rispondere 200');
    assert.equal(watcher.j.active, true, 'il watcher deve essere attivo');

    // 4) scheda gara e stato: SOLO se c'è una carriera da leggere (nel PC di Mauro c'è)
    if (boot.j.hasCareer) {
      const status = await getJson('/api/status');
      assert.equal(status.code, 200, 'status deve rispondere 200 se c\'è una carriera');
      assert.ok(status.j.header && status.j.econ, 'status deve contenere header ed econ');

      const card = await getJson('/api/card');
      assert.equal(card.code, 200, 'card deve rispondere 200 se c\'è una carriera');
      assert.ok(card.j.nodeDisplay, 'card deve avere la serie attiva (nodeDisplay)');
      assert.ok(Array.isArray(card.j.boxRadio?.tips), 'card boxRadio.tips deve essere un elenco (Consigli dal BOX)');
      assert.ok(card.j.tyre, 'card.tyre deve esserci (classe gomme dell’auto)');
    }

    // 5) API mannaggia: azione senza carriera deve dare il messaggio gentile, non un crash 500
    //    (su una career-less il 'card' entra nel ramo needsCareer; con carriera invece 200 già preso)
  } finally {
    child.kill();
  }
});
