import './_flows-sandbox.mjs'; // PRIMA riga: registro flussi in tmp (come webui-smoke)
// tetto-gui-json.test.mjs — LA FITTA-FITTA del Tetto teorico (3/11, richiesta
// Mauro: «confronta la tabella mostrata in GUI con il JSON di api/tetto e
// fallisci se una riga diverge»).
//
// Finora le due facce del pannello non si stringevano la mano: il JSON la
// guardava l'unit test (tettoReport), la CELLA disegnata le guardava solo gli
// occhi. Qui le due fonti sono accostate SUL VIVO: server vero su porta sua
// con una carriera FINTA che porta riparto settoriale (come il test unit),
// atteso il tab Analisi nel browser della cache di Playwright, la tabella
// disegnata arriva LETTA riga per riga dal DOM e confrontata col JSON
// dell'API: stessa lista di piste (solo le VERE con riparto, lezione Suzuka),
// stesse Gare, stessa busta, stessa mediana del reparto, stesso picco (con
// settore e valore) e stesso margine onesto. UNA riga che mente = test rosso,
// col nome della riga e l'atteso a schermo per dire chi ha mentito.
//
// I due presupposti (browser = ambiente, non codice) sono skip DICHIARATO col
// perché, come la guardia di layout: chromium va chiesto a mano alla cache.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8745;          // libera, fuori dalle porte degli altri test (8731–8737, 8741, 8743, 8744)
const BASE = `http://127.0.0.1:${PORT}`;

/* decifra-indipendente: la GUI e il JSON parlano lo stesso NUMBER ma la GUI lo
 * disegna in SECONDI con la virgola della lingua o il punto — qui si torna a
 * ms e si confronta a NUMERI, mai a stringhe. Il numero va preso SOLO quando
 * è seguito dall'unità «s»: il «3» di «S3» non è un tempo. */
const msDi = (testo) => {
  const m = String(testo).match(/[-−+]?\d+(?:[.,]\d+)?(?=\s*s\b)/);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.').replace('−', '-'));
  return Number.isFinite(n) ? Math.round(n * 1000) : null;
};

test('tabella Tetto teorico in GUI = JSON di /api/tetto, riga per riga', { timeout: 180_000 }, async (t) => {
  if (!existsSync(join(ROOT, 'node_modules', 'playwright-core')))
    return t.skip('manca playwright-core: `npm install` e la guardia riparte');
  const LOCALAPPDATA = process.env.LOCALAPPDATA ?? '';
  const CHROMIUM = [
    join(LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
    join(LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1223', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ].find(existsSync);
  if (!CHROMIUM)
    return t.skip(`chromium assente nella cache di Playwright (${join(LOCALAPPDATA, 'ms-playwright')}): scaricalo con \`npx playwright install chromium\``);

  // carriera FINTA (l'assetto del test unit di tettoReport): Monza due gare
  // — mediana S1 250 ms, picco S2 400 ms al round 0, busta 400, margine vero
  // assente (niente log del gioco nella finta cartella) — e «Vuota Seca»: solo
  // settori a 0 SENZA campo vivo, la pista della lezione Suzuka che deve restare
  // FUORI dalla tabella. Il save vive in una cartella dati TEMPORANEA:
  // EVO_DATA_DIR ridirige il save del TOOL (la lezione del bug del 23/10 —
  // il vecchio data dir fisso leggeva il save reale anche nei test),
  // ACE_DATA ridirige la cartella dati del GIOCO (Results, log).
  // Il nodo NON è inventato («serie_gt3» non esiste nel ladder vero — errore
  // del boot «Serie sconosciuta», visto sul vivo con la sonda): è il PRIMO
  // nodo del ladder reale (livello più basso, come fa clear-consiglio).
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const node0 = ladder.nodes.slice().sort((a, b) => a.level - b.level)[0];
  const DATA = mkdtempSync(join(tmpdir(), 'evo-tetto-gui-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const state = {
    version: 1,
    driver: { name: 'Pilota Prova', nation: 'IT' }, money: 1000, messages: [],
    node: node0.nodeId, season: 1, round: 0,
    difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
    raceSettings: {},
    results: { [node0.nodeId]: [
      { track: 'Monza', season: 1, round: 0, position: 3, dnf: false, sectors: { bestLapMs: 100500, theoreticalMs: 99800, sectors: [{ index: 1, deltaMs: 300 }, { index: 2, deltaMs: 400 }, { index: 3, deltaMs: null }] } },
      { track: 'Monza', season: 1, round: 1, position: 2, dnf: false, sectors: { bestLapMs: 100300, theoreticalMs: 99850, sectors: [{ index: 1, deltaMs: 250 }, { index: 2, deltaMs: 200 }, { index: 3, deltaMs: null }] } },
      // la pista della LEZIONE SUZUKA: 0,00 senza campo vivo NON è un punteggio —
      // riparto assente (worstSectorDeltaMs null), fuori dalla tabella disegnata
      { track: 'Vuota Seca', season: 1, round: 2, position: 1, dnf: false, sectors: { sectors: [
        { index: 1, deltaMs: 0, fieldCount: 0 }, { index: 2, deltaMs: 0, fieldCount: 0 }, { index: 3, deltaMs: 0, fieldCount: 0 },
      ] } },
    ] },
    stats: { bestLaps: {} }, agenda: { day: 1 }, titles: [],
    // il parco piloti: l'avvio POST-boots lo semina, il save finto parte senza —
    // senza questa riga /api/boot esplode «reading 'drivers'» (visto sulla sonda)
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
  const { assettaVista } = await import('./_layout-probe.mjs');
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

    /* 1) IL JSON: la fonte di verità, richiesta PRIMA del browser */
    const r = await fetch(`${BASE}/api/tetto`);
    assert.equal(r.status, 200, '/api/tetto deve rispondere 200');
    const api = await r.json();
    assert.equal(api.ok, true, '/api/tetto deve dire ok');
    const veri = api.perTrack.filter((x) => x.worstSectorDeltaMs != null);
    assert.ok(veri.length, `il JSON deve avere almeno una pista con riparto vero (la carriera finta lo garantisce) — chiavi: ${Object.keys(api).join(', ')}`);
    const monza = veri.find((x) => (x.track ?? '').includes('Monza'));
    assert.ok(monza, `il JSON deve nominare Monza (piste: ${veri.map((x) => x.track).join(', ')})`);

    /* 2) LA GUI: tab Analisi, la vista con il pannello Tetto (la sonda
     * aspetta il marcatore #an-tetto) — Poi il tbody: la tabella arriva
     * ASINCRONO con il fetch dell'API, in attesa sotto */
    const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#nav button[data-tab="analisi"]'), null, { timeout: 15000 });
    await assettaVista(page, { id: 'analisi', marker: '#an-tetto', pannelli: 1 });
    // la tabella arriva ASINCRONO (fetch /api/tetto al click): si aspetta il tbody
    await page.waitForFunction(() => {
      const tab = [...document.querySelectorAll('#an-tetto table')].find((x) =>
        /Pista|Track/.test(x.querySelector('thead th')?.textContent ?? ''));
      return tab && tab.querySelectorAll('tbody tr').length > 0;
    }, null, { timeout: 15000 });

    /* 3) LA LETTURA del DOM: per ogni riga (td) portiamo a casa i cinque campi
     * disegnati — Pista | Gare | Busta | Reparto che pesa | Margine vero */
    const righeGui = await page.evaluate(() => {
      const tab = [...document.querySelectorAll('#an-tetto table')].find((x) =>
        /Pista|Track/.test(x.querySelector('thead th')?.textContent ?? ''));
      return [...tab.querySelectorAll('tbody tr')].map((tr) => {
        const tds = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
        return { track: tds[0], gare: tds[1], busta: tds[2], reparto: tds[3], margine: tds[4] };
      });
    });

    /* 4) LA FITTA-FITTA: stessa lista di righe, stessa «vita» per riga */
    assert.equal(righeGui.length, veri.length,
      `la GUI mostra ${righeGui.length} righe ma il JSON ne dichiara ${veri.length} (piste JSON: ${veri.map((x) => x.track).join(', ')})`);
    const sortJson = veri.map((x) => (x.track ?? '').toLowerCase()).sort();
    const sortGui = righeGui.map((x) => (x.track ?? '').toLowerCase()).sort();
    assert.deepEqual(sortGui, sortJson, `le piste divergono: GUI ${sortGui.join(', ')} vs JSON ${sortJson.join(', ')}`);

    for (const j of veri) {
      const g = righeGui.find((x) => (x.track ?? '').toLowerCase() === (j.track ?? '').toLowerCase());
      assert.ok(g, `la riga ${j.track} non compare in GUI (righe: ${righeGui.map((x) => x.track).join(', ')})`);
      const dove = `riga «${j.track}»`;
      assert.equal(Number(g.gare), j.sessions, `${dove}: le Gare divergono (GUI ${g.gare} vs JSON ${j.sessions})`);

      // la BUSTA (delta sul campione top): lo stesso numero in GUI e JSON,
      // a MEO DI ARROTONDAMENTO (la GUI disegna due decimali, il JSON
      // porta i ms pieni: 22199 → 22,20s = 22200 — 1 ms non è una bugia)
      if (j.campTopDeltaMs == null) assert.equal(g.busta.trim(), '—', `${dove}: busta dove il JSON non la porta`);
      else assert.ok(Math.abs((msDi(g.busta) ?? 0) - j.campTopDeltaMs) <= 10,
        `${dove}: la BUSTA diverge (GUI «${g.busta}» = ${msDi(g.busta)} vs JSON ${j.campTopDeltaMs})`);

      // il REPARTO che pesa: mediana di tettoReport + il picco se c'è
      const msReparto = msDi(g.reparto.split('·')[0]);
      assert.ok(Math.abs((msReparto ?? 0) - j.worstSectorDeltaMs) <= 10,
        `${dove}: la MEDIANA del reparto diverge (GUI «${g.reparto}» decifra ${msReparto} ms vs JSON ${j.worstSectorDeltaMs} ms)`);
      assert.ok(new RegExp(`(\\b|-)S${j.worstSector}(\\b|\\s)`).test(g.reparto),
        `${dove}: il reparto non nomina il settore S${j.worstSector} (GUI «${g.reparto}» vs JSON S${j.worstSector})`);
      if (j.picco != null) {
        assert.ok(g.reparto.toLowerCase().includes('picco'),
          `${dove}: il JSON porta un picco (${j.picco.deltaMs} ms su S${j.picco.sector}) ma la GUI non grida «picco» (riga: «${g.reparto}»)`);
        // «picco» si cerca a presa larga: la GUI e la sua lingua possono
        // scrivere «Picco», il SETTORE si confronta sul testo ORIGINALE
        const idxPicco = g.reparto.toLowerCase().indexOf('picco');
        const dopoPicco = idxPicco >= 0 ? g.reparto.slice(idxPicco + 5) : '';
        assert.ok(idxPicco >= 0,
          `${dove}: il JSON porta un picco (${j.picco.deltaMs} ms su S${j.picco.sector}) ma la GUI non grida «picco» (riga: «${g.reparto}»)`);
        assert.ok(Math.abs((msDi(dopoPicco) ?? 0) - j.picco.deltaMs) <= 10,
          `${dove}: il VALORE del picco diverge (GUI «${g.reparto}» decifra ${msDi(dopoPicco)} vs JSON ${j.picco.deltaMs})`);
        // il settore del picco si ripete SOLO se diverso dalla mediana
        if (j.picco.sector !== j.worstSector)
          assert.ok(new RegExp(`(\\b|-)S${j.picco.sector}(\\b|\\s)`).test(dopoPicco),
            `${dove}: il picco (S${j.picco.sector} ≠ mediana S${j.worstSector}) non nomina il SUO settore (GUI «${g.reparto}»)`);
      } else {
        assert.ok(!/picco/i.test(g.reparto), `${dove}: la GUI grida «picco» ma il JSON non lo porta (riga: «${g.reparto}»)`);
      }

      // il margine vero: nella carriera finta non ci sono log, il JSON deve
      // dirlo assente — e la GUI non deve fingere un numero
      if (j.margineMs == null)
        assert.match(g.margine, /—|–|n\/d|senza|no data|-$/i, `${dove}: margine assente nel JSON ma la GUI disegna «${g.margine}»`);
      else
        assert.ok(Math.abs((msDi(g.margine) ?? 0) - j.margineMs) <= 10, `${dove}: il margine vero diverge (GUI «${g.margine}» = ${msDi(g.margine)} vs JSON ${j.margineMs})`);
    }

    /* 5) L'ONESTÀ della GUI verso le piste SENZA riparto: il JSON le porta
     * nella lista ma col campo VUOTO, la GUI NON deve disegnarle come righe
     * di tetto con numeri finti (lezione Suzuka) */
    const senzaCampo = api.perTrack.filter((x) => x.worstSectorDeltaMs == null);
    assert.ok(Array.isArray(api.perTrack), `il JSON non porta perTrack come lista (chiavi: ${Object.keys(api).join(', ')})`);
    for (const j of senzaCampo)
      assert.ok(!righeGui.some((g) => (g.track ?? '').toLowerCase() === (j.track ?? '').toLowerCase()),
        `la pista senza riparto «${j.track ?? '(senza nome)'}» NON deve comparire nella tabella della GUI (lezione Suzuka)`);
  } finally {
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((res) => setTimeout(res, 200));
  }
});
