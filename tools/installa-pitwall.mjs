// installa-pitwall.mjs — porta l'app «Pitwall» dentro il gioco (31/10/2026,
// ricostruzione: la sorgente precedente era stata tolta di proposito il 30/10
// pomeriggio, diario «Pitwall SPENTO DI PROPOSITO»).
//
// STESSO GESTO del Cruscotto (tools/installa-cruscotto.mjs): l'app vive in
//   Saved Games/ACE/mods/uiresources/ACEUIAppLoader/pitwall/  (app.json + script)
// e non tocca NIENTE altro del gioco: qui si copiano i DUE file di
// uiapp/pitwall/ nella prima base «Saved Games» disponibile. Le fasce
// ui-<slot>.json le scrive il publisher del CRUSCOTTO (src/uiapp-pub.mjs) al
// proprio tick, SOLO se questa cartella esiste — un solo costruttore.
// Il pannello nasce invisibile e si apre dalla voce PITWALL del drawer APPS
// (pattern padock: niente menu.html consegnato, lezione 27/10 18:40).
//
// IL MARCATORE (lezione 27/10 ore 17:55, vale per ogni app del loader):
// un app SENZA il file vuoto
//   Saved Games/ACE/Video/ACEUIAppLoader-pitwall.settingspreset
// NON ESISTE per il loader: resta spenta e non gira mai.
//
// uso:  node tools/installa-pitwall.mjs         (installa o aggiorna)
//       node tools/installa-pitwall.mjs --rimuovi
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { savedGamesRoots } from '../src/paths.mjs';

const PROGETTO = dirname(dirname(fileURLToPath(import.meta.url)));
const SORGENTE = join(PROGETTO, 'uiapp', 'pitwall');
const APP_KEY = 'pitwall';

function baseLoader() {
  for (const root of savedGamesRoots()) {
    const loader = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader');
    if (existsSync(loader)) return loader;
  }
  return null;
}

function marcatore(rimuovi) {
  for (const root of savedGamesRoots()) {
    const dir = join(root, 'ACE', 'Video');
    if (!existsSync(dir)) continue;
    const file = join(dir, `ACEUIAppLoader-${APP_KEY}.settingspreset`);
    if (rimuovi) { try { rmSync(file); } catch {} }
    else { mkdirSync(dir, { recursive: true }); if (!existsSync(file)) writeFileSync(file, ''); }
    return file;
  }
  return null;
}

const rimuovi = process.argv.includes('--rimuovi');
let destinazione = null;
const loaderDir = baseLoader();
if (loaderDir) destinazione = join(loaderDir, APP_KEY);

if (rimuovi) {
  const dirRim = loaderDir ? join(loaderDir, APP_KEY) : null;
  if (!dirRim || !existsSync(dirRim)) { console.log('L\'app non è installata: nulla da rimuovere.'); }
  else {
    for (const f of readdirSync(dirRim)) {
      const p = join(dirRim, f);
      if (statSync(p).isFile()) rmSync(p);   // fasce del publisher comprese
    }
    try { rmSync(dirRim); } catch {}
    console.log(`App «Pitwall» rimossa da ${dirRim}`);
  }
  marcatore(true);
  process.exit(0);
}

if (!existsSync(SORGENTE)) { console.error('Cartella sorgente uiapp/pitwall mancante.'); process.exit(1); }
if (!destinazione) {
  console.error('Nessuna base «Saved Games» con la mod ACE UI App Loader installata.');
  console.error('Installa prima il loader (la stessa cosa che serve a Paddock e Cruscotto).');
  process.exit(1);
}
mkdirSync(destinazione, { recursive: true });
for (const f of ['app.json', 'pitwall.js']) {
  if (existsSync(join(SORGENTE, f))) copyFileSync(join(SORGENTE, f), join(destinazione, f));
}
try { rmSync(join(destinazione, 'menu.html')); } catch {}   // stessa lezione del cruscotto: mai consegnare la pagina
const m = marcatore(false);
if (m) console.log(`Marcatore del loader scritto: ${relative(PROGETTO, m)}`);
console.log(`App «Pitwall» installata in ${relative(PROGETTO, destinazione)}`);
console.log('Le fasce arrivano dal publisher del Cruscotto: serve il server aperto (avvia.cmd).');
console.log('Anteprima fuori dal gioco: node tools/_preview-pitwall.mjs');
