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
// stesa copre ORA l'intera nav (18 tab), stessi 4 larghezze, stessa sonda,
// stesse leggi (marcatore unico + stabilità della geometria + niente
// sovrapposizioni + niente errori JS nuovi). Quattro viste non avevano un id
// stabile: ora ognuna porta il SUO marcatore (#mx-posta Messaggi,
// #rv-registro Rivali, #ch-carica Campionati — in ENTRAMBI i rami — e
// #bn-libro Finanze). Il tempo sale: 76 misure, il tetto del test sale con loro.
//
// (3/11, QUINTA LARGHEZZA, richiesta Mauro: «aggiungi la larghezza 320 px alla
// guardia di layout e verifica che non compaia nessuna sovrapposizione»): 320
// si mette SOTTO alle altre — il re dei telefoni stretti e delle finestre// affiancate davvero piccole — 95 misure (5 larghezze × 18 tab).
////
// (3/11, DUE TAB NASCOSTI, richiesta Mauro: «estendi la guardia al tab
// nascosto Calendario e alla Classifica Mondiale, dandogli un marcatore
// di vista ciascuno») — non stanno in nav (Calendario si apre dagli
// annunci della stagione, Classifica Mondiale dal tile del Cruscotto o
// dall'azione «vai-classifica» dei messaggi): la sonda li apre con la
// STESSA leva dei click vivi (`tab = '…'; render()` — assettaVista, flag
// `nascosto`, test/_layout-probe.mjs), e ognuno porta il SUO marcatore:
// #cal-titolo Calendar, #mondo-vetrina Classifica Mondiale. La Classifica
// ha il marcatore sul PANEL e NON sull'h2: worldRankingInner è riciclato
// anche nel pieghevole dei Campionati (#mondo-fold) e l'h2 condiviso non
// poteva dire «solo qui». 100 misure (5 larghezze × 20 tab).
//
// (7/11) Risultati esce dalla nav: importazione nel Cruscotto, storico carriera
// in Archivio, lista file tecnici in Impostazioni. La guardia copre 20 viste.
//
// (3/11, SESTA LARGHEZZA, richiesta Mauro: «aggiungi una larghezza 256 px
// alla guardia di layout come limite estremo e verifica che non compaiano
// sovrapposizioni»): 256 si mette SOTTO alle 320 — il limbo dei pannelli
// laterali annidati e delle finestre strappate a quattro affiancate. 120
// misure (6 larghezze × 20 tab).

//// Porta: 8736 (fuori dal range di fallback 8642..8655 e dal 8731 di smoke).
//
// (2/11, terzo step della guardia, richiesta Mauro: «fallisce se un
// pannello esce dalla viewport in orizzontale») — oltre alle
// sovrapposizioni, ogni misura guarda ANCHE i .panel di #main che
// sbordano a sinistra o a destra oltre la viewport (tolleranza 2 px,
// stesse esenzioni del ritaglio: antenati col clipping, details chiuse,
// invisibili). La misura vive nella sonda condivisa (test/_layout-probe.mjs)
// e si asserta DOPO le sovrapposizioni, stesso messaggio leggibile.
// Stesso spirito dell'estensione a Griglia/Garage di sopra: la vista
// misurata è quella intera, e la sbordatura che si DEVE vedere
// (scroll orizzontale del corpo) è lei il difetto, non il fantasma.
//
// (2/11, richiesta Mauro: «estendi la guardia ai tab Griglia e Garage coi
// loro marcatori») — entrambi erano ENTRATI nella stesa «tutti i tab», ma
// l'attesa di Griglia era rimasta INDIETRO: il minimo pannelli era 3 mentre
// la vista ne porta 5 (celle, classi, sede weekend, calibrazione, azioni —
// il commento qui sotto lo diceva già). Allineato a 5: la misura parte
// solo quando la vista è INTERA, non a tre quinti. Garage resta 1 come
// minimo: il suo secondo quadro (le card auto) è dinamico col contenuto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assettaVista, assettaRiempimentiImpostazioni, assettaStabilitaGenerica, misuraPanelliFuoriViewport, misuraSovrapposizioni, righeFughe, righeReport } from './_layout-probe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const SAVE = join(ROOT, 'data', 'evo-career.save.json');
const PORT = 8736;
const BASE = `http://127.0.0.1:${PORT}`;
/* le tre larghezze più piccole sono il MARGINE: 360 era il minimo
 * collaudato; 320 (3/11) è sotto ancora — regno dei telefoni stretti e
 * delle finestre affiancate davvero piccole; 256 (3/11) è il LIMITE
 * ESTREMO sotto le altre — pannelli laterali annidati e finestre
 * strappate a quattro */
const WIDTHS = [256, 320, 360, 480, 1250, 1920];
/* VENTI tab della STESSA guardia: i 18 in nav (ordine della nav) e i 2
 * NASCOSTI in coda, ognuno col SUO
 * marcatore (esiste SOLO in quella vista, non nei vicini): #card-panel
 * Dashboard, #ag-advance Centro gare, #mx-posta Messaggi, #ch-carica
 * Campionati (identico nei DUE rami: vuoto e pieno), #g-tbody
 * Griglia, #rv-registro Rivali, #track-hist Piste, #cars-grid Auto,
 * #g-mech Garage, #arc-q Archivio, #b-on-all Online, #gv-subito Giri liberi,
 * #stats-vetrina Statistiche, #bn-libro Finanze, #i-diffval Difficoltà,
 * #settings-import-files Impostazioni, #setup-series-panel Setup, #an-tetto Analisi; i due
 * NASCOSTI (senza bottone in nav, leva `nascosto` della sonda):
 * #cal-titolo Calendario, #mondo-vetrina Classifica Mondiale.
 * riempimentiDedicati solo per Impostazioni (arrivi asincroni di impostazioni e lista file);
 * per tutti gli altri la stabilità GENERICA della geometria tiene il posto.
 * pannelli: il minimo di .panel che la vista aggiunge (1 per la maggior parte;
 * Centro gare ne mette 2: hero + gare del giorno; Griglia ne mette 5:
 * celle, classi, sede weekend, calibrazione, azioni). */
/* VENTI viste collaudate: 18 nella nav più Calendario e Classifica Mondiale. */
const TAB = [
  { id: 'dashboard', nome: 'Dashboard', marker: '#imp-panel', pannelli: 4 },
  { id: 'agenda',    nome: 'Centro gare', marker: '#ag-advance', pannelli: 2 },
  { id: 'messages',  nome: 'Messaggi',    marker: '#mx-posta',   pannelli: 1 },
  { id: 'championships', nome: 'Campionati', marker: '#ch-carica', pannelli: 1 },
  { id: 'griglia',   nome: 'Griglia',     marker: '#g-tbody',    pannelli: 5 },
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
  { id: 'settings',  nome: 'Impostazioni', marker: '#settings-import-files', pannelli: 3, riempimentiDedicati: true },
  { id: 'setup',     nome: 'Setup',       marker: '#setup-series-panel', pannelli: 1 },
  { id: 'analisi',   nome: 'Analisi',     marker: '#an-tetto',   pannelli: 1 },
  /* i due NASCOSTI (3/11): senza bottone in nav — la sonda li apre con
   * `tab = '…'; render()`, la stessa leva dei click vivi */
  { id: 'calendar',  nome: 'Calendario',  marker: '#cal-titolo', pannelli: 1, nascosto: true },
  { id: 'standings', nome: 'Classifica Mondiale', marker: '#mondo-vetrina', pannelli: 1, nascosto: true },
];

// il Chromium già nella cache di Playwright (niente download: se manca, il
// messaggio dello skip dice quale cartella guardare e come riempirla)
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? '';
const CHROMIUM = [
  join(LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
  join(LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1223', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
].find(existsSync);

test('tutti i 20 tab della GUI (18 in nav + 2 nascosti): niente sovrapposizioni né pannelli fuori viewport a 256, 320, 360, 480, 1250 e 1920', { timeout: 900_000 }, async (t) => {
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
    // EVO_DATA_DIR: save e config del TOOL vivono nella copia temporanea (il
    // save vero non si tocca: lezione del 23/10).
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, EVO_DATA_DIR: DATA },
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

    // (2/11, meno tempo a muro, richiesta di Mauro) CORSIE IN PARALLELO: i 19
    // tab non girano più in FILE dentro una pagina sola per larghezza. Della
    // stessa larghezza partono TRE pagine (corsie) che corrono insieme, ognuna
    // col suo treno di tab alla stessa larghezza. Il risparmio NON tocca le
    // leggi della guardia: Chromium tiene ogni pagina in un suo processo-renderer
    // e le attese in pagina sono timer (non CPU), quindi le misure restano
    // IDENTICHE a prima — stabilità generica/dedicata con le stesse finestre,
    // sovrapposizioni e fughe dei pannelli. Gli errori JS restano attribuiti
    // per DELTA dentro la loro pagina, che qui nasce fresca a ogni larghezza
    // come a ogni corsia.
    for (const width of WIDTHS) {
      /* LE CORSIE sono la leva del ritmo: TRENIno di tab alla stessa larghezza
       * girano in parallelo. Da banco (3/11, richiesta Mauro «prova a portare le
       * corsie a 4 o 5») si misura quante ne regge la macchina senza perdere:
       * default resta 3, la forma collaudata; il numero al soffio lo dà
       * EVO_LAYOUT_CORSIE (il banco è il consumatore previsto). */
      const CORSIE = Math.min(7, Number(process.env.EVO_LAYOUT_CORSIE) || 3);
      const ferrate = Array.from({ length: CORSIE }, (_, i) => TAB.filter((_, j) => j % CORSIE === i));
      const corsieLive = [];
      await Promise.all(ferrate.map(async (treno) => {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        pagine.push(page);
        corsieLive.push(page);
        page.on('pageerror', (e) => { page.__jserr ??= []; page.__jserr.push(String(e)); });
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        // aspetta che la barra di navigazione esista (la GUI disegnata di boot)
        await page.waitForFunction(() => document.querySelector('#nav button[data-tab="settings"]'), null, { timeout: 15000 });

        for (const tab of treno) {
          await assettaVista(page, tab);

          /* (3/11, tutti i tab) ATTARDI CON DIVARIO: Griglia (5 pannelli, con
           * la sede del weekend che si riempie a parte) può allungare
           * l'arrivo della geometria stabile — qui si aspetta anche il BOX
           * «carico…» svuotato, oltre alla stabilità GENERICA della sonda. */
          if (tab.id === 'griglia') {
            await page.waitForFunction(() => !document.querySelector('#wtrack-box')?.textContent.includes('carico'), null, { timeout: 15000 }).catch(() => { /* si misura comunque */ });
          }
          if (tab.id === 'dashboard') {
            await page.waitForFunction(() => document.querySelector('#dashboard-import #b-import'), null, { timeout: 15000 });
          }
          if (tab.riempimentiDedicati) await assettaRiempimentiImpostazioni(page);
          else await assettaStabilitaGenerica(page);

          const sovrapposizioni = await misuraSovrapposizioni(page);
          const blocco = righeReport(sovrapposizioni);
          const dettaglio = blocco || (page.__jserr?.length ? '  (nessuna sovrapposizione: problemi di soli errori JS)' : '');
          assert.equal(sovrapposizioni.length, 0,
            `a ${width}px il tab ${tab.nome} ha ${sovrapposizioni.length} sovrapposizioni:\n${dettaglio}`);
          // (2/11, terzo step della guardia) NESSUN PANNELLO SBORDA dalla
          // viewport in orizzontale: lo stesso tab, il momento in cui sta
          // la geometria di sovrapposizione — le plotte morte non contano
          // (ancestors col clipping, details chiuse, invisibili: leggi
          // nella sonda). L'errore porta CHI sborda, di quanto e in che
          // contenuto nasce, come le sovrapposizioni.
          const fughe = await misuraPanelliFuoriViewport(page);
          assert.equal(fughe.length, 0,
            `a ${width}px il tab ${tab.nome} ha ${fughe.length} pannello/i fuori viewport in orizzontale:\n${righeFughe(fughe)}`);
          // 6/11 — IL DOCUMENTO NON DEVE SCORRERE (richiesta Mauro: «nemmeno a
          // 256 px»): il guard sui pannelli non vede la nav né gli elementi
          // fuori dai pannelli, quindi a OGNI larghezza misuriamo anche la
          // scrollWidth globale. La nav ha la sua barra interna; non può
          // allargare il documento all'esterno.
          const overflow = await page.evaluate(() => {
            const viewport = document.documentElement.clientWidth;
            const clipped = (el) => {
              for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
              }
              return false;
            };
            return {
              document: document.documentElement.scrollWidth,
              viewport,
              elements: [...document.querySelectorAll('body *')]
                .map((el) => ({ el, rect: el.getBoundingClientRect() }))
                .filter(({ el, rect }) => rect.width > 0 && rect.right > viewport + 1 && !clipped(el))
                .slice(0, 8)
                .map(({ el, rect }) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().replace(/\\s+/g, '.')}` : ''} right=${Math.round(rect.right)} text=${el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 45)}`),
            };
          });
          assert.equal(overflow.document, overflow.viewport,
            `a ${width}px il tab ${tab.nome} allarga il documento: scrollWidth=${overflow.document}, viewport=${overflow.viewport}\\n${overflow.elements.join('\\n')}`);
          // (3/11, più tab nella stessa pagina) GLI errori JS si attribuiscono
          // per DELTA dentro la STESSA corsia: gli errori dei tab già visitati
          // restano contati, il confronto guarda solo i NUOVI del tab corrente
          const errPrima = tab.__errPrima ?? 0;
          tab.__errPrima = (page.__jserr ?? []).length;
          assert.equal((page.__jserr ?? []).length, errPrima,
            `a ${width}px il tab ${tab.nome} ha errori JavaScript: ${(page.__jserr ?? []).slice(errPrima).join(' ; ')}`);
        }
      }));

      // fine della larghezza: le corsie si chiudono QUI, dopo la barriera di
      // Promise.all — in vita restano TRE pagine alla volta, non una pagina
      // per ogni larghezza di test.
      for (const p of corsieLive) await p.close().catch(() => {});
    }
  } finally {
    for (const p of pagine) await p.close().catch(() => {});
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((res) => setTimeout(res, 200));
  }
});
