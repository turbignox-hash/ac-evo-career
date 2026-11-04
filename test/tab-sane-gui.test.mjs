import './_flows-sandbox.mjs'; // PRIMA riga: registro flussi in tmp (come webui-smoke)
// tab-sane-gui.test.mjs — IL COLLAUDO DELLE SCHEDE, IN AUTOMATICO (4/11,
// richiesta Mauro: «il collaudo GUI è manuale… un singolo test che apre le 19
// tab e pretende zero errori JS, zero overflow orizzontale e contenuto non
// vuoto coprirebbe quella riga della checklist in automatico»).
//
// La RELEASE_CHECKLIST §3 chiede «collaudo vergine delle schede GUI (tutte le
// tab, nessuna regredita)»; finora lo faceva un giro a mano, e il crash della
// tab Griglia (`$(...).forEach is not a function`) è arrivato fino in release.
// Qui la stessa legge diventa un test: per OGNI tab dell'elenco TABS di
// gui/js/core.js (una sola verità, nessuna lista photocopy) la pagina vera,
// su server VERO con save in cartella temporanea, deve:
//   1) disegnare contenuto (niente pagina vuota, niente spinner infinito);
//   2) non lasciare `window.__renderErr` (il banner d'errore del render);
//   3) non produrre errori JavaScript nuovi;
//   4) non allargare il documento oltre la viewport (overflow orizzontale).
//
// Presupposti ambiente (playwright-core, chromium, save) = skip DICHIARATO col
// perché, lettera: il save è gitignored e il browser va chiesto a mano.
// Porta 8753: libera (8731–8752 sono delle altre guardie; 8746 è l'autopsia
// di tetto-gui-json e una collisione faceva leggere il save sbagliato).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const CORE = join(ROOT, 'gui', 'js', 'core.js');
const SAVE = join(ROOT, 'data', 'evo-career.save.json');
const PORT = 8753;
const BASE = `http://127.0.0.1:${PORT}`;

/* L'elenco dei tab si legge dal sorgente, una sola verità (stessa estrazione
 * della guardia-nav): le righe `['dashboard', tr(...)]` dentro TABS. */
const tabsDaFonte = () => {
  const core = readFileSync(CORE, 'utf8');
  const inizio = core.indexOf('const TABS = [');
  const blocco = core.slice(inizio, core.indexOf('];', inizio));
  return [...blocco.matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*tr\(/g)].map((m) => m[1]);
};

const LOCALAPPDATA = process.env.LOCALAPPDATA ?? '';
const CHROMIUM = [
  join(LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
  join(LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1223', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
].find(existsSync);

test('tutte le tab della GUI: contenuto, zero errori JS, zero overflow orizzontale', { timeout: 240_000 }, async (t) => {
  if (!existsSync(join(ROOT, 'node_modules', 'playwright-core')))
    return t.skip('manca playwright-core: `npm install` e il collaudo riparte');
  if (!CHROMIUM)
    return t.skip(`chromium assente nella cache di Playwright (${join(LOCALAPPDATA, 'ms-playwright')}): scaricalo con \`npx playwright install chromium\``);
  if (!existsSync(SAVE))
    return t.skip('manca il save di carriera (data/evo-career.save.json): il collaudo apre le tab con una carriera vera');

  // save COPIATO in cartella temporanea: il save vero non si tocca
  const DATA = mkdtempSync(join(tmpdir(), 'evo-tab-sane-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  copyFileSync(SAVE, join(DATA, 'evo-career.save.json'));

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr += d; });

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  try {
    await new Promise((res, rej) => {
      const t0 = Date.now();
      const via = setInterval(async () => {
        if (child.exitCode !== null) { clearInterval(via); rej(new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio\n${stderr.slice(-400)}`)); return; }
        try {
          const r = await fetch(`${BASE}/api/watcher?probe=1`);
          if (r.ok) { clearInterval(via); res(); return; }
        } catch { /* non ancora su */ }
        if (Date.now() - t0 > 12000) { clearInterval(via); rej(new Error(`server muto su ${BASE} in 12 s\n${stderr.slice(-400)}`)); }
      }, 250);
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errori = [];
    page.on('pageerror', (e) => errori.push(String(e)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#nav button[data-tab="dashboard"]'), null, { timeout: 15000 });

    const ids = tabsDaFonte();
    assert.ok(ids.length >= 19, `l'elenco TABS in gui/js/core.js non si legge (${ids.length} tab): aggiorna l'estrazione, non saltarla`);

    for (const id of ids) {
      await page.evaluate((tabId) => document.querySelector(`nav button[data-tab="${tabId}"]`)?.click(), id);
      await page.waitForFunction(() => {
        const m = document.querySelector('#main');
        return m && !m.querySelector('.spin') && m.querySelectorAll('.panel').length > 0;
      }, null, { timeout: 20000 });
      // i webfont e i riempimenti asincroni possono ancora muovere la pagina
      await page.evaluate(() => (document.fonts?.ready ?? Promise.resolve()));
      await page.waitForTimeout(400);

      const stato = await page.evaluate(() => {
        const m = document.querySelector('#main');
        return {
          chars: (m?.innerText ?? '').trim().length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          renderErr: window.__renderErr ?? null,
        };
      });
      assert.equal(stato.renderErr, null, `${id}: la vista ha lasciato un errore di render: ${stato.renderErr}`);
      assert.ok(stato.chars > 100, `${id}: vista vuota (${stato.chars} caratteri)`);
      assert.ok(stato.overflow <= 1, `${id}: overflow orizzontale di ${stato.overflow}px`);
      assert.deepEqual(errori, [], `${id}: errori JavaScript: ${errori.join(' ; ')}`);
    }
  } finally {
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((res) => setTimeout(res, 200));
  }
});
