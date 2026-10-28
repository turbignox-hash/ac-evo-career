import "./_flows-sandbox.mjs"; // sandbox flussi
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

async function getJson(path, method = 'GET', body = null) {
  const r = await fetch(`${BASE}${path}`, { method, headers: body !== null ? { 'Content-Type': 'application/json' } : undefined, body: body !== null ? JSON.stringify(body) : undefined });
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
  let _stderr = '';
  child.stderr.on('data', (d) => { _stderr += d; });
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

    // 3-bis) il WIZARD del primo avvio: stato delle ricerche e risposta pulita
    const wiz = await getJson('/api/wizard');
    assert.equal(wiz.code, 200, 'wizard deve rispondere 200 anche quando si controlla soltanto');
    assert.ok(typeof wiz.j.dataDir, 'string', 'wizard.dataDir (percorso trovato o null)');
    assert.ok(Array.isArray(wiz.j.candidates) && wiz.j.candidates.length >= 1 && wiz.j.candidates.some((c) => c.ok), 'wizard deve elencare i percorsi candidati, e con ACE_DATA nota il candidato è quello (verde)');
    assert.ok(wiz.j.content && typeof wiz.j.content.cars === 'number', 'wizard.content con i conteggi (cars/tracks)');

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

    // 4-bis) stint e gomme dal router garage (lesioni 28/10): con telemetria
    //    rispondono con i dati; senza sessioni ok:false + hint — MAI un 500.
    //    Con ACE_DATA puntata su una cartella TEMP la telemetria vera non c'è,
    //    MA il PC di Mauro ne ha: entrambi i casi restano verificati qui sotto.
    //    (1/11, lezione del pacchetto vergine) isMultiplayer è un'azione
    //    needsCareer: in un'installazione SENZA salvataggio (zip estratta, PC
    //    dell'amico al primo avvio) il server risponde 400 col messaggio
    //    gentile — comportamento CORRETTO. La guardia è la STESSA di status/card:
    //    il test valuta la risposta solo quando una carriera può esistere.
    const garageChecks = async () => {
    for (const action of ['stinti', 'gomme']) {
      const res = await getJson('/api/garage', 'POST', { action, car: null });
      assert.equal(res.code, 200, `garage.action=${action} deve rispondere 200`);
      assert.ok(res.j, `garage.action=${action} deve essere JSON`);
      if (res.j.ok) {
        if (action === 'stinti') {
          assert.ok(Array.isArray(res.j.stints), 'stints deve essere un elenco');
          assert.equal(typeof res.j.nStints, 'number', 'nStints deve essere numerico');
          assert.ok('fuelPace' in res.j, 'fuelPace deve esserci (anche null)');
        } else {
          assert.equal(typeof res.j.laps, 'number', 'laps (gomme) deve essere numerico');
          assert.ok('temps' in res.j, 'temps deve esserci (anche {})');
        }
      } else {
        assert.ok(typeof res.j.hint === 'string' && res.j.hint.length > 0, `senza sessioni ${action} deve dare un hint`);
      }
    }
    };
    if (boot.j.hasCareer) await garageChecks();

    // 4-ter) ARCHIVIO ONLINE (/api/mp): le sessioni _MP_ dai Results + il libro
    //    dei rivali online. Lettura PURA: anche senza gare online la risposta
    //    deve avere la forma GIUSTA (total numerico, rows e rivals elenchi) —
    //    mai un 500, e senza toccare carriera né salvataggio.
    const mp = await getJson('/api/mp', 'POST', { all: true });
    assert.equal(mp.code, 200, '/api/mp deve rispondere 200');
    assert.ok(mp.j, '/api/mp deve essere JSON');
    assert.equal(typeof mp.j.total, 'number', 'mp.total deve essere numerico');
    assert.ok(Array.isArray(mp.j.rows), 'mp.rows deve essere un elenco');
    assert.ok(Array.isArray(mp.j.rivals), 'mp.rivals (libro rivali) deve essere un elenco');
    assert.ok(mp.j.rows.length <= mp.j.total, 'le righe mostrate non superano il totale');
    for (const row of mp.j.rows.slice(0, 3)) {
      assert.ok(row.file?.endsWith('.json'), `riga online senza file: ${JSON.stringify(row)}`);
      assert.ok(typeof row.when === 'string' && row.when.length >= 10, `riga online senza quando: ${JSON.stringify(row)}`);
      assert.ok(typeof row.session === 'string' && typeof row.track === 'string', `riga online senza sessione/pista: ${JSON.stringify(row)}`);
      assert.ok(typeof row.drivers === 'number' && row.drivers >= 0, `riga online senza numero piloti: ${JSON.stringify(row)}`);
    }
    for (const rv of mp.j.rivals.slice(0, 3)) {
      assert.equal(typeof rv.meetings, 'number', `rivale senza incroci: ${JSON.stringify(rv)}`);
      assert.equal(typeof rv.beats, 'number', `rivale senza "lui davanti": ${JSON.stringify(rv)}`);
      assert.equal(typeof rv.beaten, 'number', `rivale senza "tu davanti": ${JSON.stringify(rv)}`);
    }

    // 5) API mannaggia: azione senza carriera deve dare il messaggio gentile, non un crash 500
    //    (su una career-less il 'card' entra nel ramo needsCareer; con carriera invece 200 già preso)
  } finally {
    child.kill();
  }
});
