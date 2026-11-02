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
//
// La legge del ritmo resta nel workspace (test/uiapp-periodo.test.mjs); i
// costruiti src/*.mjs→sandbox degli installatori (test/installa-gioco.test.mjs,
// test/installatore-sandbox.test.mjs) restano in SANDBOX come sono. Questa è
// la stanza VERA del gioco, dove l'utente vede il risultato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
