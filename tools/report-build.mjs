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

// I report stanno in report/ alla RADICE del progetto: data/ è nel
// .gitignore (dati del singolo PC) e un riepilogo da PUBBLICARE deve
// salire su GitHub col repo.
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RADICE, 'report');
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
// niente rumore: i commit DEL REPORT stesso («Report build v…») non si
// auto-citano — ma   un commit normale che PARLA di report resta dentro
righeCommi = righeCommi.filter((r) => !/^.{40} Report (di )?build v/i.test(r));

const v = versione();
const oggi = new Date().toISOString().slice(0, 10);

// ---- esito test (facoltativo) -----------------------------------------
let testRiga = '';
if (conTest) {
  // il conteggio si LEGGE dal run vero (# tests / # pass / # fail di node --test):
  // nessun numero scritto a mano (24/10: «suite 187/187» era il conteggio di
  // metà sessione, la suite vera era 181 — così il report dice sempre il reale)
  let ok = true, nota = '', tests = '?', pass = '?', fail = '?';
  const prendi = (out, r) => (out.match(new RegExp('# ' + r + ' \\d+'))?.[0]?.split(' ')[2] ?? '?');
  try {
    // STESSO glob di npm test: la scoperta di default di `node --test` (senza
    // argomenti) becca anche i file HELPER che iniziano con "test-" o stanno
    // in test/ (_flows-sandbox, _game-sandbox, src/test-mode.mjs,
    // tools/test-f2-insert.mjs e le 2 copie in dist/) — e gonfiava il
    // conteggio da 181 a 187. Il glob dà la suite canonica.
    const out = execFileSync(process.execPath, ['--test', 'test/*.test.mjs'], { cwd: RADICE, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    tests = prendi(out, 'tests'); pass = prendi(out, 'pass'); fail = prendi(out, 'fail');
  } catch (e) {
    ok = false;
    const out = String(e.stdout ?? '') + String(e.stderr ?? '');
    tests = prendi(out, 'tests'); pass = prendi(out, 'pass'); fail = prendi(out, 'fail');
    nota = ` — VEDI LOG: il pacchetto è arrivato ma i test non passano (${pass}/${tests} passati, ${fail} falliti)`;
  }
  testRiga = `- Esito suite di test: ${ok ? `passati ✅ (${pass}/${tests} test)` : 'FALLITI ❌' + nota}\n`;
}

// ---- quality-gate Biome (richiesta 26/10) -------------------------------
// Il report dice anche la diagnostica del linter lasciata in src/ + gui/:
// «clean» di build significa anche qualità del codice zero, non solo test
// verdi. Il conteggio viene da `check --reporter=json` (nessun numero
// scritto a mano, stessa lezione dei test del 24/10).
let rigaBiome = '';
{
  let tot = null, err = 0, warn = 0, notaFall = '';
  try {
    // di default `check` esce con exit code != 0 SE c'è diagnostica: si
    // legge l'output JSON a prescindere dal codice di uscita
    let out = '';
    try {
      out = execFileSync('cmd.exe', ['/c', 'npx', '--yes', '@biomejs/biome@2.3.12', 'check', '--reporter=json', 'src', 'gui'], { cwd: RADICE, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { out = String(e.stdout ?? '') + String(e.stderr ?? ''); }
    const json = JSON.parse(out.slice(out.indexOf('{')));
    tot = Array.isArray(json.diagnostics) ? json.diagnostics.length : 0;
    for (const d of json.diagnostics) {
      if (d.severity === 'error') err += 1;
      else if (d.severity === 'warn' || d.severity === 'warning') warn += 1;
    }
  } catch (e) {
    notaFall = `non leggibile qui (${((e.message ?? e) + '').split(String.fromCharCode(10))[0]}) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui`;
  }
  rigaBiome = tot != null
    ? `- Biome quality-gate (src + gui): ${tot ? tot + ` diagnos${tot === 1 ? 'tica' : 'tiche'} ❌ (${err} error, ${warn} warning)` : 'nessuna diagnostica ✅'}\n`
    : `- Biome quality-gate (src + gui): ${notaFall}\n`;
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
  rigaBiome,
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

// ---- commit + push del report (tocca il repo solo se ha scritto) -------
try {
  git(['add', 'report']);
  const sporco = git(['status', '--porcelain', 'report']);
  if (sporco) {
    git(['commit', '-m', `Report build v${v} (${short}): riepilogo pubblicabile delle correzioni di questa build.`]);
    try { git(['push', 'offsite', 'HEAD']); console.log('  [x] report spinto su GitHub.'); }
    catch (e) { console.log('  [!] push del report non riuscito: ' + ((e.message ?? e) + '').split(String.fromCharCode(10))[0] + ' — resta locale in questo commit.'); }
  }
} catch (e) {
  console.log('  [!] commit del report non riuscito: ' + (e.message ?? e).split('\n')[0]);
}
