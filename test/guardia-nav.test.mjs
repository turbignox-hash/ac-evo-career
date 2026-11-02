import './_flows-sandbox.mjs'; // PRIMA riga: registro flussi in tmp (come webui-smoke)
// guardia-nav.test.mjs — LA GUARDIA DELLA SIDEBAR (9/11, richiesta Mauro dopo
// l'incidente vero del giorno: nel rimanovamento della fascia fissa una edit
// di drawNav aveva PERSO la riga `$('#nav').innerHTML = ...` — la sidebar
// nasceva vuota (sonda sul vivo: navTab: [], 4 chiamate d'avvio abortite) e
// DUE guardie GUI (tetto-gui-json, layout-impostazioni) cadevano in timeout
// sull'attesa della nav senza dire il perché. La lezione: la lista dei tab è
// una sola riga in drawNav, e da oggi NON può più svanire in silenzio.)
//
// La legge: nel DOM vero, aperto su server VERO, `#nav` deve portare UN
// bottone per OGNI tab dell'elenco TABS di gui/js/core.js — né uno in più
// né uno in meno. L'elenco si LEGGE dal sorgente (una sola verità): se
// domani entra o esce un tab, la guardia segue da sola, senza liste
// photocopy che seccano. Con la lista vanno a posto anche i GRUPPI
// (nav-grp) e il bottone Aiuto in fondo.
//
// Il difetto custodito è QUI: se drawNav smette di riempire #nav
// (riga persa, antenato random in una edit), la pagina resta parziale
// e la guardia dice ESATTAMENTE i tab mancanti, col perché a fianco.
//
// LA STRUTTURA conta anche lei (richiesta Mauro, «guardia <aside nav»): la
// colonna è un <aside id="side"> con dentro <nav id="nav"> — la guardia
// misura i bottoni dentro QUESTA catena vera (non un #nav generico), così
// il rimpiazzo del tag sfonda l'assert sulla struttura e non passa in silenzio.
//
// Il server è lo stesso schema di tetto-gui-json: porta SUA (libera dal
// 8731 in su), save finto in cartella dati temporanea (il save vero non si
// tocca — lezione del 23/10), nodo d'ingresso = primo del ladder VERO
// (lezione del «serie sconosciuta» visto vivo). I presupposti ambiente
// (playwright-core, chromium) sono skip DICHIARATO col perché, lettera, come tutte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const CORE = join(ROOT, 'gui', 'js', 'core.js');
const PORT = 8738;          // libera: 8731–8737, 8739, 8741, 8743–8745 sono degli altri
const BASE = `http://127.0.0.1:${PORT}`;

/* L'ELENCO DEI TAB si legge dal sorgente, una sola verità: le righe
 * `['dashboard', tr(...)]` dentro const TABS = [ ... ]; di gui/js/core.js */
const tabsDaFonte = () => {
  const core = readFileSync(CORE, 'utf8');
  const blocco = core.slice(core.indexOf('const TABS = ['), core.indexOf('];', core.indexOf('const TABS = [')));
  const ids = [...blocco.matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*tr\(/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'L\'elenco TABS in gui/js/core.js non si legge: la guardia non va presa alla leggera — se l\'estrazione si spezza, aggiorna la legge, non saltarla.');
  return ids;
};

test('la sidebar #nav porta un bottone per OGNI tab di TABS: né uno meno né uno di più', { timeout: 90_000 }, async (t) => {
  if (!existsSync(join(ROOT, 'node_modules', 'playwright-core')))
    return t.skip('manca playwright-core: `npm install` e la guardia riparte');
  const LOCALAPPDATA = process.env.LOCALAPPDATA ?? '';
  const CHROMIUM = [
    join(LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
    join(LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1223', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ].find(existsSync);
  if (!CHROMIUM)
    return t.skip(`chromium assente nella cache di Playwright (${join(LOCALAPPDATA, 'ms-playwright')}): scaricalo con \`npx playwright install chromium\``);

  const IDE = tabsDaFonte();

  // carriera FINTA in cartella dati TEMPORANEA (stessa lezione del tetto:
  // EVO_DATA_DIR per il save del TOOL, ACE_DATA per quello del GIOCO), nodo
  // = PRIMO del ladder vero (il nodo inventato rompe il boot col «serie
  // sconosciuta») — senza questa riga /api/boot esplode «reading 'drivers»
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const node0 = ladder.nodes.slice().sort((a, b) => a.level - b.level)[0];
  const DATA = mkdtempSync(join(tmpdir(), 'evo-guardia-nav-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const state = {
    version: 1,
    driver: { name: 'Pilota Prova', nation: 'IT' }, money: 1000, messages: [],
    node: node0.nodeId, season: 1, round: 0,
    difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
    raceSettings: {},
    results: { [node0.nodeId]: [] },
    stats: { bestLaps: {} }, agenda: { day: 1 }, titles: [],
    world: { drivers: [] },
  };
  writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(state));

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), EVO_DATA_DIR: DATA, ACE_DATA: DATA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr += d; });

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  try {
    // il server deve dire la sua su porta SUA prima del resto
    await new Promise((res, rej) => {
      const t0 = Date.now();
      const via = setInterval(async () => {
        if (child.exitCode !== null) { clearInterval(via); rej(new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio\n${stderr.slice(-400)}`)); }
        try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) { clearInterval(via); res(); } } catch { /* non ancora su */ }
        if (Date.now() - t0 > 12000) { clearInterval(via); rej(new Error(`server muto su ${BASE} in 12 s\n${stderr.slice(-400)}`)); }
      }, 250);
    });

    const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    /* L'ATTESA giusta NON è il tab più in fondo (se manca lui, l'attesa muore
     * in timeout bianco senza dire niente — il peccato delle guardie di ieri
     * sera): si aspetta il SEGNO DI BOOT che arriva DOPO drawNav. paintHeader
     * scrive #t-name e sta DOPO drawNav in refreshBoot: se il nome è scritto,
     * la nav è già disegnata (o MENO disegnata — e la misura qui sotto dirà
     * chi manca, col perché). */
    const nomeScritto = () => page.waitForFunction(() => (document.querySelector('#t-name')?.textContent ?? '–').trim() !== '–', { timeout: 15000 });
    // DUE volte: la PRIMA può andare interrotta dal ricaricamento auto della
    // build (l'UNICO location.reload() del segno «build vista», lezione del
    // 26/10) che seppellisce il contesto JS di mezzo evaluate. La seconda
    // conferma il segno a reload avvenuto: dopo, niente ricomincia.
    await nomeScritto();
    await page.waitForTimeout(2000);
    await nomeScritto();

    /* LA STRUTTURA VALE (richiesta Mauro: «guardia <aside nav»): la sidebar è
     * un <aside id="side"> con dentro un <nav id="nav"> — la legge richiede il
     * TAG, non solo l'id: se un domani l'aside (o il nav) scende a div, l'id
     * girerebbe lo stesso e la pagina sembrerebbe identica a vista. Qui la
     * catena vera si dichiara prima della misura. */
    const struttura = await page.evaluate(() => ({
      aside: !!document.querySelector('aside#side'),
      nav: !!document.querySelector('aside#side > nav#nav'),
    }));
    assert.ok(struttura.aside, 'la sidebar non è più un <aside id="side"> — il tag della colonna è sparito da gui/index.html.');
    assert.ok(struttura.nav, 'dentro aside#side non c\'è più un <nav id="nav"> figlio diretto — la struttura della sidebar è cambiata.');

    /* LA MISURA: i bottoni della nav letti dentro la catena vera
     * aside#side > nav#nav (non un #nav generico), e il confronto a SET
     * (identica anche in ordine: la sidebar si disegna ordinata) */
    const nelDom = await page.evaluate(() => [...document.querySelectorAll('aside#side > nav#nav button[data-tab]')].map((b) => b.dataset.tab));
    const inDoppio = nelDom.filter((x, i) => nelDom.indexOf(x) !== i);
    const mancanti = IDE.filter((id) => !nelDom.includes(id));
    const diTroppo = nelDom.filter((id) => !IDE.includes(id));
    assert.equal(mancanti.length, 0,
      `SIDEBAR VUOTA (o incompleta): #nav non ha il bottone di ${mancanti.length} tab su ${IDE.length} — mancanti: ${mancanti.join(', ') || '(—)'}\n` +
      `nel DOM: [${nelDom.join(', ')}] · nell'elenco TABS di core.js: [${IDE.join(', ')}]\n` +
      `Chi ha smesso di riempire #nav? La lista è UNA sola riga in drawNav (gui/js/core.js): \`$('#nav').innerHTML = NAV_GROUPS.map(...)\` — l'incidente del 9/11 era proprio questa riga persa.`);
    assert.equal(diTroppo.length, 0,
      `#nav porta bottoni che NON sono nell'elenco TABS di core.js: ${diTroppo.join(', ')} — o il bottone è spurio, o l'estrazione della guardia ha perso un tab (in quel caso si aggiorna la legge, non si salta).`);
    assert.equal(inDoppio.length, 0,
      `#nav ha bottoni DOPPI: ${inDoppio.join(', ')} — la sidebar si disegna una volta sola per boot.`);
    /* i gruppi e l'Aiuto: la lista scorrevole non basta — le sezioni (nav-grp,
     * due al momento: Gara e Studio) e il bottone d'aiuto in fondo sono parte
     * della sidebar come deve stare */
    const gruppe = await page.evaluate(() => document.querySelectorAll('aside#side > nav#nav div.nav-grp').length);
    assert.ok(gruppe >= 2, `la sidebar deve avere almeno i DUE gruppi (Gara e Studio), ne ha ${gruppe}.`);
    const aiuto = await page.evaluate(() => !!document.querySelector('aside#side > nav#nav #b-aiuto'));
    assert.ok(aiuto, 'il bottone Aiuto (❓ #b-aiuto) è fermo in fondo alla lista — non sta fuori da #nav.');
  } finally {
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((res) => setTimeout(res, 200));
  }
});
