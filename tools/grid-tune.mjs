// grid-tune.mjs — LA CALIBRAZIONE AUTOMATICA dei bilanciamenti.
//
// Due mestieri:
//  1) --propose <piMin> <piMax>   → per una classe NUOVA: lista i preset di cars.json
//     dentro la finestra PI, elegge base il preset con PI più basso, zavorra fissa
//     100 kg (convenzione di Mauro) e penalità = ΔPI × 25 (pendenza calibrata il
//     19/10 sulla classe 8–9: GR86 Edition ΔPI 0.397 → 10%, Standard 0.366 → 5%).
//     La proposta è un PUNTO DI PARTENZA: si convalida in pista e si fissa in
//     grid-classes.json.
//  2) --report [N]  → per l'AFFINAMENTO: legge le ultime N gare in Results
//     (che contengono ballast/restrictor di ogni pilota!), raggruppa per modello
//     e mostra: posizioni medie, best-lap mediana, quota del top-10.
//     Indicatore di squilibrio: se un modello occupa pochissimo il top-10 o
//     tutto il fondo, la penalità va alleggerita/caricata — suggerisce il delta.
//
// uso:
//   node tools/grid-tune.mjs --propose 12 14
//   node tools/grid-tune.mjs --report 3
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CARS_JSON = 'E:/SteamLibrary/steamapps/common/Assetto Corsa EVO Dedicated Server/cars.json';
const RESULTS_DIR = 'C:/Users/Mauro/Saved Games/ACE/Results';
const PENDENZA_PCT_PER_PI = 25;   // calibrata 19/10/2026, classe 8–9
const BALLAST_STD = 100;          // convenzione di Mauro: zavorra fissa a tutte meno la base

const argv = process.argv.slice(2);
const ms = (s) => { if (!s) return null; const m = s.match(/(\d+):(\d+)[.](\d+)/); return m ? +m[1] * 60000 + +m[2] * 1000 + +m[3] : null; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const fmtLap = (v) => v == null ? '—' : `${Math.floor(v / 60000)}:${String(Math.floor((v % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor(v % 1000)).padStart(3, '0')}`;

/* ---------- 1) proposta per classe nuova ---------- */
function propose(piMin, piMax) {
  const j = JSON.parse(readFileSync(CARS_JSON, 'utf8'));
  const inWin = j.cars.filter((c) => c.performance_indicator >= piMin && c.performance_indicator <= piMax);
  if (!inWin.length) { console.log(`nessun preset in PI ${piMin}–${piMax}`); return; }
  const piMin_ = Math.min(...inWin.map((c) => c.performance_indicator));
  console.log(`preset in finestra PI ${piMin}–${piMax} (base = PI più basso ${piMin_.toFixed(3)}):`);
  for (const c of [...inWin].sort((a, b) => b.performance_indicator - a.performance_indicator)) {
    const dPI = c.performance_indicator - piMin_;
    const pct = dPI > 0.02 ? Math.min(20, Math.round(dPI * PENDENZA_PCT_PER_PI * 2) / 2) : 0;
    const isBase = dPI <= 0.02;
    console.log(`  ${c.name.padEnd(28)} PI ${c.performance_indicator.toFixed(3)}  Δ ${('+' + dPI.toFixed(3)).padStart(7)}  ${isBase ? '→ BASE (0%)' : `→ ${BALLAST_STD}kg + ${String(pct).padStart(4)}%`}  · ${c.display_name}`);
  }
  console.log(`\nNB: proposta da PI catalogo (pendenza ${PENDENZA_PCT_PER_PI}%/punto PI, zavorra fissa ${BALLAST_STD}kg).`);
  console.log('La convalida è la pista: corre la prova e poi --report per l\'affinamento. Le regole verificate si fissano in data/grid-classes.json.');
}

/* ---------- 2) report di affinamento dalle gare reali ---------- */
function report(nGare) {
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('_SP_Race.sessionresults.json')).sort().reverse().slice(0, nGare);
  if (!files.length) { console.log('nessuna gara in Results'); return; }
  const perModello = {};
  const gareAnalizzate = [];
  let totField = 0, gare = 0;
  for (const f of files) {
    const j = JSON.parse(readFileSync(join(RESULTS_DIR, f), 'utf8'));
    const rows = j.drivers.filter((d) => d.ballast != null || d.restrictor != null);
    if (rows.length < 3) continue;              // solo gare con bilanciamento in campo
    // skippa le gare di calibrazione (bilanciamento UNIFORME: tutti allo stesso set
    // o tutti a zero): lì il confronto fra modelli non misura il bilanciamento
    const keys = new Set(rows.map((d) => `${d.ballast ?? 0}|${d.restrictor ?? 0}`));
    if (keys.size < 2) continue;
    gare++;
    gareAnalizzate.push(f.split('_')[0]);
    const start = rows.length;                  // campo: rows.length piloti
    totField += start;
    for (const d of rows) {
      const key = `${d.car_brand} ${d.car_name}`.trim();
      const m = perModello[key] ??= { n: 0, pos: [], best: [], tot: [], bal: new Set(), res: new Set() };
      m.n++;
      m.pos.push((d.position ?? start) || start);
      const b = ms(d.best_lap); if (b) m.best.push(b);
      const t = ms(d.total_time); if (t) m.tot.push(t);
      m.bal.add(d.ballast ?? 0); m.res.add(d.restrictor ?? 0);
    }
  }
  if (!gare) { console.log('nessuna gara con campo bilanciato trovata'); return; }
  const half = Math.round(totField / gare / 2);
  console.log(`${gare} gara(e) bilanciata(e) analizzate (${gareAnalizzate.join(', ')}) · campo ~${Math.round(totField / gare)} · soglia top-${half} (metà campo)`);
  console.log('modello'.padEnd(32), 'n'.padStart(3), 'posMedia'.padStart(9), 'bestMediana'.padStart(12), '  bal/res'.padStart(12), ' top8%'.padStart(7), ' suggerimento');
  for (const [k, m] of Object.entries(perModello).sort((a, b) => a[1].pos && b[1].pos ? media(a[1].pos) - media(b[1].pos) : 0)) {
    const posM = media(m.pos), bestM = median(m.best), top = m.pos.filter((p) => p <= half).length / m.n;
    const bal = [...m.bal].join('/'), res = [...m.res].map((r) => (r * 100).toFixed(0) + '%').join('/');
    let sug = 'a posto';
    const attesa = half / Math.round(totField / gare);   // quota attesa ~50% per auto in sesto
    if (top < attesa * 0.4) sug = `nel top-${half} solo il ${Math.round(top * 100)}% (attesa ~${Math.round(attesa * 100)}%): alleggerisci (prova −3%)`;
    else if (top > attesa * 1.6) sug = `nel top-${half} il ${Math.round(top * 100)}% (attesa ~${Math.round(attesa * 100)}%): chiudi un po' (+2%)`;
    console.log(k.padEnd(32), String(m.n).padStart(3), posM.toFixed(1).padStart(9), fmtLap(bestM).padStart(12), `${bal}/${res}`.padStart(14), ((top * 100).toFixed(0) + '%').padStart(6), '', sug);
  }
  console.log('\nLe posizioni medie mischiano AI di abilità diverse: usa il suggerimento come spinta, il giudizio finale resta la sensazione in pista.');
}
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/* ---------- CLI ---------- */
if (argv[0] === '--propose') propose(Number(argv[1]), Number(argv[2]));
else if (argv[0] === '--report') report(Number(argv[1] ?? 3));
else console.log('uso: --propose <piMin> <piMax> | --report [nGare=3]');
