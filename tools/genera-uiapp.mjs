// genera-uiapp.mjs — LA BUILD delle app in gioco (8/11/2026, richiesta
// Mauro: «fai importare PERIODO_MS da src/uiapp-pub.mjs alle app via build,
// eliminando le tre dichiarazioni duplicate»).
//
// FINO A IERI il ritmo delle fasce viveva in TRE file a mano: il publisher
// src/uiapp-pub.mjs (la fonte vera) e le DUE app in gioco
// (uiapp/cruscotto/cruscotto.js, uiapp/pitwall/pitwall.js) — tre `const
// PERIODO_MS = 2500` senza alcun import fra loro. Le app sono script isolati
// dentro EVO (il loader non fa module): l'import a runtime non è possibile —
// quindi l'import lo fa la BUILD. Il test test/uiapp-periodo.test.mjs
// (la «legge del ritmo») sorveglia la coppia; da oggi la rende una spunta con
// un solo numero da toccare:
//
//   1. la DICHIARAZIONE vive SOLO in src/uiapp-pub.mjs (export const PERIODO_MS);
//   2. le sagome uiapp/<app>/<app>.src.js portano il SEGNAPSTO
//      __PERIODO_MS_DAL_PUBLISHER__ al posto del numero;
//   3. questo tool legge il valore dal publisher (import vero, non regex) e
//      scrive i file costruiti uiapp/<app>/<app>.js — la STESSA cosa poi
//      copiata in gioco da tools/installa-cruscotto.mjs / installa-pitwall.mjs.
//
// (1/11) IL SUCCESSO SI LEGGE (richiesta Mauro): il segnaposto non si limita
// a ricevere il numero — la build da due cose: la costante E la firma
// `const BUILD_OK = true`, che l'app LEGGE all'avvio e dichiara in log.
// Un file costruito a mano, un vecchio .js mai rigenerato o un segnaposto
// residuo NON hanno la firma: l'app lo dice in console e la build fallisce
// se al segnaposto non rimbanca come aspettato. Identico dopo la scrittura:
// il file a disco vinee rilegto e rivissato — segnaposto residuo o firma
// mancante = uscita 1, mai un .js a metà.
//
// Idempotente: rilanciarlo dopo un cambio di valore nel publisher è il flusso
// normale — e da oggi (3/11) L'INSTALLAZIONE NON RICHIENDE PUNCTI: quando il
// file costruito si scambia a disco (o la copia in gioco non corrisponde alle
// costruite), il generatore richiama da solo l'installatore dell'app
// (installa-cruscotto.mjs / installa-pitwall.mjs): il valore cambia → le app
// in gioco seguono nella STESSA run. Se il loader non è installato, il
// richiamo esce non-zero e la build lo dice (non passa come fatta).
//
// Uso: node tools/genera-uiapp.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diff as differenz } from 'node:util';
import { PERIODO_MS } from '../src/uiapp-pub.mjs';
import { savedGamesRoots } from '../src/paths.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEGNAPOSTO = '__PERIODO_MS_DAL_PUBLISHER__';

const APP = [
  { chiave: 'cruscotto', cartella: join(RADICE, 'uiapp', 'cruscotto') },
  { chiave: 'pitwall', cartella: join(RADICE, 'uiapp', 'pitwall') },
];

let uscita = 0;
// (3/11) le app da reinstallare: chi la build riscrive, MAI ANCHE chi la copia
// in gioco è stantia (il file costruito ≠ la copia in ACEUIAppLoader) — se il
// generatore non gira per un pezzo, il flag di installazione lo riprende.
const daInstallare = new Set();
// l'app in gioco: la SOMMA copia degli installatori (stesso percorso di base)
const copiaInGioco = (chiave) => {
  for (const root of savedGamesRoots()) {
    const p = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', chiave, `${chiave}.js`);
    if (existsSync(p)) return p;
  }
  return null;
};
for (const app of APP) {
  const sagoma = join(app.cartella, `${app.chiave}.src.js`);
  const costruito = join(app.cartella, `${app.chiave}.js`);
  const src = readFileSync(sagoma, 'utf8');
  const occorrenze = src.split(SEGNAPOSTO).length - 1;
  if (occorrenze !== 1) {
    console.error(`  [!] ${relative(RADICE, sagoma)}: il segnaposto deve essere UNO soltanto (trovate ${occorrenze}).`);
    uscita = 1;
    continue;
  }
  // il numero entra UNA volta sola, con la firma della sua fonte — e con la
  // FIRMA della build (const BUILD_OK) che l'app legge all'avvio
  const sostituzione = `const PERIODO_MS = ${PERIODO_MS};  // [via build] il valore arriva da src/uiapp-pub.mjs\n  const BUILD_OK = true;  // [via build] firma della build riuscita (genera-uiapp) — l'app la legge in log`;
  const testo = src.replace(SEGNAPOSTO, sostituzione);
  // guardie nel COSTRUITO: il valore vive UNA volta e il segnaposto non ne resta
  const dichiarazioni = (testo.match(/(?<!\w)(?:export\s+)?const\s+PERIODO_MS\s*=/g) ?? []).length;
  if (dichiarazioni !== 1) {
    console.error(`  [!] ${relative(RADICE, costruito)}: aspettata 1 dichiarazione di PERIODO_MS, trovate ${dichiarazioni}.`);
    uscita = 1;
    continue;
  }
  if (!testo.includes('const BUILD_OK = true;')) {
    console.error(`  [!] ${relative(RADICE, costruito)}: la firma BUILD_OK non è stata scritta — il segnaposto non ha rimbanato.`);
    uscita = 1;
    continue;
  }
  const prima = (() => { try { return readFileSync(costruito, 'utf8'); } catch { return null; } })();
  if (prima !== testo) { writeFileSync(costruito, testo, 'utf8'); daInstallare.add(app.chiave); }
  // superviora A DISCO (1/11, «fallisci se il segnaposto non rimbanca»): quello
  // che è finito sul disco deve avere la firma e NESSUN segnaposto residuo
  const sulDisco = readFileSync(costruito, 'utf8');
  if (sulDisco.includes(SEGNAPOSTO)) {
    console.error(`  [!] ${relative(RADICE, costruito)}: SEGNAPSTO RESIDUO sul disco — build mai riuscita.`);
    uscita = 1;
    continue;
  }
  if (!sulDisco.includes('const BUILD_OK = true;')) {
    console.error(`  [!] ${relative(RADICE, costruito)}: firma BUILD_OK assente sul disco.`);
    uscita = 1;
    continue;
  }
  console.log(`  [x] ${relative(RADICE, costruito)}: PERIODO_MS = ${PERIODO_MS} + firma BUILD_OK (da src/uiapp-pub.mjs)`
    + (prima === testo ? ' — già al passo, niente riscrittura' : ''));
  // la copia in gioco stantia ha lo stesso effetto del valore che cambia: si
  // reinstalla (il numero può essere pari, ma il file diverso per altro motivo)
  const inGioco = copiaInGioco(app.chiave);
  if (inGioco && !daInstallare.has(app.chiave)) {
    let costruitoVivo = testo;
    try { costruitoVivo = readFileSync(inGioco, 'utf8'); } catch { /* la copia è irraggiungibile: la reinstallazione lo dirà */ }
    if (costruitoVivo !== testo) {
      daInstallare.add(app.chiave);
      console.log(`  [!] la copia in gioco (${relative(RADICE, inGioco)}) non corrisponde alla costruita`);
    }
  }
}
if (!uscita) {
  if (daInstallare.size) {
    // (3/11) il RICHIAMO: il valore cambia → l'installatore gira NELLA STESSA
    // run, con il SUO output e un esito che la build rispetta (non-zero =
    // fallisce qui): mai più «copiati a mano dopo».
    for (const chiave of daInstallare) {
      const via = join(RADICE, 'tools', `installa-${chiave}.mjs`);
      console.log(`  ↻ richiamo l'installatore: node tools/installa-${chiave}.mjs`);
      const r = spawnSync(process.execPath, [via], { stdio: 'inherit', cwd: RADICE });
      if (r.status !== 0) {
        console.error(`  [!] installa-${chiave}.mjs è uscito con codice ${r.status}: app NON aggiornata in gioco.`);
        uscita = 1;
      }
    }
  } else {
    console.log('  niente da reinstallare: costruite e copie in gioco sono al passo');
  }
}
if (!uscita) {
  // (3/11) DIAGNOSTICA A CODA — costruiti E sorgenti aperti e diffati con la
  // libreria di diff GIÀ A BORDO di Node (node:util.diff, modalità a righe;
  // niente dipendenze nuove). Il conto è chiuso per costruzione: tolte le
  // righe che la build è autorizzata a spostare (il segno consumato «−» e
  // le due righe cucite al suo posto, riconosciute dal marchio [via build]),
  // ciò che RESTA si stampa. Solo RAPPORTO: non tocca l'uscita — il
  // verdetto della build resta quello delle guardie.
  console.log('  — diagnostica a CODA: costruiti ↔ sorgenti (node:util.diff, riga per riga)');
  for (const app of APP) {
    const fuori = [];
    // la libreria diffa VALORI generici: sulle stringhe fa un diff a
    // CARATTERI (l'opzione diffMode:'lines' è di Node 24, qui ignorata) —
    // le pipe uno a uno (split('\n')) e diffando i due array. Orientamento empirico della coppia [op, riga]: op 1 = riga
    // solo nel PRIMO argomento (sorgente), op -1 = solo nel secondo, 0 = uguale.
    const passi = differenz(readFileSync(join(app.cartella, `${app.chiave}.src.js`), 'utf8').split('\n'),
      readFileSync(join(app.cartella, `${app.chiave}.js`), 'utf8').split('\n'));
    for (const [op, riga] of passi) {
      if (op === 0) continue;
      // il resto legittimo: il segno consumato (riga solo nella sagoma, −)
      // e la cucitura (le due righe + col marchio [via build], una ciascuna)
      if (op === 1 && riga.trim() === SEGNAPOSTO) continue;
      if (op === -1 && riga.includes('[via build]') && /^\s*const (PERIODO_MS|BUILD_OK)\b/.test(riga)) continue;
      fuori.push(`${op === -1 ? '+' : '-'} ${riga}`);
    }
    if (fuori.length) {
      console.log(`  [!] ${app.chiave}: ${fuori.length} righe di diff FUORI dalla cucitura:`);
      for (const riga of fuori) console.log(`      ${riga}`);
    } else {
      console.log(`  [x] ${app.chiave}: oltre la cucitura della build NON resta niente`);
    }
  }
}
process.exit(uscita);
