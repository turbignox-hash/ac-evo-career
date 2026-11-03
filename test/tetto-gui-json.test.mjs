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
//
// STESSA SCUOLA per gli altri due pannelli del tab Analisi (3/11, richiesta
// Mauro: «porta lo stesso confronto GUI-vs-JSON della guardia tetto anche ai
// pannelli Autopsia della gara e Monte Carlo»): server vero su PORTA SUA per
// ciascuno (autopsia 8746, Monte Carlo 8747), impalcato comune qui sotto
// (carrieraFinta + avviaServerAnalisi + presuppostiBrowser), pannello LETTO
// dal DOM e accostato al JSON della rispettiva API (/api/autopsy, /api/seat-mc
// con gli STESSI sims della GUI).
//
// E LA LINGUA (3/11, richiesta Mauro: «verifica che la vista Analisi e il
// tetto reggano anche a lingua EN»): OGNI confronto gira DUE volte, it ed en —
// server e cartella dati SUA per lingua (porte distinte, qui a fianco: nessuno
// conta sul rebind immediato della stessa porta), GUI con 'evo-lingua'
// FISSATO in init (niente ricarica d'adozione che sposti i tempi) e le API
// chieste CON la stessa lingua — il campo 'lingua' che il dispatcher applica
// per richiesta nel webui. Oltre ai confronti di cifra valgono i conti della
// LINGUA: legenda e testate tradotte («campione»/«champion», «stagioni per
// sedile»/«seasons per seat»), i secondi col SEPARATORE della lingua
// (dec() — virgola a it, PUNTO a en) e la marcatura «griglia non in
// archivio»/«grid not in archive» dichiarata nella lingua della pagina.
// Le due stringhe vive del tetto che stavano FUORI da tr() («— senza dati»
// e la tag «picco») sono passate per tr() al modulo: la guardia EN le
// controlla con la parola della lingua (senza dati/no data, picco/peak).
// Per la Monte Carlo il confronto è legale
// solo perché la simulazione è DETERMINISTICA: seme fisso
// `seatmc|nodo|stagione|diff|sims` (src/analisi.mjs) — due POST /api/seat-mc
// con gli stessi argomenti rispondono identiche, GUI e test chiedono 400.

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
const PORT_AUTOPSIA = 8746; // idem: la replica dell'autopsia ha il server SUO, non condivide la porta
const PORT_MC = 8747;       // idem per la replica Monte Carlo
const PORT_EN = 8748;           // replica del TETTO alla lingua EN: porta sua per la
const PORT_AUTOPSIA_EN = 8749;  // lega dei due giri (it · en) — nessuno conta sul
const PORT_MC_EN = 8750;        // rebind immediato della porta giusta uscita da poco
const PORT_AUT_VUOTA = 8751;    // replica del CASO VUOTO dell'autopsia (carriera senza gare)
const PORT_AUT_VUOTA_EN = 8752; // idem per il giro EN

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

/* — IMPALCATO COMUNE dei tre confronti (3/11, estensione richiesta Mauro):
 * UNA carriera finta che alimenta i pannelli del tab Analisi e l'avvio del
 * server su porta SUA con attesa del battito. La carriera porta i campi che
 * l'AUTOPSIA legge (at/gridSize/laps/points/gridPosition/bestLap/gapMs…)
 * DENTRO le stesse gare del tetto: i settori restano IDENTICI
 * al bit, le aggiunte non toccano ciò che la guardia del tetto già guardava.
 * La gara che l'autopsia APRE è la più recente per `at`: Monza P2, margine sul
 * precedente con gli stessi giri (P2 → P1 0,80 s), griglia P4, giri/punti
 * pieni; bestLap stringa come la scrive il file risultato. */
const carrieraFinta = (node0) => ({
  version: 1,
  driver: { name: 'Pilota Prova', nation: 'IT' }, money: 1000, messages: [],
  node: node0.nodeId, season: 1, round: 0,
  difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
  raceSettings: {},
  results: { [node0.nodeId]: [
    { at: '2026-11-01T10:00:00', track: 'Monza', season: 1, round: 1, position: 2, dnf: false,
      gridSize: 20, laps: 15, points: 18, gridPosition: 4, bestLap: '1:40.300',
      gapMs: 2500, winnerLaps: 15, prevGapMs: 800, prevLaps: 15,
      sectors: { bestLapMs: 100300, theoreticalMs: 99850, sectors: [{ index: 1, deltaMs: 250 }, { index: 2, deltaMs: 200 }, { index: 3, deltaMs: null }] } },
    { at: '2026-10-30T10:00:00', track: 'Monza', season: 1, round: 0, position: 3, dnf: false,
      gridSize: 20, laps: 12, points: 15, gridPosition: 6, bestLap: '1:40.500',
      gapMs: 4500, winnerLaps: 12, prevGapMs: 1800, prevLaps: 12,
      sectors: { bestLapMs: 100500, theoreticalMs: 99800, sectors: [{ index: 1, deltaMs: 300 }, { index: 2, deltaMs: 400 }, { index: 3, deltaMs: null }] } },
    // la pista della LEZIONE SUZUKA: 0,00 senza campo vivo NON è un punteggio —
    // riparto assente (worstSectorDeltaMs null), fuori dalla tabella disegnata
    { at: '2026-10-29T10:00:00', track: 'Vuota Seca', season: 1, round: 2, position: 1, dnf: false,
      gridSize: 20, laps: 10, points: 25, gridPosition: 1, bestLap: '1:38.000',
      sectors: { sectors: [
        { index: 1, deltaMs: 0, fieldCount: 0 }, { index: 2, deltaMs: 0, fieldCount: 0 }, { index: 3, deltaMs: 0, fieldCount: 0 },
      ] } },
  ] },
  stats: { bestLaps: {} }, agenda: { day: 1 }, titles: [],
  // il parco piloti: l'avvio POST-boots lo semina, il save finto parte senza —
  // senza questa riga /api/boot esplode «reading 'drivers'» (visto sulla sonda)
  world: { drivers: [] },
});

/* I due presupposti (browser = ambiente, non codice) sono skip DICHIARATO col
 * perché, come la guardia di layout: chromium va chiesto a mano alla cache.
 * Condiviso dai tre confronti. */
async function presuppostiBrowser(t) {
  if (!existsSync(join(ROOT, 'node_modules', 'playwright-core')))
    return t.skip('manca playwright-core: `npm install` e la guardia riparte');
  const LOCALAPPDATA = process.env.LOCALAPPDATA ?? '';
  const CHROMIUM = [
    join(LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'),
    join(LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1223', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ].find(existsSync);
  if (!CHROMIUM)
    return t.skip(`chromium assente nella cache di Playwright (${join(LOCALAPPDATA, 'ms-playwright')}): scaricalo con \`npx playwright install chromium\``);
  return CHROMIUM;
}

/* Il server deve dire la sua su porta SUA prima del resto. L'ambiente è lo
 * stesso del test del tetto: EVO_DATA_DIR ridirige il save del TOOL (lezione
 * del bug del 23/10) e ACE_DATA la cartella dati del GIOCO (Results, log). */
async function avviaServerAnalisi(port, data) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(port), EVO_DATA_DIR: data, ACE_DATA: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr += d; });
  const base = `http://127.0.0.1:${port}`;
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const via = setInterval(async () => {
      if (child.exitCode !== null) { clearInterval(via); rej(new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${port} occupata o errore all'avvio\n${stderr.slice(-400)}`)); }
      try { const r = await fetch(`${base}/api/watcher?probe=1`); if (r.ok) { clearInterval(via); res(); } } catch { /* non ancora su */ }
      if (Date.now() - t0 > 12000) { clearInterval(via); rej(new Error(`server muto su ${base} in 12 s\n${stderr.slice(-400)}`)); }
    }, 250);
  });
  return { child, stderr, base };
}

test('tabella Tetto teorico in GUI = JSON di /api/tetto, riga per riga', { timeout: 180_000 }, async (t) => {
  const CHROMIUM = await presuppostiBrowser(t);
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
  const { chromium } = await import('playwright-core');
  const { assettaVista } = await import('./_layout-probe.mjs');
  /* LE DUE LINGUE (3/11, richiesta Mauro): stessa carriera finta, server e
   * cartella dati SUA per lingua, GUI con 'evo-lingua' FISSATO in init e le
   * API chieste con il campo 'lingua' come le chiama il browser. */
  for (const [lingua, port] of [['it', PORT], ['en', PORT_EN]]) {
    const DATA = mkdtempSync(join(tmpdir(), 'evo-tetto-gui-'));
    mkdirSync(join(DATA, 'Results'), { recursive: true });
    writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(carrieraFinta(node0)));

    const { child, base } = await avviaServerAnalisi(port, DATA);
    const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
    try {
    /* 1) IL JSON: la fonte di verità, richiesta PRIMA del browser — POST col
     * campo 'lingua', la STESSA chiamata che la GUI fa dalla pagina */
    const r = await fetch(`${base}/api/tetto`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lingua }),
    });
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
    /* la lingua FISSATA prima dei copioni del sito per ENTRAMBE le giri:
     * senza, il cookie-less adotta /api/lang con una RICARICA che sposta i
     * tempi dell'attesa (lezione già presa nelle altre due repliche) */
    await page.addInitScript((l) => { try { localStorage.setItem('evo-lingua', l); } catch { /* pagina non ancora pronta */ } }, lingua);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
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

    /* LEGENDA E NUMERI alla LINGUA (3/11, richiesta Mauro): la legenda lunga
     * della testa parla la lingua della GUI («campione»/«champion») e i
     * secondi delle celle usano il SEPARATORE della lingua — virgola a it,
     * PUNTO a en (dec() del core). Il confronto di cifra resta a NUMERI:
     * msDi sopra decifra entrambi i separatori. */
    const testa = await page.evaluate(() => document.querySelector('#an-tetto h2')?.textContent ?? '');
    assert.ok(lingua === 'en' ? /champion/.test(testa) : /campione/.test(testa),
      `la legenda del tetto deve parlare ${lingua} (testa: «${testa.slice(0, 160)}…»)`);
    const monzaGui = righeGui.find((x) => (x.track ?? '').toLowerCase().includes('monza'));
    assert.ok(monzaGui, `la riga Monza deve comparire in GUI (righe: ${righeGui.map((x) => x.track).join(', ')})`);
    if (lingua === 'en')
      assert.ok(/\d\.\d\d/.test(monzaGui.reparto) && !monzaGui.reparto.includes(','),
        `in EN i secondi devono usare il PUNTO decimale (riga: «${monzaGui.reparto}»)`);
    else
      assert.ok(/\d,\d\d/.test(monzaGui.reparto),
        `in it i secondi usano la virgola decimale (riga: «${monzaGui.reparto}»)`);

    for (const j of veri) {
      const g = righeGui.find((x) => (x.track ?? '').toLowerCase() === (j.track ?? '').toLowerCase());
      assert.ok(g, `la riga ${j.track} non compare in GUI (righe: ${righeGui.map((x) => x.track).join(', ')})`);
      const dove = `riga «${j.track}»`;
      /* la parola del picco parla la lingua del pannello (3/11): la tag della
       * cella è passata per tr() — «picco» a it, «peak» a en */
      const parolaPicco = lingua === 'en' ? 'peak' : 'picco';
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
        assert.ok(g.reparto.toLowerCase().includes(parolaPicco),
          `${dove}: il JSON porta un picco (${j.picco.deltaMs} ms su S${j.picco.sector}) ma la GUI non grida «${parolaPicco}» (riga: «${g.reparto}»)`);
        // la parola si cerca a presa larga (capo o minuscolo che sia, la GUI
        // e la sua lingua possono scriverla come vogliono): il SETTORE e il
        // VALORE si confrontano sul testo ORIGINALE dopo la parola
        const idxPicco = g.reparto.toLowerCase().indexOf(parolaPicco);
        const dopoPicco = idxPicco >= 0 ? g.reparto.slice(idxPicco + parolaPicco.length) : '';
        assert.ok(idxPicco >= 0,
          `${dove}: il JSON porta un picco (${j.picco.deltaMs} ms su S${j.picco.sector}) ma la GUI non grida «${parolaPicco}» (riga: «${g.reparto}»)`);
        assert.ok(Math.abs((msDi(dopoPicco) ?? 0) - j.picco.deltaMs) <= 10,
          `${dove}: il VALORE del picco diverge (GUI «${g.reparto}» decifra ${msDi(dopoPicco)} vs JSON ${j.picco.deltaMs})`);
        // il settore del picco si ripete SOLO se diverso dalla mediana
        if (j.picco.sector !== j.worstSector)
          assert.ok(new RegExp(`(\\b|-)S${j.picco.sector}(\\b|\\s)`).test(dopoPicco),
            `${dove}: il picco (S${j.picco.sector} ≠ mediana S${j.worstSector}) non nomina il SUO settore (GUI «${g.reparto}»)`);
      } else {
        assert.ok(!new RegExp(parolaPicco, 'i').test(g.reparto), `${dove}: la GUI grida «${parolaPicco}» ma il JSON non lo porta (riga: «${g.reparto}»)`);
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
  }
});

/* — Replica DELL'AUTOPSIA (3/11): i sei KPI disegnati (Esito · Punti · Giri ·
 * margine (sul precedente / sul vincitore) · Giro veloce · Partenza → arrivo),
 * LE CAGIONI (le righe con tag: causa per causa) e la marcatura «griglia non
 * in archivio» quando il registro rivali non c'è — il JSON la dice
 * hasRaceRow:false, la GUI NON deve fingere confronti sul giro. */ 
test('Autopsia della gara in GUI = JSON di /api/autopsy, KPI e cause a confronto (it ed EN)', { timeout: 180_000 }, async (t) => {
  const CHROMIUM = await presuppostiBrowser(t);
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const node0 = ladder.nodes.slice().sort((a, b) => a.level - b.level)[0];
  const { chromium } = await import('playwright-core');
  const { assettaVista } = await import('./_layout-probe.mjs');
  /* LE DUE LINGUE (3/11): lo stesso skeletto, server e cartella dati SUA
   * per lingua, API e GUI alla STESSA lingua per richiesta */
  for (const [lingua, port] of [['it', PORT_AUTOPSIA], ['en', PORT_AUTOPSIA_EN]]) {
    const DATA = mkdtempSync(join(tmpdir(), 'evo-autopsia-gui-'));
    mkdirSync(join(DATA, 'Results'), { recursive: true });
    writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(carrieraFinta(node0)));

    const { child, base } = await avviaServerAnalisi(port, DATA);
    const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
    try {
    /* 1) IL JSON: la fonte di verità, chiamata COME LA GUI la chiama (l'azione
     * sta nell'URL, il body porta i dati E la lingua: il server applica la
     * lingua per richiesta nel dispatcher — i testi del JSON e della GUI
     * parlano così la STESSA lingua, non per caso ma per legge). */
    const r = await fetch(`${base}/api/autopsy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lingua }),
    });
    assert.equal(r.status, 200, '/api/autopsy deve rispondere 200');
    const api = await r.json();
    assert.equal(api.ok, true, '/api/autopsy deve dire ok');
    const e = api.entry;
    assert.equal(e.position, 2, `la carriera finta apre la P2 di Monza ma il JSON porta P${e.position}`);
    assert.equal(api.round, 1, `la gara aperta deve essere la più recente per at (R2 attesa, JSON dice R${api.round + 1})`);

    /* 2) LA GUI: tab Analisi aperto e le sue GETTURE assestate (l'autopsia è      * pannello uno, riempito con le tre chiamate del Promise.all di drawAnalisi) */
    const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
    /* la lingua FISSATA prima dei copioni del sito: senza, il cookie-less
     * adotta /api/lang con una RICARICA che sposta i tempi dell'attesa —
     * scritta dentro, la vista è stabile dalla prima letta */
    await page.addInitScript((l) => { try { localStorage.setItem('evo-lingua', l); } catch { /* pagina non ancora pronta */ } }, lingua);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#nav button[data-tab="analisi"]'), null, { timeout: 15000 });
    await assettaVista(page, { id: 'analisi', marker: '#an-tetto', pannelli: 1 });
    await page.waitForFunction(() => document.querySelectorAll('#an-autopsia .grid6 .kpi').length === 6, null, { timeout: 15000 });

    /* 3) LA LETTURA del DOM: i SEI KPI per etichetta e valore (in ordine:
     * Esito · Punti · Giri · margine · Giro veloce · Partenza → arrivo),
     * le tag delle cagioni e le testate del pannello */
    const kpiGui = await page.evaluate(() => {
      const host = document.querySelector('#an-autopsia');
      return {
        header: host.querySelector('h2')?.textContent.trim() ?? '',
        kpi: [...host.querySelectorAll('.grid6 .kpi')].map((k) => ({
          l: k.querySelector('.l')?.textContent.trim() ?? '',
          v: k.querySelector('.v')?.textContent.trim() ?? '',
        })),
        tag: [...host.querySelectorAll('span.tag')].map((x) => x.textContent.trim()),
        testo: host.textContent,
      };
    });

    /* 4) LA FITTA-FITTA, KPI per KPI */
    assert.equal(kpiGui.kpi.length, 6, `il pannello deve disegnare SEI KPI (visti: ${kpiGui.kpi.length})`);
    assert.match(kpiGui.header, /S1\s*R2/, `l'intestazione deve dire la S1 R2 della gara aperta (testa: «${kpiGui.header}»)`);
    assert.ok(kpiGui.header.includes(api.node), `l'intestazione deve nominare la serie del JSON («${api.node}» vs «${kpiGui.header}»)`);
    // la LINGUA (3/11, richiesta Mauro): le etichette dei KPI sono tr() del
    // pannello e la marcatura senza archivio parla la lingua della pagina
    assert.equal(kpiGui.kpi[0].l, lingua === 'en' ? 'Result' : 'Esito',
      `la prima etichetta deve parlare ${lingua} (vista: «${kpiGui.kpi[0].l}»)`);
    assert.equal(kpiGui.kpi[0].v, `P${e.position}/${e.gridSize}`, `ESITO diverge (GUI «${kpiGui.kpi[0].v}» vs JSON P${e.position}/${e.gridSize})`);
    assert.equal(kpiGui.kpi[1].v, `+${e.points}`, `PUNTI divergono (GUI «${kpiGui.kpi[1].v}» vs JSON +${e.points})`);
    assert.equal(kpiGui.kpi[2].v, String(e.laps), `GIRI divergono (GUI «${kpiGui.kpi[2].v}» vs JSON ${e.laps})`);
    // il MARGINE (P2 → margine sul precedente): con gli stessi giri del
    // precedente il numero c'è e combacia; se il JSON lo tacesse, la GUI
    // non deve disegnare numeri
    assert.ok(/P1/.test(kpiGui.kpi[3].l), `la quarta etichetta deve dire SU CHI è il margine P2 → P1 («${kpiGui.kpi[3].l}»)`);
    if (e.prevGapMs != null && e.prevLaps === e.laps)
      assert.ok(Math.abs((msDi(kpiGui.kpi[3].v) ?? 0) - e.prevGapMs) <= 10,
        `MARGINE diverge (GUI «${kpiGui.kpi[3].v}» = ${msDi(kpiGui.kpi[3].v)} ms vs JSON ${e.prevGapMs} ms)`);
    else
      assert.match(kpiGui.kpi[3].v, /—/, `margine tacito nel JSON ma la GUI disegna «${kpiGui.kpi[3].v}»`);
    // il GIRO VELOCE: senza registro rivali la gara non può dire chi l'ha
    // firmato, il KPI resta il TUA best del file risultato
    assert.ok(kpiGui.kpi[4].v.includes(e.bestLap), `GIRO VELOCE diverge (GUI «${kpiGui.kpi[4].v}» vs JSON ${e.bestLap})`);
    assert.equal(kpiGui.kpi[5].v, `P${e.gridPosition} → P${e.position}`, `PARTENZA → arrivo diverge (GUI «${kpiGui.kpi[5].v}» vs JSON P${e.gridPosition} → P${e.position})`);

    /* 5) LE CAGIONI: una tag per causa, STESSA LISTA in GUI e JSON —
     * titolo e testo OGNUNO presenti nel pannello (esc() non mordendo
     * testo senza markup, si può sostenere la parola) */
    assert.equal(kpiGui.tag.length, api.attributions.length,
      `le cause divergono: GUI ${kpiGui.tag.length} tag vs JSON ${api.attributions.length} (JSON: ${api.attributions.map((a) => a.title).join(', ')})`);
    for (const a of api.attributions) {
      assert.ok(kpiGui.tag.includes(a.title), `la causa «${a.title}» (tag JSON) non compare tra le tag della GUI (viste: ${kpiGui.tag.join(', ')})`);
      assert.ok(kpiGui.testo.includes(a.text), `il testo della causa «${a.title}» non compare nel pannello: «${a.text.slice(0, 80)}…»`);
    }

    /* 6) L'ONESTÀ del caso SENZA archivio: il registro rivali nella finta
     * cartella non c'è, il JSON lo dice hasRaceRow:false — la GUI deve
     * stampare la marcatura al posto di fingere confronti sul giro */
    assert.equal(api.hasRaceRow, false, 'la carriera finta non ha il registro rivali: il JSON deve dirlo');
    assert.match(kpiGui.testo, lingua === 'en' ? /grid not in archive/ : /griglia non in archivio/,
      'senza archivio la GUI deve DIRE la marcatura nella LINGUA della pagina invece di fingere confronti sul giro');
    assert.ok(!kpiGui.testo.includes('campo-top'), 'senza griglia in archivio la GUI non deve inventare il confronto con il campo-top');
    } finally {
      await browser.close().catch(() => {});
      child.kill();
      await new Promise((res) => setTimeout(res, 200));
    }
  }
});

/* — REPLICA del CASO VUOTO (3/11, richiesta Mauro: «Metti il nome della serie
 * corrente nel messaggio vuoto dell'autopsia («Nessuna gara ancora in <serie>»)
 * con test»): la carriera FINTA qui NON ha gare (results svuotati): il JSON
 * risponde col SUO messaggio di eiezione, la GUI lo stampa nel box .empty.
 * La serie nel messaggio NON si copia a mano: la si TRAE da un'altra fonte
 * legale, la base della Monte Carlo (basis.current — stesso ladder localizzato
 * alla STESSA lingua). Server e browser SUA per lingua. */
test('Autopsia del vuoto: «Nessuna gara ancora in <serie>» nomina la serie corrente, JSON = GUI (it ed EN)', { timeout: 180_000 }, async (t) => {
  const CHROMIUM = await presuppostiBrowser(t);
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const node0 = ladder.nodes.slice().sort((a, b) => a.level - b.level)[0];
  const { chromium } = await import('playwright-core');
  const { assettaVista } = await import('./_layout-probe.mjs');
  for (const [lingua, port] of [['it', PORT_AUT_VUOTA], ['en', PORT_AUT_VUOTA_EN]]) {
    const DATA = mkdtempSync(join(tmpdir(), 'evo-autopsia-vuota-'));
    mkdirSync(join(DATA, 'Results'), { recursive: true });
    // STESSA carriera finta SENZA i risultati: l'autopsia non ha gare da
    // aprire e deve DIRE l'eiezione col nome della serie, non fingere KPI
    writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify({ ...carrieraFinta(node0), results: {} }));

    const { child, base } = await avviaServerAnalisi(port, DATA);
    const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
    try {
    /* 1) IL JSON e la FONTE DEL NOME: l'autopsia senza gare deve rispondere
     * col messaggio che APRE con la formula giusta per la lingua e NOMINA
     * la serie corrente — il nome lo TRAE dalla base della MC, stessa
     * lingua, così la copia nel dispatcher non finge niente */
    const r = await fetch(`${base}/api/autopsy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lingua }),
    });
    assert.equal(r.status, 200, '/api/autopsy sul vuoto deve rispondere 200');
    const api = await r.json();
    assert.ok(typeof api.error === 'string' && api.error, `senza gare il JSON deve portare il messaggio di vuoto (chiavi: ${Object.keys(api).join(', ')})`);
    const mc = await fetch(`${base}/api/seat-mc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sims: 50, lingua }),
    }).then((x) => x.json());
    assert.ok(mc.ok && mc.basis?.current, `la base della MC deve dare il nome della serie in ${lingua} (json MC: ${Object.keys(mc).join(', ')})`);
    assert.match(api.error, lingua === 'en' ? /No race yet in / : /Nessuna gara ancora in /,
      `il messaggio vuoto deve aprire con la formula giusta per ${lingua} («${api.error}»)`);
    assert.ok(api.error.includes(mc.basis.current),
      `il messaggio vuoto deve nominare la serie corrente («${api.error}» vs base MC «${mc.basis.current}»)`);

    /* 2) LA GUI: il box vuoto del pannello deve raccontare la STESSA cosa,
     * parola per parola (il pannello stampa il testo del JSON: se un giorno
     * la scrittura cambia lato, la guardia lo coglie qui) */
    const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
    await page.addInitScript((l) => { try { localStorage.setItem('evo-lingua', l); } catch { /* pagina non ancora pronta */ } }, lingua);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#nav button[data-tab="analisi"]'), null, { timeout: 15000 });
    await assettaVista(page, { id: 'analisi', marker: '#an-tetto', pannelli: 1 });
    await page.waitForFunction(() => document.querySelector('#an-autopsia .empty'), null, { timeout: 15000 });
    const vuoto = await page.evaluate(() => document.querySelector('#an-autopsia .empty')?.textContent.trim() ?? '');
    assert.equal(vuoto, api.error,
      `il messaggio vuoto della GUI deve combaciare col JSON («${vuoto}» vs «${api.error}»)`);
    } finally {
      await browser.close().catch(() => {});
      child.kill();
      await new Promise((res) => setTimeout(res, 200));
    }
  }
});

/* — REPLICA DELLA MONTE CARLO (3/11): la tabella dei sedili disegnata riga per
 * riga contro /api/seat-mc con gli STESSI sims della GUI (400). LEGALE perché
 * la simulazione ha seme fisso `seatmc|nodo|stagione|diff|sims`: due chiamate
 * con gli stessi argomenti NON tirano a sorte nient'altro. Colonne: Sedile ·
 * Punti/ronda · Punti stagione · Posto mediano · Podio · Vittorie · Titolo ·
 * Top 3 classifica · Premio atteso · Saldo stagione — PIÙ la sottoriga del
 * sedile (griglia · ronde · parco chiuso) e la base (dal, σ, DNF). */
test('tabella Monte Carlo del sedile in GUI = JSON di /api/seat-mc, riga per riga (it ed EN)', { timeout: 180_000 }, async (t) => {
  const CHROMIUM = await presuppostiBrowser(t);
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const node0 = ladder.nodes.slice().sort((a, b) => a.level - b.level)[0];
  const { chromium } = await import('playwright-core');
  const { assettaVista } = await import('./_layout-probe.mjs');
  /* LE DUE LINGUE (3/11): la stima è deterministica per SORTE (il seme non
   * prende argomenti di lingua), ili testi di base/sottoriga/caveat portano
   * la lingua della richiesta: server e cartella dati SUA per lingua */
  for (const [lingua, port] of [['it', PORT_MC], ['en', PORT_MC_EN]]) {
    const DATA = mkdtempSync(join(tmpdir(), 'evo-mc-gui-'));
    mkdirSync(join(DATA, 'Results'), { recursive: true });
    writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(carrieraFinta(node0)));

    const { child, base } = await avviaServerAnalisi(port, DATA);
    const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
    try {
    /* 1) IL JSON: corpo della GUI (sims 400) e lingua appiccicata —
     * stessa chiamata, stessa sorte */
    const r = await fetch(`${base}/api/seat-mc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sims: 400, lingua }),
    });
    assert.equal(r.status, 200, '/api/seat-mc deve rispondere 200');
    const api = await r.json();
    assert.equal(api.ok, true, '/api/seat-mc deve dire ok');
    assert.equal(api.sims, 400, `il test richiede gli STESSI sims della GUI (JSON porta ${api.sims})`);
    assert.ok(Array.isArray(api.seats) && api.seats.length, `dev'esserci almeno il rinnovo della serie corrente (seats: ${api.seats.length})`);

    /* 2) LA GUI: tab Analisi aperto e la tabella della MC assestata (arriva
     * col Promise.all di drawAnalisi, in attesa sotto) */
    const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
    await page.addInitScript((l) => { try { localStorage.setItem('evo-lingua', l); } catch { /* pagina non ancora pronta */ } }, lingua);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#nav button[data-tab="analisi"]'), null, { timeout: 15000 });
    await assettaVista(page, { id: 'analisi', marker: '#an-tetto', pannelli: 1 });
    await page.waitForFunction(() => document.querySelectorAll('#an-mc table tbody tr').length > 0, null, { timeout: 15000 });

    /* 3) LA LETTURA del DOM: testata + riga della base + tutte le righe
     * dei sedili, cella per cella (testo e classi) */
    const mcGui = await page.evaluate(() => {
      const host = document.querySelector('#an-mc');
      return {
        head2: host.querySelector('h2')?.textContent.trim() ?? '',
        base: host.querySelector('div.muted')?.textContent.trim() ?? '',
        righe: [...host.querySelectorAll('table tbody tr')].map((tr) =>
          [...tr.querySelectorAll('td')].map((td) => ({ t: td.textContent.trim(), c: td.className }))),
        testo: host.textContent,
      };
    });

    /* numeri «della valigia»: toLocaleString it-IT mette PUNTI alle migliaia
     * («1.234») e le celle percentuali portano il loro segno — la GUI e il JSON
     * parlano lo stesso NUMBER, qui si torna al numero levando tutto ciò che
     * non è cifra o segno. Niente decimali nelle valige: il server arrotonda
     * all'euro (expPrizeSeason, netSeason: Math.round), e le percentuali sono
     * intere per costruzione (Math.round). */
    const numera = (t) => Number(String(t).replace(/[^\d-]/g, '')) || 0;

    /* 4) LA FITTA-FITTA, colonna per colonna, riga per riga (l'ordine è lo
     * STESSO: il server ordina e la GUI non rimischia) */
    assert.ok(new RegExp(`\\b${api.sims}\\b`).test(mcGui.head2), `la testa deve gridare i sims (JSON ${api.sims}) — «${mcGui.head2}»`);
    /* la LINGUA (3/11, richiesta Mauro): la testa grida i sims nelle parole
     * della lingua («stagioni per sedile»/«seasons per seat») e la sottoriga
     * del sedile usa auto/cars e ronde/rounds della STESSA lingua; le valige
     * restano NUMERI (numera leva la punteggiatura di entrambi i locale) */
    assert.ok(lingua === 'en' ? /seasons per seat/.test(mcGui.head2) : /stagioni per sedile/.test(mcGui.head2),
      `la testa della MC deve parlare ${lingua} (testa: «${mcGui.head2}»)`);
    const prima = mcGui.righe[0]?.[0]?.t ?? '';
    assert.ok(lingua === 'en' ? /\bcars\b/.test(prima) : /\bauto\b/.test(prima),
      `la sottoriga del sedile deve parlare ${lingua} (sottoriga: «${prima}»)`);
    assert.equal(mcGui.righe.length, api.seats.length,
      `righe divergono: GUI ${mcGui.righe.length} vs JSON ${api.seats.length}`);
    assert.ok(mcGui.base.includes(api.basis.current), `la base deve nominare la serie corrente (JSON «${api.basis.current}» vs «${mcGui.base}»)`);
    for (const [i, s] of api.seats.entries()) {
      const r2 = mcGui.righe[i];
      const dove = `riga ${i} «${s.display}»`;
      assert.ok(r2[0].t.includes(s.display), `${dove}: il nome diverge (GUI «${r2[0].t}»)`);
      // la sottoriga del sedile: griglia e ronde in cifra, parco chiuso SOLO
      // se il JSON lo dice (access 'closed')
      assert.ok(r2[0].t.includes(String(s.gridSize)) && r2[0].t.includes(String(s.rounds)),
        `${dove}: sottoriga senza griglia/ronde (${s.gridSize} auto · ${s.rounds} ronde) — «${r2[0].t}»`);
      assert.equal((s.access === 'closed') ? /parco chiuso|closed grid/.test(r2[0].t) : !/parco chiuso|closed grid/.test(r2[0].t), true,
        `${dove}: il «parco chiuso» deve comparire SOLO quando il JSON dice access:'closed' (GUI «${r2[0].t}» vs JSON ${s.access})`);
      // punti: per ronda (un decimale) e stagione (interi) — numero al numero
      // PUNTI/RONDA: la GUI disegna il NUMERO raw del JSON (punto decimale,
      // niente simboli) → parseFloat diretto, senza scrucchiare di migliaia
      assert.ok(Math.abs(parseFloat(r2[1].t) - s.expPointsPerRound) <= 0.05,
        `${dove}: PUNTI/RONDA divergono (GUI «${r2[1].t}» vs JSON ${s.expPointsPerRound})`);

      assert.ok(Math.abs(numera(r2[2].t) - s.expSeasonPoints) <= 0.05,
        `${dove}: PUNTI STAGIONE divergono (GUI «${r2[2].t}» vs JSON ${s.expSeasonPoints})`);
      // posto mediano: P{n} o tacito (—) quando il JSON non lo sa
      if (s.medianPos == null) assert.match(r2[3].t, /—/, `${dove}: posto mediano tacito nel JSON ma la GUI scrive «${r2[3].t}»`);
      else assert.equal(r2[3].t, `P${s.medianPos}`, `${dove}: POSTO MEDIANO diverge (GUI «${r2[3].t}» vs JSON P${s.medianPos})`);
      // le QUATTRO percentuali (cella con il segno %), cella per cella
      const pct = [['podiumPct', 4], ['winPct', 5], ['titlePct', 6], ['top3StandingsPct', 7]];
      for (const [campo, col] of pct)
        assert.ok(Math.abs(numera(r2[col].t) - s[campo]) <= 0.01,
          `${dove}: la percentuale ${campo} diverge (GUI «${r2[col].t}» vs JSON ${s[campo]})`);
      // la classe del TITOLO: 'good' (verde) SOLO quando il JSON sa >= 40
      const verde = (s.titlePct ?? 0) >= 40;
      assert.equal(r2[6].c.includes('good'), verde,
        `${dove}: il verde del TITOLO diverge (JSON titlePct ${s.titlePct}, classe GUI «${r2[6].c}»)`);
      // le due valige: premio atteso e saldo stagione, euro roundo del server
      assert.ok(Math.abs(numera(r2[8].t) - s.expPrizeSeason) <= 0.5,
        `${dove}: PREMIO ATTESO diverge (GUI «${r2[8].t}» vs JSON ${s.expPrizeSeason})`);
      assert.ok(Math.abs(numera(r2[9].t) - s.netSeason) <= 0.5,
        `${dove}: SALDO STAGIONE diverge (GUI «${r2[9].t}» vs JSON ${s.netSeason})`);
      // la classe del saldo: verde se non negativo, rossa altrimenti
      assert.equal(r2[9].c.includes('good'), s.netSeason >= 0,
        `${dove}: il colore del SALDO diverge (JSON netSeason ${s.netSeason}, classe GUI «${r2[9].c}»)`);
    }
    /* 5) L'onestà della stima: il caveat del server deve starsi in GUI, così
     * chi legge sa che l'ordine di grandezza non è una promessa */
    assert.ok(mcGui.testo.includes(api.caveat), 'il caveat della stima del JSON deve comparire in GUI (onestà della stima)');
    } finally {
      await browser.close().catch(() => {});
      child.kill();
      await new Promise((res) => setTimeout(res, 200));
    }
  }
});
