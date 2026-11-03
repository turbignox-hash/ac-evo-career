// beffa-preflight.test.mjs — LA FASCIA MEZZA AL BANCO FERMO (3/11, richiesta
// Mauro: «aggiungi la prova della beffa preflight al banco: un test che scrive
// una fascia mezza JSON in una sandbox e aspetta che genera-uiapp + la guardia
// siano l'unica soglia che la prende»).
//
// La prova vera l'abbiamo fatta in diretta, sulla stanza del gioco: fascia
// mozzata a mano dentro ACEUIAppLoader, `crea-release --solo-preflight`, e il
// preflight si è fermato alla guardia. Qui la stessa beffa si replica SENZA
// toccare la stanza vera — e resta: se un giorno la soglia smette di mordere,
// questo file è rosso al primo `npm test`, non alla prossima release.
//
// Il banco:
//   • radice Saved Games FINTA in temp, comandata con ACE_SAVEDIR (in
//     src/paths.mjs l'override comanda su ogni radice reale — Steam su altro
//     disco compreso), popolata COME la vera: le due app installate con
//     app.json + costruito IDENTICO e il marcatore Video/ che il loader
//     pretende. Così la guardia non salta e non finge: guarda la sandbox.
//   • la BEFFA: una fascia `ui-<slot>.json` TAGLIATA A METÀ, il file che una
//     scrittura interrotta (o una mano) lascia in giro e che l'app in gioco
//     JSON.parse a ogni tick — da lì il pannello vuoto.
//
// Le due soglie del preflight (tools/crea-release.mjs) girano sulla sandbox con
// la loro VERA uscita:
//   1) node tools/genera-uiapp.mjs → esce 0. La build le fasce non le guarda e
//      NON le tocca: la mezza resta mezza (le fasce le nasce solo il publisher,
//      non la build). Anzi: il fatto che esca 0 è la prova che da sola non
//      basta — è la guardia a dover mordere.
//   2) node --test test/uiapp-installata.test.mjs (la GUARDIA) → esce non-zero
//      e in TAP ha UN SOLO `not ok`: il suo test delle fasce, col nome del
//      file guasto. Biome, firma BUILD_OK, copia in gioco byte per byte e
//      pagine d'ingresso restano verdi e NON saltati: la fascia mezza è
//      l'unica cosa che la guardia prende, nient'altro del preflight la vede.
//
// La guardia gira in un processo SUO (node --test su un altro file): niente
// ricorsione, e il verdetto che conta è l'exit code, come quello che ferma la
// release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP = [
  { chiave: 'cruscotto', costruito: 'cruscotto.js' },
  { chiave: 'pitwall', costruito: 'pitwall.js' },
];

test('LA FASCIA MEZZA AL BANCO: genera-uiapp passa, la guardia è l\'unica soglia che la prende', () => {
  const GENERA = join(ROOT, 'tools', 'genera-uiapp.mjs');
  const GUARDIA = join(ROOT, 'test', 'uiapp-installata.test.mjs');
  for (const via of [GENERA, GUARDIA]) {
    assert.ok(existsSync(via), `${via} assente: niente preflight da provare al banco`);
  }

  // ---- 1) la radice finta, popolata COME la stanza vera -------------------
  const radice = mkdtempSync(join(tmpdir(), 'ac-career-beffa-'));
  mkdirSync(join(radice, 'ACE', 'Video'), { recursive: true }); // marcatore del loader (lezione 27/10)
  const cartelle = {};
  for (const { chiave, costruito } of APP) {
    const cartella = join(radice, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', chiave);
    mkdirSync(cartella, { recursive: true });
    for (const f of ['app.json', costruito]) {
      const sorgente = join(ROOT, 'uiapp', chiave, f);
      assert.ok(existsSync(sorgente), `manca uiapp/${chiave}/${f}: il banco non finge un'installazione senza sorgente`);
      writeFileSync(join(cartella, f), readFileSync(sorgente));
    }
    cartelle[chiave] = cartella;
  }

  // ---- 2) la beffa: fascia tagliata a metà, come quando una scrittura muore
  const mezza = join(cartelle.cruscotto, 'ui-3586822415.json');
  const tagliata = '{"periodoMs":2500,"ora":"14:0';
  assert.throws(() => JSON.parse(tagliata), 'la fascia del banco dev\'essere DAVVERO mezza: se si parsa, il test non prova niente');
  writeFileSync(mezza, tagliata, 'utf8');

  // la stessa radice comanda TUTTI i figli (genera-uiapp e l'installatore che
  // eventualmente richiama): la stanza vera non entra mai in questa prova
  const env = { ...process.env, ACE_SAVEDIR: radice };

  // ---- 3) soglia 1: la build passa e la mezza resta mezza -----------------
  const build = spawnSync(process.execPath, [GENERA], { cwd: ROOT, encoding: 'utf8', env });
  const logBuild = `${build.stdout ?? ''}${build.stderr ?? ''}`;
  assert.equal(build.status, 0, `genera-uiapp non deve inciampare nella fascia mezza (le fasce non sono affare suo):\n${logBuild}`);
  assert.equal(readFileSync(mezza, 'utf8'), tagliata,
    'genera-uiapp ha toccato la fascia: la mezza dev\'essere ancora mezza — le fasce le nasce solo il publisher, la build non le riscrive');
  assert.ok(!logBuild.includes('non corrisponde alla costruita'),
    `al banco le copie in gioco sono identiche al costruito: la build non deve vedere copie stantie\n${logBuild}`);

  // ---- 4) soglia 2: la guardia morde, UNA sola bocciatura, quella fascia ---
  // TAP: un verdetto per riga (`ok N - …` / `not ok N - …`), il nome e il
  // messaggio dell'asserzione arrivano nel blocco diagnostico.
  // il figlio deve poter avviare il PROPRIO runner: dentro un test node marca
  // NODE_TEST_CONTEXT e un `node --test` annidato si rifiuterebbe («skipping
  // running files»), lasciando uscire 0 — cioè un falso-verde del banco. Fuori
  // quella variabile, il figlio è la STESSA run di crea-release.
  const { NODE_TEST_CONTEXT: _annidato, ...envGuardia } = env;
  const guardia = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join('test', 'uiapp-installata.test.mjs')], {
    cwd: ROOT, encoding: 'utf8', env: envGuardia,
  });
  const uscita = `${guardia.stdout ?? ''}\n${guardia.stderr ?? ''}`;
  assert.notEqual(guardia.status, 0,
    `la guardia NON ha preso la fascia mezza al banco (exit 0): il preflight lascerebbe passare una fascia mozzata in gioco\n${uscita}`);
  // TAP scrive i messaggi di errore a riga singola come stringhe JSON: i \ di
  // Windows arrivano raddoppiati. Appiattiti, si cerca il percorso vero.
  const piatto = uscita.replace(/\\\\/g, '\\');
  assert.ok(piatto.includes('fascia guasta in gioco'), `la guardia è caduta, ma non per la fascia:\n${uscita}`);
  assert.ok(piatto.includes(mezza), `la bocciatura non nomina il file guasto (${mezza}): chi legge non sa dove mettere le mani:\n${uscita}`);

  const righe = piatto.split(/\r?\n/);
  const rossi = righe.filter((l) => /^not ok \d+ - /.test(l));
  const verdi = righe.filter((l) => /^ok \d+ - /.test(l));
  assert.equal(rossi.length, 1, `la fascia mezza deve essere l'UNICA bocciatura al banco, ne ho contate ${rossi.length}:\n${rossi.join('\n')}\n\n${uscita}`);
  assert.match(rossi[0], /FASCE DEL PUBLISHER IN GIOCO/, `la bocciatura non è quella delle fasce: ${rossi[0]}`);
  // il resto della guardia è verde E NON saltato: la sandbox è vista come stanza
  // installata (una radice finta dimenticata = skip = falso-verde)
  for (const nome of ['COSTRUITI CON FIRMA', 'COPPIA IN GIOCO ALLINEATA', 'PAGINE D\'INGRESSO IN GIOCO']) {
    const riga = verdi.find((l) => l.includes(nome));
    assert.ok(riga, `la guardia non dà verde a "${nome}" al banco: la fascia non è l'unica soglia in gioco\n${uscita}`);
    assert.ok(!/# SKIP/.test(riga), `"${nome}" è SALTATA al banco: la radice finta non è stata presa per una stanza installata\n${riga}`);
  }
});
