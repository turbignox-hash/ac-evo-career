// uiapp-installata.test.mjs — LA GUARDIA DELLE APP IN GIOCO (1/11, richiesta
// Mauro: «estendi la guardia anche ai file .src.js e alla loro copia installata»).
//
// La guardia delle viste (test/viste-guard.test.mjs) copre il gui/; la legge
// del ritmo (test/uiapp-periodo.test.mjs) copre publisher ↔ costruiti nel
// WORKSPACE. Qui si mette la mano sulle pagine d'ingresso che nessuna delle
// due sorveglia davvero:
//
//   1) le SAGOME uiapp/<app>/<app>.src.js e i costruiti passano in
//      `biome check` con la config di casa (formato spento, import a mano —
//      biome.jsonc) e l'ESITO BLOCCANTE: stile sfogato a mano = test rosso;
//   2) il costruito deve portare la FIRMA della build (`const BUILD_OK`) e
//      NON avere il segnaposto residuo: un .js rigenerato male o scritto a
//      mano non passa (genera-uiapp lo scrive, la guardia lo riprende se svanisce);
//   3) la copia INSTALLATA in Saved Games\ACE\mods\uiresources\ACEUIAppLoader
//      dev'essere il costruito IDENTICO, byte per byte: è il file che EVO
//      legge a ogni slot — costruito aggiornato e copia stantia è la coppia
//      «app in gioco che parla con slot diversi dal publisher». Skip onesto
//      quando l'app non è installata (PC vergine, collaudo zip): niente
//      falso-verde. Le radici sono quelle di genera-uiapp e degli
//      installatori (savedGamesRoots di src/paths.mjs): Steam su altro disco
//      o ACE_SAVEDIR comandano qui come là.
//   4) (3/11, richiesta Mauro: «estendi la guardia anche a app.json e
//      menu.html installati: il loader li legge a ogni avvio») — le DUE
//      PAGINE D'INGRESSO: app.json installato = sorgente byte per byte
//      (la carta d'identità che il loader rilegge a ogni avvio), mentre
//      menu.html NON deve ESSERCI: dichiarato in app.json ma non più
//      consegnato (lezione 27/10 ore 18:40) — una copia stantia che resta
//      nella cartella viene rilegata a ogni avvio e rimonta l'app nel SUO
//      drawer spostando il menu di EVO, la beffa appunto.
//   5) (3/11, richiesta Mauro: «estendi la stessa regola (firma con data,
//      niente markup sepolto) ai file uiapp delle app in gioco») — i
//      COMMENTI HTML di menu.html e delle sagome .src.js valgono come nel
//      gui (test/viste-guard.test.mjs): o MEMORIA con la firma della casa
//      (una data «3/11» nel corpo) o dubbia spazzatura da cancellare, e
//      NESSUN tag dentro il commento (markup sepolto che il browser non
//      usa: si cancella o lo si racconta nel diario).
//   6) (3/11, richiesta Mauro: «aggiungi al test anche il caso "copia in
//      gioco stantia" del generatore, con un finto ACE_SAVEDIR popolato») —
//      il FLUSSO RICHIAMO: genera-uiapp si accorge che la copia installata
//      è vecchia e RICHIAVA da solo l'installatore nella STESSA run (lezione
//      «mai più copiati a mano dopo»). Qui NON si tocca la stanza vera:
//      ACE_SAVEDIR comandata a una radice finta in temp, popolata COME la
//      vera (mod ACEUIAppLoader installata: cartella app + marcatore Video)
//      ma con un cruscotto STANTIO dentro (testo vecchio ≠ costruito); il
//      generatore deve: riconoscere la stantia nel SUO log, richiamare
//      l'installatore nella STESSA run (uscire 0) e consegnare in radice
//      finta il costruito IDENTICO — e alla SECONDA run dichiararsi al
//      passo («niente da reinstallare»): il set delle app da reinstallare
//      si respopola solo quando una copia torna stantia.
//
// La legge del ritmo resta nel workspace (test/uiapp-periodo.test.mjs); i
// costruiti src/*.mjs→sandbox degli installatori (test/installa-gioco.test.mjs,
// test/installatore-sandbox.test.mjs) restano in SANDBOX come sono. Questa è
// la stanza VERA del gioco, dove l'utente vede il risultato; la stanza finta
// del caso stantio (test 6) agisce SOLO in temp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { savedGamesRoots } from '../src/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP = [
  { chiave: 'cruscotto', sagoma: 'cruscotto.src.js', costruito: 'cruscotto.js' },
  { chiave: 'pitwall', sagoma: 'pitwall.src.js', costruito: 'pitwall.js' },
];
const SEGNAPSTO = '__PERIODO_MS_DAL_PUBLISHER__';

/* Biome locale: node_modules/@biomejs/biome/bin/biome, avviato con la config
 * di casa (cwd ROOT = biome.jsonc). node lo lancia direttamente (verified 2.3.12).
 * Se il pacchetto devDependency manca, la guardia salta DICHIARATO: non un falso-verde. */
const BIOME = join(ROOT, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');

test('SAGOME E COSTRUITI sono biome-puliti con la config di casa (check completo, esito bloccante)', (t) => {
  if (!existsSync(BIOME)) return t.skip('@biomejs/biome non installato: il lint di package.json lo prende, qui non fingo');
  const daGuardare = APP.flatMap(({ chiave, sagoma, costruito }) =>
    [sagoma, costruito].map((f) => join(ROOT, 'uiapp', chiave, f)),
  ).filter((f) => existsSync(f));
  assert.ok(daGuardare.length >= 4, `attese le 4 pagine delle app (2 sagome + 2 costruiti), trovate ${daGuardare.length}`);
  const r = spawnSync(process.execPath, [BIOME, 'check', ...daGuardare], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `biome check non passa sulle app in gioco:\n${r.stdout || r.stderr}`);
});

test('COSTRUITI CON FIRMA: BUILD_OK scritto dalla build e NESSUN segnaposto residuo', () => {
  for (const { chiave, costruito } of APP) {
    const via = join(ROOT, 'uiapp', chiave, costruito);
    assert.ok(existsSync(via), `${chiave}/${costruito} assente: rigenera con node tools/genera-uiapp.mjs`);
    const testo = readFileSync(via, 'utf8');
    assert.ok(!testo.includes(SEGNAPSTO),
      `${chiave}: segnaposto residuo nel costruito — la build non ha mai rimbanato (node tools/genera-uiapp.mjs).`);
    assert.ok(testo.includes('const BUILD_OK = true;'),
      `${chiave}: manca la firma BUILD_OK — il costruito non è quello fresco della build.`);
  }
});

test('COPPIA IN GIOCO ALLINEATA: la copia installata è il costruito, byte per byte', (t) => {
  const radici = savedGamesRoots();
  if (!radici.length) return t.skip('nessuna cartella Saved Games: PC senza il profilo di gioco, niente stanza vera da guardare');
  const installazioni = {};
  for (const { chiave, costruito } of APP) {
    for (const root of radici) {
      const p = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', chiave, costruito);
      if (existsSync(p)) { installazioni[chiave] = p; break; }
    }
  }
  if (!Object.keys(installazioni).length) {
    return t.skip('app non installate in gioco (loader assente): installatore-gioco.test la sorveglia in sandbox, qui niente da guardare');
  }
  for (const { chiave, costruito } of APP) {
    const via = installazioni[chiave];
    if (!via) continue; // installata una sola delle due: si guarda quella trovata
    const costruitoVivo = readFileSync(join(ROOT, 'uiapp', chiave, costruito));
    const installata = readFileSync(via);
    assert.ok(installata.equals(costruitoVivo),
      `la copia in gioco di ${chiave} (${via}) NON è identica a uiapp/${chiave}/${costruito} — rigenera con node tools/genera-uiapp.mjs (richiama gli installatori da solo).`);
  }
});

// 3/11 — LE DUE PAGINE D'INGRESSO (richiesta Mauro: «il loader li legge a
// ogni avvio e curarsi lì è la beffa tipica»). Stessa stanza vera del test
// sopra, stesso skip: app non installata → niente da guardare qui.
test('PAGINE D\'INGRESSO IN GIOCO: app.json = sorgente, menu.html assente', (t) => {
  const radici = savedGamesRoots();
  if (!radici.length) return t.skip('nessuna cartella Saved Games: PC senza il profilo di gioco, niente stanza vera da guardare');
  for (const { chiave } of APP) {
    let cartella = null;
    for (const root of radici) {
      const p = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', chiave);
      if (existsSync(join(p, 'app.json'))) { cartella = p; break; }
    }
    if (!cartella) continue; // non installata: la coppia del costruito decide lo skip com'era
    const sorgente = join(ROOT, 'uiapp', chiave, 'app.json');
    assert.ok(existsSync(sorgente), `manca uiapp/${chiave}/app.json nel workspace: senza sorgente la guardia non può dire nulla`);
    assert.ok(readFileSync(join(cartella, 'app.json')).equals(readFileSync(sorgente)),
      `la carta d'identità in gioco (${chiave}) NON è la sorgente uiapp/${chiave}/app.json — il loader la rilegge a ogni avvio: node tools/installa-${chiave}.mjs`);
    const vecchiaPagina = join(cartella, 'menu.html');
    assert.ok(!existsSync(vecchiaPagina),
      `${chiave}: menu.html stantio in gioco (${vecchiaPagina}) — il loader lo rilegge a ogni avvio e rimonta l'app nel SUO drawer spostando il menu di EVO (lezione 27/10 ore 18:40): node tools/installa-${chiave}.mjs lo cancella`);
  }
});

// 3/11 (richiesta Mauro: «la stessa guardia anche alle fasce ui-<slot>.json»).
// Il publisher le scrive con UNA writeFileSync nuda (niente atomico: src/,
// uiapp-pub 866/895/1020) e l'app in gioco le JSON.parse a ogni tick — una
// fascia MEZZA (scrittura troncata, beffa a mano) esce rotta a schermo come
// lo era la pagina. Stessa stanza vera dei test sopra, stesso skip.
test('FASCE DEL PUBLISHER IN GIOCO: ogni ui-<slot>.json è un JSON intero (niente mezze fasce)', (t) => {
  const radici = savedGamesRoots();
  if (!radici.length) return t.skip('nessuna cartella Saved Games: PC senza il profilo di gioco, niente stanza vera da guardare');
  for (const { chiave } of APP) {
    let cartella = null;
    for (const root of radici) {
      const p = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', chiave);
      if (existsSync(join(p, 'app.json'))) { cartella = p; break; }
    }
    if (!cartella) continue; // non installata: la guardia delle pagine decide lo skip com'è
    for (const f of readdirSync(cartella).filter((f) => /^ui-\d+\.json$/.test(f))) {
      let dati = null;
      try { dati = JSON.parse(readFileSync(join(cartella, f), 'utf8')); } catch { dati = null; }
      assert.ok(dati !== null && typeof dati === 'object',
        `${chiave}: fascia guasta in gioco (${join(cartella, f)}) — l'app la JSON.parse a ogni tick e con una fascia mezza non disegna: col server aperto il publisher la riscrive intera entro il prossimo tick (avvia.cmd); se è una beffa di mano, cancellala — LE fasce le nasce SOLO il publisher`);
    }
  }
});

// 3/11 — LA STESSA REGOLA dei commenti HTML della GUI (viste-guard.test.mjs)
// arriva alle app: menu.html e le sagome .src.js portano anch'esse markup.
test('COMMENTI HTML DELLE APP: firma con data e niente markup sepolto', () => {
  const fuorilegge = [];
  for (const { chiave } of APP) {
    for (const f of ['menu.html', `${chiave}.src.js`]) {
      const via = join(ROOT, 'uiapp', chiave, f);
      if (!existsSync(via)) continue; // pitwall non porta la pagina (lezione 27/10)
      const testo = readFileSync(via, 'utf8');
      for (const m of testo.matchAll(/<!--([\s\S]*?)-->/g)) {
        const corpo = m[1].replace(/\s+/g, ' ').trim();
        if (!/\b\d{1,2}\/\d{1,2}\b/.test(corpo)) {
          fuorilegge.push(`uiapp/${chiave}/${f}: commento HTML senza data — "${corpo.slice(0, 60)}" — mettici la firma (data) o cancellalo`);
          continue;
        }
        if (/<[a-zA-Z/]/.test(corpo)) {
          fuorilegge.push(`uiapp/${chiave}/${f}: markup sepolto (tag dentro il commento) — "${corpo.slice(0, 60)}" — cancellalo: il browser non lo usa e noi lo spediamo lo stesso`);
        }
      }
    }
  }
  assert.deepEqual(fuorilegge, [], `commenti HTML fuorilegge nelle app in gioco:\n${fuorilegge.join('\n')}`);
});

// 3/11 (richiesta Mauro: «estendi la regola dei commenti HTML firmati anche
// ai file di pacchetto-amico e release, se c'è markup sepolto») — lo zip
// dell'amico è `git archive HEAD` (tools/pacchetto-amico.mjs) e la release
// parte da quello: la regola (firma con data, niente markup sepolto) vale
// quindi su TUTTO l'albero tracciato, non solo sulle app. Le LEGGI CHE
// PORTANO LA REGOLA non parlano: nei `.md` le citazioni dentro `inline code`
// e fence non sono commenti, e i due law-test (questo file e
// test/viste-guard.test.mjs) portano la regola SOTTO FORMA DI REGOLA
// (regex e documentazione) — esclusi con nome, niente falso rosso.
test('COMMENTI HTML DEL PACCHETTO: firma con data e niente markup sepolto su TUTTO l’albero tracciato', (t) => {
  const ls = spawnSync('git', ['ls-files', '--', '.'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (ls.status !== 0) return t.skip(`git non parla (clone? repo?): niente albero tracciato da vigilare\n${ls.stderr || ''}`);
  const diTesto = ['.html', '.htm', '.md', '.txt', '.js', '.mjs', '.cjs', '.css', '.json', '.jsonc', '.cmd', '.ps1', '.hpp', '.py', '.lua'];
  const vetrina = new Set(['test/uiapp-installata.test.mjs', 'test/viste-guard.test.mjs']);
  const file = ls.stdout.split(/\r?\n/)
    .map((f) => f.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('archive/') && !f.startsWith('pacchetti/'))
    .filter((f) => vetrina.has(f) === false)          // le leggi non si sorvegliano con se stesse
    .filter((f) => diTesto.some((e) => f.toLowerCase().endsWith(e)));
  // niente falso-verde: la scansione deve avere visto il markup vero del pacchetto
  for (const dovuto of ['gui/index.html', 'gui/js/viste-a.js', 'uiapp/cruscotto/menu.html', 'README.md']) {
    assert.ok(file.includes(dovuto), `la scansione del pacchetto non ha visto ${dovuto}: troppi pochi o filtro sbagliato (visti ${file.length})`);
  }
  assert.ok(file.length >= 20, `almeno 20 file di testo tracciati dentro lo zip, visti ${file.length}`);
  const fuorilegge = [];
  for (const f of file) {
    const via = join(ROOT, f);
    if (!existsSync(via)) continue; // marcato da git ma sparito a disco: il commit lo dirà
    const grezzo = readFileSync(via, 'utf8');
    // nei .md inline code e fence non sono commenti HTML: non parlano
    const testo = f.toLowerCase().endsWith('.md')
      ? grezzo.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
      : grezzo;
    for (const m of testo.matchAll(/<!--([\s\S]*?)-->/g)) {
      const corpo = m[1].replace(/\s+/g, ' ').trim();
      if (/\b\d{1,2}\/\d{1,2}\b/.test(corpo)) {
        // firmato: resta il markup sepolto da interdire
        if (/<[a-zA-Z/]/.test(corpo)) {
          fuorilegge.push(`${f}: markup sepolto nel commento firmato — "${corpo.slice(0, 60)}" — cancellalo o riscrivilo senza tag`);
        }
        continue;
      }
      fuorilegge.push(`${f}: commento HTML senza firma (data) — "${corpo.slice(0, 60)}" — mettici la firma o cancellalo: viaggerebbe nascosto nel pacchetto amico`);
    }
  }
  assert.deepEqual(fuorilegge, [], `commenti HTML fuorilegge nel PACCHETTO (tutto l'albero tracciato che git archive HEAD imballe nel pacchetto amico e nella release):\n${fuorilegge.join('\n')}`);
});

// 3/11 — IL CASO STANTIO DEL GENERATORE (richiesta Mauro): una radice Saved
// Games FINTA ma popolata COME la vera (mod ACEUIAppLoader installata: cartella
// app + file vuoto Video/ come marcatore del loader) e un cruscotto STANTIO
// dentro (testo vecchio ≠ costruito), con ACE_SAVEDIR comandata qui (vince su
// tutte le radici reali, lezione percorsi-saved-games). Il generatore gira LÌ,
// mai nella stanza vera: deve riconoscere la copia stantia nel SUO log,
// richiamare da solo l'installatore nella STESSA run (uscire 0) e consegnare in
// radice finta il costruito IDENTICO. E alla SECONDA run si dichiara al passo
// («niente da reinstallare»): il set delle app da reinstallare si respopola
// solo quando una copia torna stantia.
test('COPPIA STANTIA: genera-uiapp vede la copia vecchia e la riprova con una radice finta ACE_SAVEDIR popolata', (t) => {
  const GENERA = join(ROOT, 'tools', 'genera-uiapp.mjs');
  if (!existsSync(GENERA)) return t.skip('genera-uiapp assente: niente flusso richiamo da sorvegliare qui');

  const RADICE_FINTA = mkdtempSync(join(tmpdir(), 'ac-career-saved-'));
  // la mod installata COME la vera: cartella app con sorgente + costruito, e il
  // MARCATORE del loader (lezione 27/10 ore 17:55: app senza il file vuoto
  // Video/ non esiste per il loader — e l'installatore lo scrive lui stesso).
  const app = APP.find(({ chiave }) => chiave === 'cruscotto');
  const appCartella = join(RADICE_FINTA, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', app.chiave);
  mkdirSync(appCartella, { recursive: true });
  mkdirSync(join(RADICE_FINTA, 'ACE', 'Video'), { recursive: true });
  for (const f of ['app.json', app.costruito]) {
    writeFileSync(join(appCartella, f), readFileSync(join(ROOT, 'uiapp', app.chiave, f)));
  }
  // la copia STANTIA: un vecchio .js installato a mano — DIVERSO dal costruito
  // (per il generatore la differenza è tutta la domanda: il flag di
  // installazione si accorge, oltre al valore che cambia).
  const costruito = readFileSync(join(ROOT, 'uiapp', app.chiave, app.costruito), 'utf8');
  const stantio = '// vecchio .js a mano, prima che il generatore si facesse da solo\n' + costruito;
  assert.notEqual(stantio, costruito, 'la copia stantia deve essere DIVERSA dal costruito: il test non finge');
  writeFileSync(join(appCartella, app.costruito), stantio);

  // ACE_SAVEDIR comandata: genera-uiapp E l'installatore che richiama girano
  // TUTTI dentro la radice finta (spawnSync la passa al figlio, mai alla stanza vera).
  const r = spawnSync(process.execPath, [GENERA], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ACE_SAVEDIR: RADICE_FINTA },
  });
  assert.equal(r.status, 0, `genera-uiapp fallito con la copia stantia:\n${r.stdout || r.stderr}`);
  assert.ok(r.stdout.includes('non corrisponde alla costruita'),
    `il generatore non ha gridato la copia stantia nel log:\n${r.stdout}`);
  assert.ok(r.stdout.includes('richiamo l\'installatore'),
    `il generatore non ha richiamato l'installatore nella sua run:\n${r.stdout}`);
  // in radice FINTA la copia adesso è il costruito IDENTICO (byte per byte)
  const consegnata = readFileSync(join(appCartella, app.costruito), 'utf8');
  assert.equal(consegnata, costruito,
    'la copia stantia in radice finta non è stata sostituita col costruito: flusso richiamo rotto');

  // idempotente: alla SECONDA run, con le copie fresche, niente da reinstallare
  const r2 = spawnSync(process.execPath, [GENERA], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ACE_SAVEDIR: RADICE_FINTA },
  });
  assert.equal(r2.status, 0, `genera-uiapp secondo giro in radice finta:\n${r2.stdout || r2.stderr}`);
  assert.ok(r2.stdout.includes('niente da reinstallare'),
    `alla seconda run il generatore non si dichiara al passo:\n${r2.stdout}`);
});
