// build-installer-exe.mjs — costruisce EVO-Pitwall-Setup.exe.
//
// L'EXE è una GUI WinForms che incorpora `installa.cmd` (base64): la logica di
// download/aggiornamento resta UNA sola, quella coperta dai test. Il builder
// richiede Windows e il compilatore C# di .NET Framework (presente su Windows
// 10/11); non serve Visual Studio, non serve admin.
//
// Due varianti:
//   node tools/build-installer-exe.mjs            → dist\EVO-Pitwall-Setup.exe
//       (circa 90 KB: scarica Node e codice come installa.cmd)
//   node tools/build-installer-exe.mjs --offline  → dist\EVO-Pitwall-Setup-Offline.exe
//       (incorpora node.zip e code.zip: funziona senza rete)
//   node tools/build-installer-exe.mjs --verifica-firma [file.exe ...]
//       non costruisce: verifica catena Authenticode, .sha256 e versione
//       della build (.build.json) degli EXE indicati (default: i due in
//       dist/). Serve al preflight di release.
//
// L'offline usa gli stessi due zip che installa.cmd accetterebbe da
// EVO_INSTALLER_NODEZIP/EVO_INSTALLER_CODEZIP, quindi il percorso è lo stesso
// dei test sandbox. Lo zip del codice nasce dai file CORRENTI (tracciati e non),
// non da HEAD: le modifiche non committate finiscono nel pacchetto.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argsCli = process.argv.slice(2);
const OFFLINE = argsCli.includes('--offline');
const VERIFY_ONLY = argsCli.includes('--verifica-firma');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// Sovrascrivibile: il test della firma costruisce in TEMP, senza toccare i dist
// dell'utente (e senza rischiare di lasciare un EXE firmato a metà).
const OUT_DIR = process.env.EVO_BUILD_DIR ? resolve(process.env.EVO_BUILD_DIR) : join(ROOT, 'dist');

const SYSTEM32 = join(process.env.SystemRoot || 'C:/Windows', 'System32');
const CURL = join(SYSTEM32, 'curl.exe');
const TAR = existsSync(join(SYSTEM32, 'tar.exe')) ? join(SYSTEM32, 'tar.exe') : 'tar';

/** Commit breve + eventuale "+mod" (working tree diverso da HEAD). */
function buildLabel() {
  const commit = run('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT });
  let label = commit.status === 0 ? commit.stdout.trim() : 'commit?';
  const status = run('git', ['status', '--porcelain'], { cwd: ROOT });
  if (status.status === 0 && status.stdout.trim() !== '') label += '+mod';
  return `v${pkg.version} · ${label} · ${OFFLINE ? 'offline' : 'online'}`;
}

// ---------------------------------------------------------------- firma
// Facoltativa: senza EVO_SIGN_PFX / EVO_SIGN_THUMBPRINT l'EXE esce non
// firmato, esattamente come prima. Con una delle due, signtool firma con
// SHA-256 (+ timestamp) e SOLO DOPO il builder calcola lo .sha256 del file
// firmato. La password arriva dall'ambiente e non viene mai stampata né
// scritta su disco dal builder.
const SIGN_PFX = process.env.EVO_SIGN_PFX ? resolve(process.env.EVO_SIGN_PFX) : null;
const SIGN_THUMB = (process.env.EVO_SIGN_THUMBPRINT ?? '').replace(/\s+/g, '') || null;
const SIGN_PASSWORD = process.env.EVO_SIGN_PASSWORD ?? '';
// EVO_SIGN_TIMESTAMP="" disattiva il timestamp (firma solo offline).
const SIGN_TIMESTAMP = process.env.EVO_SIGN_TIMESTAMP === ''
  ? null
  : (process.env.EVO_SIGN_TIMESTAMP || 'http://timestamp.digicert.com');
const SIGN_ENABLED = Boolean(SIGN_PFX || SIGN_THUMB);

if (SIGN_PFX && SIGN_THUMB) {
  throw new Error('firma: scegli EVO_SIGN_PFX oppure EVO_SIGN_THUMBPRINT, non entrambi');
}
if (SIGN_PFX && !existsSync(SIGN_PFX)) {
  throw new Error(`firma: certificato non trovato: ${SIGN_PFX}`);
}
if (SIGN_THUMB && !/^[0-9a-fA-F]{40,64}$/.test(SIGN_THUMB)) {
  throw new Error('firma: EVO_SIGN_THUMBPRINT non sembra un thumbprint esadecimale (40-64 cifre)');
}

/** signtool non è nel PATH: Windows SDK lo mette sotto Windows Kits. */
function findSigntool() {
  const explicit = process.env.EVO_SIGNTOOL;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`firma: EVO_SIGNTOOL non trovato: ${explicit}`);
    return explicit;
  }
  const where = run('where.exe', ['signtool'], { encoding: 'utf8' });
  if (where.status === 0) {
    const found = (where.stdout ?? '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (found && existsSync(found)) return found;
  }
  const kits = join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Windows Kits', '10', 'bin');
  if (existsSync(kits)) {
    const versions = readdirSync(kits).filter((v) => /^\d+\.\d+/.test(v)).sort().reverse();
    for (const v of versions) {
      const p = join(kits, v, 'x64', 'signtool.exe');
      if (existsSync(p)) return p;
    }
  }
  throw new Error('firma: signtool.exe non trovato (installa Windows SDK o imposta EVO_SIGNTOOL)');
}

function signExe(exePath) {
  const tool = findSigntool();
  const args = ['sign', '/fd', 'SHA256'];
  if (SIGN_TIMESTAMP) args.push('/tr', SIGN_TIMESTAMP, '/td', 'SHA256');
  if (SIGN_PFX) {
    args.push('/f', SIGN_PFX);
    if (SIGN_PASSWORD) args.push('/p', SIGN_PASSWORD);
  } else {
    args.push('/sha1', SIGN_THUMB);
  }
  args.push(exePath);
  console.log(`Firma: ${SIGN_PFX ? 'certificato PFX' : `certificato ${SIGN_THUMB}`} con ${tool}`);
  const r = run(tool, args, { timeout: 180_000 });
  if (r.status !== 0) {
    process.stderr.write((r.stdout || '') + (r.stderr || ''));
    // Mai lasciare in giro un EXE che sembra firmato ma non lo è.
    rmSync(exePath, { force: true });
    throw new Error('firma Authenticode non riuscita: EXE rimosso');
  }
  const v = run(tool, ['verify', '/pa', '/q', exePath]);
  if (v.status !== 0) {
    console.log('Firma: apposta; verifica di catena non riuscita (normale senza la CA nel magazzino).');
  } else {
    console.log('Firma: verificata.');
  }
}

function verifySignedExe(file) {
  if (!existsSync(file)) throw new Error(`firma: file non trovato: ${file}`);
  const sidecar = file + '.sha256';
  if (!existsSync(sidecar)) throw new Error(`firma: manca ${sidecar} (lo .sha256 del file firmato)`);
  const atteso = /[0-9a-fA-F]{64}/.exec(readFileSync(sidecar, 'utf8'));
  if (!atteso) throw new Error(`firma: ${sidecar} non contiene uno SHA-256`);
  const reale = sha256File(file);
  if (reale !== atteso[0].toLowerCase()) {
    throw new Error(`firma: SHA-256 non corrisponde per ${file} (file ${reale}, sidecar ${atteso[0].toLowerCase()})`);
  }
  // La versione della build viaggia accanto all'EXE: senza, un file vecchio
  // può avere firma e hash giusti e partire lo stesso per la release.
  const buildFile = file + '.build.json';
  if (!existsSync(buildFile)) throw new Error(`firma: manca ${buildFile} (versione della build: ricostruisci l'EXE)`);
  let meta;
  try {
    meta = JSON.parse(readFileSync(buildFile, 'utf8'));
  } catch {
    throw new Error(`firma: ${buildFile} non è JSON valido`);
  }
  if (meta?.version !== pkg.version) {
    throw new Error(`firma: ${file} è della versione ${meta?.version ?? '?'}, il progetto è ${pkg.version}: ricostruisci l'EXE`);
  }
  if (String(meta?.sha256 ?? '').toLowerCase() !== reale) {
    throw new Error(`firma: ${buildFile} non corrisponde allo SHA-256 di ${file}`);
  }
  if (meta?.firmato !== true) {
    throw new Error(`firma: ${file} non risulta firmato dal builder`);
  }
  const tool = findSigntool();
  const r = run(tool, ['verify', '/pa', '/q', file], { timeout: 120_000 });
  if (r.status !== 0) {
    if (r.stdout) process.stderr.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    throw new Error(`firma: verifica Authenticode fallita per ${file}`);
  }
}

// --verifica-firma: uscita anticipata, nessuna build. Il preflight di release
// la chiama quando EVO_SIGN_PFX o EVO_SIGN_THUMBPRINT è impostata.
if (VERIFY_ONLY) {
  if (!SIGN_ENABLED) {
    console.log('Firma: non configurata → nessun EXE da verificare.');
    process.exit(0);
  }
  const espliciti = argsCli.filter((a) => a !== '--verifica-firma' && a !== '--offline' && !a.startsWith('--'));
  const predefiniti = [
    join(OUT_DIR, 'EVO-Pitwall-Setup.exe'),
    join(OUT_DIR, 'EVO-Pitwall-Setup-Offline.exe'),
  ].filter(existsSync);
  const targets = espliciti.length ? espliciti.map((f) => resolve(f)) : predefiniti;
  if (!targets.length) {
    console.error(`✧ firma: nessun EXE da verificare (né passato né in ${OUT_DIR}).`);
    process.exit(1);
  }
  let errori = 0;
  for (const file of targets) {
    try {
      verifySignedExe(file);
      console.log(`Firma: verificata ${file}`);
    } catch (e) {
      console.error('✧ ' + e.message);
      errori++;
    }
  }
  process.exit(errori ? 1 : 0);
}

function assemblyVersion(v) {
  const parts = String(v).split(/[.+-]/).map((n) => Number.parseInt(n, 10)).filter(Number.isFinite).slice(0, 3);
  while (parts.length < 3) parts.push(0);
  return `${parts.join('.')}.0`;
}

/** Un file è uno zip se comincia con "PK": basta per scartare download tronchi. */
function isZip(path) {
  try {
    const fd = openSync(path, 'r');
    const head = Buffer.alloc(2);
    const read = readSync(fd, head, 0, 2, 0);
    closeSync(fd);
    return read === 2 && head.toString('latin1') === 'PK';
  } catch {
    return false;
  }
}

function run(file, args, opts = {}) {
  const r = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  return r;
}

/** URL e SHA-256 di Node restano scritti in installa.cmd: una sola fonte di verità. */
function nodeUrlFromScript(text) {
  const m = /set "NODEURL=([^"]+)"/.exec(text);
  if (!m) throw new Error('installa.cmd: riga NODEURL non trovata');
  return m[1];
}

function nodeShaFromScript(text) {
  const m = /set "NODESHA=([0-9a-fA-F]{64})"/.exec(text);
  if (!m) throw new Error('installa.cmd: riga NODESHA non trovata');
  return m[1].toLowerCase();
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function downloadNodeZip(url, expectedSha) {
  const cacheDir = join(OUT_DIR, 'offline-cache');
  mkdirSync(cacheDir, { recursive: true });
  const dest = join(cacheDir, url.split('/').pop());
  if (existsSync(dest) && statSync(dest).size > 1_000_000 && isZip(dest) && sha256File(dest) === expectedSha) {
    console.log(`Node: uso la copia in cache, SHA-256 verificato (${statSync(dest).size} byte)`);
    return dest;
  }
  if (existsSync(dest)) {
    console.log('Node: la copia in cache non corrisponde allo SHA-256 atteso, la riscarico');
    rmSync(dest, { force: true });
  }
  if (!existsSync(CURL)) throw new Error('curl.exe di Windows non trovato: impossibile scaricare il Node portatile');
  console.log(`Node: scarico ${url} ...`);
  const r = run(CURL, ['-L', '--fail', '--silent', '--show-error', '--connect-timeout', '20', '--retry', '2', '--retry-delay', '2', '-o', dest, url]);
  if (r.status !== 0 || !isZip(dest)) {
    rmSync(dest, { force: true });
    throw new Error('download di Node non riuscito: ' + (r.stderr || `exit ${r.status}`));
  }
  const actual = sha256File(dest);
  if (actual !== expectedSha) {
    rmSync(dest, { force: true });
    throw new Error(`Node scaricato con SHA-256 inatteso: ${actual} (atteso ${expectedSha})`);
  }
  console.log(`Node: salvato in ${dest} (${statSync(dest).size} byte, SHA-256 verificato)`);
  return dest;
}

function buildCodeZip() {
  const git = run('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT });
  if (git.status !== 0) throw new Error('git rev-parse fallito: ' + (git.stderr || ''));
  const commit = git.stdout.trim();
  const rootName = `ac-evo-career-${commit}`;
  const stage = join(OUT_DIR, 'offline-stage');
  const destRoot = join(stage, rootName);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });

  const list = run('git', ['ls-files', '-z', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'buffer' });
  if (list.status !== 0) throw new Error('git ls-files fallito: ' + String(list.stderr));
  const files = list.stdout.toString('utf8').split('\0').filter(Boolean);
  let total = 0;
  for (const rel of files) {
    const from = join(ROOT, rel);
    const to = join(destRoot, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    total += statSync(to).size;
  }

  const zipPath = join(OUT_DIR, 'offline-cache', 'code.zip');
  rmSync(zipPath, { force: true });
  const z = run(TAR, ['-a', '-cf', zipPath, '-C', stage, rootName]);
  if (z.status !== 0 || !isZip(zipPath)) throw new Error('creazione code.zip fallita: ' + (z.stderr || `exit ${z.status}`));
  console.log(`Codice: ${files.length} file, ${total} byte sciolti → ${zipPath} (${statSync(zipPath).size} byte, build ${commit})`);
  return { zipPath, commit };
}

const scriptText = readFileSync(join(ROOT, 'installa.cmd'), 'utf8');
const b64 = readFileSync(join(ROOT, 'installa.cmd')).toString('base64');
const template = readFileSync(join(ROOT, 'tools', 'installer-exe.cs'), 'utf8');
for (const marker of ['__SCRIPT_B64__', '__VERSION__', '__OFFLINE__', '__BUILD__']) {
  if (!template.includes(marker)) throw new Error(`tools/installer-exe.cs: segnaposto ${marker} mancante`);
}

const outDir = OUT_DIR;
mkdirSync(outDir, { recursive: true });
const baseName = OFFLINE ? 'EVO-Pitwall-Setup-Offline' : 'EVO-Pitwall-Setup';
const sourcePath = join(outDir, `${baseName}.cs`);
const exePath = join(outDir, `${baseName}.exe`);

let resources = [];
if (OFFLINE) {
  const nodeZip = downloadNodeZip(nodeUrlFromScript(scriptText), nodeShaFromScript(scriptText));
  const { zipPath: codeZip } = buildCodeZip();
  resources = [nodeZip, codeZip];
}

const build = buildLabel();
const source = template
  .replaceAll('__SCRIPT_B64__', b64)
  .replaceAll('__VERSION__', assemblyVersion(pkg.version))
  .replaceAll('__OFFLINE__', OFFLINE ? 'true' : 'false')
  .replaceAll('__BUILD__', build);
writeFileSync(sourcePath, source, 'utf8');

const win = process.env.WINDIR || 'C:/Windows';
const candidates = [
  join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];
const csc = candidates.find((p) => existsSync(p));
if (!csc) throw new Error('csc.exe di .NET Framework non trovato: serve Windows con .NET Framework 4.x');

const args = [
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  '/codepage:65001',
  `/out:${exePath}`,
  `/win32icon:${join(ROOT, 'gui', 'pitwall.ico')}`,
  '/reference:System.dll',
  '/reference:System.Drawing.dll',
  '/reference:System.Windows.Forms.dll',
];
// /resource:file,identifier → il nome letto da ExtractPayload("node.zip"/"code.zip").
if (OFFLINE) {
  args.push(`/resource:${resources[0]},node.zip`, `/resource:${resources[1]},code.zip`);
}
args.push(sourcePath);

const r = run(csc, args);
if (r.status !== 0) {
  process.stderr.write((r.stdout || '') + (r.stderr || ''));
  process.exit(r.status ?? 1);
}

if (SIGN_ENABLED) signExe(exePath);
else console.log('Firma: non configurata → EXE non firmato (EVO_SIGN_PFX o EVO_SIGN_THUMBPRINT per firmarlo).');

const bytes = readFileSync(exePath);
const sha = createHash('sha256').update(bytes).digest('hex');
writeFileSync(`${exePath}.sha256`, `${sha}  ${baseName}.exe\n`, 'utf8');
// Metadati della build: il preflight di release li legge per rifiutare un
// EXE vecchio anche quando firma e hash sono formalmente a posto.
writeFileSync(`${exePath}.build.json`, JSON.stringify({
  schema: 1,
  version: pkg.version,
  build,
  variante: OFFLINE ? 'offline' : 'online',
  firmato: SIGN_ENABLED,
  sha256: sha,
}, null, 2) + '\n', 'utf8');
console.log(`Creato: ${exePath}`);
console.log(`Versione: ${pkg.version}  Variante: ${OFFLINE ? 'offline' : 'online'}  Firma: ${SIGN_ENABLED ? 'sì' : 'no'}  Build: ${build}  Dimensione: ${statSync(exePath).size} byte`);
console.log(`SHA-256: ${sha}`);
