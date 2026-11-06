// test/webui-azioni-contratto.test.mjs — il contratto dei moduli azioni.
//
// I sette webui-actions-*.mjs sono le rotte che SCRIVONO (garage, agenda,
// eventi, integrità, manutenzione, setup, live) e fino al 6/11 erano gli unici
// moduli di src/ che nessun test importava: i guasti più fastidiosi nascevano
// lì. Questo test non rifà il giro e2e (c'è, e pesa) — controlla il CABLAGGIO,
// che è il punto dove si rompe in silenzio:
//   1. ogni modulo risponde `false` a una rotta che non è sua (il dispatcher
//      può consegnargli tutto senza che catturi azioni altrui);
//   2. il dispatcher di webui.mjs consegna OGNI dominio al suo modulo;
//   3. i parametri che il modulo estrae da `ctx` sono TUTTI passati al call
//      site: un `persist` o un `pingVoce` dimenticato è un ReferenceError che
//      risponde 500 solo quando l'utente clicca quella rotta.
// Più i test veri di webui-static (origine e Host), che erano zero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestFromLocalBrowser } from '../src/webui-static.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const leggi = (f) => readFileSync(join(SRC, f), 'utf8');
const webui = leggi('webui.mjs');

const MODULI = readdirSync(SRC)
  .filter((f) => /^webui-actions-.*\.mjs$/.test(f))
  .map((file) => {
    const src = leggi(file);
    const set = src.match(/export const ([A-Z][A-Z0-9_]*_ACTIONS) = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(set, `${file}: set azioni non trovato`);
    const fn = src.match(/export (?:async )?function ([a-zA-Z]+Action)\(action, ([\s\S]*?)\) \{/);
    assert.ok(fn, `${file}: funzione azione non trovata`);
    // `{ persist: persistState }` è la CHIAVE `persist` (il nome locale non conta)
    const dalCtx = src.match(/const \{ ([^}]*) \} = ctx;/);
    const chiavi = (fn[2].startsWith('ctx')
      ? (dalCtx ? dalCtx[1] : '')
      : fn[2].replace(/[{}]/g, ''))
      .split(',').map((s) => s.split(':')[0].trim()).filter(Boolean);
    return { file, set: set[1], fn: fn[1], async: /export async function/.test(src), chiavi };
  });

test('ci sono i sette domini (il dispatcher non deve perdere pezzi)', () => {
  assert.equal(MODULI.length, 7, `attesi 7 moduli azioni, trovati ${MODULI.length}`);
});

test('ogni modulo risponde false a una rotta che non è sua', async () => {
  for (const m of MODULI) {
    const modulo = await import(`../src/${m.file}`);
    const out = modulo[m.fn]('rotta-che-non-esiste', {});
    const valore = m.async ? await out : out;
    assert.equal(valore, false, `${m.file}: una rotta altrui deve tornare false (non un 200 muto)`);
  }
});

test('il dispatcher consegna ogni dominio al suo modulo', () => {
  for (const m of MODULI) {
    assert.match(webui, new RegExp(`if \\(${m.set}\\.has\\(action\\)\\)`),
      `${m.set} non è mai consultato da webui.mjs: le rotte del modulo sono irraggiungibili`);
    assert.ok(webui.includes(`${m.fn}(action,`), `webui.mjs non chiama ${m.fn}`);
  }
});

test('il call site passa TUTTI i parametri che il modulo estrae da ctx', () => {
  for (const m of MODULI) {
    const i = webui.indexOf(`${m.fn}(action,`);
    assert.ok(i > 0, `${m.fn} non chiamata`);
    const coda = webui.slice(i, i + 700);
    const oggetto = coda.slice(coda.indexOf('{') + 1, coda.indexOf('}'));
    const passate = new Set(oggetto.match(/[A-Za-z_$][\w$]*/g) ?? []);
    const mancanti = m.chiavi.filter((k) => !passate.has(k));
    assert.deepEqual(mancanti, [],
      `${m.file}: parametri non passati dal dispatcher (ReferenceError a runtime): ${mancanti.join(', ')}`);
  }
});

// --- webui-static: la porta di casa (Host e Origin) -------------------------
const req = (headers) => ({ headers });
const PORT = 8642;

test('webui-static: il loopback passa, il resto no (DNS rebinding)', () => {
  assert.equal(requestFromLocalBrowser(req({ host: `127.0.0.1:${PORT}` }), PORT), true);
  assert.equal(requestFromLocalBrowser(req({ host: `localhost:${PORT}` }), PORT), true);
  assert.equal(requestFromLocalBrowser(req({ host: `[::1]:${PORT}` }), PORT), true);
  assert.equal(requestFromLocalBrowser(req({ host: 'evil.example:8642' }), PORT), false);
  assert.equal(requestFromLocalBrowser(req({ host: `127.0.0.1:${PORT + 1}` }), PORT), false);
  assert.equal(requestFromLocalBrowser(req({}), PORT), false);
});

test('webui-static: l’Origin di un altro sito è un CSRF, quello proprio no', () => {
  const host = `127.0.0.1:${PORT}`;
  assert.equal(requestFromLocalBrowser(req({ host, origin: `http://127.0.0.1:${PORT}` }), PORT), true);
  assert.equal(requestFromLocalBrowser(req({ host, origin: `http://localhost:${PORT}` }), PORT), true);
  // nessun Origin = client locale (curl, CLI, sonda di porta): consentito
  assert.equal(requestFromLocalBrowser(req({ host }), PORT), true);
  // pagina di un altro sito nel browser: porta diversa o hostname diverso
  assert.equal(requestFromLocalBrowser(req({ host, origin: 'http://127.0.0.1:9999' }), PORT), false);
  assert.equal(requestFromLocalBrowser(req({ host, origin: 'https://evil.example' }), PORT), false);
  assert.equal(requestFromLocalBrowser(req({ host, origin: 'non-un-url' }), PORT), false);
});
