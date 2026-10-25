// installatore-sandbox.test.mjs — LA PROVA DELL'INSTALLATORE installa.cmd,
// in sandbox (26/10, richiesta Mauro: «prova installer in sandbox, senza
// scarichi reali»).
//
// NON tocca nodejs.org e NON tocca GitHub: un server HTTP LOCALE serve
//   /repos/turbignox-hash/ac-evo-career/zipball/main
// restituendo un mini-zip costruito al momento con il tar di Windows, dal
// nome radice <repo>-<commit> finto: il test non dipende dallo stato del repo.
// Node non si scarica: la sandbox usa il Node del PC (where node). All'installatore
// arrivano SOLO override da ambiente, attesi dallo stesso script (vedi il
// blocco «PRESA DI PROVA» dentro installa.cmd): EVO_INSTALLER_DIR/API/AUTO/
// FAST/NOSCORCIATOIA/NOAVVIO.
//
// NOTA (26/10): si lancia con spawn ASINCRONO e promessa, NON spawnSync —
// spawnSync rimane impalato a metà installazione con lo stesso script, stesso
// ambiente e stesso server (verificato con i probe _dbg-spawn*: async esce in
// 0,8 s, sync ETIMEDOUT: storia dei pipe ereditati su Windows). Per i PC degli
// amici resta il doppio click: lo stesso flusso funziona da terminale reale
// (verificato a mano).
//
// Aspettativa: uscita 0, installazione pulita nella destinazione (initializer,
// avvia.cmd, package.json, tools/, build-id.txt leggibile e CORRISPONDENTE
// al commit della zipball), data/ vergine (nessun token scritto), npm test
// saltato col modo veloce, niente scorciatoie né avvii fuori. Windows only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLATORE = join(QUI, 'installa.cmd');
const TAR = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
const COMMIT_FINTO = 'sandbox0x1a2b3';

/** spawn con promessa + watchdog: uccide il processo se eccede il tetto. */
function cmdAsync(file, args, opts, tettoMs) {
  return new Promise((fine) => {
    const processo = spawn(file, args, opts);
    let chiuso = false;
    const t0 = Date.now();
    let stdout = '', stderr = '';
    processo.stdout.on('data', (d) => { stdout += d; });
    processo.stderr.on('data', (d) => { stderr += d; });
    processo.on('exit', (code, signal) => {
      if (chiuso) return;
      chiuso = true;
      clearTimeout(guardia);
      fine({ status: code, signal, stdout, stderr, ms: Date.now() - t0 });
    });
    // il timer è guardia ma anche peso: se non lo annullo tiene il test
    // in vita per 120 s anche dopo l'uscita del processo (verificato)
    const guardia = setTimeout(() => {
      if (chiuso) return;
      try { processo.kill(); } catch { /* pazienza */ }
      chiuso = true;
      fine({ status: null, signal: 'WATCHDOG', stdout, stderr, ms: Date.now() - t0 });
    }, tettoMs);
  });
}

test('installatore: installazione completa in sandbox, con zipball locale', { skip: process.platform !== 'win32' }, async (t) => {
  // --- la palude minima che farà da «repo»: indipendente dallo stato del repo ---
  const blob = mkdtempSync(join(tmpdir(), 'installer-blob-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));
  const RADICE_ZIP = `turbignox-hash-ac-evo-career-${COMMIT_FINTO}`;
  const stage = join(blob, 'stage');
  mkdirSync(join(stage, RADICE_ZIP, 'tools'), { recursive: true });
  writeFileSync(join(stage, RADICE_ZIP, 'package.json'),
    JSON.stringify({ name: 'ac-evo-career', version: '0.0.0-sandbox' }), 'utf8');
  writeFileSync(join(stage, RADICE_ZIP, 'ac-evo-career.mjs'), 'console.log("sandbox")\n', 'utf8');
  writeFileSync(join(stage, RADICE_ZIP, 'avvia.cmd'), '@echo off\nrem sandbox stub\n', 'utf8');
  copyFileSync(join(QUI, 'tools', 'crea-scorciatoia.mjs'), join(stage, RADICE_ZIP, 'tools', 'crea-scorciatoia.mjs'));
  const zipPath = join(blob, 'zipball.zip');
  const z = spawnSync(TAR, ['-a', '-cf', zipPath, '-C', stage, RADICE_ZIP], { encoding: 'utf8' });
  assert.equal(z.status, 0, 'il test non è riuscito a costruire lo zip minimo: ' + (z.stderr ?? ''));

  // --- server finto con SOLO l'endpoint che l'installatore usa ---
  let chiestiZipball = 0;
  const server = createServer((req, res) => {
    if (req.url?.endsWith('/zipball/main')) {
      if (req.headers['user-agent'] !== 'evo-installer') {
        res.writeHead(418); res.end('chi vi porta?'); return;
      }
      chiestiZipball++;
      res.writeHead(200, { 'Content-Type': 'application/zip' });
      res.end(readFileSync(zipPath));
      return;
    }
    res.writeHead(404); res.end('{"message":"route ignota"}');
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  server.keepAliveTimeout = 0; // nessuna connessione che tiene aperta la porta
  t.after(() => { try { server.closeAllConnections?.(); } catch { /* pazienza */ } return new Promise((fatto) => server.close(fatto)); });
  const httpPort = server.address().port;

  // --- destinazione vergine; anche i temporanei dell'installatore restano in sandbox ---
  const destinazione = mkdtempSync(join(tmpdir(), 'installer-target-'));
  t.after(() => rmSync(destinazione, { recursive: true, force: true }));

  const r = await cmdAsync('cmd.exe', ['/d', '/c', INSTALLATORE], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TMP: blob,
      TEMP: blob,
      EVO_INSTALLER_DIR: destinazione,
      EVO_INSTALLER_API: `http://127.0.0.1:${httpPort}/repos/turbignox-hash/ac-evo-career`,
      EVO_INSTALLER_AUTO: '1',
      EVO_INSTALLER_FAST: '1',
      EVO_INSTALLER_NOSCORCIATOIA: '1',
      EVO_INSTALLER_NOAVVIO: '1',
    },
  }, 120_000);

  // 1) uscita dichiarata: 0, e senza pendere al watchdog
  assert.equal(r.signal, null, `l'installatore ha scavalcato il tetto del watchdog (${r.ms} ms)\n${r.stdout}\n${r.stderr}`);
  assert.equal(r.status, 0, `uscita ${r.status}\n${r.stdout}\n${r.stderr}`);
  // il ramo :fallito non deve passare: l'installazione è finita in piedi
  assert.ok(!r.stdout.includes('NON completata'),
    'l\'installatore è passato da :fallito anche in sandbox\n' + r.stdout);
  // l'installazione dichiara la build
  assert.ok(r.stdout.includes('[x] Codice installato, build '),
    'l\'installatore non ha dichiarato la build:\n' + r.stdout);
  // il modo veloce dichiara la corsa saltata (la voce contiene «npm test»:
  // si verifica la riga precisa, non l'assenza della scritta)
  assert.ok(r.stdout.includes('Modo veloce: salto la prova npm test.'),
    'il modo veloce non viene dichiarato:\n' + r.stdout);

  // 2) i file chiave stanno nella destinazione
  for (const f of ['ac-evo-career.mjs', 'avvia.cmd', 'package.json']) {
    assert.ok(existsSync(join(destinazione, f)), `manca ${f} nella destinazione:\n` + r.stdout);
  }
  assert.ok(existsSync(join(destinazione, 'tools', 'crea-scorciatoia.mjs')),
    'le sotto-cartelle del codice non sono state copiate:\n' + r.stdout);
  // 3) build-id.txt scritto e leggibile: il commit del nome della zipball
  assert.ok(existsSync(join(destinazione, 'build-id.txt')),
    'manca build-id.txt: il taglio del commit non è passato\n' + r.stdout);
  assert.equal(readFileSync(join(destinazione, 'build-id.txt'), 'utf8').split(/\r?\n/)[0].trim(),
    COMMIT_FINTO, 'build-id.txt non corrisponde al commit della zipball');
  // 4) nessun token scritto: data/ esiste e resta vergine
  assert.ok(existsSync(join(destinazione, 'data')),
    'l\'installatore non ha preparato la cartella dati');
  assert.ok(!existsSync(join(destinazione, 'data', '.github-token')),
    'nessun token dato ma è stato scritto: bug');
  // 5) niente node_modules attesi dal modo veloce
  assert.ok(!existsSync(join(destinazione, 'node_modules')),
    'con modo veloce non deve esserci node_modules');
  // 6) richiesta unica: il server finto colpito una volta sola
  assert.equal(chiestiZipball, 1, `zipball chiesta ${chiestiZipball} volte: attesa 1`);
});
