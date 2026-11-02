import './_flows-sandbox.mjs';
// layout-impostazioni.test.mjs — LA GUARDIA DEL LAYOUT DELLE IMPOSTAZIONI (2/11,
// richiesta Mauro: «test di layout che misura le sovrapposizioni del tab
// Impostazioni a 480/1250/1920 e falla fallire se qualcuna ritorna»).
//
// Il difetto custodito: quando la finestra si restringe (schermo piccolo,
// due finestre affiancate, proiezione), campi e bottoni possono finire SOPRA
// l'uno all'altro — nessun test del DOM lo vede, lo decide solo il browser.
//
// (3/11, seguente «stessa guardia a Impostazioni: terza larghezza 360 px
// (schermo piccolo) e ai tab Setup e Analisi») — l'estensione a 12 misure:
// 4 larghezze × i 3 tab, ognuno col SUO marcatore di vista.
//
// (3/11, seconda estrazione, richiesta Mauro: «estendi il guard anche alla
// tab Setup e alla Dashboard») — il Setup c'era già, la Dashboard entra
// col marcatore #card-panel: la guardia sale a 16 misure (4 larghezze × 4
// tab).
//
// (3/11, il MOTORE tecnico è estratto): la sonda browser (click della
// vista, attesa del marcatore, arrivi asincroni, misura delle
// sovrapposizioni) vive ora in [test/_layout-probe.mjs](_layout-probe.mjs)
// e si riusa su altre viste;
// questo file resta L'ORCHESTRAZIONE: server su porta sua, save slot 1
// COPIATO in una cartella dati temporanea (il save vero non si tocca),
// loop di larghezze e tab, assertion e pulizia.
//
// (3/11, richiesta Mauro: «nella CI del comando check esegui il guard della
// GUI solo se il chromium è presente, altrimenti il test resta verde ma
// dice il perché») — i tre PRESUPPOSTI (browser = ambiente, non codice)
// sono skip DICHIARATO col perché nel messaggio, non rossi: il save è
// gitignored (nel checkout fresco non c'è), il chromium va chiesto a mano.
//
// (3/11, TUTTI I TAB, richiesta Mauro: «aggiungi alla guardia di layout anche
// i restanti tab della GUI… mantenendo le stesse misure di stabilità»): la
// stesa copre ORA l'intera nav (19 tab), stessi 4 larghezze, stessa sonda,
// stesse leggi (marcatore unico + stabilità della geometria + niente
// sovrapposizioni + niente errori JS nuovi). Quattro viste non avevano un id
// stabile: ora ognuna porta il SUO marcatore (#mx-posta Messaggi,
// #rv-registro Rivali, #ch-carica Campionati — in ENTRAMBI i rami — e
// #bn-libro Finanze). Il tempo sale: 76 misure, il tetto del test sale con loro.
//
// Porta: 8736 (fuori dal range di fallback 8642..8655 e dal 8731 di smoke).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assettaVista, assettaRiempimentiImpostazioni, assettaStabilitaGenerica, misuraSovrapposizioni, righeReport } from './_layout-probe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const SAVE = join(ROOT, 'data', 'evo-career.save.json');
const PORT = 8736;
const BASE = `http://127.0.0.1:${PORT}`;
/* la quarta larghezza è il MARGINE più piccolo: 480 era il minimo
 * collaudato, sotto c'è il regno dei telefoni e dei pannelli affiancati
 * in finestra stretta */
const WIDTHS = [360, 480, 1250, 1920];
/* DICIANNOVE tab della STESSA guardia, nell'ordine della nav, ognuno col SUO
 * marcatore (esiste SOLO in quella vista, non nei vicini): #card-panel
 * Dashboard, #ag-advance Centro gare, #mx-posta Messaggi, #imp-result Import,
 * #ch-carica Campionati (identico nei DUE rami: vuoto e pieno), #g-tbody
 * Griglia, #rv-registro Rivali, #track-hist Piste, #cars-grid Auto,
 * #g-mech Garage, #arc-q Archivio, #b-on-all Online, #gv-subito Giri liberi,
 * #stats-vetrina Statistiche, #bn-libro Finanze, #i-diffval Difficoltà,
 * #agg-status Impostazioni, #psi-panel Setup, #an-tetto Analisi.
 * riempimentiDedicati solo per Impostazioni (i tre arrivi asincroni NOTI);
 * per tutti gli altri la stabilità GENERICA della geometria tiene il posto.
 * pannelli: il minimo di .panel che la vista aggiunge (1 per la maggior parte;
 * Centro gare ne mette 2: hero + gare del giorno; Griglia ne mette 5:
 * celle, classi, sede weekend, calibrazione, azioni). */
const TAB = [
  { id: 'dashboard', nome: 'Dashboard', marker: '#card-panel', pannelli: 4 },
  { id: 'agenda',    nome: 'Centro gare', marker: '#ag-advance', pannelli: 2 },
  { id: 'messages',  nome: 'Messaggi',    marker: '#mx-posta',   pannelli: 1 },
  { id: 'import',    nome: 'Import',      marker: '#imp-result', pannelli: 1 },
  { id: 'championships', nome: 'Campionati', marker: '#ch-carica', pannelli: 1 },
  { id: 'griglia',   nome: 'Griglia',     marker: '#g-tbody',    pannelli: 3 },
  { id: 'rivals',    nome: 'Rivali',      marker: '#rv-registro', pannelli: 1 },
  { id: 'tracks',    nome: 'Piste',       marker: '#track-hist', pannelli: 1 },
  { id: 'cars',      nome: 'Auto',        marker: '#cars-grid',  pannelli: 1 },
  { id: 'garage',    nome: 'Garage',      marker: '#g-mech',     pannelli: 1 },
  { id: 'archive',   nome: 'Archivio',    marker: '#arc-q',      pannelli: 1 },
  { id: 'online',    nome: 'Online',      marker: '#b-on-all',   pannelli: 1 },
  { id: 'gironi',    nome: 'Giri liberi', marker: '#gv-subito',  pannelli: 1 },
  { id: 'stats',     nome: 'Statistiche', marker: '#stats-vetrina', pannelli: 1 },
  { id: 'banca',     nome: 'Finanze',     marker: '#bn-libro',   pannelli: 1 },
  { id: 'difficulty', nome: 'Difficoltà', marker: '#i-diffval',  pannelli: 1 },
  { id: 'settings',  nome: 'Impostazioni', marker: '#agg-status', pannelli: 3, riempimentiDedicati: true },
  { id: 'setup',     nome: 'Setup',       marker: '#psi-panel',  pannelli: 1 },
  { id: 'analisi',   nome: 'Analisi',     marker: '#an-tetto',   pannelli: 1 },
];

// il Chromium già nella cache di Playwright (niente download: se manca, il
// messaggio dello skip dice quale cartella guardare e come riempirla)
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? '';
const CHROMIUM = [
  join(LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
  join(LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1223', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
].find(existsSync);

test('tutti i 19 tab della GUI: niente sovrapposizioni a 360, 480, 1250 e 1920', { timeout: 900_000 }, async (t) => {
  if (!existsSync(join(ROOT, 'node_modules', 'playwright-core')))
    return t.skip('manca playwright-core: `npm install` e la guardia riparte');
  if (!CHROMIUM)
    return t.skip(`chromium assente nella cache di Playwright (${join(LOCALAPPDATA, 'ms-playwright')}): scaricalo con \`npx playwright install chromium\``);
  if (!existsSync(SAVE))
    return t.skip('la tab Impostazioni si apre solo con una carriera (niente onboarding): manca il save ' + SAVE);

  // server della GUI con cartella dati finta: il save slot 1 è una COPIA, e
  // il watcher di questo server guarda solo la cartella temporanea
  const DATA = mkdtempSync(join(tmpdir(), 'evo-layout-'));
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
  const pagine = [];
  try {
    // il server deve dire la sua su porta SUA prima di aprire il browser
    await new Promise((res, rej) => {
      const t0 = Date.now();
      const via = setInterval(async () => {
        if (child.exitCode !== null) { clearInterval(via); rej(new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio\n${stderr.slice(-400)}`)); }
        try {
          const r = await fetch(`${BASE}/api/watcher?probe=1`);
          if (r.ok) { clearInterval(via); res(); }
        } catch { /* non ancora su */ }
        if (Date.now() - t0 > 12000) { clearInterval(via); rej(new Error(`server muto su ${BASE} in 12 s\n${stderr.slice(-400)}`)); }
      }, 250);
    });

    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      pagine.push(page);
      page.on('pageerror', (e) => { page.__jserr ??= []; page.__jserr.push(String(e)); });
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      // aspetta che la barra di navigazione esista (la GUI disegnata di boot)
      await page.waitForFunction(() => document.querySelector('#nav button[data-tab="settings"]'), null, { timeout: 15000 });

      for (const tab of TAB) {
        await assettaVista(page, tab);

        /* (3/11, tutti i tab) ATTARDI CON DIVARIO: Griglia (5 pannelli, con
         * la sede del weekend che si riempie a parte) può allungare
         * l'arrivo della geometria stabile — qui si aspetta anche il BOX
         * «carico…» svuotato, oltre alla stabilità GENERICA della sonda. */
        if (tab.id === 'griglia') {
          await page.waitForFunction(() => !document.querySelector('#wtrack-box')?.textContent.includes('carico'), null, { timeout: 15000 }).catch(() => { /* si misura comunque */ });
        }
        if (tab.riempimentiDedicati) await assettaRiempimentiImpostazioni(page);
        else await assettaStabilitaGenerica(page);

        const sovrapposizioni = await misuraSovrapposizioni(page);
        const blocco = righeReport(sovrapposizioni);
        const dettaglio = blocco || (page.__jserr?.length ? '  (nessuna sovrapposizione: problemi di soli errori JS)' : '');
        assert.equal(sovrapposizioni.length, 0,
          `a ${width}px il tab ${tab.nome} ha ${sovrapposizioni.length} sovrapposizioni:\n${dettaglio}`);
        // (3/11, tre tab nella stessa pagina) GLI errori JS si attribuiscono
        // per DELTA: gli errori dei tab già visitati restano contati, il
        // confronto guarda solo i NUOVI del tab corrente
        const errPrima = tab.__errPrima ?? 0;
        tab.__errPrima = (page.__jserr ?? []).length;
        assert.equal((page.__jserr ?? []).length, errPrima,
          `a ${width}px il tab ${tab.nome} ha errori JavaScript: ${(page.__jserr ?? []).slice(errPrima).join(' ; ')}`);
      }
    }
  } finally {
    for (const p of pagine) await p.close().catch(() => {});
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((res) => setTimeout(res, 200));
  }
});
