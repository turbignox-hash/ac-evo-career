// trim-tile-gui.test.mjs — LA GUARDIA DEL «TRIM NEL CRUSCOTTO» (5/11)
//
// Storia: 4/11 la riga compatta «⚖️ Difficoltà AI · −1/+1» (#card-trim) era
// era la guardia della serata; la sera del 5/11 Mauro la toglie per
// decreto («deve apparire solamente la finestra color oro con il suggerimento
// trim, non lo voglio fisso»). Le regole nuove del cruscotto sono due:
//
//  1) la riga FISSA NON DEVE PIÙ TORNARE: banda live, trim corrente e i
//     nudges −1/+1 non hanno più posto nel cruscotto (sul pannello
//     Difficoltà restano i comandi veri);
//  2) la FINESTRA ORO del suggerimento resta: quando il server ha una
//     proposta pendente, il banner «Il tool suggerisce il trim» con
//     Accetta/Rifiuta sta in scheda gara.
//
// Sorgente gui/js si legge TESTUALMENTE, e la prova col server sandbox
// pesa /js/viste-a.js DALLA RETE: il browser deve vedere la stessa cosa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'gui', 'js', 'viste-a.js'), 'utf8');

const RIGA_FISSA = '<div id="card-trim"';
const NUDGE = '.d-nudge';
const BANNER = 'Il tool suggerisce il trim';
const ACCETTA = 'b-prop-accept';

test('la riga fissa del trim NON torna nel cruscotto (decreto 5/11)', () => {
  assert.ok(!src.includes(RIGA_FISSA), 'GUARDIA COLPITA: #card-trim è tornata in viste-a.js — la riga fissa va tolta di nuovo');
  assert.ok(!src.includes(NUDGE), 'GUARDIA COLPITA: i pulsanti −1/+1 (.d-nudge) sono tornati nella scheda gara');
  // e nemmeno il vecchio endpoint dei nudges viene più chiamato dalla vista
  assert.ok(!src.includes("'difficulty-nudge'"), 'la scheda gara chiama ancora difficulty-nudge: morto col tile, via anche questo');
});

test('la finestra oro del suggerimento resta, in scheda gara, prima della sfida e di «Prepara tutto»', () => {
  const dove = src.indexOf('function drawCardInto');
  assert.ok(dove > 0, 'drawCardInto non è più in viste-a.js');
  const banner = src.indexOf(BANNER);
  assert.ok(banner > dove, 'il banner del suggerimento trim non sta più in drawCardInto');
  assert.ok(src.includes(ACCETTA), 'il bottone Accetta della proposta non c\'è più in viste-a.js');
  // ordine: il banner sta prima della sfida della ronda e prima di «Prepara tutto»
  assert.ok(src.indexOf('challenge-flag', banner) > banner, 'il banner del trim non sta più SOPRA la sfida della ronda');
  assert.ok(src.indexOf('id="b-race"', banner) > banner, 'il banner del trim non sta più PRIMA di «Prepara tutto»');
});

/* ---------- la prova col server sandbox ---------- */

const PORT = 8732;                 // lontano dal smoke (8731) e dal fallback 8642–8655
const BASE = `http://127.0.0.1:${PORT}`;

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`il server sandbox è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio`);
    try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) return; } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`il server sandbox non ha risposto su ${BASE} entro ${ms}ms`);
}

test('il server sandbox serve al browser la STESSA cosa, byte a byte', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-trim-tile-'));
  const child = spawn(process.execPath, [join(ROOT, 'src', 'webui.mjs')], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    await waitReady(child);
    const r = await fetch(`${BASE}/js/viste-a.js`);
    assert.equal(r.status, 200, 'viste-a.js deve arrivare 200 dal server sandbox');
    assert.match(r.headers.get('content-type') ?? '', /javascript/i, 'viste-a.js serve con il MIME giusto (application/javascript)');
    const testa = await r.text();
    // ciò che arriva al browser è la sorgente SCRITTA — nel server non ci può
    // stare una variante «temperata» della GUI
    assert.equal(testa, src, 'ciò che il server manda al browser NON è il file sul disco — niente rifacimenti della GUI tra server e browser');
    // le regole del 5/11 devono arrivare anche al browser:
    assert.ok(!testa.includes(RIGA_FISSA), 'la riga fissa #card-trim arriva ancora al browser: da togliere anche nel momento del servirlo');
    assert.ok(testa.includes(BANNER), 'la finestra oro del suggerimento non arriva più al browser');
  } finally {
    child.kill();
    void stderr; // gli stamb del server non sporcano il verdetto del test
  }
});
