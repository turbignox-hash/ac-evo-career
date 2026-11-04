// trim-tile-gui.test.mjs — LA GUARDIA DELLA RIGA COMPATTA «DIFFICOLTÀ AI» (4/11)
// La riga vive in drawCardInto (gui/js/viste-a.js), dentro #card-actions:
// banda VIVA della serie, trim corrente e pulsanti −1/+1, sopra la sfida e
// prima di «Prepara tutto». Il vecchio tile del modale è stato sostituito da
// questa riga: la guardia pesa la riga nuova, non una formula che non c'è più.
//
// Stessa cura delle guardie delle viste: la sorgente gui/js si legge
// TESTUALMENTE, ma il pezzo che scrive banda e trim viene PERÒ ANCHE VALUTATO
// DAVVERO (vm) con la card dell'esempio: 84–85 con trim +2 → «84–85% · trim
// +2», parola per parola.
//
// Terza prova «con server sandbox»: il webui PARTE DAVVERO su porta sua
// (8732, fuori dalla scala di riserva 8642–8655 e diversa dall'8731 dello smoke)
// con cartella dati temporanea, e il test PESA /js/viste-a.js DALLA RETE:
// ciò che arriva al browser DEV'essere la stessa riga, byte a byte.

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

// La riga e il pezzo che rende banda/trim, al script. Cambiare UNA virgola
// della formula = test rosso.
const ROW = '<div id="card-trim"';
// biome-ignore lint/suspicious/noTemplateCurlyInString: i ${ … } qui NON sono un template da valutare: è il pezzo di viste-a.js, pesato alla lettera.
const TITLE = "⚖️ <b>${tr({ it: 'Difficoltà AI', en: 'AI difficulty' })}</b>";
// biome-ignore lint/suspicious/noTemplateCurlyInString: i ${ … } qui NON sono un template da valutare: è il pezzo di viste-a.js, pesato alla lettera e poi valutato con vm.
const VALUE = "<b style=\"color:var(--acc)\">${card.difficulty.rangeMin}–${card.difficulty.rangeMax}%</b> · ${tr({ it: 'trim', en: 'trim' })} <b>${Number(card.difficulty.trim ?? 0) > 0 ? '+' : ''}${Number(card.difficulty.trim ?? 0)}</b>";

test('la riga compatta Difficoltà AI sta nel modale, sopra la sfida e prima di «Prepara tutto»', () => {
  assert.ok(src.includes(ROW), 'GUARDIA COLPITA: #card-trim non c\'è più in viste-a.js — la riga compatta del trim è sparita');
  // una sola copia: la riga nasce QUI, non altrove
  assert.equal(src.split(ROW).length, 2, 'la riga #card-trim compare più di una volta in viste-a.js — niente doppi visi');
  // e sta DENTRO drawCardInto (il modale della scheda gara), non altrove
  const dove = src.indexOf(ROW);
  assert.ok(src.indexOf('function drawCardInto') >= 0 && dove > src.indexOf('function drawCardInto'),
    'la riga #card-trim non sta più dentro drawCardInto — il modale della scheda gara ha perso il trim');
  // il titolo e la formula viva (banda + trim) sono quelli che il browser deve vedere
  assert.ok(src.includes(TITLE), 'il titolo «Difficoltà AI» non è più nella riga compatta');
  assert.ok(src.includes(VALUE), 'la formula «rangeMin–rangeMax% · trim +N» non è più quella — guarda #card-trim in viste-a.js');
  // ordine richiesto: trim sopra la sfida e prima di «Prepara tutto»
  assert.ok(src.indexOf('challenge-flag', dove) > dove, 'la riga del trim non sta più SOPRA la sfida della ronda');
  assert.ok(src.indexOf('id="b-race"', dove) > dove, 'la riga del trim non sta più PRIMA di «Prepara tutto»');
});

test('il testo reso è banda viva e trim col segno giusto: «84–85% · trim +N»', () => {
  // VALUE è il pezzo HTML scritto in viste-a.js: qui si valuta DENTRO un
  // template literal, così ${…} diventa il testo reso e non codice HTML.
  const rende = (card) => vm.runInNewContext('`' + VALUE + '`', { card, tr: ({ it }) => it });
  // l'esempio del 3/11: banda 84–85, trim +2 → 84–85% · trim +2
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: 2 } }), '<b style="color:var(--acc)">84–85%</b> · trim <b>+2</b>');
  // segno positivo SOLO se il trim lo è: un getter lieve non spara un "+" secco
  assert.notEqual(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: 2 } }), '<b style="color:var(--acc)">84–85%</b> · trim <b>2</b>');
  // senza trim: il valore c'è ed è 0, non una banda nuda né "undefined"
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: 0 } }), '<b style="color:var(--acc)">84–85%</b> · trim <b>0</b>');
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: undefined } }), '<b style="color:var(--acc)">84–85%</b> · trim <b>0</b>');
  // trim negativo (tasto −1): niente "+-1" — il meno lo porta il numero
  assert.equal(rende({ difficulty: { rangeMin: 84, rangeMax: 85, trim: -1 } }), '<b style="color:var(--acc)">84–85%</b> · trim <b>-1</b>');
  // la banda usa rangeMin/rangeMax (trim attivo sposta la banda, lezione del 1/11):
  assert.equal(rende({ difficulty: { rangeMin: 28, rangeMax: 29, trim: 2 } }), '<b style="color:var(--acc)">28–29%</b> · trim <b>+2</b>');
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
    // e la riga compatta è lì: banda e trim arrivano integri alla GUI del browser
    assert.ok(testa.includes(ROW), 'la riga #card-trim non arriva più al browser nel modale della scheda gara');
    assert.ok(testa.includes(VALUE), 'la formula «84–85% · trim +N» non arriva più al browser nel modale della scheda gara');
  } finally {
    child.kill();
    void stderr; // gli stamb del server non sporcano il verdetto del test
  }
});
