// trim-tile-gui.test.mjs — LA GUARDIA DEL TILE «DIFFICOLTÀ AI» DELLA GUI (3/11, richiesta Mauro)
// «Aggiungi una guardia che fissa il testo «84–85% — trim +N» del modale GUI
// della scheda gara (viste-a.js, riga 828)».
//
// I fatti: nel modale della scheda gara (drawCardInto, gui/js/viste-a.js circa la riga 834;
// Mauro l'ha contata 828) il tile
// 🎚 Difficoltà AI NON legge la riga già risolta della card («min 84% · max 85%
// (trim +2)») — si costruisce da solo: `${rangeMin}–${rangeMax}%` (trattino EN
// U+2013, quindi «84–85%») e, SE c'è un trim vivo, « — trim +N» (trattino EM
// U+2014 con spazi, + solo per il positivo). Le due guardie che già esistono
// pesano il LATO SERVER (race-card.test.mjs: «min % · max % (trim +N)») e il
// BANNER del pannello (race.mjs): questo test pesa il LATO BROWSER.
//
// Stessa cura delle guardie delle viste (viste-guard.test.mjs, ab-avviso-
// giro.test.mjs): la sorgente gui/js si legge TESTUALMENTE — e la riga del
// tile viene PERÒ ANCHE VALUTATA DAVVERO (vm) con la card dell'esempio di
// Mauro: 84–85 con trim +2 → «84–85% — trim +2», parola per parola.
//
// Terza prova «con server sandbox»: il webui PARTE DAVVERO su porta sua
// (8732, fuori dalla scala di riserva 8642–8655 e diversa dall'8731 dello smoke)
// con cartella dati temporanea, e il test PESA /js/viste-a.js DALLA RETE:
// ciò che arriva al browser DEV'essere la stessa riga, byte a byte. Così una
// riscrittura (o un bundling) della GUI non passa inosservata.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'gui', 'js', 'viste-a.js'), 'utf8');

// LA RIGA, al script: una sola sintassi ammessa (trattino EN della banda,
// trattino EM con spazi del trim, più solo per il positivo, niente suffisso
// quando il trim non c'è). Cambiare UNA virgola della formula = test rosso.
// NB: la sorgente usa i trattini UNICODE veri (– e —): la literal qui sotto
// li porta esattamente.
// biome-ignore lint/suspicious/noTemplateCurlyInString: i ${ … } qui NON sono un template da valutare: è il CIMEILO della riga 834 di viste-a.js, pesato alla lettera.
const TILE = "[tr({ it: 'Difficoltà AI', en: 'AI difficulty' }), `${card.difficulty.rangeMin}–${card.difficulty.rangeMax}%${card.difficulty?.trim ? ` — trim ${card.difficulty.trim > 0 ? '+' : ''}${card.difficulty.trim}` : ''}`],";

test('il tile Difficoltà AI del modale scheda gara costruisce il testo dalla banda VIVA', () => {
  assert.ok(src.includes(TILE), 'GUARDIA COLPITA: la riga del tile «Difficoltà AI» non è più quella — la formula «84–85% — trim +N» è cambiata (guarda drawCardInto in gui/js/viste-a.js)');
  // una sola copia: il testo del modale nasce QUI, non altrove
  assert.equal(src.split(TILE).length, 2, 'la formula del tile compare più di una volta in viste-a.js — niente doppi visi');
  // e sta DENTRO drawCardInto (il modale della scheda gara), non altrove
  const dove = src.indexOf(TILE);
  assert.ok(src.indexOf('function drawCardInto') >= 0 && dove > src.indexOf('function drawCardInto'),
    'la formula del tile non sta più dentro drawCardInto — il modale della scheda gara ha perso il testo');
});

test('il testo reso è quello di Mauro, parola per parola: «84–85% — trim +N»', () => {
  // la stringa del valore si prende DALLA RIGA VIVA della sorgente (non da
  // una copia qui): la guardia valuta ciò che davvero scrive la GUI.
  const riga = src.split('\n').find((l) => l.includes('Difficoltà AI') && l.includes('trim ${'));
  assert.ok(riga, 'GUARDIA COLPITA: la riga del tile con trim non si trova più nella sorgente');
  const sorgente = riga.trim();
  const dalSegno = sorgente.indexOf("en: 'AI difficulty' }),") + "en: 'AI difficulty' }),".length;
  const valore = sorgente.slice(dalSegno).trim().replace(/\],\s*$/, '');   // la riga finisce «…`],»
  assert.ok(valore.startsWith('`') && valore.endsWith('`'), `la formula estratta non è un template literal: ${valore.slice(0, 80)}`);

  const rende = (card) => vm.runInNewContext(valore, { card });
  // l'esempio del 3/11: banda 84–85, trim +2 → 84–85% — trim +2
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: 2 } }), '84–85% — trim +2');
  // segno positivo SOLO se il trim lo è: un getter lieve non spara un "+ secco
  assert.notEqual(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: 2 } }), '84–85% — trim 2');
  // senza trim: BANDA NUDA — niente « trim », niente spazzatura in fondo
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: 0 } }), '84–85%');
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: undefined } }), '84–85%');
  // trim negativo (tasto −1): niente "+-1" — il meno lo porta il numero
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: -1 } }), '84–85% — trim -1');
  // la banda usa rangeMin/rangeMax (trim attivo sposta la banda, lezione del 1/11):
  assert.equal(rende({ difficulty: { rangeMin: 28, rangeMax: 29, trim: 2 } }), '28–29% — trim +2');
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

test('il server sandbox serve al browser la STESSA riga, byte a byte', async () => {
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
    // e la riga del tile è lì: la formula arriva integra alla GUI del browser
    assert.ok(testa.includes(TILE), 'la riga «84–85% — trim +N» non arriva più al browser nel modale della scheda gara');
  } finally {
    child.kill();
    void stderr; // gli stamb del server non sporcano il verdetto del test
  }
});
