// _collaudo-amico.mjs — la DANZA DEL PC AMICO VERGINE, da cima a fondo
// (1/11/2026, «l'amico non deve avere nessun problema: deve installare e
// giocare»). Nessun tool dedicato finora provava la SEQUENZA INTERA:
//
//   1. zipball POSTA VERA del ramo (git ls-files → palude → zip): non la
//      mini-zip del test, TUTTO il codice tracciato, data/ di propria
//      esclusa; le modifiche NON committate ci entrano, che è il punto
//      (collaudo del ramo, non dell'ultimo commit);
//   2. INSTALLATORE installazione.cmd in sandbox, col server HTTP finto
//      (stessa tecnica di test/installatore-sandbox.test.mjs: spawn
//      asincrono, TMP/TEMP spostati);
//   3. IL PC DELL'AMICO: base «Saved Games» finta con la mod ACE UI App
//      Loader installata e ZERO app nostre; primo «avvia» simulato col
//      modo silenzioso (node tools/installa-gioco.mjs --silenzioso), che
//      avvia.cmd chiama a ogni apertura GUI;
//   4. verifica: app copiate IDENTICHE alle sorgenti, marcatori ACE/Video,
//      menu.html mai consegnato, build-id coerente, data vergine;
//      secondo avvio ≡ muto (nessuna copia ripetuta).
//
// Uso:  node tools/_collaudo-amico.mjs        (esce 0 se tutta la sequenza stanca)
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

if (process.platform !== 'win32') {
  console.error('Solo Windows: la danza usa cmd, il tar di System32 e i percorsi del PC amico.');
  process.exit(1);
}
const QUI = dirname(dirname(fileURLToPath(import.meta.url)));
const TAR = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
const COMMIT = 'collaudo' + createHash('sha256').update(String(process.pid) + Date.now()).digest('hex').slice(0, 8);
const RADICE_ZIP = `turbignox-hash-ac-evo-career-${COMMIT}`;
let KO = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) console.log(`  [x] ${msg}`); else { KO++; fails.push(msg); console.log(`  [!] ${msg}`); } };

// --- 1) palude del ramo: SOLO i file tracciati, col contenuto del disco ---
const palude = mkdtempSync(join(tmpdir(), 'collaudo-amico-'));
const stage = join(palude, RADICE_ZIP);
console.log('1) zipball del ramo in palude...');
const tracciati = spawnSync('git', ['ls-files'], { cwd: QUI, encoding: 'utf8' }).stdout
  .split(/\r?\n/).filter((f) => f && !/^(archive\/|pacchetti\/|tmp\/)/.test(f));
for (const f of tracciati) {
  const dest = join(stage, f);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(QUI, f), dest);
}
console.log(`    ${tracciati.length} file tracciati in palude`);
const zip = join(palude, 'zipball.zip');
const pz = spawnSync(TAR, ['-a', '-cf', zip, '-C', palude, RADICE_ZIP], { encoding: 'utf8' });
ok(pz.status === 0, `zip costruito col tar di System32 (${tracciati.length} file)`);
ok(existsSync(join(stage, 'tools', 'installa-gioco.mjs')), 'l\'installatore unitario delle app in gioco è nella zipball');

// --- 2) server finto: SOLO l'endpoint che l'installatore chiama ---
let chiestiZipball = 0;
const server = createServer((req, res) => {
  if (req.url?.endsWith('/zipball/main')) {
    chiestiZipball++;
    res.writeHead(200, { 'Content-Type': 'application/zip' });
    pipeline(Readable.from([readFileSync(zip)]), res).catch(() => {});
    return;
  }
  res.writeHead(404); res.end('{"message":"route ignota"}');
});
await new Promise((accorta) => server.listen(0, '127.0.0.1', accorta));
const httpPort = server.address().port;
console.log(`2) server finto del «GitHub» in 127.0.0.1:${httpPort}`);

// --- 3) installatore: un file, col codice del ramo, in una cartella vergine ---
console.log('3) installazione.cmd come l\'amico (Node del PC, test saltato, niente scorciatoie/avvii)...');
const destinazione = mkdtempSync(join(tmpdir(), 'collaudo-amico-pc-'));
const t0 = Date.now();
const ins = await new Promise((fineInstallazione) => {
  const p = spawn('cmd.exe', ['/d', '/c', join(QUI, 'installa.cmd')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TMP: palude, TEMP: palude,
      EVO_INSTALLER_DIR: destinazione,
      EVO_INSTALLER_API: `http://127.0.0.1:${httpPort}/repos/turbignox-hash/ac-evo-career`,
      EVO_INSTALLER_AUTO: '1',
      EVO_INSTALLER_FAST: '1',
      EVO_INSTALLER_NOSCORCIATOIA: '1',
      EVO_INSTALLER_NOAVVIO: '1',
    },
  });
  let stdout = '';
  p.stdout.on('data', (d) => { stdout += d; });
  p.stderr.on('data', (d) => { stdout += d; });
  const guardia = setTimeout(() => { try { p.kill(); } catch {} }, 180_000);
  p.on('exit', (code) => { clearTimeout(guardia); fineInstallazione({ code, stdout }); });
});
ok(ins.code === 0, `installatione.cmd esce 0 in ${Date.now() - t0} ms`);
ok(!ins.stdout.includes('NON completata'), 'niente ramo :fallito');
for (const f of ['ac-evo-career.mjs', 'avvia.cmd', 'tools', 'gui', 'src', 'uiapp']) {
  ok(existsSync(join(destinazione, f)), `nella cartella c'è ${f}`);
}
ok((readFileSync(join(destinazione, 'build-id.txt'), 'utf8').split(/\r?\n/)[0].trim() ?? '') === COMMIT, `build-id.txt = ${COMMIT}`);
ok(existsSync(join(destinazione, 'data')) && !existsSync(join(destinazione, 'data', '.github-token')), 'data/ vergine (nessun token)');
ok(existsSync(join(destinazione, 'tools', 'installa-gioco.mjs') ) && existsSync(join(destinazione, 'INSTALLA-GIOCO.cmd')), 'l\'installatore un-file porta con sé anche le app in gioco');

// --- 4) il PC dell'amico: mod AGL installata, app nostre ZERO ---
console.log('4) primo "avvia" dell\'amico (modo silenzioso di avvia.cmd, saved games vergini)...');
const salvataggi = mkdtempSync(join(tmpdir(), 'collaudo-amico-sg-'));
mkdirSync(join(salvataggi, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader'), { recursive: true });
mkdirSync(join(salvataggi, 'ACE', 'Video'), { recursive: true });
const avviaSilenzioso = () => spawnSync(process.execPath,
  [join(destinazione, 'tools', 'installa-gioco.mjs'), '--silenzioso'],
  { encoding: 'utf8', env: { ...process.env, ACE_SAVEDIR: salvataggi } });

const prima = avviaSilenzioso();
ok(prima.status === 0, `primo avvio esce 0 (${prima.stdout ? 'annuncia le app' : 'MA tace — non doveva'})`);
for (const chiave of ['cruscotto', 'pitwall']) {
  ok(/App «\w+» in gioco/.test(prima.stdout), `primo avvio: ${chiave} annunciata`);
}
const loader = join(salvataggi, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader');
for (const [chiave, file] of [
  ['cruscotto', 'app.json'], ['cruscotto', 'cruscotto.js'],
  ['pitwall', 'app.json'], ['pitwall', 'pitwall.js'],
]) {
  const nelGioco = join(loader, chiave, file);
  if (!ok(existsSync(nelGioco), `${chiave}/${file} dentro ${'Saved Games'}`)) continue;
  ok(readFileSync(nelGioco).equals(readFileSync(join(QUI, 'uiapp', chiave, file))), `${chiave}/${file} identica alla sorgente`);
}
ok(!existsSync(join(loader, 'cruscotto', 'menu.html')), 'nessuna pagina consegnata al loader (lezione 27/10)');
for (const chiave of ['cruscotto', 'pitwall']) {
  const m = join(salvataggi, 'ACE', 'Video', `ACEUIAppLoader-${chiave}.settingspreset`);
  ok(existsSync(m) && readFileSync(m, 'utf8') === '', `marcatore ${chiave} in ACE/Video (vuoto)`);
}
const dopo = avviaSilenzioso();
ok(dopo.status === 0 && dopo.stdout.trim() === '', `secondo avvio: muto (nessuna copia ripetuta) ${JSON.stringify(dopo.stdout)}`);

// --- chiusura ---
server.close(() => {});
try { rmSync(palude, { recursive: true, force: true }); } catch {}
try { rmSync(destinazione, { recursive: true, force: true }); } catch {}
try { rmSync(salvataggi, { recursive: true, force: true }); } catch {}
console.log('');
if (KO) {
  console.log(`DANZA INTERROTTA a ${KO} colpi falliti:`);
  for (const f of fails) console.log(`   - ${f}`);
  process.exit(1);
}
console.log(`DANZA COMPLETA: l'amico installa con un file e gioca (zip colpita ${chiestiZipball} volta/e).`);
