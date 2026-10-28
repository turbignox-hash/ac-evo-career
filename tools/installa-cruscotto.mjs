// installa-cruscotto.mjs — porta l'app «Cruscotto» dentro il gioco (27/10/2026).
//
// Come per Paddock: l'app vive in
//   Saved Games/ACE/mods/uiresources/ACEUIAppLoader/<app>/   (app.json + pagine)
// e non tocca NIENTE altro del gioco. Qui si copiano i tre file di
// uiapp/cruscotto/ nella prima base «Saved Games» disponibile; il resto (i
// file ui-<fascia>.json) li scrive il publisher con il server aperto.
//
// IL PATTERN PADDOCK (27/10 18:40): l'app NON ha più la sua pagina. La
// dichiarazione `pages: ["menu.html"]` resta (come Paddock), ma il file NON
// viene copiato: finché esisteva, il loader lo caricava nel SUO drawer e il
// pannello cresceva col contenuto spostando il menu di EVO (27/10 18:17),
// mentre i fix CSS dallo script siderano la PAGINA DEL GIOCO (27/10 18:30:
// menu sparito). Ora il pannello lo costituisce cruscotto.js da solo:
// position:fixed, dimensioni sue, appeso a document.body (esatto paddock.js).
//
// Uso:  node tools/installa-cruscotto.mjs        (installa o aggiorna)
//       node tools/installa-cruscotto.mjs --rimuovi
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { savedGamesRoots } from '../src/paths.mjs';

const PROGETTO = dirname(dirname(fileURLToPath(import.meta.url)));
const SORGENTE = join(PROGETTO, 'uiapp', 'cruscotto');
const APP_KEY = 'cruscotto';

function baseLoader() {
  for (const root of savedGamesRoots()) {
    const loader = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader');
    if (existsSync(loader)) return loader;
  }
  return null;
}

// IL MARCATORE (lezione 27/10 ore 17:55): il loader scopre le app dall'elenco
// dei preset video del gioco — un'app senza il file vuoto
//   Saved Games/ACE/Video/ACEUIAppLoader-<nome>.settingspreset
// NON ESISTE per il loader: resta spenta nel cassetto e non gira MAI (oggi il
// cambio auto istantaneo non partiva proprio per questo: l'app non si caricava).
function marcatore(rimuovi) {
  // la base «Video» della STESSA radice del loader: lì il gioco elenca i preset
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
  const loader = baseLoader();
  const dirRim = loader ? join(loader, APP_KEY) : null;
  if (!existsSync(dirRim)) { console.log('L\'app non è installata: nulla da rimuovere.'); }
  else {
    for (const f of readdirSync(dirRim)) {
      const p = join(dirRim, f);
      if (statSync(p).isFile()) rmSync(p);           // ui-*.json (publisher) comprese
    }
    try { rmSync(dirRim); } catch {}
    console.log(`App «Cruscotto» rimossa da ${dirRim}`);
  }
  marcatore(true);
  process.exit(0);
}

if (!existsSync(SORGENTE)) { console.error('Cartella sorgente uiapp/cruscotto mancante.'); process.exit(1); }
if (!destinazione) {
  console.error('Nessuna base «Saved Games» con la mod ACE UI App Loader installata.');
  console.error('Installa prima il loader (la stessa cosa che serve a Paddock).');
  process.exit(1);
}
mkdirSync(destinazione, { recursive: true });
for (const f of ['app.json', 'cruscotto.js']) {
  if (existsSync(join(SORGENTE, f))) copyFileSync(join(SORGENTE, f), join(destinazione, f));
}
// lezione 27/10 18:40: niente più menu.html; se un'installazione vecchia lo
// aveva mandato al loader, lo eliminiamo così il gioco non lo riverde mai più
try { rmSync(join(destinazione, 'menu.html')); } catch {}
const m = marcatore(false);
if (m) console.log(`Marcatore del loader scritto: ${relative(PROGETTO, m)}`);
console.log(`App «Cruscotto» installata in ${relative(PROGETTO, destinazione)}`);
console.log('Con il cruscotto aperto (avvia.cmd) la vetrina si aggiorna da sola nel gioco.');
