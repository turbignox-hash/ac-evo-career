// installa-gioco.mjs — le app DENTRO il gioco (Cruscotto + Pitwall) con un
// gesto solo (1/11/2026, «l'amico deve installare e giocare»: niente comandi
// Node dopo l'installazione).
//
// Cosa fa: copia app.json + script di entrambe le app in
//   Saved Games/ACE/mods/uiresources/ACEUIAppLoader/<app>/
// e scrive i marcatori ACEUIAppLoader-<app>.settingspreset in
//   Saved Games/ACE/Video/
// — lo stesso gesto fatto a parte da tools/installa-cruscotto.mjs e
// tools/installa-pitwall.mjs (che restano validi per l'uso manuale). Il
// confronto è sui CONTENTI: se il file già installato è identico, non si
// rimette mano — così avvia.cmd può chiamarlo in modo silenzioso a OGNI
// apertura della GUI senza rumore né scritture inutili.
//
// IL MARCATORE (lezione 27/10 ore 17:55): un'app senza il file vuoto
//   Saved Games/ACE/Video/ACEUIAppLoader-<nome>.settingspreset
// NON esiste per il loader: resta spenta nel cassetto e non gira mai.
//
// LA SOGLIA DELLA MOD (1/11): se il loader ACE UI App Loader non è
// installato, qui si dice SOLO che le app in gioco non possono partire e
// che va installata la mod (la stessa che serve alle app in gioco del
// genere Paddock). Senza mod TUTTO il resto funziona: GUI nel browser,
// carriera, preparazione gare — niente è bloccato.
//
// Uso:
//   node tools/installa-gioco.mjs               (installa o aggiorna, parlato)
//   node tools/installa-gioco.mjs --silenzioso  (avvia.cmd: parla solo se fa qualcosa)
//   INSTALLA-GIOCO.cmd                          (la via manuale, doppio click)

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { savedGamesRoots } from '../src/paths.mjs';

const PROGETTO = dirname(dirname(fileURLToPath(import.meta.url)));
const APPS = [
  { chiave: 'cruscotto', cartella: join(PROGETTO, 'uiapp', 'cruscotto'), files: ['app.json', 'cruscotto.js'] },
  { chiave: 'pitwall', cartella: join(PROGETTO, 'uiapp', 'pitwall'), files: ['app.json', 'pitwall.js'] },
];

const silenzioso = process.argv.includes('--silenzioso');
// parla: solo fuori dal modo silenzioso. avviso: sempre — cose da sapere,
// installato o meno (mod mancante, copia riuscita).
const parla = (...righe) => { if (!silenzioso) console.log(righe.join('\n')); };
const avviso = (...righe) => console.log(righe.join('\n'));

function baseLoader() {
  for (const root of savedGamesRoots()) {
    const loader = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader');
    if (existsSync(loader)) return loader;
  }
  return null;
}

// il file installato è già identico alla sorgente? (confronto contenuto,
// così il modo silenzioso di avvia.cmd non scrive né rumore a ogni giro)
function giaUguale(sorgente, bersaglio) {
  try { return readFileSync(sorgente).equals(readFileSync(bersaglio)); } catch { return false; }
}

function installaApp(app, loaderDir) {
  const dest = join(loaderDir, app.chiave);
  mkdirSync(dest, { recursive: true });
  let toccata = 0;
  for (const f of app.files) {
    const sorgente = join(app.cartella, f);
    if (!existsSync(sorgente)) continue;
    const bersaglio = join(dest, f);
    if (giaUguale(sorgente, bersaglio)) continue;
    copyFileSync(sorgente, bersaglio);
    toccata++;
  }
  // lezione 27/10 18:40: la pagina NON va più consegnata al loader; se una
  // vecchia installazione l'aveva mandata, la togliamo così il pannello non
  // cresca col contenuto spostando il menu di EVO
  try { rmSync(join(dest, 'menu.html')); } catch {}
  return toccata;
}

function marcatore(chiave) {
  for (const root of savedGamesRoots()) {
    const dir = join(root, 'ACE', 'Video');
    if (!existsSync(dir)) continue;
    const file = join(dir, `ACEUIAppLoader-${chiave}.settingspreset`);
    if (!existsSync(file)) { mkdirSync(dir, { recursive: true }); writeFileSync(file, ''); return true; }
    return false; // già presente: la lista del loader resta com'è
  }
  return false; // niente base Video: la copia resta proficua, il marcatore si farà alla prossima
}

const loaderDir = baseLoader();

if (!loaderDir) {
  avviso('', '[i] Le app DENTRO il gioco (Cruscotto e Pitwall) non partono:', '', '    Serve prima la mod ACE UI App Loader (la stessa che usano le app', '    in gioco come Paddock), installata in Saved Games\\ACE\\mods\\uiresources.', '    Senza mod TUTTO il resto funziona: GUI nel browser, carriera, preparazione', '    gare. Dettagli in GUIDA-AMICO.md.');
  process.exit(0);
}

let installate = 0;
for (const app of APPS) {
  if (!existsSync(app.cartella)) continue;   // app non in progetto: si salta in silenzio
  const toccata = installaApp(app, loaderDir);
  const marcata = marcatore(app.chiave);
  if (toccata || marcata) {
    installate++;
    avviso(`[x] App «${app.chiave}» in gioco: ${relative(PROGETTO, join(loaderDir, app.chiave))}${marcata && toccata ? '' : marcata ? ' (marcatore scritto)' : ' aggiornata'}`);
  } else {
    parla(`App «${app.chiave}»: già a giorno, nessuna copia necessaria.`);
  }
}

if (installate) parla('', 'Al prossimo avvio di EVO le trovi nel drawer APPS; le fasce si aggiornano da sole col server della GUI aperto (avvia.cmd).');
else parla('Le app del gioco sono già a giorno: nessuna copia necessaria.');
process.exit(0);
