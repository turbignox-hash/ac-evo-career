// installa-cruscotto.mjs — porta l'app «Cruscotto» dentro il gioco (27/10/2026).
//
// Come per Paddock: l'app vive in
//   Saved Games/ACE/mods/uiresources/ACEUIAppLoader/<app>/   (app.json + pagine)
// e non tocca NIENTE altro del gioco. Qui si copiano i tre file di
// uiapp/cruscotto/ nella prima base «Saved Games» disponibile; il resto (i
// file ui-<fascia>.json) li scrive il publisher con il server aperto.
//
// Uso:  node tools/installa-cruscotto.mjs        (installa o aggiorna)
//       node tools/installa-cruscotto.mjs --rimuovi
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { savedGamesRoots } from '../src/paths.mjs';

const PROGETTO = dirname(dirname(fileURLToPath(import.meta.url)));
const SORGENTE = join(PROGETTO, 'uiapp', 'cruscotto');
const APP_KEY = 'cruscotto';

function baseDestinazione() {
  for (const root of savedGamesRoots()) {
    const loader = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader');
    if (existsSync(loader)) return join(loader, APP_KEY);
  }
  return null;
}

const destinazione = baseDestinazione();
const rimuovi = process.argv.includes('--rimuovi');

if (rimuovi) {
  if (!existsSync(destinazione)) { console.log('L\'app non è installata: nulla da rimuovere.'); process.exit(0); }
  for (const f of readdirSync(destinazione)) {
    const p = join(destinazione, f);
    if (statSync(p).isFile()) rmSync(p);           // ui-*.json (publisher) comprese
  }
  try { rmSync(destinazione); } catch {}
  console.log(`App «Cruscotto» rimossa da ${destinazione}`);
  process.exit(0);
}

if (!existsSync(SORGENTE)) { console.error('Cartella sorgente uiapp/cruscotto mancante.'); process.exit(1); }
if (!destinazione) {
  console.error('Nessuna base «Saved Games» con la mod ACE UI App Loader installata.');
  console.error('Installa prima il loader (la stessa cosa che serve a Paddock).');
  process.exit(1);
}
mkdirSync(destinazione, { recursive: true });
for (const f of ['app.json', 'menu.html', 'cruscotto.js']) {
  if (existsSync(join(SORGENTE, f))) copyFileSync(join(SORGENTE, f), join(destinazione, f));
}
console.log(`App «Cruscotto» installata in ${relative(PROGETTO, destinazione)}`);
console.log('Con il cruscotto aperto (avvia.cmd) la vetrina si aggiorna da sola nel gioco.');
