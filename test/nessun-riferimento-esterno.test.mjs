// nessun-riferimento-esterno.test.mjs — la guardia del taglio (4/11/2026).
//
// Il progetto non deve più nominare il prodotto da cui è partita l'idea:
// niente journal, canali, chiavi o tool collegati. L'unica eccezione è
// «Paddock Hill», il nome reale della curva di Brands Hatch. La guardia gira
// anche nella cartella estratta dallo zip, quindi non usa git: legge i file
// di testo del progetto e ignora data/ (save utente), pacchetti/, dist/ e le
// risorse grafiche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'test/nessun-riferimento-esterno.test.mjs';
const SKIP = new Set([
  '.git', 'node_modules', 'data', 'dist', 'pacchetti', 'archive', 'demo',
  'tmp', 'gui/carmaps', 'gui/trackmaps',
]);
const TESTO = /\.(?:mjs|js|cjs|json|md|txt|cmd|html|css|ya?ml)$/i;
// Composto a pezzi: così la guardia non trova sé stessa mentre si legge.
const MARCHIO = ['pad', 'dock'].join('');
const CONSENTITO = new RegExp(MARCHIO + ' +Hill', 'gi');
const ESTERNI = ['AM' + 'S2', 'Automobi' + 'lista', 'Apex ' + 'to Zero'].join('|');
// BS e BORDO costruiti a pezzi: nella stringa di una RegExp il confine parola è
// backslash + "b"; scriverlo come travestimento compatto aveva prodotto in
// passato il carattere BACKSPACE (U+0008) e la guardia vedeva tutto verde.
const BS = String.fromCharCode(92);
const BORDO = BS + 'b';
const VIETATO = new RegExp(
  BORDO + MARCHIO + BORDO + '|' +
  BORDO + 'pd-|APP_JOURNAL_DIR|__pd|ronda' + MARCHIO + '|' +
  ESTERNI,
  'i',
);

function raccogli(dir, out = []) {
  for (const voce of readdirSync(dir, { withFileTypes: true })) {
    const percorso = join(dir, voce.name);
    const rel = relative(ROOT, percorso).split(sep).join('/');
    if (voce.isDirectory()) {
      if (!SKIP.has(rel) && !voce.name.startsWith('sessione-')) raccogli(percorso, out);
    } else if (rel !== SELF && TESTO.test(voce.name)) {
      out.push({ rel, percorso });
    }
  }
  return out;
}

test('NESSUN RIFERIMENTO AL PRODOTTO ESTERNO: il progetto è indipendente', () => {
  const trovati = [];
  for (const { rel, percorso } of raccogli(ROOT)) {
    const testo = readFileSync(percorso, 'utf8').replace(CONSENTITO, '');
    const match = testo.match(VIETATO);
    if (match) trovati.push(`${rel}: ${match[0]}`);
  }
  assert.deepEqual(
    trovati,
    [],
    `riferimenti al prodotto esterno trovati:\n${trovati.join('\n')}`,
  );
});
