// _collaudo-sazio.mjs — la palestra sazio UFFICIALIZZATA (task 7 dell'audit,
// 1/11, con l'autorizzazione migliorie ricorrente di Mauro): la tecnica
// «rottura SIMULATA → il test DEVE cadere» che in Fase 1 ha rafforzato i
// 3 test sazio (carValueKm, cadenzaSerie, DISPLAY_EN), qui come strumento.
//
// Uso:
//   node tools/_collaudo-sazio.mjs                      → REPORT completo (baseline + 3 mutazioni)
//   node tools/_collaudo-sazio.mjs --niente-baseline    → solo le mutazioni (più rapido)
//
// Come funziona, in ordine:
//   1. SANDBOX: copia temporanea del repo (mkdtemp di sistema). Niente
//      scritture nel repo vero — l'unico bersaglio di scrittura è la copia.
//      .git, node_modules, tmp e le mappe della GUI pesanti (carmaps e
//      trackmaps, 41 MB) non si copiano: ai test non servono.
//   2. BASELINE: la suite COMPLETA sulla copia vergine. Se non passa le
//      mutazioni NON si considerano (un test che cade a casa non prova
//      niente) e il report lo dichiara.
//   3. MUTAZIONE curata nel codice della COPIA — una per punto sazio,
//      la stessa rottura che a mano ha fatto cadere il test in Fase 1.
//      La stringa vecchia deve essere UNICA nel file: 0 o più occorrenze
//      ⇒ mutazione NOT APPLICATA (il codice è cambiato: si aggiorna a mano).
//   4. REPORT: una riga per mutazione → CADE / NON CADE, col pass/fail del
//      bersaglio e l'intento della rottura.
//   5. La sandbox si cancella da sola. Exit: 0 tutte cadute, 3 se una
//      tiene (qualche test non è più sazio), 2 baseline KO, 1 preparazione KO.

import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const NIENTE_BASELINE = process.argv.includes('--niente-baseline');

/** Le rotture curate: quelle che a mano in Fase 1 hanno fatto cadere i tre
 *  test rafforzati (valori fissi a terra). Vecchia stringa UNICA nel file. */
const MUTAZIONI = [
  {
    file: 'src/garage.mjs',
    descr: 'carValueKm: la soglia di auto fresca scende 0.85 → 0.80 (carValueKm(30000,0) da 25500 a 24000 €)',
    vecchia: 'if (k < 500) factor = 0.85;',
    rotta: 'if (k < 500) factor = 0.80;',
    bersaglio: 'test/garage-buy.test.mjs',
  },
  {
    file: 'src/agenda.mjs',
    descr: 'cadenzaSerie: la spalmatura dell hash muore (h % 8 → h % 1 = sempre la cadenza minima 3)',
    vecchia: 'return CADENZA_LIVELLI + (h % 8);',
    rotta: 'return CADENZA_LIVELLI + (h % 1);',
    bersaglio: 'test/agenda.test.mjs',
  },
  {
    file: 'src/lang.mjs',
    descr: 'DISPLAY_EN: la mappa muore (Coppa Città → "City Cupp" che non è la mappata attesa)',
    vecchia: "  ['Coppa Città', 'City Cup'],",
    rotta: "  ['Coppa Città', 'City Cupp'],",
    bersaglio: 'test/lingua-server.test.mjs',
  },
];

/** Conteggio TAP (pass/fail) dall'output di node --test. */
const contiTap = (out) => {
  const p = /^# pass\s+(\d+)/m.exec(out ?? '');
  const f = /^# fail\s+(\d+)/m.exec(out ?? '');
  return { pass: p ? Number(p[1]) : null, fail: f ? Number(f[1]) : null };
};

/** node --test sul bersaglio, DENTRO la sandbox: exit + conteggi. */
function giroTest(cwd, bersagli) {
  const r = spawnSync(process.execPath, ['--test', ...bersagli], {
    cwd, encoding: 'utf8', timeout: 300000, windowsHide: true,
  });
  return { code: r.status, ...contiTap(`${r.stdout ?? ''}\n${r.stderr ?? ''}`) };
}

/** Copia ricorsiva di UNA sottocartella con esclusioni semplici: carmaps e
 *  trackmaps dentro gui escono (41 MB di mappe che ai test non servono). */
function copiaSotto(da, verso, sotto) {
  cpSync(join(da, sotto), join(verso, sotto), {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(join(da, sotto).length).replace(/\\/g, '/').replace(/^\//, '');
      if (sotto === 'gui' && (rel === 'carmaps' || rel === 'trackmaps' || rel.startsWith('carmaps/') || rel.startsWith('trackmaps/'))) return false;
      return true;
    },
  });
}

/** Sostituzione a singola occorrenza: vale SOLO con 1 hit esatto, altrimenti
 *  la mutazione non si applica { hits: n, out: testo invariato }. */
const sostituzione = (testo, vecchia, rotta) => {
  const hits = testo.split(vecchia).length - 1;
  return { hits, out: hits === 1 ? testo.replace(vecchia, rotta) : testo };
};

// ---------- 1. SANDBOX ----------
const sandbox = mkdtempSync(join(tmpdir(), 'collaudo-sazio-'));
let exit = 1;
try {
  // uiapp PICCOLA serve ai test insta-gioco (diff con le sorgenti del loader)
  for (const d of ['src', 'test', 'tools', 'config', 'data', 'docs', 'report', 'uiapp', 'gui']) {
    if (existsSync(join(RADICE, d))) copiaSotto(RADICE, sandbox, d);
  }
  // TUTTI i file RADICE (le diagnosi: i flussi installer/disinstalla mangiano
  // le .cmd e le .ps1 alla radice — 9 test senza di loro cadono): solo FILE,
  // niente cartelle (quelle ugualmente finite qui sopra).
  for (const e of readdirSync(RADICE)) {
    if (!statSync(join(RADICE, e)).isFile()) continue;
    cpSync(join(RADICE, e), join(sandbox, e));
  }

  // ---------- 2. BASELINE (la copia vergine deve passare per intero) ----------
  let okBaseline = true;
  if (!NIENTE_BASELINE) {
    // LO STESSO GLOBO di npm test (casa): `--test <dir>` su Windows/22 viene
    // preso MOLO per un modulo (lezione 1/11 del debug tmp/_debug-sazio).
    const base = giroTest(sandbox, ['test/*.test.mjs']);
    console.log(`baseline: ${base.pass ?? '?'} pass / ${base.fail ?? '?'} fail (sandbox vergine, suite completa)`);
    okBaseline = base.code === 0 && (base.fail ?? 1) === 0;
    if (!okBaseline) console.log('baseline NON passa: le mutazioni NON si considerano (un test che cade a casa non prova niente)');
  } else console.log('baseline SALTATA (--niente-baseline): si dà per passante');

  // ---------- 3+4. MUTAZIONI + REPORT ----------
  let cadute = 0;
  for (const m of MUTAZIONI) {
    const fileS = join(sandbox, m.file);
    if (!existsSync(fileS)) { console.log(`MUTAZIONE ${m.file}: file assente in sandbox — report non attendibile`); continue; }
    const prima = readFileSync(fileS, 'utf8');
    const r = sostituzione(prima, m.vecchia, m.rotta);
    if (r.hits !== 1) {
      console.log(`NOT APPLICATA ${m.file} (${r.hits} occorrenze della vecchia):\n    ${m.vecchia}\n    il codice è cambiato: si aggiorna la stringa curata a mano`);
      continue;
    }
    writeFileSync(fileS, r.out);
    const g = giroTest(sandbox, [m.bersaglio]);
    writeFileSync(fileS, prima);   // ripristino del file nella COPIA
    const cade = (g.fail ?? 1) > 0 || g.code !== 0;
    console.log(`MUTAZIONE ${m.file}: ${cade ? 'CADE' : 'NON CADE'} · ${g.pass ?? '-'} pass / ${g.fail ?? '-'} fail\n    ${m.descr}`);
    if (cade) cadute++;
    else console.log('    TEST NON PIU SAZIO: questo punto non sente più la rottura — da rafforzare nel bersaglio');
  }

  const sazie = cadute === MUTAZIONI.length;
  exit = !okBaseline ? 2 : (sazie ? 0 : 3);
  console.log(sazie
    ? `LA PALESTRA SAZIO È INTEGRA: ${cadute}/${MUTAZIONI.length} cadute — tutti i valori fissi tengono la linea`
    : `LA PALESTRA SAZIO NON È INTERA: ${cadute}/${MUTAZIONI.length} cadute — le NON CADUTE vanno rafforzate`);
} finally {
  // ---------- 5. Cancellazione della sandbox ----------
  try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* è in tmp del sistema, si pulisce da sola */ }
  process.exit(exit);
}
