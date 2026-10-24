#!/usr/bin/env node
// aggiorna-zip.mjs — L'AUTO-AGGIORNAMENTO per le installazioni da ZIP (24/10,
// richiesta Mauro: «preso a mano? non si auto-aggiorna?»). Fino a ieri chi
// riceveva il pacchetto-amico doveva ri-scaricare e ri-copiare a mano ogni
// aggiornamento; solo il clone git aveva il controllo da launcher.
//
// Anche la via zip adesso si auto-aggiorna: la cartella NON contiene .git,
// quindi il confronto e il download passano dall'API REST di GitHub:
//   1. build-id.txt nella radice dell'installazione → il commit della build
//      (scritto dentro lo zip da tools/pacchetto-amico.mjs);
//   2. GET api.github.com/.../commits/main → il commit di GitHub (per un repo
//      PRIVATO serve un token di lettura: env GITHUB_TOKEN o file
//      data/.github-token);
//   3. se GitHub è avanti → GET .../zipball/main, estrazione in temp e copia
//      a livello file: si sovrascrive SOLO il codice — data/ (il save, la
//      config locale, i MoTec) non si tocca, come col clone.
// Poi npm test, come nel flusso git. tools/aggiornamenti.mjs delega qui
// quando nella cartella non c'è .git: l'amico vede la stessa barra
// «Aggiorna ora» della GUI e lo stesso prompt del launcher, senza saperlo.
//
// Differenze col flusso git (--ff-only): la copia NON CANCELA i file rimossi
// dal repo (restano sul disco, innocui) e non difende le modifiche locali: il
// codice modificato a mano si sovrascrive senza protesta — per chi riceve lo
// zip è il comportamento giusto.
//
// Uso: invocato da aggiornamenti.mjs (delega automatica quando manca .git) e
// anche da solo: node tools/aggiorna-zip.mjs [--breve] (--installa per applicare)

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
// il repo: stesso valore di GUIDA-AMICO.md / README.it.md (override da env
// per chi ha un fork o un mirror)
const REPO = process.env.EVO_AGGIORNAMENTI_REPO ?? 'turbignox-hash/ac-evo-career';
const API = `https://api.github.com/repos/${REPO}`;
const TOKEN_FILE = join(RADICE, 'data', '.github-token');
// tar: su Windows serve il bsdtar di System32 (legge gli zip; il GNU tar di
// Git Bash no) — stessa nota di tools/pacchetto-amico.mjs
const TAR = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';

export function viaGit(radice = RADICE) {
  return existsSync(join(radice, '.git'));
}

/** Il token di accesso (repo privato): env prima, poi il file locale. */
export function leggiToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, 'utf8').trim();
  return '';
}

function header() {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'ac-evo-career' };
  const t = leggiToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

/** Il commit della build installata (scritto nel pacchetto-amico). */
export function leggiBuildId(radice = RADICE) {
  try {
    const riga = readFileSync(join(radice, 'build-id.txt'), 'utf8').split(/\r?\n/)[0].trim();
    return riga.length >= 7 ? riga : '';
  } catch { return ''; }
}

export function scriviBuildId(sha, radice = RADICE) {
  writeFileSync(join(radice, 'build-id.txt'), `${sha}\n`, 'utf8');
}

/** Confronto disco (build-id) vs GitHub (commits/main): STESSA forma di
 *  risultato di tools/aggiornamenti.mjs — skip / equal / remotoAvanti — così
 *  la GUI e il launcher non fanno nessun reformato. */
export async function statoZipAsync(radice = RADICE) {
  const locale = leggiBuildId(radice);
  if (!locale) return { skip: true, motivo: 'installazione muta (zip anteriore al 24/10): ri-scarica lo zip UNA volta, da lì si auto-aggiorna.' };
  let r;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    try { r = await fetch(`${API}/commits/main`, { headers: header(), signal: c.signal }); }
    finally { clearTimeout(t); }
  } catch {
    return { skip: true, motivo: 'GitHub non raggiungibile (offline?).' };
  }
  if (r.status === 404 || r.status === 401 || r.status === 403) {
    return { skip: true, motivo: r.status === 404
      ? 'repo non raggiungibile: privato e senza token? Metti un token di LETTURA in data/.github-token o in GITHUB_TOKEN.'
      : 'token rifiutato da GitHub (scaduto o senza accesso al repo). Rinnovalo in data/.github-token.' };
  }
  if (!r.ok) return { skip: true, motivo: `GitHub ha risposto ${r.status}.` };
  let j;
  try { j = await r.json(); } catch { return { skip: true, motivo: 'risposta di GitHub illeggibile.' }; }
  const remoto = String(j?.sha ?? '');
  if (!remoto) return { skip: true, motivo: 'il remoto non risponde con un commit.' };
  if (remoto === locale) return { equal: true, discoAvanti: 0 };
  // 1 = "c'è almeno un aggiornamento": il numero esatto chiede la history,
  // che un'installazione zip non possiede
  return { remotoAvanti: 1, discoAvanti: 0, remoto, locale };
}

/** Copia RICORSIVA sovrascrivendo, MA senza mai toccare le cartelle dei dati
 *  del singolo PC (data/ con dentro save, config locale, MoTec, error log) e
 *  senza cancellare niente (i file rimossi dal repo restano sul disco).
 *  esclusiFirst vale SOLO al primo livello; nelle sottocartelle si copia tutto. */
export function copiaAlbero(da, verso, esclusiFirst = ['data', '.git', 'pacchetti', 'archive', 'dist', 'demo', 'sessione']) {
  const vietate = new Set(esclusiFirst);
  for (const nome of readdirSync(da, { withFileTypes: true })) {
    if (vietate.has(nome.name)) continue;
    const s = join(da, nome.name);
    const d = join(verso, nome.name);
    if (nome.isDirectory()) { mkdirSync(d, { recursive: true }); copiaAlbero(s, d, []); }
    else if (nome.isFile()) { mkdirSync(dirname(d), { recursive: true }); copyFileSync(s, d); }
  }
}

/** L'installazione VERA: scarica la zipball, estrai, copia il codice, test.
 *  Stessa forma di risultato di installaAggiornamenti(): ok/nessuno/hash/testOk/testOut. */
export async function installaZip(radice = RADICE) {
  const stato = await statoZipAsync(radice);
  if (stato.skip) return { ok: false, messaggio: 'aggiornamento non controllabile adesso: ' + (stato.motivo ?? '') };
  if (stato.equal || !stato.remotoAvanti) return { ok: true, nessuno: true, messaggio: 'Nessun aggiornamento: sei già al passo con GitHub.' };
  if (!leggiToken()) return { ok: false, messaggio: 'il repo è privato: per lo scarico serve un token di lettura (data/.github-token o GITHUB_TOKEN).' };

  // scarico la zipball di main (tutto il codice del repo: senza .git, senza data/)
  const tmp = join(tmpdir(), 'evo-aggiorna-zip-' + Date.now());
  mkdirSync(tmp, { recursive: true });
  const zipPath = join(tmp, 'zipball.zip');
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 120000);
    let r;
    try { r = await fetch(`${API}/zipball/main`, { headers: header(), redirect: 'follow', signal: c.signal }); }
    finally { clearTimeout(t); }
    if (!r.ok) return { ok: false, messaggio: `scarico di GitHub non riuscito (HTTP ${r.status}).` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 10000) return { ok: false, messaggio: 'il download è troppo corto: niente zip credibile.' };
    writeFileSync(zipPath, buf);
  } catch (e) {
    return { ok: false, messaggio: 'scarico da GitHub non riuscito (rete o credenziali): ' + ((e?.message ?? e) + '').split('\n')[0] };
  }

  // estrazione: cwd + nome RELATIVO (tar su Windows interpreta "C:\..." come
  // host remoto, come già scoperto in pacchetto-amico.mjs)
  const dest = join(tmp, 'estrazione');
  mkdirSync(dest, { recursive: true });
  const rip = spawnSync(TAR, ['-xf', 'zipball.zip', '-C', 'estrazione'], { cwd: tmp, encoding: 'utf8' });
  if (rip.status !== 0) return { ok: false, messaggio: 'estrazione non riuscita (tar): ' + ((rip.stderr ?? rip.error) + '').split('\n')[0] };
  // la zipball di GitHub ha un UNICO root: <repo>-<sha>
  const root = readdirSync(dest, { withFileTypes: true }).find((e) => e.isDirectory())?.name;
  if (!root) return { ok: false, messaggio: 'la zipball estratta non ha la cartella radice attesa.' };
  const albero = join(dest, root);

  try { copiaAlbero(albero, radice); }
  catch (e) {
    return { ok: false, messaggio: 'copia del codice riuscita a metà: ' + ((e?.message ?? e) + '').split('\n')[0] + ' — data/ non toccata; ri-scarica lo zip se resta a metà.' };
  }
  scriviBuildId(stato.remoto, radice);   // la nuova build segna il commit nuovo

  // npm test, come nel flusso git
  let testOk = null, testOut = '';
  try {
    const prova = spawnSync('npm test', { encoding: 'utf8', cwd: radice, timeout: 180000, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    testOk = (prova.status ?? 1) === 0;
    if (!testOk) {
      const text = String(prova.stdout ?? '') + '\n' + String(prova.stderr ?? '');
      testOut = text.split('\n').filter(Boolean).slice(-8).join('\n');
    }
  } catch (e) { testOk = false; testOut = String(e?.message ?? ''); }

  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* resta in temp, innocuo */ }
  return { ok: true, hash: stato.remoto.slice(0, 7), testOk, testOut, installati: 1 };
}

/* --- CLI: lancio diretto (debug, specchio di aggiornamenti.mjs) --- */
async function main() {
  const breve = process.argv.includes('--breve');
  const s = await statoZipAsync();
  if (s.skip) { if (!breve) console.log('  -  aggiornamenti (via zip): ' + (s.motivo ?? 'non controllabili adesso')); return; }
  if (s.equal || !s.remotoAvanti) { if (!breve) console.log('  [x] aggiornamenti (via zip): sei al passo con GitHub.'); return; }
  if (!process.argv.includes('--installa')) { console.log('  (usa --installa per applicarlo: launcher e GUI lo fanno gia da soli)'); return; }
  const r = await installaZip();
  if (r.ok && r.nessuno) console.log('  -  ' + r.messaggio);
  else if (r.ok) {
    console.log('  [x] Installato: ora sei a ' + (r.hash ?? '?') + '.');
    console.log(r.testOk === false ? '  [!] npm test FALLITO dopo l aggiornamento:\n' + r.testOut : '  [x] npm test: passati.');
    console.log('     Riavvia il launcher per usare il codice nuovo.');
  } else console.log('  [!] ' + r.messaggio);
}
const STA_A_MAIN = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (STA_A_MAIN) await main();
