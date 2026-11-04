// genera-uiapp-guardie.test.mjs — LE GUARDIE DELLA BUILD (3/11, richieste a
// test da Mauro: «un test che copra le guardie nuove di genera-uiapp.mjs —
// segno mancante, firma assente su disco»).
//
// La build tools/genera-uiapp.mjs cuce il numero del publisher
// (src/uiapp-pub.mjs) al segnaposto __PERIODO_MS_DAL_PUBLISHER__ delle sagome
// uiapp/<app>/<app>.src.js e scrive i costruiti. Dal 1/11 e dal 3/11 è scorta
// di GUARDIE, ciascuna con uscita 1 e messaggio nel log:
//
//   • SEGNO: il segnaposto deve essere UNO per sagoma (0 = la sagoma ha una
//     cifra a mano o l'ha perso; 2 = due volte). Respinta PRIMA di scrivere:
//     «mai un .js a metà».
//   • CIFRA A MANO: dopo la sostituzione il costruito deve dichiarare
//     PERIODO_MS UNA volta sola — una sagoma che aveva anche la sua
//     const produce un doppione, respinta.
//   • FIRMA nel TESTO: se il segnaposto non ha rimbanato la firma
//     `const BUILD_OK = true;` non c'è — respinta.
//   • SUPERVORA A DISCO: il file RILETTO da disco deve non avere segnaposto
//     residuo e avere la firma — respinta (l'ultima linea di difesa).
//
// Storia delle prove: il tool vive SOLO del SUO albero (RADICE = la cartella
// sopra il tool), quindi il test lo copia in una sandbox con lo stub del
// publisher (PERIODO_MS = 1997: un valore che NON è quello reale, così se il
// tool andasse a prendere il numero dal publisher vero il test si accorge)
// e le sagome mini-app scritte dal test. Inoltre savedGamesRoots obbedisce a
// ACE_SAVEDIR: lo puntiamo a una cartella che non c'è, così `copiaInGioco`
// non trova niente e la sandbox non tocca le copie vere in gioco (e i
// richiami dell'installatore cadono sui NOI stub, mai sugli installatori
// veri). Le guardie FAIL-SAFE (firma nel testo / supervora a disco) non sono
// attivabili a comportamento — con il segno a 1 la sostituzione le passa
// SEMPRE — e vengono sorvegliate A SORGENTE nello stile di casa
// (come fa test/uiapp-periodo.test.mjs per la sagoma e il tool): i messaggi
// esistono e la supervora legge il file DOPO la scrittura, non la memoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENERA = join(QUI, 'tools', 'genera-uiapp.mjs');
const SEGNAPOSTO = '__PERIODO_MS_DAL_PUBLISHER__';
const VALORE_STUB = 1997;          // MAI il valore reale del publisher: lo sbaglio non passa
const APP = ['cruscotto', 'pitwall'];

const sagomaSana = (nome) =>
  `// ${nome}.src.js — mini-app della sandbox: un segno, una volta\n`
  + `  __PERIODO_MS_DAL_PUBLISHER__\n`
  + `console.log('${nome} parte');\n`;

/** La sandbox: il tool VERO copiato, lo stub del publisher, le sagome sane. */
function creaSandbox(t, { sagomaCruscotto = sagomaSana('cruscotto'), sagomaPitwall = sagomaSana('pitwall') } = {}) {
  const qu = mkdtempSync(join(tmpdir(), 'genera-uiapp-'));
  t.after(() => rmSync(qu, { recursive: true, force: true }));
  mkdirSync(join(qu, 'tools'));
  mkdirSync(join(qu, 'src'));
  for (const chiave of APP) mkdirSync(join(qu, 'uiapp', chiave), { recursive: true });
  copyFileSync(GENERA, join(qu, 'tools', 'genera-uiapp.mjs'));
  copyFileSync(join(QUI, 'src', 'paths.mjs'), join(qu, 'src', 'paths.mjs'));
  writeFileSync(join(qu, 'src', 'uiapp-pub.mjs'), `// stub sandbox\nexport const PERIODO_MS = ${VALORE_STUB};\n`, 'utf8');
  // l'UNICO installer STUB: i richiami del generatore arrivano QUI, mai sul vero
  writeFileSync(join(qu, 'tools', 'installa-gioco.mjs'), 'process.exit(0);\n', 'utf8');
  writeFileSync(join(qu, 'uiapp', 'cruscotto', 'cruscotto.src.js'), sagomaCruscotto, 'utf8');
  writeFileSync(join(qu, 'uiapp', 'pitwall', 'pitwall.src.js'), sagomaPitwall, 'utf8');
  return qu;
}

/** La run del tool VERO (la copia): niente Saved Games toccati — ACE_SAVEDIR
 *  comanda e punta dove non c'è nulla (scelta vera, per paths.mjs). */
function lancia(qu) {
  return spawnSync(process.execPath, [join(qu, 'tools', 'genera-uiapp.mjs')], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ACE_SAVEDIR: join(qu, 'salva-gioche-non-c-e') },
  });
}

test('VIA FELICE + IDEMPOTENZA: numero dello stub, firma, niente reinstallare al secondo giro', () => {
  const qu = creaSandbox(test);
  const prima = lancia(qu);
  assert.equal(prima.signal, null, 'il generatore è rimasto appeso al watchdog');
  assert.equal(prima.status, 0, `uscita ${prima.status}\n${prima.stdout}\n${prima.stderr}`);
  for (const chiave of APP) {
    const costruito = join(qu, 'uiapp', chiave, `${chiave}.js`);
    const testo = readFileSync(costruito, 'utf8');
    assert.ok(testo.includes(`const PERIODO_MS = ${VALORE_STUB};`),
      `${chiave}: il numero nel costruito non è quello dello stub (${VALORE_STUB}) — la build ha preso il valore sbagliato`);
    assert.ok(testo.includes('const BUILD_OK = true;'),
      `${chiave}: manca la firma della build riuscita`);
    assert.ok(!testo.includes(SEGNAPOSTO),
      `${chiave}: segno residuo nel costruito`);
  }
  assert.ok(prima.stdout.includes('richiamo l\'installatore'),
    'al primo giro i costruiti sono nuovi: il richiamo dell\'installatore deve partire\n' + prima.stdout);
  assert.ok(prima.stdout.includes('node tools/installa-gioco.mjs'),
    'il richiamo deve passare dall\'unico installatore delle app\n' + prima.stdout);
  // il SECONDO giro: niente da riscrivere, niente da reinstallare (idempotente alla pari)
  const dopo = lancia(qu);
  assert.equal(dopo.status, 0, `seconda uscita ${dopo.status}\n${dopo.stdout}\n${dopo.stderr}`);
  assert.ok(dopo.stdout.includes('già al passo, niente riscrittura'),
    'il secondo giro deve dichiarare che le costruite sono al passo\n' + dopo.stdout);
  assert.ok(dopo.stdout.includes('niente da reinstallare'),
    'il secondo giro non deve richiamare gli installer\n' + dopo.stdout);
});

test('SEGNO MANCANTE: sagoma senza segnaposto respinta, costruito non scritto', () => {
  const qu = creaSandbox(
    test,
    { sagomaCruscotto: '// una sagoma a cui è caduto il segnaposto\nconsole.log("cifra persa");\n' },
  );
  const r = lancia(qu);
  assert.equal(r.status, 1, `una sagoma senza segno DEVE fallire (uscita ${r.status})\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stderr.includes('il segnaposto deve essere UNO soltanto (trovate 0)'),
    'il messaggio della guardia del segno non è arrivato\n' + r.stderr);
  assert.ok(!existsSync(join(qu, 'uiapp', 'cruscotto', 'cruscotto.js')),
    'il costruito non deve esistere: respinta PRIMA della scrittura (mai un .js a metà)');
  // il PITWALL sano però passa: la guadaia non trattiene il raccolto sano
  assert.ok(readFileSync(join(qu, 'uiapp', 'pitwall', 'pitwall.js'), 'utf8').includes('const BUILD_OK = true;'),
    'il pitwall sano deve essere costruito normalmente');
});

test('SEGNO DOPPIO: due segnaposto nella stessa sagoma respinti', () => {
  const qu = creaSandbox(
    test,
    { sagomaCruscotto: `// il segno due volte\n  ${SEGNAPOSTO}\n  ${SEGNAPOSTO}\nconsole.log('doppio');\n` },
  );
  const r = lancia(qu);
  assert.equal(r.status, 1, `due segni DEVO fallire (uscita ${r.status})\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stderr.includes('il segnaposto deve essere UNO soltanto (trovate 2)'),
    'la guardia conta i segni: il «trovate 2» non è arrivato\n' + r.stderr);
});

test('CIFRA A MANO: la sagoma con la sua dichiarazione di PERIODO_MS produce un doppione e è respinta', () => {
  const qu = creaSandbox(
    test,
    { sagomaCruscotto: `// segno a posto MA anche la costante a mano\n  ${SEGNAPOSTO}\n  const PERIODO_MS = 1234;\nconsole.log('doppia dichiarazione');\n` },
  );
  const r = lancia(qu);
  assert.equal(r.status, 1, `la cifra a mano DEVE fallire (uscita ${r.status})\n${r.stdout}\n${r.stderr}`);
  assert.ok(r.stderr.includes('aspettata 1 dichiarazione di PERIODO_MS, trovate 2'),
    'il messaggio della guardia delle dichiarazioni non è arrivato\n' + r.stderr);
  assert.ok(!existsSync(join(qu, 'uiapp', 'cruscotto', 'cruscotto.js')),
    'respinta PRIMA della scrittura: il costruito non nasce');
});

test('GUARDIE FAIL-SAFE A SORGENTE: la firma viene cercata nel testo e la supervora rilegge da DISCO', () => {
  // le due guardie (firma nel testo, firma a disco) non si possono attivare a
  // comportamento: con il segno a 1 la sostituzione le passa SEMPRE. La casa
  // le sorveglia nel sorgente del tool (come uiapp-periodo per la sagoma).
  const genera = readFileSync(GENERA, 'utf8');
  assert.ok(genera.includes("if (!testo.includes('const BUILD_OK = true;'))"),
    'manca la guardia della firma sul TESTO costruito');
  assert.ok(genera.includes('firma BUILD_OK non è stata scritta'),
    'manca il messaggio «firma non scritta — il segnaposto non ha rimbanato»');
  assert.ok(genera.includes('const sulDisco = readFileSync(costruito'),
    'manca la SUPERVORA a disco: il file rilegto');
  assert.ok(genera.includes('SEGNAPSTO RESIDUO sul disco'),
    'manca il messaggio del segno residuo a disco');
  assert.ok(genera.includes('firma BUILD_OK assente sul disco'),
    'manca il messaggio della firma assente sul disco');
  // e la supervora legge DOPO la scrittura: riceve il file, non la memoria
  const scritta = genera.indexOf('writeFileSync(costruito, testo');
  const rilettura = genera.indexOf('const sulDisco = readFileSync(costruito');
  assert.notEqual(scritta, -1, 'la scrittura del costruito non è nel tool');
  assert.notEqual(rilettura, -1, 'la rilettura del costruito non è nel tool');
  assert.ok(rilettura > scritta, 'la supervora deve rileggere DA DISCO DOPO la scrittura, non prima');
});
