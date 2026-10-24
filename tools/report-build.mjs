// report-build.mjs — IL REPORT DI BUILD (richiesta Mauro 24/10):
// «ogni modifica effettuata ad ogni build deve scrivere un report da
// pubblicare con le correzioni effettuate».
//
// A ogni sincronizza-git.cmd, DOPO il push, genera data/report/
// build-vX.Y.Z-<hash>.md con le correzioni di questa build (i commit
// dall'ultimo report pubblicato), e SOLO se ha scritto qualcosa lo
// committe e lo spinge — così la prossima "Aggiorna ora" dell'amico
// porta anche il riepilogo leggibile sul repo.
//
// Uso:
//   node tools/report-build.mjs          → genera + commit + push
//   node tools/report-build.mjs --dry    → solo stampa, zero scritture
//   node tools/report-build.mjs --test   → include l'esito di npm test
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RADICE, 'data', 'report');
const PUNTATORE = join(DIR, 'ultimo-report.json');

const dry = process.argv.includes('--dry');
const conTest = process.argv.includes('--test');

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: RADICE, encoding: 'utf8', timeout: 15000, ...opts }).trim();
}

// ---- versione e hash --------------------------------------------------
function versione() {
  try { return (JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')).version ?? '?'); }
  catch { return '?'; }
}

let head = '';
try { head = git(['rev-parse', 'HEAD']); } catch { head = ''; }
if (!head) { console.log('  -  report build: git non disponibile qui, salto.'); process.exit(0); }
const short = head.slice(0, 7);

// ---- da dove rileggere i commit: il puntatore dell'ultimo report ------
let daHash = '', daVersione = '';
try {
  const p = JSON.parse(readFileSync(PUNTATORE, 'utf8'));
  daHash = p.hash ?? ''; daVersione = p.versione ?? '';
} catch { /* primo report: elenco corto a ritroso */ }

let righeCommi = [];
if (daHash) {
  try { righeCommi = git(['log', '--reverse', '--pretty=format:%H %s', daHash + '..' + head]).split('\n').filter(Boolean); }
  catch { righeCommi = []; }
}
if (!righeCommi.length && !daHash) {
  // primo report: gli ultimi 30 commit bastano (l'amico rilegge la lista, non la storia)
  righeCommi = git(['log', '-n', '30', '--reverse', '--pretty=format:%H %s', head]).split('\n').filter(Boolean);
}
// niente rumore: i commit del report stesso non si auto-citano
righeCommi = righeCommi.filter((r) => !/^.* Report (build|di build)/i.test(r));

const v = versione();
const oggi = new Date().toISOString().slice(0, 10);

// ---- esito test (facoltativo) -----------------------------------------
let testRiga = '';
if (conTest) {
  let ok = true, nota = '';
  try { execFileSync('npm', ['test'], { cwd: RADICE, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { ok = false; nota = ' — VEDI LOG: il pacchetto è arrivato ma i test non passano'; }
  testRiga = `- Esito suite di test: ${ok ? 'passati ✅' : 'FALLITI ❌' + nota}\n`;
}

const prima = daVersione ? `Aggiornamento da **${daVersione}**` : 'Primo report del meccanismo (storia recente inclusa)';

const testo = [
  `# EVO Pitwall — report build ${v} (${short})`,
  `_Data: ${oggi} · ${prima}_`,
  '',
  '## Correzioni e novità',
  ...(righeCommi.map((r) => {
    // %H %s → hash completo + soggetto: taglio DOPO il primo spazio
    const sp = r.indexOf(' ');
    const h = r.slice(0, 7), msg = sp > 7 ? r.slice(sp + 1) : r;
    return `- ${msg} · ${h}`;
  })),
  '',
  testRiga,
  '## Come si aggiorna',
  '- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).',
  '- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.',
  '- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.',
  '',
].join('\n');

if (dry) {
  console.log('--- REPORT (dry) ---\n' + testo);
  process.exit(0);
}

if (!righeCommi.length) {
  console.log('  -  report build: nessun commit nuovo dall\u2019ultimo report, niente da pubblicare.');
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
const file = join(DIR, `build-${v}-${short}.md`);
writeFileSync(file, testo, 'utf8');
writeFileSync(PUNTATORE, JSON.stringify({ hash: head, versione: `v${v}` }, null, 2) + '\n');
console.log(`  [x] report build v${v} scritto: ${file}`);

// ---- commit + del push del report (tolge solo se ha scritto) -----------
try {
  git(['add', 'data/report']);
  const sporco = git(['status', '--porcelain', 'data/report']);
  if (sporco) {
    git(['commit', '-m', `Report build v${v} (${short}): riepilogo pubblicabile delle correzioni di questa build.`]);
    try { git(['push', 'offsite', 'HEAD']); console.log('  [x] report spinto su GitHub.'); }
    catch (e) { console.log('  [!] push del report non riuscito: ' + ((e.message ?? e) + '').split(String.fromCharCode(10))[0] + ' — resta locale in questo commit.'); }
  }
} catch (e) {
  console.log('  [!] commit del report non riuscito: ' + (e.message ?? e).split('\n')[0]);
}
