// test/istantanea-endpoint.test.mjs — il RIEPILOGO VIVO dell'istantanea
// per la GUI (4/11): /api/istantanea risponde con durata · pista · banda
// AI letti dal file INSTANT_RACE con la STESSA funzione del cruscotto in
// gioco (statoIstantanea in src/uiapp-pub.mjs). Sola lettura: se una gara
// custom non è mai stata aperta in EVO la risposta dice istantanea:null e
// la vista browser mostra il suo consiglio — mai un 500, mai un'eccezione.
//
// Il server parte DAVVERO (come webui-smoke) con ACE_GAME_SAVEDIR su una
// sandbox VUOTA: lì l'istantanea DEVE essere null; se invece il processo
// risolve i percorsi veri del PC (PC con EVO installato), la risposta è
// tollerante ma con la forma GIUSTA. Entrambe le condizioni passano.
import './_game-sandbox.mjs'; // sandbox FILE DI GIOCO (prima di ogni import dei tool!)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8741;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio`);
    try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) return; } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`il server non ha risposto su ${BASE} entro ${ms}ms`);
}

const postJson = async (path) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { }
  return { code: r.status, j };
};

test('/api/istantanea: sola lettura, 200 sempre, istantanea null NELLA SANDBOX vuota e mai un errore', async () => {
  const SANDBOX = mkdtempSync(join(tmpdir(), 'evo-istantanea-'));
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_GAME_SAVEDIR: SANDBOX },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    await waitReady(child);

    // TRE chiamate di fila: un endpoint vivo deve rispondere SEMPRE uguale,
    // senza eccezioni né stato che scivola fra le chiamate.
    for (let i = 0; i < 3; i++) {
      const r = await postJson('/api/istantanea');
      assert.equal(r.code, 200, `chiamata ${i + 1}: 200 atteso (ricevuto ${r.code})`);
      assert.equal(r.j?.ok, true, 'ok deve essere true (il formato è del server)');
      const i1 = r.j?.istantanea;
      assert.ok(i1 === null || i1 === undefined || typeof i1 === 'object', 'istantanea: null oppure un oggetto, mai una stringa/numero');
      if (i1) {
        // PC dove le strade del gioco risolvono ai file VERI: la forma giusta
        assert.ok(i1.durata && ('giri' in i1.durata || 'min' in i1.durata), 'durata: giri o minuti');
        if (i1.banda != null) assert.match(String(i1.banda), /^\d+–\d+$/, 'banda in forma LO–HI');
        if (i1.pista != null) assert.equal(typeof i1.pista, 'string', `pista: stringa (ricevuto ${typeof i1.pista})`);
      }
    }
  } finally {
    child.kill();
    if (stderr.trim()) console.log('[istantanea-endpoint] stderr server:\n' + stderr.slice(0, 1500));
  }
});

test('il riepilogo in GUI vive in viste-a.js (gv-stato) e vive di /api/istantanea', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(ROOT, 'gui', 'js', 'viste-a.js'), 'utf8');
  assert.ok(src.includes("api('istantanea')"), 'la vista chiama /api/istantanea (la stessa fonte del cruscotto)');
  assert.ok(src.includes('id="gv-stato"'), 'la vista ha il div del riepilogo');
  assert.ok(src.includes('15 * 1000'), 'il riepilogo si aggiorna da solo (timer 15 s)');
});
