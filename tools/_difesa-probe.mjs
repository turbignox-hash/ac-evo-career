// _difesa-probe.mjs — la SONDA ANTI-COLPO (promossa da tmp il 31/10).
//
// La lezione dei DUE colpi del 31/10 (SESSION_REPORT §Incidente): il vizio non
// era solo la rotta, ma il BANCO — le sonde vecchie (tmp/_colpo-api.mjs e il
// provino tmp/_difesa-probe.mjs) isolavano i FILE DI GIOCO con ACE_DATA ma NON
// la carriera, che vive nel repo: il server spawnato operava sul save VERO
// (−450 €, sponsor riassegnato, nodo spostato). Da qui il banco giusto, che
// isola TUTTO:
//   • EVO_DATA_DIR     → save carriera + config + backup (webui-env.mjs)
//   • EVO_FLOWS_DIR    → registro flussi (flows.jsonl)
//   • ACE_DATA         → file dati EVO (paths.mjs)
//   • ACE_GAME_SAVEDIR → file di gioco (GameModes)
//   • ACE_SAVEDIR      → intera root «Saved Games» (il publisher e lo store del
//     loader finiscono in sandbox: niente fasce nel gioco, niente lock
//     .publisher.pid del publisher vivo)
// e sul banco gira una carriera di MARCATURA (nome «Prova Sonda»): ogni
// lettura del disco sandbox porta la firma, così è IMPOSSIBILE che il banco
// confonda il vero.
//
// Lo sweep: estrae TUTTE le rotte `case '…'` di src/webui.mjs — non solo le 43
// del set SOLO_POST: è lì il buco reale del 31/10 (una rotta di scrittura
// DIMENTICATA nel set). Ognuna la raccoglie con GET e controlla che NESSUNA
// muti i file della sandbox: chi muta è una rotta di scrittura che manca nel
// set SOLO_POST, e il banco la smaschera per nome.
//
// Uso:
//   node tools/_difesa-probe.mjs            → sweep completo, verdetto ed exit code
//   node tools/_difesa-probe.mjs --quiet    → stampa solo il verdetto
//   node tools/_difesa-probe.mjs --dettaglio → stampa ogni rotta provata
import { spawn } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// PORTA LIBERA AD OGNI SORTITA (3/11): prima era fissa 8799 e un server di
// sonda ORFANO (ronda finita, shell madre morta) restava in ascolto sulla
// porta: il figlio della nuova corsa usciva con «porta occupata», MA la
// finestra di attesa veniva servita PRIMA dall'orfano — che era nato col SAVE
// VERO. Risultato: check di marca «Mauro Turbigno» (giustamente rosso), sweep
// pulito con COLPI: NESSUNO ed exit 1 senza che il banco fosse mai davvero
// interrogato. Da adesso la porta la decide l'OS a presa libera: due banchi
// non possono più litigare sulla stessa porta.
const PORT = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
});
const BASE = `http://127.0.0.1:${PORT}`;
const QUIET = process.argv.includes('--quiet');
const DETTAGLIO = process.argv.includes('--dettaglio');
const say = (t) => { if (!QUIET && DETTAGLIO) console.log(t); };
const niente = (t) => { if (!QUIET) console.log(t); };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/* ---------- 1) sandbox completa + carriera di marcatura ---------- */
const SB = mkdtempSync(join(tmpdir(), 'evo-antocolpo-'));
const DATA = join(SB, 'dati');       // ACE_DATA: file dati EVO (paths.mjs)
const SAVE_DIR = join(SB, 'carriera'); // EVO_DATA_DIR: save/config/backup
const GAME_DIR = join(SB, 'salvataggi'); // ACE_GAME_SAVEDIR + ACE_SAVEDIR
for (const d of [DATA, SAVE_DIR, join(GAME_DIR, 'GameModes')]) mkdirSync(d, { recursive: true });

// Carriera di MARCATURA: stessa forma minima usata dai test sandbox di casa
// (game-sandbox.test.mjs). /api/status la legge e deve mostrare QUESTO nome —
// se mostra il pilota vero, il banco non isola ed è lui l'errore.
const MARCA = {
  version: 1, node: 'coppa_audi-r8-lms-gt4-evo', round: 0, season: 99,
  money: 1234, rep: 2, driver: { first: 'Prova', last: 'Sonda', name: 'Prova Sonda', nation: 'ITA' },
  messages: [], offers: [], pending: null, results: {},
  events: { active: null, history: [], showCase: [], lastRoundChecked: null },
};
const SAVE_SANDBOX = join(SAVE_DIR, 'evo-career.save.json');
writeFileSync(SAVE_SANDBOX, JSON.stringify(MARCA, null, 2));

/** Regole di RUMORE consentito: log diagnostici APPEND-ONLY che le VISTE
 *  legacy scovano in EVO_DATA_DIR (la stessa regola di casa: test e server di
 *  prova non toccano il registro vero, ma LEGGERE può appendere una riga di
 *  log). voce-panello.json è il battito del pannello voce, aggiornato dal
 *  timer del server: non è la risposta di una GET. SAVE/config/flussi non
 *  sono rumore: se muoiano, è un colpo vero. */
const LOG_CONSENTITO = /(^|[\\/])(copilot-voce-[\w-]+\.jsonl|errors\.jsonl|voce-panello\.json)$/;
/** Impronta ricorsiva delle cartelle della sandbox: la mappa {percorso → hash}
 *  di ogni file presente. Così anche una rotta che scrive un file dimenticato
 *  (backup, journal, marker ..bak) finisce nella rete, non solo il save. */
const impronta = () => {
  const mappa = new Map();
  const visita = (dir) => {
    for (const nome of existsSync(dir) ? readdirSync(dir) : []) {
      const p = join(dir, nome);
      const st = statSync(p);
      if (st.isDirectory()) visita(p);
      else if (!LOG_CONSENTITO.test(p)) mappa.set(p, sha256(readFileSync(p)));
    }
  };
  for (const dir of [SAVE_DIR, DATA, SB]) visita(dir); // SB copre anche il file flussi
  return mappa;
};
/** Diff leggibile fra due impronte: solo i nomi file toccati (max 6). */
const diff = (prima, dopo) => {
  const chiavi = new Set([...prima.keys(), ...dopo.keys()]);
  const toccati = [];
  for (const k of chiavi) if (prima.get(k) !== dopo.get(k)) toccati.push(k);
  return toccati.slice(0, 6).map((k) => k.replace(SB, '…'));
};

/* ---------- 2) le rotte dal FONTE (il set SOLO_POST può essere imperfetto) ---------- */
const fonte = readFileSync(join(ROOT, 'src', 'webui.mjs'), 'utf8');
const ROTTE = [...new Set([...fonte.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]))].sort();
// il set SOLO_post si legge DIRETTO dal fonte (tra `const SOLO_POST = new Set([` e
// `]);`): così il banco non può mai divergiare dalla difesa che dichiara il codice.
const estraiSet = () => {
  const m = fonte.match(/const SOLO_POST = new Set\(\[([\s\S]*?)\]\);/);
  if (!m) { console.error('impossibile leggere il set SOLO_POST del fonte'); process.exit(1); }
  return [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]);
};
const SOLO_POST = estraiSet();

/* ---------- 3) il server sandbox ---------- */
const child = spawn(process.execPath, [join(ROOT, 'src', 'webui.mjs')], {
  cwd: ROOT,
  env: {
    ...process.env,
    ACE_UI_PORT: String(PORT),
    EVO_DATA_DIR: SAVE_DIR,      // save/config/backup: la carriera è DI MARCA
    EVO_FLOWS_DIR: SB,           // flows.jsonl in sandbox
    ACE_DATA: DATA,              // file dati EVO in sandbox
    ACE_GAME_SAVEDIR: GAME_DIR,  // file di gioco in sandbox
    ACE_SAVEDIR: GAME_DIR,       // intera root «Saved Games» in sandbox
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let err = '';
child.stderr.on('data', (d) => { err += d; });
const t0 = Date.now();
let su = false;
while (Date.now() - t0 < 15000) {
  if (child.exitCode !== null) {
    console.error(`SERVER USCITO subito (exit ${child.exitCode})`, err.slice(0, 1200));
    process.exit(1);
  }
  try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) { su = true; break; } } catch { }
  await new Promise((r) => setTimeout(r, 250));
}
if (!su) {
  console.error('SERVER NON PRONTO entro 15s', err.slice(0, 1200));
  child.kill();
  process.exit(1);
}
// Guardia finale (3/11): se QUALCOSA risponde mentre il nostro figlio è già
// morto, chi risponde NON è il banco — fallisce SUBITO con la diagnosi,
// invece di lasciare che sia il check di marca a smascherarlo a distanza.
if (child.exitCode !== null) {
  console.error(`LA PORTA È DI UN ALTRO: qualcosa ha risposto mentre il figlio ${child.pid} era già uscito (exit ${child.exitCode}) — la risposta arriva da un processo estraneo sulla stessa porta, il banco non è mai stato interrogato.\n${err.slice(0, 1200)}`);
  process.exit(1);
}

let male = 0;
try {
  /* ---------- 4) check di marca: il server sta lavorando sulla SANDBOX ---------- */
  // world-ranking e non status: col save di marcatura MINIMO alcune letture
  // ricche rispondono 500, ma world-ranking porta il pilota e basta la firma.
  const st = await (await fetch(`${BASE}/api/world-ranking`)).json();
  const nomeOk = /Prova Sonda/i.test(String(st?.me?.name ?? ''));
  if (!QUIET) console.log(`[marca] il server vede la carriera di marcatura "${st?.me?.name ?? '?'}": ${nomeOk ? 'OK' : 'ERRORE — NON sta lavorando sulla sandbox'}`);
  if (!nomeOk) male += 1;

  /* ---------- 5) sweep di TUTTE le rotte, GET uno a uno con impronta prima/dopo ---------- */
  const difese = [], letture = [], colpi = [];
  const nRotte = ROTTE.length;
  let i = 0;
  for (const rotta of ROTTE) {
    i++;
    const prima = impronta();
    let code = 0, corpo = '';
    try { const r = await fetch(`${BASE}/api/${rotta}`); code = r.status; corpo = await r.text(); } catch (e) { corpo = String(e?.message ?? e); }
    const dopo = impronta();
    if (code === 405) { say(`[405] ${i}/${nRotte} ${rotta}`); difese.push(rotta); continue; }
    // una GET che NON risponde 405 dovrebbe essere una pura lettura: se i file
    // della sandbox cambiano, è una rotta di scrittura fuori dal set.
    const toccati = diff(prima, dopo);
    if (toccati.length === 0) { say(`[${code}] ${i}/${nRotte} ${rotta} → ${String(corpo).slice(0, 70).replace(/\s+/g, ' ')}`); letture.push(rotta); continue; }
    colpi.push(rotta);
    male += 1;
    console.log(`⚠️  GET /api/${rotta} MUTA ${toccati.join(' · ')}`);
  }

  /* ---------- 6) il SELECT della difesa: le rotte SOLO_POST devono dare 405 ---------- */
  const manche = [];
  for (const rotta of SOLO_POST) {
    let code = 0;
    try { code = (await (await fetch(`${BASE}/api/${rotta}`)).status); } catch { }
    if (code === 405) continue;
    manche.push(`${rotta}→${code}`);
    male += 1;
  }
  say(`[give] SOLO_POST: ${SOLO_POST.length - manche.length}/${SOLO_POST.length} → 405. Manche: ${manche.join(', ') || 'nessuna'}`);

  /* ---------- 7) POST regolare: la difesa NON deve bloccare il vivo ---------- */
  // il corpo {} non è una gara vera: conta SOLO che la POST arrivi ALL'-handler
  // (qualsiasi 4xx/5xx di handler va bene, un 405 no — sarebbe la difesa che
  // blocca anche il vivo).
  const post = await fetch(`${BASE}/api/race`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const postOk = post.status !== 405;
  if (!QUIET) console.log(`[POST] /api/race con corpo {} → ${post.status} ${postOk ? '(gentile: la POST raggiunge l\'handler, la difesa non blocca)' : 'ERRORE — la difesa blocca anche i POST!'}`);
  if (!postOk) male += 1;

  const riepilogo = `sweep ${nRotte} rotte: ${difese.length} difese 405 · ${letture.length} GET-lettura pulite · colpi: ${colpi.length ? colpi.join(', ') : 'NESSUNO'} · ${SOLO_POST.length} del set ${manche.length ? `manche: ${manche.join(', ')}` : 'tutte 405'}`;
  if (male === 0) {
    niente(`VERDETTO (${riepilogo}): niente colpi — le GET non mutano la sandbox, il set SOLO_POST è intero, la POST regolare passa.`);
    process.exit(0);
  }
  console.error(`VERDETTO di PROBLEMI — ${riepilogo}`);
  process.exit(1);
} finally {
  child.kill();
}
